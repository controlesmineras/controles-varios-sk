const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const { IDBFactory } = require('fake-indexeddb');
const root = path.resolve(__dirname, '..');
const sourceCache = new Map();
const clone = value => structuredClone(value);
const blank = () => ({ INDUGEL: [], ANFO: [], 'MECHA DE SEGURIDAD': [], DETONADORES: [], SELLOS: [] });
const record = serial => ({ tipo: 'ANFO', serial, fechaFabricacion: '2026-01-01', fechaVencimiento: '2027-01-01', fechaIngreso: '2026-10-17', ubicacion: 'Polvorín superficie' });
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
function harness(version = 7, role = "ADMINISTRADOR") {
  const local = new Map([['control_explosivos_token', 'token'], ['control_explosivos_user', JSON.stringify({ usuario: 'audit', nombre: 'Audit', rol: role })]]);
  const server = { Utilities: { getUuid: () => crypto.randomUUID() } };
  vm.createContext(server);
  vm.runInContext(fs.readFileSync(path.join(root, 'apps-script/Code.gs'), 'utf8'), server);
  let db = server.emptyDb_(), writes = 0, failWrite = false;
  server.load_ = () => clone(db);
  server.locked_ = fn => { const draft = clone(db); const result = fn(draft); if(failWrite)throw new Error("Drive no disponible");db = draft; writes++;return result; };
  const calls = [], events = [];
  let intercept = null;
  const defaultReply = body => {
    if (body.action === 'status') return { ok: true, apiVersion: version, authenticated: true, usuario: { usuario: 'audit', rol: role } };
    if (body.action === 'deletedRecordsList') { try { return server.deletedRecordsList_({usuario:'audit',rol:role}); } catch (error) { return {ok:false,error:error.message}; } }
    if (body.action === 'list') return { ok: true, records: clone(db.records) };
    if (body.action === 'sync') {
      try {
        const user={ usuario: 'audit', rol: role };
        if(version>=7)return server.sync_(body.operations,user,body.syncProtocol);
        const processed=[];
        for(const op of body.operations){const data=op.data||{},id=op.id;
          if(op.action==='create')server.create_(data.record,user.usuario,id);
          else if(op.action==='move')server.move_(data,user.usuario,id);
          else if(op.action==='createBatch')server.createBatch_(data.batch,user.usuario,id);
          else if(op.action==='verifyBatch')server.verifyBatch_(data,user.usuario,id);
          else if(op.action==='deleteRecord')server.deleteRecord_(data,user,id);
          else throw new Error('Operación pendiente no reconocida');
          processed.push(id);
        }
        return {ok:true,apiVersion:6,processed,records:clone(db.records)};
      }
      catch (error) { return { ok: false, error: error.message }; }
    }
    if (body.action === 'login') return { ok: true, token: 'fresh-token', usuario: { usuario: body.usuario, nombre: 'Audit', rol: 'ADMINISTRADOR' } };
    throw new Error('Unexpected request: ' + body.action);
  };
  const context = vm.createContext({
    indexedDB: new IDBFactory(), structuredClone, crypto, TextEncoder, Uint8Array, URLSearchParams, AbortSignal, Event,
    navigator: { onLine: true },
    localStorage: { getItem: key => local.get(key) ?? null, setItem: (key, value) => local.set(key, String(value)), removeItem: key => local.delete(key) },
    window: { CONTROL_EXPLOSIVOS_CONFIG: { apiUrl: 'https://audit.invalid' }, dispatchEvent: event => events.push(event.type) },
    fetch: async (_url, options) => {
      const body = JSON.parse(options.body.get('payload')); calls.push(body);
      const result = intercept ? await intercept(body, defaultReply) : defaultReply(body);
      return { ok: true, json: async () => clone(result) };
    },
  });
  const modules = new Map();
  function load(filename) {
    filename = path.resolve(root, filename);
    if (modules.has(filename)) return modules.get(filename).exports;
    const module = { exports: {} }; modules.set(filename, module);
    if (!sourceCache.has(filename)) sourceCache.set(filename, ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText);
    const fn = vm.runInContext('(function(module,exports,require){' + sourceCache.get(filename) + '\n})', context);
    fn(module, module.exports, name => load(name.startsWith('@/') ? name.slice(2) + '.ts' : path.resolve(path.dirname(filename), name + '.ts')));
    return module.exports;
  }
  return { backend: load('lib/backend.ts'), store: load('lib/offline-store.ts'), state: load('lib/sync-state.ts'), corrections: load('lib/inventory-corrections.ts'), order: load('lib/inventory-order.ts'), context, local, calls, events,
    get db() { return db; }, get writes(){return writes;}, failWrite:()=>{failWrite=true;}, server, setIntercept: value => { intercept = value; } };
}
const tests = [];
function test(name, run) { tests.push({ name, run }); }

