import type { OfflineOperation } from "./offline-store";
export type Inventory = Record<string, Array<Record<string, unknown>>>;
export const materialTypes = ["INDUGEL", "ANFO", "MECHA DE SEGURIDAD", "DETONADORES", "SELLOS"];
export function validateInventory(value: unknown): asserts value is Inventory {
  const problems: string[] = [];
  if (!value || typeof value !== "object") problems.push("Falta la sección de inventario en la respuesta (records).");
  else for (const type of materialTypes) {
    const rows = (value as Inventory)[type];
    if (!Array.isArray(rows)) {
      problems.push(`${type}: ${rows === undefined ? "categoría ausente en la respuesta" : "la categoría no contiene una lista válida"}.`);
      continue;
    }
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      if (!row || typeof row !== "object") {
        problems.push(`${type}: fila ${index + 1} vacía o con formato inválido.`);
        break;
      }
      if (row.id == null || !String(row.id)) {
        const identifier = row.serial != null ? `serial ${row.serial}` : row.cajaNumero != null ? `caja ${row.cajaNumero}` : row.selloIndugel || row.selloAnfo ? `precinto ${row.selloIndugel || row.selloAnfo}` : "sin serial/caja informado";
        problems.push(`${type}: fila ${index + 1} (${identifier.slice(0, 100)}) sin identificador interno (ID).`);
        break;
      }
    }
  }
  if (problems.length) throw new Error(`El servidor no devolvió un inventario completo. ${problems.join(" ")} Se conservan los datos locales y los pendientes.`);
}
export function operationKeys(operation: OfflineOperation): string[] {
  const data = operation.data;
  const record = data.record as Record<string, unknown> | undefined;
  const batch = data.batch as { tipo: string; items?: Array<{ id: string }> } | undefined;
  if (record) return [`${record.tipo}:${record.id}`];
  if (batch) return (batch.items || []).map(item => `${batch.tipo}:${item.id}`);
  if (Array.isArray(data.unidades)) return data.unidades.map(unit => `${data.tipo}:${unit.id}`);
  if (data.id != null) return [`${data.tipo}:${data.id}`];
  const person = data.person as { documento?: string } | undefined;
  return person ? [`person:${person.documento}`] : [];
}
// Server inventory plus all unconfirmed changes; existing IDs are never duplicated.
export function overlayPending(remote: Inventory, pending: OfflineOperation[]): Inventory {
  const records = structuredClone(remote);
  for (const type of materialTypes) records[type] ||= [];
  for (const operation of pending) {
    const data = operation.data;
    if (operation.action === "create" || operation.action === "createBatch") {
      const batch = data.batch as { tipo: string; items?: Array<Record<string, unknown>> } | undefined;
      const items = batch?.items || [data.record as Record<string, unknown>];
      const type = String(batch?.tipo || items[0]?.tipo || "");
      if (!records[type]) continue;
      for (const item of [...items].reverse()) {
        if (item && !records[type].some(row => String(row.id) === String(item.id))) records[type].unshift(structuredClone(item));
      }
    } else if (operation.action === "deleteRecord") {
      // Historical deletion requests are paused. Do not hide a serial still on the server.
      continue;
    } else if (operation.action === "verifyBatch" && Array.isArray(data.unidades)) {
      for (const unit of data.unidades) {
        const item = records[String(data.tipo)]?.find(row => String(row.id) === String(unit.id));
        if (item) Object.assign(item, { fechaFabricacion: unit.fechaFabricacion, fechaVencimiento: unit.fechaVencimiento, verificado: true, fechaVerificacion: operation.createdAt });
      }
    } else if (operation.action === "move") {
      const item = records[String(data.tipo)]?.find(row => String(row.id) === String(data.id));
      if (!item) continue;
      const movements = Array.isArray(item.movimientos) ? item.movimientos as Array<Record<string, unknown>> : [];
      if (!movements.some(move => move.fecha === data.fechaMovimiento && move.destino === data.ubicacion)) movements.unshift({ fecha: data.fechaMovimiento, origen: item.ubicacion, destino: data.ubicacion });
      item.movimientos = movements;
      item.ubicacion = data.ubicacion;
    }
  }
  return records;
}
export function operationLabel(operation: OfflineOperation): string {
  const data = operation.data;
  const record = data.record as Record<string, unknown> | undefined;
  const batch = data.batch as Record<string, unknown> | undefined;
  const person = data.person as {documento?: string; nombre?: string} | undefined;
  if (person) return `${person.nombre || "Persona"} · Documento ${person.documento || "no informado"}`;
  return `${record?.tipo || batch?.tipo || data.tipo || "Directorio"} · ${record?.serial || record?.cajaNumero || data.id || operation.id.slice(0, 8)}`;
}

