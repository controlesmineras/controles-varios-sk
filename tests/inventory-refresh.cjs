const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), ts = require('typescript');
const root = path.resolve(__dirname, '..');
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
const inventory = location => ({ INDUGEL: [{ id: 'reentered', serial: 30288, verificado: true, ubicacion: location, movimientos: [] }], ANFO: [], 'MECHA DE SEGURIDAD': [], DETONADORES: [], SELLOS: [] });
const surface = 'Polvorín superficie', interior = 'Polvorín interior de mina';
function harness() {
  const slots = [], effects = []; let cursor = 0, changed = true, tree;
  const window = new EventTarget(), document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  const navigator = { onLine: true }, local = new Map([['control_explosivos_token', 'session']]);
  let saved = inventory(surface), pending = 0, calls = 0, release = deferred();
  const hooks = {
    useState(initial) { const i = cursor++; if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, value => { const next = typeof value === 'function' ? value(slots[i].value) : value; if (!Object.is(next, slots[i].value)) { slots[i].value = next; changed = true; } }]; },
    useRef(value) { const i = cursor++; return slots[i] ||= { current: value }; },
    useMemo(fn, deps) { const i = cursor++, old = slots[i]; if (!old || deps.some((x, n) => !Object.is(x, old.deps[n]))) slots[i] = { deps, value: fn() }; return slots[i].value; },
    useCallback(fn, deps) { return this.useMemo(() => fn, deps); },
    useEffect(effect, deps) { const i = cursor++, old = slots[i]; if (!old || deps.some((x, n) => !Object.is(x, old.deps[n]))) { slots[i] = { deps, cleanup: old?.cleanup }; effects.push(() => { slots[i].cleanup?.(); slots[i].cleanup = effect(); }); } },
  };
  // React calls these functions without a receiver.
  hooks.useCallback = (fn, deps) => hooks.useMemo(() => fn, deps);
  const backend = {
    backendConfigured: () => true,
    getStatus: async () => ({ authenticated: true, usuario: { usuario: 'audit', nombre: 'Audit', rol: 'OPERADOR' } }),
    listRecords: async () => structuredClone(saved), pendingOperations: async () => pending,
    isTransientSyncError: () => false,
    synchronize: async () => { calls++; const snapshot = structuredClone(saved), count = pending; await release.promise; return { records: snapshot, pending: count, issues: [] }; },
  };
  const imports = {
    react: hooks,
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    '@/lib/backend': backend,
    '@/lib/offline-store': { getLocal: async (_key, fallback) => fallback },
    '@/lib/use-revista': { useRevista: () => ({ active: false, ready: true, checked: () => false }) },
    '@/lib/inventory-order': { compareInventory: () => 0, inventoryOrderLabels: { TRASLADO: 'Traslado' }, inventoryOrderOptions: ['TRASLADO'], transferDate: () => '' },
  };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, 'app/page.tsx'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext('(function(module,exports,require){' + code + '\n})', { window, document, navigator, localStorage: { getItem: key => local.get(key) ?? null }, AbortController, setTimeout, clearTimeout })(module, module.exports, name => {
    if (imports[name]) return imports[name];
    if (name === 'lucide-react' || name.startsWith('@/components/')) return new Proxy({}, { get: (_target, key) => key });
    throw new Error('Unexpected import: ' + name);
  });
  function render() { for (let n = 0; changed; n++) { assert(n < 30, 'Render loop'); changed = false; cursor = 0; tree = module.exports.default(); while (effects.length) effects.shift()(); } }
  async function settle() { for (let n = 0; n < 4; n++) { render(); await new Promise(setImmediate); } render(); }
  function nodes(node) { if (arguments.length === 0) node = tree; if (!node || typeof node !== 'object') return []; if (Array.isArray(node)) return node.flatMap(nodes); return [node, ...nodes(node.props?.children)]; }
  function card() { return nodes().find(node => node.type === 'button' && node.props['aria-label']?.startsWith('INDUGEL.')); }
  function counts() { return nodes(card()).filter(node => node.type === 'strong').map(node => node.props.children); }
  return { settle, render, window, navigator, local, counts, card, nodes, get calls() { return calls; },
    save(location, count = 1) { saved = inventory(location); pending = count; },
    onSaved() { return nodes().find(node => node.type === 'MovementDialog').props.onSaved(); },
    finish() { release.resolve(); },
    setSync(fn) { backend.synchronize = fn; },
  };
}
const tests = [], test = (name, run) => tests.push({name, run});
test('guardar un traslado refresca Indugel aunque otra sincronización siga esperando', async () => {
  const h = harness(); await h.settle(); assert.deepEqual(h.counts(), ['1', '1']); assert.equal(h.calls, 1);
  h.save(interior); await h.onSaved(); await h.settle();
  assert.deepEqual(h.counts(), ['1', '0'], 'La tarjeta debe reflejar el traslado guardado, sin esperar la red');
  h.card().props.onClick(); h.render(); assert.deepEqual(h.counts(), ['154', '0'], 'Las barras usan la ubicación nueva');
});
test('el progreso de un lote refresca existencias y no solo el contador de pendientes', async () => {
  const h = harness(); await h.settle(); h.save(interior);
  h.window.dispatchEvent(new Event('explosivos-sync-progress')); await h.settle();
  assert.deepEqual(h.counts(), ['1', '0']); assert.equal(h.calls, 1, 'Refrescar la tarjeta no debe crear otra petición de red');
});
test('una respuesta anterior no devuelve el material al almacén y el guardado solicitado se sincroniza después', async () => {
  const h = harness(); await h.settle(); h.save(interior); await h.onSaved();
  let followups = 0;
  h.setSync(async () => { followups++; h.save(interior, 0); return { records: inventory(interior), pending: 0, issues: [] }; });
  h.finish(); await h.settle();
  assert.deepEqual(h.counts(), ['1', '0']); assert.equal(followups, 1, 'No perder la sincronización pedida mientras estaba ocupada');
});
test('sin conexión, el guardado actualiza las cifras sin hacer solicitudes nuevas', async () => {
  const h = harness(); await h.settle(); h.finish(); await h.settle(); const calls = h.calls;
  h.navigator.onLine = false; h.save(interior); await h.onSaved(); await h.settle();
  assert.deepEqual(h.counts(), ['1', '0']); assert.equal(h.calls, calls);
});
test('un cambio de sesión descarta la actualización de la respuesta anterior', async () => {
  const h = harness(); await h.settle(); h.save(interior); h.local.delete('control_explosivos_token'); h.finish(); await h.settle();
  assert.deepEqual(h.counts(), ['1', '1']);
});
(async () => { for (const {name, run} of tests) { await run(); console.log('PASS:', name); } console.log(`${tests.length} pruebas de actualización visual superadas; sin datos reales.`); })().catch(error => { console.error(error); process.exitCode = 1; });