test('27 pendientes: un duplicado se conserva y los otros 26 llegan', async () => {
  const h = harness();
  h.db.records.ANFO.push({ ...record(100), id: 'remote-existing' });
  await h.backend.saveRecord(record(100));
  for (let serial = 101; serial <= 126; serial++) await h.backend.saveRecord(record(serial));
  const result = await h.backend.synchronize();
  assert.equal(result.pending, 1); assert.equal(result.issues.length, 1);
  assert.match(result.issues[0].message, /Ya existe/);
  assert.equal(h.db.records.ANFO.length, 27);
  assert.equal((await h.store.getOperations()).length, 1);
  assert.equal(await h.store.getLocal('lastSync', ''), '', 'A partial pass is not a successful full sync');
});

test('un cambio dependiente espera al registro rechazado', async () => {
  const h = harness(); h.db.records.ANFO.push({ ...record(100), id: 'remote-existing' });
  const saved = await h.backend.saveRecord(record(100));
  await h.backend.moveRecord('ANFO', saved.id, 'Polvorín interior de mina', '2026-10-17T12:00:00.000Z');
  const result = await h.backend.synchronize();
  assert.equal(result.pending, 2); assert.equal(result.issues.length, 2);
  assert.equal(h.calls.filter(x => x.action === 'sync').length, 1);
});

test('respuesta perdida: reintento con el mismo ID sin duplicar', async () => {
  const h = harness(); await h.backend.saveRecord(record(101));
  const original = (await h.store.getOperations())[0].id;
  h.setIntercept((body, reply) => { const result = reply(body); if (body.action === 'sync') throw new Error('Network interrupted after commit'); return result; });
  await assert.rejects(h.backend.synchronize(), /No se pudo conectar/);
  assert.equal((await h.store.getOperations())[0].id, original);
  h.setIntercept(null); const result = await h.backend.synchronize();
  assert.equal(result.pending, 0); assert.equal(h.db.records.ANFO.length, 1);
  assert(await h.store.getLocal('lastSync', ''));
});

test('respuesta incompleta no elimina pendientes', async () => {
  const h = harness(); await h.backend.saveRecord(record(101));
  h.setIntercept((body, reply) => body.action === 'sync' ? { ok: true, processed: [body.operations[0].id] } : reply(body));
  await assert.rejects(h.backend.synchronize(), /inventario completo/);
  assert.equal((await h.store.getOperations()).length, 1);
  assert.equal((await h.store.getCachedRecords()).ANFO.length, 1);
});

test('confirmación de otro ID no elimina el pendiente enviado', async () => {
  const h = harness(); await h.backend.saveRecord(record(101));
  h.setIntercept((body, reply) => body.action === 'sync' ? { ok: true, processed: ['wrong-id'], records: blank() } : reply(body));
  await assert.rejects(h.backend.synchronize(), /no confirmó/);
  assert.equal((await h.store.getOperations()).length, 1);
});

test('un guardado durante la descarga se envía automáticamente', async () => {
  const h = harness(), started = deferred(), release = deferred();
  h.setIntercept(async (body, reply) => { if (body.action === 'list') { const snapshot = reply(body); started.resolve(); await release.promise; return snapshot; } return reply(body); });
  const syncing = h.backend.synchronize(); await started.promise;
  const saved = await h.backend.saveRecord(record(101)); release.resolve();
  const result = await syncing;
  assert.equal(result.pending, 0); assert.equal(result.records.ANFO[0].id, saved.id);
  assert.equal(h.db.records.ANFO[0].id,saved.id);
});

test('sincronizaciones simultáneas comparten una sola ejecución', async () => {
  const h = harness(); await h.backend.saveRecord(record(101));
  const first = h.backend.synchronize(), second = h.backend.synchronize();
  assert.equal(first, second); await first;
  assert.equal(h.calls.filter(x => x.action === 'sync').length, 1);
});

test('20 guardados simultáneos conservan inventario y cola completos', async () => {
  const h = harness();
  await Promise.all(Array.from({ length: 20 }, (_, i) => h.backend.saveRecord(record(100 + i))));
  assert.equal((await h.store.getOperations()).length, 20);
  assert.equal((await h.store.getCachedRecords()).ANFO.length, 20);
});

test('rechazo local revierte toda la transacción', async () => {
  const h = harness(); await h.backend.saveRecord(record(101));
  await assert.rejects(h.backend.saveRecord(record(101)), /ya está registrado/);
  assert.equal((await h.store.getOperations()).length, 1);
  assert.equal((await h.store.getCachedRecords()).ANFO.length, 1);
});

