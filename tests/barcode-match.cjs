const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/barcode-match.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: mod, exports: mod.exports });
const match = mod.exports.matchesScannedCode;
assert.equal(match({ serial: 1234567 }, '0001234567'), true);
assert.equal(match({ serial: '12345678901234567890' }, '012345678901234567890'), true);
assert.equal(match({ serial: 12345678 }, '1234567'), false);
assert.equal(match({ serial: 1234567 }, '(01)0001234567(21)999'), false);
assert.equal(match({ cajaNumero: 'SK-007' }, ' sk-007 '), true);
assert.equal(match({ cajaNumero: 'SK-007' }, 'SK-7'), false);
assert.equal(match({ loteProduccion: '1234567', id: '1234567' }, '1234567'), false);
assert.equal(match({}, ''), false);
assert.equal(match({ serial: 0 }, '000'), true);
console.log('Barcode matching: exact identifiers, leading zeroes, large numbers and no partial/lot matches OK');
