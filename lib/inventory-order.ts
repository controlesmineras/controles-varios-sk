export type InventoryOrder = "FECHA" | "SERIAL";
export type OrderDirection = "ASC" | "DESC";

export function compareInventory(
  a: Record<string, unknown>, b: Record<string, unknown>,
  criteria: InventoryOrder[], direction: OrderDirection,
  dateOf: (record: Record<string, unknown>) => string,
) {
  for (const criterion of criteria) {
    const av = criterion === "FECHA" ? dateOf(a).slice(0, 10) : String(a.serial ?? a.cajaNumero ?? "");
    const bv = criterion === "FECHA" ? dateOf(b).slice(0, 10) : String(b.serial ?? b.cajaNumero ?? "");
    // Missing values stay at the end in both directions.
    if (!av && bv) return 1;
    if (av && !bv) return -1;
    const difference = av.localeCompare(bv, "es", { numeric: criterion === "SERIAL" });
    if (difference) return direction === "ASC" ? difference : -difference;
  }
  return 0;
}
