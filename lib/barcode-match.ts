// Compare complete identifiers; a partial barcode must never select a different serial.
// Existing numeric serials lose their printed leading zeroes when entered as numbers.
function normalize(value: unknown) {
  const text = String(value ?? "").trim().toUpperCase();
  return /^\d+$/.test(text) ? text.replace(/^0+(?=\d)/, "") : text;
}

export function matchesScannedCode(record: Record<string, unknown>, code: string) {
  const target = normalize(code);
  return Boolean(target) && [record.serial, record.cajaNumero].some(value => value !== undefined && value !== null && normalize(value) === target);
}
