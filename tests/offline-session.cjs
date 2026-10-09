const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const values = new Map();
const localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
const navigator = { onLine: true };
let requests = 0;
const user = { usuario: 'qa', nombre: 'Prueba', rol: 'OPERADOR' };
const context = {
  localStorage, navigator, crypto: globalThis.crypto, TextEncoder, Uint8Array, URLSearchParams, AbortSignal, Event,
  window: { CONTROL_EXPLOSIVOS_CONFIG: { apiUrl: 'https://example.invalid' }, dispatchEvent() {} },
  fetch: async (_url, options) => {
    requests++;
    if (!navigator.onLine) throw new Error('No network');
    const body = JSON.parse(options.body.get('payload'));
    return { json: async () => body.action === 'login'
      ? body.usuario === 'qa' && body.password === 'test password' ? { ok: true, token: 'qa-token', usuario: user } : { ok: false, error: 'Usuario o contraseña incorrectos.' }
      : { ok: true, needsBootstrap: false, authenticated: body.token === 'qa-token', usuario: user } };
  },
};
function load(filename, imports = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { ...context, module, exports: module.exports, require: name => imports[name] || {} });
  return module.exports;
}
const access = load('lib/device-access.ts');
const backend = load('lib/backend.ts', { '@/lib/device-access': access });
(async () => {
  await backend.login('qa', 'test password');
  assert(![...values.values()].join('').includes('test password'), 'Do not store plaintext passwords');
  navigator.onLine = false;
  const beforeOffline = requests;
  assert.equal((await backend.getStatus()).usuario.usuario, 'qa');
  backend.logout();
  assert.equal((await backend.getStatus()).authenticated, false, 'Explicit logout must be respected');
  await assert.rejects(backend.login('qa', 'wrong password'));
  await assert.rejects(backend.login('unknown', 'test password'));
  assert.equal((await backend.login('qa', 'test password')).usuario.usuario, 'qa');
  assert.equal(requests, beforeOffline, 'Offline restoration and login must not contact the server');
  values.set('control_explosivos_user', 'invalid-json');
  assert.equal((await backend.getStatus()).authenticated, false, 'An invalid saved session must not crash startup');
  console.log('Sesión offline: restauración, cierre, contraseña válida, rechazos y cero peticiones OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
