const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
function load(name,requires={},globals={}){
 const module={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(path.join(root,name),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext('(function(module,exports,require){'+code+'\n})',{...globals})(module,module.exports,name=>{if(!(name in requires))throw new Error(name);return requires[name];});
 return module.exports;
}
function harness(){
 const slots=[],effects=[],values=new Map();let cursor=0,changed=true,current,user='audit',failure=false,writes=0;
 const target=new EventTarget();
 const hooks={
  useState(initial){const i=cursor++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};return [slots[i].value,value=>{const next=typeof value==='function'?value(slots[i].value):value;if(!Object.is(slots[i].value,next)){slots[i].value=next;changed=true;}}];},
  useRef(value){const i=cursor++;if(!slots[i])slots[i]={current:value};return slots[i];},
  useEffect(effect,deps){const i=cursor++,old=slots[i];if(!old||deps.some((value,n)=>!Object.is(value,old.deps[n]))){slots[i]={deps,cleanup:old?.cleanup};effects.push(()=>{slots[i].cleanup?.();slots[i].cleanup=effect();});}},
 };
 const storage={
  async getLocal(key,fallback){return structuredClone(values.get(key)??fallback);},
  async updateLocal(key,fallback,mutate){if(failure)throw new Error('storage full');const next=mutate(structuredClone(values.get(key)??fallback));values.set(key,next);writes++;return structuredClone(next);},
 };
 const module=load('lib/use-revista.ts',{'react':hooks,'@/lib/offline-store':storage},{window:target});
 function render(){for(let n=0;changed;n++){assert(n<30);changed=false;cursor=0;current=module.useRevista(user);while(effects.length)effects.shift()();}}
 async function settle(){for(let n=0;n<3;n++){render();await new Promise(setImmediate);}render();}
 return {module,values,settle,render,target,get hook(){return current;},get key(){return 'revista:'+JSON.stringify([user,current.date]);},get writes(){return writes;},setUser(value){user=value;changed=true;},fail(value){failure=value;}};
}
const tests=[];const test=(name,run)=>tests.push({name,run});
const row=id=>({id,ubicacion:'Polvorín superficie'});
test('cancelar descarta borrador sin tocar marcas guardadas',async()=>{
 const h=harness();await h.settle();const key=h.module.revistaRecordKey('ANFO',row('old'));
 h.values.set(h.key,{[key]:'original'});h.hook.setDate('2026-10-01');await h.settle();h.hook.setDate(h.module.todayInColombia());await h.settle();
 h.hook.begin();h.render();h.hook.toggle('ANFO',row('old'),false);h.hook.toggle('ANFO',row('new'),true);h.render();
 assert(h.hook.dirty);assert(!h.hook.checked('ANFO',row('old')));assert(h.hook.checked('ANFO',row('new')));assert.equal(h.writes,0);
 h.hook.cancel();h.render();assert(!h.hook.active);assert(h.hook.checked('ANFO',row('old')));assert(!h.hook.checked('ANFO',row('new')));assert.equal(h.values.get(h.key)[key],'original');assert.equal(h.writes,0);
});
test('finalizar mezcla solo los cambios y conserva marcas de otra pestaña',async()=>{
 const h=harness();await h.settle();h.hook.begin();h.render();h.hook.toggle('ANFO',row('new'),true);h.render();
 const other=h.module.revistaRecordKey('ANFO',row('other'));h.values.set(h.key,{[other]:'another-tab'});
 assert(await h.hook.finish());h.render();assert(!h.hook.active);assert(h.hook.checked('ANFO',row('new')));assert(h.hook.checked('ANFO',row('other')));assert.equal(h.writes,1);
});
test('fallo al finalizar mantiene el borrador para reintentar',async()=>{
 const h=harness();await h.settle();h.hook.begin();h.render();h.hook.toggle('ANFO',row('new'),true);h.render();h.fail(true);
 assert.equal(await h.hook.finish(),false);h.render();assert(h.hook.active);assert(h.hook.dirty);assert(h.hook.error);assert.equal(h.writes,0);
 h.fail(false);assert(await h.hook.finish());h.render();assert(!h.hook.dirty);assert.equal(h.writes,1);
});
test('fecha bloqueada con cambios; cambiar usuario descarta el borrador aislado',async()=>{
 const h=harness();await h.settle();const date=h.hook.date;h.hook.begin();h.render();h.hook.toggle('ANFO',row('new'),true);h.render();
 h.hook.setDate('2020-01-01');h.render();assert.equal(h.hook.date,date);
 const event=new Event('beforeunload',{cancelable:true});h.target.dispatchEvent(event);assert(event.defaultPrevented);
 h.setUser('another');await h.settle();assert(!h.hook.active);assert(!h.hook.checked('ANFO',row('new')));assert.equal(h.writes,0);
});
test('entrar y finalizar sin checks no crea registros',async()=>{
 const h=harness();await h.settle();h.hook.begin();h.render();assert(await h.hook.finish());h.render();assert.equal(h.writes,0);assert(!h.hook.active);
});
test('orden numérico, dos criterios y fechas ausentes en ambos sentidos',()=>{
 const {compareInventory}=load('lib/inventory-order.ts');
 const rows=[{serial:10,fechaIngreso:'2026-01-01'},{serial:2,fechaIngreso:'2026-01-01'},{serial:3,fechaIngreso:'2026-01-02'},{serial:4,fechaIngreso:''}];
 const sort=(criteria,direction)=>[...rows].sort((a,b)=>compareInventory(a,b,criteria.map(field=>({field,direction})))).map(r=>r.serial);
 assert.deepEqual(sort(['SERIAL'],'ASC'),[2,3,4,10]);assert.deepEqual(sort(['SERIAL'],'DESC'),[10,4,3,2]);
 assert.deepEqual(sort(['INGRESO','SERIAL'],'ASC'),[2,10,3,4]);assert.deepEqual(sort(['INGRESO','SERIAL'],'DESC'),[3,10,2,4]);
});
test('vencimiento ascendente: vencidos, próximos, lejanos y sin fecha al final',()=>{
 const {compareInventory}=load('lib/inventory-order.ts');
 const rows=[{serial:1,fechaVencimiento:'2028-01-01'},{serial:2,fechaVencimiento:''},{serial:3,fechaVencimiento:'2026-01-01'},{serial:4,fechaVencimiento:'2026-10-18'},{serial:5,fechaVencimiento:'2026-10-17'},{serial:6,fechaVencimiento:'2026-02-30'}];
 const sort=direction=>[...rows].sort((a,b)=>compareInventory(a,b,[{field:'VENCIMIENTO',direction},{field:'SERIAL',direction}])).map(r=>r.serial);
 assert.deepEqual(sort('ASC'),[3,5,4,1,2,6]);assert.deepEqual(sort('DESC'),[1,4,5,3,6,2]);
});
test('ingreso, último traslado y vencimiento son criterios independientes',()=>{
 const {compareInventory,inventoryDateFor}=load('lib/inventory-order.ts');
 const rows=[{serial:1,fechaIngreso:'2026-01-01',fechaVencimiento:'2027-04-01',movimientos:[{destino:'Polvorín interior de mina',fecha:'2026-02-01'},{destino:'Polvorín interior de mina',fecha:'2026-04-01'}]},{serial:2,fechaIngreso:'2026-02-01',fechaVencimiento:'2027-01-01',movimientos:[{destino:'Polvorín interior de mina',fecha:'2026-03-01'},{destino:'Polvorín superficie',fecha:'2026-05-01'}]}];
 const sort=field=>[...rows].sort((a,b)=>compareInventory(a,b,[{field,direction:'ASC'}])).map(r=>r.serial);
 assert.deepEqual(sort('INGRESO'),[1,2]);assert.deepEqual(sort('TRASLADO'),[2,1]);assert.deepEqual(sort('VENCIMIENTO'),[2,1]);
 assert.equal(inventoryDateFor(rows[0],'TRASLADO'),'2026-04-01');assert.equal(inventoryDateFor(rows[1],'INGRESO'),'2026-02-01');assert.equal(inventoryDateFor(rows[1],'VENCIMIENTO'),'2027-01-01');
});

test('cada criterio aplica su propio sentido al resolver empates',()=>{
 const {compareInventory}=load('lib/inventory-order.ts');
 const rows=[{serial:2,fechaVencimiento:'2026-01-01'},{serial:10,fechaVencimiento:'2026-01-01'},{serial:1,fechaVencimiento:'2026-02-01'},{serial:20,fechaVencimiento:'2026-02-01'}];
 const sort=(dateDirection,serialDirection)=>[...rows].sort((a,b)=>compareInventory(a,b,[{field:'VENCIMIENTO',direction:dateDirection},{field:'SERIAL',direction:serialDirection}])).map(r=>r.serial);
 assert.deepEqual(sort('ASC','DESC'),[10,2,20,1]);assert.deepEqual(sort('DESC','ASC'),[1,20,2,10]);
 assert.deepEqual(sort('ASC','ASC'),[2,10,1,20]);assert.deepEqual(sort('DESC','DESC'),[20,1,10,2]);
 assert.deepEqual([...rows].sort((a,b)=>compareInventory(a,b,[])).map(r=>r.serial),[2,10,1,20]);
});

(async()=>{for(const {name,run} of tests){await run();console.log('PASS:',name);}console.log(tests.length+' pruebas de revista y orden superadas.');})().catch(error=>{console.error(error);process.exitCode=1;});