test('confirmación concurrente con guardado no borra la operación nueva', async () => {
  const h = harness(); await h.backend.saveRecord(record(101));
  const op = (await h.store.getOperations())[0], remote = blank(); remote.ANFO.push(op.data.record);
  await Promise.all([h.store.acceptSnapshot(remote, [op.id]), h.backend.saveRecord(record(102))]);
  assert.equal((await h.store.getOperations()).length, 1);
  assert.equal((await h.store.getCachedRecords()).ANFO.length, 2);
});

test('sesión vencida informa el problema antes de enviar pendientes', async () => {
  const h = harness(); await h.backend.saveRecord(record(101));
  h.setIntercept(() => ({ ok: true, apiVersion: 6, authenticated: false }));
  await assert.rejects(h.backend.synchronize(), /sesión del servidor venció/);
  assert.equal(h.calls.filter(x => x.action === 'sync').length, 0);
  assert.equal((await h.store.getOperations()).length, 1);
});

test('lectura local no declara una sincronización de red', async () => {
  const h = harness(); await h.backend.saveRecord(record(101));
  assert.equal((await h.backend.listRecords()).ANFO.length, 1);
  assert.equal(h.calls.length, 0); assert.equal(await h.store.getLocal('lastSync', ''), '');
});

test('sesión cambiada durante el envío no consume la cola', async () => {
  const h = harness(); await h.backend.saveRecord(record(101));
  h.setIntercept((body, reply) => { const result = reply(body); if (body.action === 'sync') h.local.set('control_explosivos_token', 'other-token'); return result; });
  await assert.rejects(h.backend.synchronize(), /sesión cambió/);
  assert.equal((await h.store.getOperations()).length, 1);
});

test('ingreso online espera el token renovado antes de retornar', async () => {
  const h = harness(); await h.backend.login('audit', 'test password');
  h.local.set('control_explosivos_token', 'expired-token');
  const started = deferred(), release = deferred();
  h.setIntercept(async (body, reply) => { if (body.action === 'login') { started.resolve(); await release.promise; } return reply(body); });
  let completed = false;
  const login = h.backend.login('audit', 'test password').then(result => { completed = true; return result; });
  await started.promise; assert.equal(completed, false); release.resolve();
  assert.equal((await login).token, 'fresh-token');
  assert.equal(h.local.get('control_explosivos_token'), 'fresh-token');
});

test('superposición conserva cambios y no oculta seriales por eliminaciones pausadas', async () => {
  const h = harness();
  const remote = blank(); remote.ANFO = [{ ...record(100), id: 'one', movimientos: [], verificado: false }, { ...record(101), id: 'two' }];
  const pending = [
    { id: 'v', action: 'verifyBatch', data: { tipo: 'ANFO', unidades: [{ id: 'one', fechaFabricacion: '2026-02-01', fechaVencimiento: '2028-02-01' }] } },
    { id: 'm', action: 'move', data: { tipo: 'ANFO', id: 'one', ubicacion: 'Polvorín interior de mina', fechaMovimiento: '2026-10-17T12:00:00.000Z' } },
    { id: 'd', action: 'deleteRecord', data: { tipo: 'ANFO', id: 'two' } },
  ].map(op => ({ ...op, createdAt: '2026-10-17T13:00:00.000Z' }));
  const result = h.state.overlayPending(remote, pending);
  assert.equal(result.ANFO.length, 2); assert.equal(result.ANFO[0].verificado, true);
  assert.equal(result.ANFO[0].ubicacion, 'Polvorín interior de mina');
  assert.equal(h.state.overlayPending(result, pending).ANFO[0].movimientos.length, 1);
  assert.equal(remote.ANFO.length, 2, 'The server snapshot is not mutated');
});

test('27 pendientes válidos requieren 2 solicitudes y una escritura central', async () => {
  const h = harness();
  for (let i = 0; i < 27; i++) await h.backend.saveRecord(record(100 + i));
  const result = await h.backend.synchronize();
  assert.equal(result.pending, 0); assert.equal(h.db.records.ANFO.length, 27);
  assert.equal(h.calls.length, 2);assert.equal(h.writes, 1);
  assert.deepEqual(h.calls.filter(x => x.action === 'sync').map(x => x.operations.length), [27]);
  assert.equal(h.calls.filter(x => x.action === 'list').length, 0);
});

test('servidor anterior: rechazo a mitad del grupo reintenta sin duplicar', async () => {
  const h = harness(6); h.db.records.ANFO.push({ ...record(102), id: 'remote-existing' });
  for (let i = 0; i < 5; i++) await h.backend.saveRecord(record(100 + i));
  const result = await h.backend.synchronize();
  assert.equal(result.pending, 1); assert.equal(result.issues.length, 1);
  assert.equal(h.db.records.ANFO.length, 5);
  for (let i = 100; i <= 104; i++) assert.equal(h.db.records.ANFO.filter(row => row.serial === i).length, 1);
  const calls = h.calls.filter(x => x.action === 'sync');
  assert.equal(calls[0].operations.length, 5);
  assert.equal(calls[1].operations[0].id, calls[0].operations[0].id);
});

