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
function harness() {
  const local = new Map([['control_explosivos_token', 'token'], ['control_explosivos_user', JSON.stringify({ usuario: 'audit', nombre: 'Audit', rol: 'ADMINISTRADOR' })]]);
  const server = { Utilities: { getUuid: () => crypto.randomUUID() } };
  vm.createContext(server);
  vm.runInContext(fs.readFileSync(path.join(root, 'apps-script/Code.gs'), 'utf8'), server);
  let db = server.emptyDb_();
  server.load_ = () => clone(db);
  server.locked_ = fn => { const draft = clone(db); const result = fn(draft); db = draft; return result; };
  const calls = [], events = [];
  let intercept = null;
  const defaultReply = body => {
    if (body.action === 'status') return { ok: true, apiVersion: 6, authenticated: true, usuario: { usuario: 'audit' } };
    if (body.action === 'list') return { ok: true, records: clone(db.records) };
    if (body.action === 'sync') {
      try { return server.sync_(body.operations, { usuario: 'audit', rol: 'ADMINISTRADOR' }); }
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
  return { backend: load('lib/backend.ts'), store: load('lib/offline-store.ts'), state: load('lib/sync-state.ts'), context, local, calls, events,
    get db() { return db; }, setIntercept: value => { intercept = value; } };
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

test('un guardado durante la descarga permanece visible y pendiente', async () => {
  const h = harness(), started = deferred(), release = deferred();
  h.setIntercept(async (body, reply) => { if (body.action === 'list') { const snapshot = reply(body); started.resolve(); await release.promise; return snapshot; } return reply(body); });
  const syncing = h.backend.synchronize(); await started.promise;
  const saved = await h.backend.saveRecord(record(101)); release.resolve();
  const result = await syncing;
  assert.equal(result.pending, 1); assert.equal(result.records.ANFO[0].id, saved.id);
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

test('superposición conserva verificaciones, movimientos y eliminaciones', async () => {
  const h = harness();
  const remote = blank(); remote.ANFO = [{ ...record(100), id: 'one', movimientos: [], verificado: false }, { ...record(101), id: 'two' }];
  const pending = [
    { id: 'v', action: 'verifyBatch', data: { tipo: 'ANFO', unidades: [{ id: 'one', fechaFabricacion: '2026-02-01', fechaVencimiento: '2028-02-01' }] } },
    { id: 'm', action: 'move', data: { tipo: 'ANFO', id: 'one', ubicacion: 'Polvorín interior de mina', fechaMovimiento: '2026-10-17T12:00:00.000Z' } },
    { id: 'd', action: 'deleteRecord', data: { tipo: 'ANFO', id: 'two' } },
  ].map(op => ({ ...op, createdAt: '2026-10-17T13:00:00.000Z' }));
  const result = h.state.overlayPending(remote, pending);
  assert.equal(result.ANFO.length, 1); assert.equal(result.ANFO[0].verificado, true);
  assert.equal(result.ANFO[0].ubicacion, 'Polvorín interior de mina');
  assert.equal(h.state.overlayPending(result, pending).ANFO[0].movimientos.length, 1);
  assert.equal(remote.ANFO.length, 2, 'The server snapshot is not mutated');
});

test('27 pendientes válidos requieren 7 solicitudes en lugar de 29', async () => {
  const h = harness();
  for (let i = 0; i < 27; i++) await h.backend.saveRecord(record(100 + i));
  const result = await h.backend.synchronize();
  assert.equal(result.pending, 0); assert.equal(h.db.records.ANFO.length, 27);
  assert.equal(h.calls.length, 7);
  assert.deepEqual(h.calls.filter(x => x.action === 'sync').map(x => x.operations.length), [5, 5, 5, 5, 5, 2]);
  assert.equal(h.calls.filter(x => x.action === 'list').length, 0);
});

test('rechazo a mitad del grupo reintenta los confirmados sin duplicarlos', async () => {
  const h = harness(); h.db.records.ANFO.push({ ...record(102), id: 'remote-existing' });
  for (let i = 0; i < 5; i++) await h.backend.saveRecord(record(100 + i));
  const result = await h.backend.synchronize();
  assert.equal(result.pending, 1); assert.equal(result.issues.length, 1);
  assert.equal(h.db.records.ANFO.length, 5);
  for (let i = 100; i <= 104; i++) assert.equal(h.db.records.ANFO.filter(row => row.serial === i).length, 1);
  const calls = h.calls.filter(x => x.action === 'sync');
  assert.equal(calls[0].operations.length, 5);
  assert.equal(calls[1].operations[0].id, calls[0].operations[0].id);
});

test('cambios del mismo registro mantienen el orden entre grupos', async () => {
  const h = harness();
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

test('un guardado durante el último grupo permanece visible sin descarga adicional', async () => {
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
  assert.equal(result.pending, 1); assert(result.records.ANFO.some(row => row.id === saved.id));
  assert.equal(h.calls.filter(x => x.action === 'list').length, 0);
});

test('validar la misma sesión no dispara otra recarga de inventario', async () => {
  const h = harness();
  h.setIntercept((body, reply) => body.action === 'status' ? { ...reply(body), usuario: JSON.parse(h.local.get('control_explosivos_user')) } : reply(body));
  await h.backend.getStatus(); await new Promise(setImmediate);
  assert.equal(h.events.filter(event => event === 'explosivos-access-updated').length, 0);
});

(async () => {
  for (const { name, run } of tests) { await run(); console.log('PASS:', name); }
  console.log(`${tests.length} pruebas de sincronización superadas; sin acceso a datos reales.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
