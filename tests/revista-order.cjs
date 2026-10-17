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
 const rows=[{serial:10,date:'2026-01-01'},{serial:2,date:'2026-01-01'},{serial:3,date:'2026-01-02'},{serial:4,date:''}];
 const sort=(criteria,direction)=>[...rows].sort((a,b)=>compareInventory(a,b,criteria,direction,r=>r.date)).map(r=>r.serial);
 assert.deepEqual(sort(['SERIAL'],'ASC'),[2,3,4,10]);assert.deepEqual(sort(['SERIAL'],'DESC'),[10,4,3,2]);
 assert.deepEqual(sort(['FECHA','SERIAL'],'ASC'),[2,10,3,4]);assert.deepEqual(sort(['FECHA','SERIAL'],'DESC'),[3,10,2,4]);
});
(async()=>{for(const {name,run} of tests){await run();console.log('PASS:',name);}console.log(tests.length+' pruebas de revista y orden superadas.');})().catch(error=>{console.error(error);process.exitCode=1;});