test('servidor anterior: cambios dependientes mantienen el orden', async () => {
  const h = harness(6);
  const saved = await h.backend.saveRecord(record(100));
  await h.backend.moveRecord('ANFO', saved.id, 'Polvorín interior de mina', '2026-10-17T12:00:00.000Z');
  await h.backend.moveRecord('ANFO', saved.id, 'Polvorín superficie', '2026-10-17T13:00:00.000Z');
  await h.backend.saveRecord(record(101));
  const result = await h.backend.synchronize();
  assert.equal(result.pending, 0);
  const item = h.db.records.ANFO.find(row => row.id === saved.id);
  assert.equal(item.ubicacion, 'Polvorín superficie'); assert.equal(item.movimientos.length, 2);
  for (const call of h.calls.filter(x => x.action === 'sync')) {
    const keys = call.operations.flatMap(op => [...h.state.operationKeys(op)]);
    assert.equal(keys.length, new Set(keys).size);
  }
});

test('ingreso de cien unidades se envía separado de otros cambios', async () => {
  const h = harness(); await h.backend.saveRecord(record(100));
  await h.backend.saveBatchRecords({ ...record(200), rangos: [{ desde: 200, hasta: 299 }] });
  await h.backend.saveRecord(record(300));
  const result = await h.backend.synchronize();
  assert.equal(result.pending, 0); assert.equal(h.db.records.ANFO.length, 102);
  const call = h.calls.find(x => x.action === 'sync' && x.operations.some(op => op.action === 'createBatch'));
  assert.equal(call.operations.length, 1);
});

test('confirmación parcial de un grupo conserva todos sus pendientes', async () => {
  const h = harness(); for (let i = 0; i < 5; i++) await h.backend.saveRecord(record(100 + i));
  h.setIntercept((body, reply) => body.action === 'sync' ? { ok: true, processed: [body.operations[0].id], records: blank() } : reply(body));
  await assert.rejects(h.backend.synchronize(), /no confirmó/);
  assert.equal((await h.store.getOperations()).length, 5);
  assert.equal((await h.store.getCachedRecords()).ANFO.length, 5);
});

test('interrupción a mitad del grupo recupera los mismos cinco IDs', async () => {
  const h = harness(); for (let i = 0; i < 5; i++) await h.backend.saveRecord(record(100 + i));
  const ids = (await h.store.getOperations()).map(op => op.id);
  h.setIntercept((body, reply) => {
    if (body.action === 'sync') { reply({ ...body, operations: body.operations.slice(0, 2) }); throw new Error('Connection lost'); }
    return reply(body);
  });
  await assert.rejects(h.backend.synchronize(), /No se pudo conectar/);
  assert.deepEqual((await h.store.getOperations()).map(op => op.id), ids);
  h.setIntercept(null); const result = await h.backend.synchronize();
  assert.equal(result.pending, 0); assert.equal(h.db.records.ANFO.length, 5);
});

test('un guardado durante el último grupo se envía sin descarga adicional', async () => {
  const h = harness(); for (let i = 0; i < 5; i++) await h.backend.saveRecord(record(100 + i));
  const started = deferred(), release = deferred();
  h.setIntercept(async (body, reply) => {
    const result = reply(body);
    if (body.action === 'sync') { started.resolve(); await release.promise; }
    return result;
  });
  const syncing = h.backend.synchronize(); await started.promise;
  const saved = await h.backend.saveRecord(record(105)); release.resolve();
  const result = await syncing;
  assert.equal(result.pending, 0); assert(result.records.ANFO.some(row => row.id === saved.id));
  assert(h.db.records.ANFO.some(row=>row.id===saved.id));
  assert.equal(h.calls.filter(x=>x.action==='status').length,1);
  assert.equal(h.calls.filter(x => x.action === 'list').length, 0);
});

test('validar la misma sesión no dispara otra recarga de inventario', async () => {
  const h = harness();
  h.setIntercept((body, reply) => body.action === 'status' ? { ...reply(body), usuario: JSON.parse(h.local.get('control_explosivos_user')) } : reply(body));
  await h.backend.getStatus(); await new Promise(setImmediate);
  assert.equal(h.events.filter(event => event === 'explosivos-access-updated').length, 0);
});

