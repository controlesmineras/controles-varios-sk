export type InventoryOrder = "INGRESO" | "TRASLADO" | "VENCIMIENTO" | "SERIAL";
export type InventoryDateField = Exclude<InventoryOrder, "SERIAL">;
export type OrderDirection = "ASC" | "DESC";
export type InventorySort = { field: InventoryOrder; direction: OrderDirection };

export const inventoryOrderLabels: Record<InventoryOrder, string> = {
  INGRESO: "Fecha de ingreso", TRASLADO: "Fecha de traslado",
  VENCIMIENTO: "Fecha de vencimiento", SERIAL: "Serial",
};
export const inventoryOrderOptions = Object.keys(inventoryOrderLabels) as InventoryOrder[];

// Ignore absent or invalid dates rather than treating them as the oldest expiry.
function validDate(value: unknown) {
  const day = String(value ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "";
  const timestamp = Date.parse(`${day}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === day ? day : "";
}

export function transferDate(record: Record<string, unknown>) {
  const movements = Array.isArray(record.movimientos) ? record.movimientos as Array<Record<string, unknown>> : [];
  return movements.filter(m => m.revertido !== true && m.destino === "Polvorín interior de mina")
    .map(m => validDate(m.fecha)).filter(Boolean).sort().at(-1) || "";
}

export function inventoryDateFor(record: Record<string, unknown>, field: InventoryDateField) {
  if (field === "TRASLADO") return transferDate(record);
  return validDate(field === "VENCIMIENTO" ? record.fechaVencimiento : record.fechaIngreso);
}

export function compareInventory(
  a: Record<string, unknown>, b: Record<string, unknown>,
  criteria: InventorySort[],
) {
  for (const { field: criterion, direction } of criteria) {
    const av = criterion === "SERIAL" ? String(a.serial ?? a.cajaNumero ?? "") : inventoryDateFor(a, criterion);
    const bv = criterion === "SERIAL" ? String(b.serial ?? b.cajaNumero ?? "") : inventoryDateFor(b, criterion);
    // Missing values stay at the end in both directions.
    if (!av && bv) return 1;
    if (av && !bv) return -1;
    const difference = av.localeCompare(bv, "es", { numeric: criterion === "SERIAL" });
    if (difference) return direction === "ASC" ? difference : -difference;
  }
  return 0;
}
