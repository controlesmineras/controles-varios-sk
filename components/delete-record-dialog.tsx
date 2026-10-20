"use client";

import { FormEvent, useId, useRef, useState } from "react";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { deleteRecordConfirmed } from "@/lib/backend";

type Props = {
  tipo: string;
  record: Record<string, unknown>;
  disabled?: boolean;
  onDeleted: () => void;
};

export function DeleteRecordDialog({ tipo, record, disabled, onDeleted }: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"warning" | "password">("warning");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const reviewed = useRef(record), operationId = useRef(""), submitting = useRef(false);
  const passwordInput = useRef<HTMLInputElement>(null);
  const passwordId = useId();
  const identifier = String(reviewed.current.serial ?? reviewed.current.cajaNumero ?? reviewed.current.id);

  function changeOpen(next: boolean) {
    if (submitting.current) return;
    if (passwordInput.current) passwordInput.current.value = "";
    setError(""); setStep("warning");
    if (next) { reviewed.current = structuredClone(record); operationId.current = crypto.randomUUID(); }
    setOpen(next);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step !== "password" || submitting.current) return;
    const password = passwordInput.current?.value || "";
    if (!password.trim()) { setError("Ingresa tu contraseña de acceso a la app."); return; }
    // Keep the credential out of React state, local storage and pending operations.
    if (passwordInput.current) passwordInput.current.value = "";
    submitting.current = true; setBusy(true); setError("");
    try {
      await deleteRecordConfirmed(tipo, reviewed.current, password, operationId.current);
      setOpen(false); setStep("warning"); onDeleted();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo confirmar la eliminación.");
    } finally { submitting.current = false; setBusy(false); }
  }

  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogTrigger asChild><Button type="button" variant="outline" size="sm" disabled={disabled} className="border-red-200 text-red-700 hover:bg-red-50" aria-label={`Eliminar ${tipo} ${String(record.serial ?? record.cajaNumero ?? record.id)}`}><Trash2 className="h-4 w-4" />ELIMINAR</Button></DialogTrigger>
    <DialogContent className="sm:max-w-lg" showCloseButton={!busy} onEscapeKeyDown={event => { if (submitting.current) event.preventDefault(); }} onInteractOutside={event => event.preventDefault()}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />Eliminar material</DialogTitle>
        <DialogDescription>Esta acción borrará el serial del material y su trazabilidad en la app. ¿Deseas continuar?</DialogDescription>
      </DialogHeader>
      <div className="rounded-lg border bg-slate-50 p-3 text-sm"><p className="font-semibold">{tipo} · {identifier}</p><p className="mt-1 text-slate-600">{String(reviewed.current.ubicacion || "")}</p></div>
      {step === "warning" ? <DialogFooter>
        <Button type="button" variant="outline" autoFocus onClick={() => changeOpen(false)}>CANCELAR</Button>
        <Button type="button" variant="destructive" onClick={() => setStep("password")}>CONTINUAR</Button>
      </DialogFooter> : <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor={passwordId} className="text-sm font-medium">Contraseña de acceso a la app</label>
          <Input ref={passwordInput} id={passwordId} name="password" type="password" autoComplete="current-password" autoFocus required disabled={busy} />
          <p className="text-xs text-slate-500">Ingresa la contraseña del administrador que tiene la sesión abierta. Se requiere conexión a internet.</p>
        </div>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => changeOpen(false)}>CANCELAR</Button>
          <Button type="submit" variant="destructive" disabled={busy}>{busy ? <><Loader2 className="h-4 w-4 animate-spin" />VALIDANDO…</> : "ELIMINAR"}</Button>
        </DialogFooter>
      </form>}
    </DialogContent>
  </Dialog>;
}