test('operador: crear, verificar y mover no exige rol administrador', async () => {
 const h=harness(7,'OPERADOR');
 await h.backend.saveBatchRecords({...record(300),rangos:[{desde:300,hasta:300}]});
 const item=(await h.store.getCachedRecords()).ANFO[0];
 await h.backend.verifyBatchRecords('ANFO',[{id:item.id,fechaFabricacion:'2026-01-01',fechaVencimiento:'2027-01-01'}]);
 await h.backend.moveRecord('ANFO',item.id,'Polvorín interior de mina','2026-10-17T12:00:00.000Z');
 const result=await h.backend.synchronize();assert.equal(result.pending,0);assert.equal(h.db.records.ANFO[0].ubicacion,'Polvorín interior de mina');
});
test('eliminación pausada no bloquea otros registros',async()=>{
 const h=harness(7,'OPERADOR');h.db.records.ANFO.push({...record(100),id:'existing'});
 await h.store.acceptSnapshot(h.db.records);await h.store.enqueue('deleteRecord',{tipo:'ANFO',id:'existing'});await h.backend.saveRecord(record(101));
 const result=await h.backend.synchronize();assert.equal(result.pending,1);assert.match(result.issues[0].message,/deshabilitada/);
 assert.equal(h.db.records.ANFO.length,2);assert.equal(h.writes,1);assert.equal(h.calls.length,2);
});
test('recibos individuales identifican rechazo y dependencias dentro del mismo lote',async()=>{
 const h=harness();h.db.records.ANFO.push({...record(100),id:'existing'});
 const item=await h.backend.saveRecord(record(100));
 await h.backend.moveRecord('ANFO',item.id,'Polvorín interior de mina','2026-10-17T12:00:00.000Z');
 await h.backend.saveRecord(record(101));
 const result=await h.backend.synchronize();assert.equal(result.pending,2);assert.equal(result.issues.length,2);assert.equal(h.calls.length,2);assert.equal(h.writes,1);
 assert.match(result.issues[1].message,/cambio anterior/);
});
test('fallo de escritura central conserva todos los pendientes sin confirmar',async()=>{
 const h=harness();await h.backend.saveRecord(record(100));h.failWrite();
 await assert.rejects(h.backend.synchronize(),/Drive no disponible/);assert.equal(h.db.records.ANFO.length,0);assert.equal((await h.store.getOperations()).length,1);
});
test('recibos contradictorios o de otro ID nunca consumen la cola',async()=>{
 for(const corrupt of [r=>r.rejected.push({id:r.processed[0],message:'rechazado'}),r=>{r.processed=[];r.rejected=[{id:'otro-id',message:'rechazado'}]},r=>{r.processed=[];r.rejected=[{id:r.rejected[0]?.id,message:''}]}]){
  const h=harness();await h.backend.saveRecord(record(100));h.setIntercept((body,reply)=>{const r=reply(body);if(body.action==='sync')corrupt(r);return r;});
  await assert.rejects(h.backend.synchronize(),/no confirmó/);assert.equal((await h.store.getOperations()).length,1);
 }
});
test('más de 50 operaciones se confirman por lotes limitados',async()=>{
 const h=harness();for(let n=100;n<161;n++)await h.backend.saveRecord(record(n));
 const result=await h.backend.synchronize();assert.equal(result.pending,0);assert.equal(h.writes,2);assert.deepEqual(h.calls.filter(r=>r.action==='sync').map(r=>r.operations.length),[50,11]);
});
test('servidor anterior conserva lotes de cinco y confirmaciones completas',async()=>{
 const h=harness(6);for(let n=100;n<127;n++)await h.backend.saveRecord(record(n));
 const result=await h.backend.synchronize();assert.equal(result.pending,0);assert.equal(h.calls.length,7);assert.equal(h.writes,27);
});

test('eliminaciones anteriores no se envían ni ocultan seriales del servidor',async()=>{
 for(const version of [6,7]){
  const h=harness(version);h.db.records.ANFO.push({...record(100),id:'delete-me'});await h.store.acceptSnapshot(h.db.records);
  await h.store.enqueue('deleteRecord',{tipo:'ANFO',id:'delete-me'});await h.store.enqueue('deleteRecord',{tipo:'ANFO',id:'delete-me'});
  const result=await h.backend.synchronize();assert.equal(result.pending,2);assert.equal(h.db.deletedRecords.length,0);assert.equal(result.records.ANFO.length,1);
  assert.equal(h.calls.filter(x=>x.action==='sync').length,0);assert.match(result.issues[0].message,/deshabilitada/);
 }
});
test('la función antigua no permite generar nuevas eliminaciones',async()=>{
 const h=harness();await h.backend.saveRecord(record(100));const item=(await h.store.getCachedRecords()).ANFO[0];
 await assert.rejects(h.backend.deleteRecord('ANFO',item.id),/deshabilitada/);assert.equal((await h.store.getCachedRecords()).ANFO.length,1);
 assert.equal((await h.store.getOperations()).filter(op=>op.action==='deleteRecord').length,0);
});

