import type { OfflineOperation } from "./offline-store";
export type Inventory = Record<string, Array<Record<string, unknown>>>;
export const materialTypes = ["INDUGEL", "ANFO", "MECHA DE SEGURIDAD", "DETONADORES", "SELLOS"];
export function validateInventory(value: unknown): asserts value is Inventory {
  if (!value || typeof value !== "object" || !materialTypes.every(type => {
    const rows = (value as Inventory)[type];
    return Array.isArray(rows) && rows.every(row => row && typeof row === "object" && row.id != null && String(row.id));
  })) throw new Error("El servidor no devolvió un inventario completo. Los pendientes se conservan.");
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
      const type = String(data.tipo);
      if (records[type]) records[type] = records[type].filter(row => String(row.id) !== String(data.id));
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
  return `${record?.tipo || batch?.tipo || data.tipo || "Directorio"} · ${record?.serial || record?.cajaNumero || data.id || operation.id.slice(0, 8)}`;
}
