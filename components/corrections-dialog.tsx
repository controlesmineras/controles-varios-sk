"use client";

import { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cancelDeletionRequest, getCorrectionData, restoreDeletedRecord, revertLastMovement } from "@/lib/backend";
import { latestReversibleMovement } from "@/lib/inventory-corrections";
import type { Inventory } from "@/lib/sync-state";

type Corrections = Awaited<ReturnType<typeof getCorrectionData>>;
const types = ["INDUGEL", "ANFO", "MECHA DE SEGURIDAD", "DETONADORES"];
const identifier = (row: Record<string, unknown>) => row.serial != null ? `Serial ${row.serial}` : row.cajaNumero != null ? `Caja ${row.cajaNumero}` : `Registro ${row.id}`;
const stamp = (value: unknown) => Number.isFinite(Date.parse(String(value))) ? new Date(String(value)).toLocaleString("es-CO") : String(value || "Sin fecha");

export function CorrectionsDialog({ records, onChanged }: { records: Inventory; onChanged: () => Promise<boolean> }) {
  const [open, setOpen] = useState(false), [mode, setMode] = useState("RECUPERAR");
  const [data, setData] = useState<Corrections | null>(null), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [message, setMessage] = useState("");
  const [type, setType] = useState("ANFO"), [query, setQuery] = useState(""), [reason, setReason] = useState("");
  const matches = (row: Record<string, unknown>) => identifier(row).toLocaleLowerCase("es").includes(query.trim().toLocaleLowerCase("es"));
  const archived = (data?.archived || []).filter(row => row.tipo === type && matches(row.registro));
  const movements = (records[type] || []).filter(row => Array.isArray(row.movimientos) && row.movimientos.length && matches(row));
  const paused = useMemo(() => Array.from(new Map((data?.paused || []).map(op => [`${op.data.tipo}:${op.data.id}`, op])).values()), [data]);
  const pending = (id: string) => !!data?.pending.some(op => op.data.tipo === type && String(op.data.id) === id);
  const held = (id: string) => paused.some(op => op.data.tipo === type && String(op.data.id) === id);
  async function refresh() { const value = await getCorrectionData(); setData(value); return value; }
  async function openDialog(value: boolean) {
    if (busy) return;
    setOpen(value);
    if (!value) return;
    setError(""); setMessage(""); setReason(""); setData(null); setBusy(true);
    try { await refresh(); } catch (e) { setError(e instanceof Error ? e.message : "No se pudo consultar el servidor."); } finally { setBusy(false); }
  }
  async function correct(run: () => Promise<{ id: string }>, confirmation: string) {
    if (busy || !reason.trim() || !window.confirm(confirmation)) return;
    setBusy(true); setError(""); setMessage("");
    let queued = false;
    try {
      const operation = await run(); queued = true;
      await onChanged();
      const current = await refresh();
      const rejected = current.rejected.find(op => op.id === operation.id);
      if (rejected) setError(`La corrección no se aplicó: ${rejected.message} Actualiza y revisa el registro antes de volver a intentarlo.`);
      else setMessage(current.pending.some(op => op.id === operation.id)
        ? "Solicitud guardada, todavía pendiente de confirmación. Revisa el aviso de sincronización; no vuelvas a registrarla."
        : "Corrección confirmada por el servidor. Se conservaron el serial y el historial.");
      setReason("");
    } catch (e) { setError(`${queued ? "La solicitud quedó guardada. Sincroniza para confirmar el resultado. " : ""}${e instanceof Error ? e.message : "No se pudo completar la consulta."}`); }
    finally { setBusy(false); }
  }
  async function cancel(tipo: string, id: string) {
    if (busy || !window.confirm("¿Cancelar esta solicitud antigua de eliminación? Si el serial ya se eliminó en el servidor, deberás recuperarlo desde la copia archivada.")) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await cancelDeletionRequest(tipo, id); await onChanged(); await refresh();
      setMessage(result.present ? "Solicitud de eliminación cancelada. El registro está en el inventario central." : "Solicitud cancelada. El registro no está en el inventario central; busca su copia en Recuperar eliminados.");
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo cancelar la solicitud."); } finally { setBusy(false); }
  }
  return <Dialog open={open} onOpenChange={value => void openDialog(value)}>
    <DialogTrigger asChild><Button variant="outline" className="h-12 border-[#0d2c3e] px-5 font-semibold text-[#0d2c3e]"><RotateCcw className="h-4 w-4" />REVERTIR / RECUPERAR</Button></DialogTrigger>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle>CORREGIR INVENTARIO</DialogTitle><DialogDescription>Recupera seriales eliminados o revierte un traslado registrado por error. Cada corrección conserva el historial y su motivo.</DialogDescription></DialogHeader>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Tipo de corrección">
        <Button disabled={busy} variant={mode === "RECUPERAR" ? "default" : "outline"} onClick={() => setMode("RECUPERAR")}>RECUPERAR ELIMINADOS</Button>
        <Button disabled={busy} variant={mode === "REVERTIR" ? "default" : "outline"} onClick={() => setMode("REVERTIR")}>REVERTIR TRASLADO</Button>
      </div>
      {busy && <p role="status" className="text-sm">Consultando y confirmando con el servidor…</p>}
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {message && <p role="status" className="rounded-lg bg-sky-50 p-3 text-sm text-sky-900">{message}</p>}
      {data?.needsServerUpdate && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">El servidor necesita actualizarse para recuperar y revertir. Las eliminaciones siguen pausadas; puedes cancelar sus solicitudes pendientes aquí.</p>}
      {mode === "RECUPERAR" && paused.length > 0 && <section className="space-y-2 rounded-xl border border-amber-300 p-3" aria-label="Eliminaciones pausadas">
        <h3 className="font-semibold">Solicitudes antiguas de eliminación</h3>
        <p className="text-sm">Están detenidas. Cancélalas antes de recuperar el registro correspondiente.</p>
        {paused.map(op => {
          const tipo = String(op.data.tipo), id = String(op.data.id);
          const record = records[tipo]?.find(row => String(row.id) === id) || data?.archived.find(row => row.tipo === tipo && String(row.registro.id) === id)?.registro;
          return <div key={`${tipo}:${id}`} className="flex flex-wrap items-center justify-between gap-2 border-t pt-2"><span className="break-all text-sm">{tipo} · {record ? identifier(record) : `Registro ${id}`}</span><Button size="sm" variant="outline" disabled={busy} onClick={() => void cancel(tipo, id)}>CANCELAR SOLICITUD</Button></div>;
        })}
      </section>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">MATERIAL<select aria-label="Material para corregir" value={type} onChange={e => setType(e.target.value)} disabled={busy} className="mt-1 h-10 w-full rounded-md border bg-white px-2">{types.map(value => <option key={value}>{value}</option>)}</select></label>
        <label className="text-sm font-medium">BUSCAR SERIAL O CAJA<Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Escribe el número" className="mt-1" /></label>
      </div>
      <label className="text-sm font-medium">MOTIVO DE LA CORRECCIÓN<Input value={reason} onChange={e => setReason(e.target.value)} disabled={busy} placeholder="Explica qué se registró por error" className="mt-1" /></label>
      {data && !data.needsServerUpdate && <div className="space-y-3">
        {mode === "RECUPERAR" ? archived.map(entry => <article key={`${entry.registro.id}:${entry.fechaEliminacion}`} className="space-y-2 rounded-xl border p-3">
          <h3 className="font-semibold">{identifier(entry.registro)}</h3><p className="text-sm">Ubicación archivada: {String(entry.registro.ubicacion || "Sin ubicación")}</p>
          <p className="text-xs text-slate-600">Eliminado: {stamp(entry.fechaEliminacion)} · {entry.eliminadoPor}</p>
          <Button disabled={busy || !reason.trim() || pending(String(entry.registro.id)) || held(String(entry.registro.id))} variant="outline" onClick={() => void correct(() => restoreDeletedRecord(entry, reason), `¿Recuperar ${type} · ${identifier(entry.registro)} con sus datos originales?`)}>{pending(String(entry.registro.id)) ? "RECUPERACIÓN PENDIENTE" : held(String(entry.registro.id)) ? "CANCELA SU ELIMINACIÓN PENDIENTE" : "RECUPERAR REGISTRO"}</Button>
        </article>) : movements.map(row => {
          const movement = latestReversibleMovement(row), history = row.movimientos as Array<Record<string, any>>;
          return <article key={String(row.id)} className="space-y-2 rounded-xl border p-3">
            <h3 className="font-semibold">{identifier(row)}</h3><p className="text-sm">Ubicación actual: {String(row.ubicacion)}</p>
            {movement ? <><p className="text-sm">Último traslado: {movement.origen} → {movement.destino}<br />{stamp(movement.fecha)}</p><p className="text-sm font-medium">Al revertir, regresará a: {movement.origen}.</p><Button variant="outline" disabled={busy || !reason.trim() || pending(String(row.id)) || held(String(row.id))} onClick={() => void correct(() => revertLastMovement(type, String(row.id), movement, reason), `¿Revertir el último traslado de ${type} · ${identifier(row)} y devolver su ubicación a ${movement.origen}? El serial permanecerá en el inventario.`)}>{pending(String(row.id)) ? "CORRECCIÓN PENDIENTE" : "REVERTIR ÚLTIMO TRASLADO"}</Button></> : <p className="text-sm text-slate-600">No hay un traslado vigente que se pueda revertir.</p>}
            <details className="text-xs text-slate-600"><summary className="cursor-pointer">Ver historial y reversiones</summary><ul className="mt-2 space-y-2">{history.map((event, index) => <li key={index}>{stamp(event.fecha)} · {event.origen} → {event.destino}{event.revertido === true && <strong className="block">Revertido: {stamp(event.reversion?.fecha)} · {event.reversion?.usuario} · Motivo: {event.reversion?.motivo}</strong>}</li>)}</ul></details>
          </article>;
        })}
        {(mode === "RECUPERAR" ? archived.length === 0 : movements.length === 0) && <p className="py-3 text-sm text-slate-600">{mode === "RECUPERAR" ? "No hay copias eliminadas pendientes de recuperar para esta búsqueda." : "No hay traslados para esta búsqueda."}</p>}
      </div>}
      {!!data?.rejected.length && <details className="text-xs text-slate-600"><summary className="cursor-pointer">Correcciones rechazadas en este dispositivo ({data.rejected.length})</summary><ul className="mt-2 space-y-2">{[...data.rejected].reverse().map(op => <li key={op.id}>{stamp(op.rejectedAt)} · {String(op.data.tipo)} · Registro {String(op.data.id)}: {op.message}</li>)}</ul></details>}
      <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={async () => { setBusy(true); setError(""); try { await onChanged(); await refresh(); } catch (e) { setError(e instanceof Error ? e.message : "No se pudo actualizar."); } finally { setBusy(false); } }}>ACTUALIZAR</Button><Button disabled={busy} onClick={() => setOpen(false)}>CERRAR</Button></div>
    </DialogContent>
  </Dialog>;
}