test('llegada continua de cambios termina tras tres rondas conservando el resto',async()=>{
 const h=harness();await h.backend.saveRecord(record(100));let next=101;
 h.setIntercept(async(body,reply)=>{const result=reply(body);if(body.action==='sync')await h.backend.saveRecord(record(next++));return result;});
 const result=await h.backend.synchronize();assert.equal(result.pending,1);assert.equal(result.hasNewPending,true);
 assert.equal(h.db.records.ANFO.length,3);assert.equal(result.records.ANFO.length,4);
 assert.equal(h.calls.filter(x=>x.action==='sync').length,3);
});
test('nuevos cambios dependientes no adelantan un rechazo de la primera ronda',async()=>{
 const h=harness();h.db.records.ANFO.push({...record(100),id:'existing'});
 const item=await h.backend.saveRecord(record(100));let added=false;
 h.setIntercept(async(body,reply)=>{const result=reply(body);if(body.action==='sync'&&!added){added=true;await h.backend.moveRecord('ANFO',item.id,'Polvorín interior de mina','2026-10-17T12:00:00.000Z');await h.backend.saveRecord(record(101));}return result;});
 const result=await h.backend.synchronize();assert.equal(result.pending,2);assert.equal(result.issues.length,2);assert.match(result.issues[1].message,/cambio anterior/);
 assert.equal(h.calls.filter(x=>x.action==='sync').length,2);assert.equal(h.db.records.ANFO.length,2);
});
test('corte después de guardar se clasifica para reintento sin perder el mismo ID',async()=>{
 const h=harness();await h.backend.saveRecord(record(100));const id=(await h.store.getOperations())[0].id;
 h.setIntercept((body,reply)=>{const result=reply(body);if(body.action==='sync')throw new Error('corte');return result;});
 await assert.rejects(h.backend.synchronize(),error=>h.backend.isTransientSyncError(error));
 h.setIntercept(null);const result=await h.backend.synchronize();assert.equal(result.pending,0);assert.equal(h.db.records.ANFO.length,1);
 assert.equal(h.calls.filter(x=>x.action==='sync')[1].operations[0].id,id);
});
test('HTTP temporal permite reintento; permisos e inventario inválido lo detienen',async()=>{
 for(const status of [408,429,500,503,401,403]){
  const h=harness();await h.backend.saveRecord(record(100));h.context.fetch=async()=>({ok:false,status});
  await assert.rejects(h.backend.synchronize(),error=>h.backend.isTransientSyncError(error)===[408,429,500,503].includes(status));
  assert.equal((await h.store.getOperations()).length,1);
 }
 const h=harness();await h.backend.saveRecord(record(100));h.setIntercept((body,reply)=>body.action==='sync'?{ok:true,processed:[],records:{}}:reply(body));
 await assert.rejects(h.backend.synchronize(),error=>!h.backend.isTransientSyncError(error));
});
test('actualizaciones locales concurrentes conservan marcas ajenas y abortan completas',async()=>{
 const h=harness();await h.store.setLocal('revista-test',{old:'old'});
 await Promise.all([h.store.updateLocal('revista-test',{},value=>({...value,a:'a'})),h.store.updateLocal('revista-test',{},value=>({...value,b:'b'}))]);
 const marks=await h.store.getLocal('revista-test',{});assert.equal(marks.old,'old');assert.equal(marks.a,'a');assert.equal(marks.b,'b');
 await assert.rejects(h.store.updateLocal('revista-test',{},value=>{delete value.old;throw new Error('fallo');}),/fallo/);
 assert.equal((await h.store.getLocal('revista-test',{})).old,'old');
});

