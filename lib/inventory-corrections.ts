export type MovementToReverse = { index: number; historyLength: number; fecha: string; origen: string; destino: string };
export type DeletedRecord = {
  tipo: string; registro: Record<string, unknown>; eliminadoPor: string; fechaEliminacion: string;
};
const locations = ["Polvorín superficie", "Polvorín interior de mina"];

export function latestReversibleMovement(record: Record<string, unknown>): MovementToReverse | null {
  const history = Array.isArray(record.movimientos) ? record.movimientos as Array<Record<string, unknown>> : [];
  const index = history.findIndex(row => row && row.revertido !== true), movement = history[index];
  if (!movement || !movement.fecha || !locations.includes(String(movement.origen)) || !locations.includes(String(movement.destino)) || movement.origen === movement.destino || record.ubicacion !== movement.destino) return null;
  return { index, historyLength: history.length, fecha: String(movement.fecha), origen: String(movement.origen), destino: String(movement.destino) };
}