function archivedFixture(h, serial=555) {
 const item={...record(serial),id:'recover-'+serial,verificado:true,fechaRegistro:'2026-10-16T10:00:00.000Z',movimientos:[]};
 const entry={tipo:'ANFO',registro:item,eliminadoPor:'audit',fechaEliminacion:'2026-10-17T12:00:00.000Z'};
 h.db.deletedRecords.push(entry);return entry;
}
function movedFixture(h) {
 const item={...record(777),id:'moved',verificado:true,ubicacion:'Polvorín interior de mina',movimientos:[{fecha:'2026-10-17T12:00:00.000Z',origen:'Polvorín superficie',destino:'Polvorín interior de mina',usuario:'original'}]};
 h.db.records.ANFO.push(item);return item;
}
test('API 8 recupera el mismo ID, serial y datos; conserva copia y auditoría',async()=>{
 const h=harness(8),entry=archivedFixture(h);
 assert.equal((await h.backend.getCorrectionData()).archived.length,1);
 await h.backend.restoreDeletedRecord(entry,'Eliminación por confusión');
 assert.equal((await h.store.getCachedRecords()).ANFO.length,0,'No fingir recuperación antes de confirmar');
 const result=await h.backend.synchronize();assert.equal(result.pending,0);
 const restored=h.db.records.ANFO[0];
 for(const key of Object.keys(entry.registro))assert.equal(JSON.stringify(restored[key]),JSON.stringify(entry.registro[key]));
 assert.equal(restored.restauraciones[0].motivo,'Eliminación por confusión');
 assert.equal(h.db.deletedRecords.length,1);assert(h.db.deletedRecords[0].restaurado);
 assert.equal((await h.backend.getCorrectionData()).archived.length,0);
});
test('respuesta perdida al recuperar no duplica serial ni auditoría',async()=>{
 const h=harness(8),entry=archivedFixture(h);await h.backend.restoreDeletedRecord(entry,'Error');
 const original=(await h.store.getOperations())[0].id;
 h.setIntercept((body,reply)=>{const result=reply(body);if(body.action==='sync')throw new Error('lost');return result;});
 await assert.rejects(h.backend.synchronize(),/No se pudo conectar/);
 assert.equal(h.db.records.ANFO.length,1);assert.equal((await h.store.getOperations())[0].id,original);
 h.setIntercept(null);assert.equal((await h.backend.synchronize()).pending,0);
 assert.equal(h.db.records.ANFO.length,1);assert.equal(h.db.records.ANFO[0].restauraciones.length,1);
});
test('recuperación rechaza serial duplicado sin reemplazar ni perder registros',async()=>{
 const h=harness(8),entry=archivedFixture(h);h.db.records.ANFO.push({...record(555),id:'different-id'});
 await h.backend.restoreDeletedRecord(entry,'Error');const result=await h.backend.synchronize();
 assert.equal(result.pending,0);assert.match(result.issues[0].message,/Ya existe/);
 assert.equal((await h.backend.getCorrectionData()).rejected.length,1);
 assert.equal(h.db.records.ANFO[0].id,'different-id');assert.equal(h.db.records.ANFO.length,1);assert(!h.db.deletedRecords[0].restaurado);
});
test('revertir mantiene serial, cantidad e historial y quita fecha de traslado vigente',async()=>{
 const h=harness(8),item=movedFixture(h),expected=h.corrections.latestReversibleMovement(item);
 await h.backend.synchronize();await h.backend.revertLastMovement('ANFO',item.id,expected,'Traslado registrado por error');
 assert.equal((await h.store.getCachedRecords()).ANFO[0].ubicacion,'Polvorín interior de mina');
 const result=await h.backend.synchronize();assert.equal(result.pending,0);
 const changed=h.db.records.ANFO[0];assert.equal(changed.id,item.id);assert.equal(changed.serial,777);assert.equal(h.db.records.ANFO.length,1);
 assert.equal(changed.ubicacion,'Polvorín superficie');assert.equal(changed.movimientos.length,1);assert.equal(changed.movimientos[0].usuario,'original');
 assert.equal(changed.movimientos[0].reversion.usuario,'audit');assert.equal(changed.movimientos[0].reversion.motivo,'Traslado registrado por error');
 assert.equal(h.order.transferDate(changed),'');assert.equal(h.corrections.latestReversibleMovement(changed),null);
});
test('reversión con respuesta perdida se aplica una sola vez',async()=>{
 const h=harness(8),item=movedFixture(h);await h.backend.revertLastMovement('ANFO',item.id,h.corrections.latestReversibleMovement(item),'Error');
 h.setIntercept((body,reply)=>{const result=reply(body);if(body.action==='sync')throw new Error('lost');return result;});
 await assert.rejects(h.backend.synchronize(),/No se pudo conectar/);
 const audit=JSON.stringify(h.db.records.ANFO[0].movimientos[0].reversion);
 h.setIntercept(null);assert.equal((await h.backend.synchronize()).pending,0);
 assert.equal(JSON.stringify(h.db.records.ANFO[0].movimientos[0].reversion),audit);
});
test('traslado nuevo impide revertir una selección desactualizada',async()=>{
 const h=harness(8),item=movedFixture(h);await h.backend.revertLastMovement('ANFO',item.id,h.corrections.latestReversibleMovement(item),'Error');
 h.server.move_({tipo:'ANFO',id:item.id,ubicacion:'Polvorín superficie',fechaMovimiento:'2026-10-17T13:00:00.000Z'},'other','new-move');
 const result=await h.backend.synchronize();assert.equal(result.pending,0);assert.match(result.issues[0].message,/cambió o ya fue revertido/);
 const audit=await h.store.getLocal('rejectedCorrections',[]);assert.equal(audit.length,1);assert.equal(audit[0].data.reason,'Error');
 await h.backend.synchronize();assert.equal(h.db.records.ANFO[0].ubicacion,'Polvorín superficie');
 assert.equal(h.db.records.ANFO[0].movimientos.length,2);assert(!h.db.records.ANFO[0].movimientos[1].revertido);
 assert.equal(h.db.records.ANFO[0].serial,777);
});
test('API anterior no recibe correcciones; operadores tampoco pueden ejecutarlas',async()=>{
 const old=harness(7),entry=archivedFixture(old);
 assert.equal((await old.backend.getCorrectionData()).needsServerUpdate,true);
 await assert.rejects(old.backend.restoreDeletedRecord(entry,'Error'),/Actualiza Code.gs/);
 assert.equal((await old.store.getOperations()).length,0);
 await old.store.enqueueCorrection('restoreRecord',{tipo:'ANFO',id:entry.registro.id,deletedAt:entry.fechaEliminacion,reason:'Error'});
 const blocked=await old.backend.synchronize();assert.equal(blocked.pending,1);assert.equal(old.calls.filter(x=>x.action==='sync').length,0);
 const operator=harness(8,'OPERADOR'),deleted=archivedFixture(operator);
 await assert.rejects(operator.backend.restoreDeletedRecord(deleted,'Error'),/administrador/);
 assert.throws(()=>operator.server.restoreRecord_({tipo:'ANFO',id:deleted.registro.id,deletedAt:deleted.fechaEliminacion,reason:'Error'},{usuario:'op',rol:'OPERADOR'},'bad'),/administrador/);
 assert.throws(()=>operator.server.revertMovement_({},{usuario:'op',rol:'OPERADOR'},'bad'),/administrador/);
 assert.throws(()=>operator.server.deletedRecordsList_({rol:'OPERADOR'}),/administrador/);
 assert.equal(operator.db.records.ANFO.length,0);
});
test('clientes antiguos no pueden eliminar seriales en servidor API 8',async()=>{
 const h=harness(8);h.db.records.ANFO.push({...record(555),id:'keep'});
 assert.throws(()=>h.server.deleteRecord_({tipo:'ANFO',id:'keep'},{usuario:'audit',rol:'ADMINISTRADOR'},'del'),/deshabilitada/);
 const result=h.server.sync_([{id:'del',action:'deleteRecord',data:{tipo:'ANFO',id:'keep'}}],{usuario:'audit',rol:'ADMINISTRADOR'},'explosivos-receipts-v1');
 assert.equal(result.rejected.length,1);assert.equal(h.db.records.ANFO.length,1);assert.equal(h.db.deletedRecords.length,0);
});
test('cancelar eliminaciones retiene auditoría, serial y todos los pendientes ajenos',async()=>{
 const h=harness(7);h.db.records.ANFO.push({...record(555),id:'keep'});
 await h.store.enqueue('deleteRecord',{tipo:'ANFO',id:'keep'});await h.store.enqueue('deleteRecord',{tipo:'ANFO',id:'keep'});
 await h.store.enqueue('deleteRecord',{tipo:'ANFO',id:'other'});
 await h.backend.saveRecord(record(556));
 const result=await h.backend.cancelDeletionRequest('ANFO','keep');assert.equal(result.cancelled,2);assert.equal(result.present,true);
 assert.equal((await h.store.getOperations()).length,2);assert.equal((await h.store.getCachedRecords()).ANFO.length,2);
 const audit=await h.store.getLocal('cancelledOperations',[]);assert.equal(audit.length,2);assert.equal(audit[0].cancelledBy,'audit');
 assert.equal(h.calls.filter(x=>x.action==='sync').length,0);
});
test('cancelar solicitud ya eliminada no declara recuperación y exige restauración aparte',async()=>{
 const h=harness(8),entry=archivedFixture(h);await h.store.enqueue('deleteRecord',{tipo:'ANFO',id:entry.registro.id});
 await assert.rejects(h.backend.restoreDeletedRecord(entry,'Error'),/cancela primero/);
 const result=await h.backend.cancelDeletionRequest('ANFO',entry.registro.id);assert.equal(result.present,false);
 assert.equal(h.db.records.ANFO.length,0);await h.backend.restoreDeletedRecord(entry,'Error');await h.backend.synchronize();assert.equal(h.db.records.ANFO.length,1);
});
test('dos correcciones simultáneas del mismo registro generan una sola solicitud',async()=>{
 const h=harness(8),entry=archivedFixture(h);
 const results=await Promise.allSettled([h.backend.restoreDeletedRecord(entry,'Error'),h.backend.restoreDeletedRecord(entry,'Error')]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal((await h.store.getOperations()).length,1);
});
test('fallo de guardado central no confirma una recuperación ni altera el archivo',async()=>{
 const h=harness(8),entry=archivedFixture(h);await h.backend.restoreDeletedRecord(entry,'Error');h.failWrite();
 await assert.rejects(h.backend.synchronize(),/Drive no disponible/);assert.equal(h.db.records.ANFO.length,0);assert(!h.db.deletedRecords[0].restaurado);assert.equal((await h.store.getOperations()).length,1);
});

(async () => {
  for (const { name, run } of tests) { await run(); console.log('PASS:', name); }
  console.log(`${tests.length} pruebas de sincronización superadas; sin acceso a datos reales.`);
})().catch(error => { console.error(error); process.exitCode = 1; });


