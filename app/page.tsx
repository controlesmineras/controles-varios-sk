"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Archive, Check, ChevronRight, Loader2, LogOut, MapPin, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RecordDialog } from "@/components/record-dialog";
import { AccessDialog } from "@/components/access-dialog";
import { MovementDialog } from "@/components/movement-dialog";
import { VerificationDialog } from "@/components/verification-dialog";
import { InstallAppButton } from "@/components/install-app-button";
import { backendConfigured, createInitialAdmin, getStatus, listRecords, login, logout, pendingOperations } from "@/lib/backend";

const modules = [
  { name: "INDUGEL", detail: "Seriales y ubicación", tone: "green" },
  { name: "ANFO", detail: "Seriales y ubicación", tone: "pink" },
  { name: "MECHA DE SEGURIDAD", detail: "Cajas, bobinas y rangos", tone: "black" },
  { name: "DETONADORES", detail: "Cajas y lotes", tone: "pale-yellow" },
] as const;

function MaterialIcon({name}:{name:string}){
  if(name==="ANFO")return <svg viewBox="0 0 36 32" className="h-7 w-7" aria-hidden="true"><path d="M8 4.5c6 1 14 1 20 0l-1 5c1.5 5 2 11.5 1 17-6.5 1.5-13.5 1.5-20 0-1-5.5-.5-12 1-17l-1-5Z" fill="#fff" stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round"/><path d="M9 8.5c6 .8 12 .8 18 0M9 26.5c6-1 12-1 18 0" fill="none" stroke="currentColor" strokeWidth=".8" opacity=".55"/><path d="m18 10 4 4-4 4-4-4 4-4Z" fill="#fb923c" stroke="#c2410c" strokeWidth=".8"/><text x="18" y="23.5" textAnchor="middle" fontSize="5.2" fontWeight="800" fill="currentColor">ANFO</text></svg>;
  if(name==="INDUGEL")return <svg viewBox="0 0 42 32" className="h-7 w-8" aria-hidden="true"><g transform="rotate(-28 21 16)"><path d="M4.5 12.5h33c1 0 1.5 1.4 1.5 3.5s-.5 3.5-1.5 3.5h-33C3.5 19.5 3 18.1 3 16s.5-3.5 1.5-3.5Z" fill="#e5e7eb" stroke="currentColor" strokeWidth="1"/><circle cx="2" cy="16" r="1.1" fill="currentColor"/><circle cx="40" cy="16" r="1.1" fill="currentColor"/><path d="M5 12.8v6.4m32-6.4v6.4" fill="none" stroke="currentColor" strokeWidth=".65"/><path d="m10 14.4 2.4 2.4m6-2.4 2.4 2.4m6-2.4 2.4 2.4" fill="none" stroke="#dc2626" strokeWidth=".9" strokeLinecap="round"/></g></svg>;
  if(name==="MECHA DE SEGURIDAD")return <svg viewBox="0 0 36 32" className="h-6 w-7" aria-hidden="true"><path d="M5 26c2-12 17-3 19-13 1-4-2-6-5-6-4 0-6 3-6 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/><path d="M25 11c-2-3 1-6 3-8 0 3 4 4 3 8-.5 2-2 4-4 4s-3-2-2-4Z" fill="#f59e0b" stroke="#fbbf24" strokeWidth="1.2"/></svg>;
  return <svg viewBox="0 0 36 32" className="h-6 w-7" aria-hidden="true"><path d="M7 17h21c2 0 3 2 3 4s-1 4-3 4H7c-2 0-3-2-3-4s1-4 3-4Z" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M9 17v8m16-8v8M31 21h3" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><path d="M18 3 25 14H11L18 3Z" fill="#facc15" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><path d="M18 7v3m0 2v.2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>;
}

export default function Home() {
  const [authenticated, setAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ usuario: string; nombre: string; rol: string } | null>(null);
  const [needsBootstrap, setNeedsBootstrap] = useState(false);
  const [checking, setChecking] = useState(true);
  const [selected, setSelected] = useState("INDUGEL");
  const [query, setQuery] = useState("");
  const [dateFilter,setDateFilter]=useState("");
  const [verificationFilter,setVerificationFilter]=useState("TODOS");
  const [verificationSignal,setVerificationSignal]=useState(0);
  const [syncState,setSyncState]=useState<"idle"|"syncing"|"success"|"error">("idle");
  const [lastSync,setLastSync]=useState("");
  const [pendingSync,setPendingSync]=useState(0);
  const [records, setRecords] = useState<Record<string, Array<Record<string, unknown>>>>({});
  const loadRecords = useCallback(async () => {
    setSyncState("syncing");
    try {
      setRecords(await listRecords());setPendingSync(await pendingOperations());
      const now=new Date();if(navigator.onLine)setLastSync(now.toLocaleString("es-CO",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}));setSyncState(navigator.onLine?"success":"idle");return true;
    } catch {setPendingSync(await pendingOperations());setSyncState("error");return false;}
  }, []);
  useEffect(() => {
    if (!backendConfigured()) { setChecking(false); return; }
    getStatus().then((status) => {
      setNeedsBootstrap(Boolean(status.needsBootstrap));
      setAuthenticated(Boolean(status.authenticated));
      setCurrentUser(status.usuario || null);
    }).finally(() => setChecking(false));
  }, []);
  useEffect(() => { if (authenticated) void loadRecords(); }, [authenticated, loadRecords]);
  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool?: (tool: object, options?: { signal?: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({
      name: "read_explosives_inventory",
      title: "Consultar inventario de explosivos",
      description: "Devuelve el número de registros por tipo y por ubicación mostrados en CONTROL EXPLOSIVOS SK.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: () => ({
        porTipo: Object.fromEntries(Object.entries(records).map(([key, value]) => [key, value.length])),
        porUbicacion: {
          superficie: Object.values(records).flat().filter((record) => record.ubicacion === "Polvorín superficie"&&record.verificado!==false).length,
          interiorMina: Object.values(records).flat().filter((record) => record.ubicacion === "Polvorín interior de mina"&&record.verificado!==false).length,
        },
      }),
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, [records]);
  const selectedRecords = useMemo(
    () => (records[selected] || []).filter((record) => JSON.stringify(record).toLowerCase().includes(query.toLowerCase())).filter(record=>!dateFilter||String(record.fechaIngreso||record.fecha||"").slice(0,10)===dateFilter).filter(record=>verificationFilter==="TODOS"||(verificationFilter==="VERIFICADOS"?record.verificado!==false:record.verificado===false)),
    [records, selected, query,dateFilter,verificationFilter],
  );
  const latestPrecinto = records.SELLOS?.[0];

  if (checking) return <div className="grid min-h-screen place-items-center bg-slate-50"><Loader2 className="h-7 w-7 animate-spin text-slate-500" /></div>;
  if (!backendConfigured()) return <ConnectionPending />;
  if (!authenticated) return <AccessForm bootstrap={needsBootstrap} onSuccess={(user) => { setAuthenticated(true); setNeedsBootstrap(false); setCurrentUser(user); }} />;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-800 bg-[#0d2c3e] text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#f5b51b] text-[#0d2c3e] shadow-inner">
              <ShieldCheck className="h-6 w-6" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold tracking-[0.02em]">CONTROL EXPLOSIVOS SK</p>
              <p className="hidden text-xs text-slate-300 sm:block">Control de inventario y ubicación</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2"><Button type="button" onClick={()=>void loadRecords()} disabled={syncState==="syncing"} className="h-9 min-w-32 flex-col justify-center gap-0 rounded-lg bg-white px-3 py-0 text-[#0d2c3e] hover:bg-slate-100"><span className="flex items-center gap-1.5 text-[11px] font-semibold leading-none">{syncState==="syncing"?<RefreshCw className="h-3.5 w-3.5 animate-spin"/>:syncState==="success"?<Check className="h-3.5 w-3.5 text-emerald-600"/>:syncState==="error"?<AlertTriangle className="h-3.5 w-3.5 text-red-600"/>:<RefreshCw className="h-3.5 w-3.5"/>}SINCRONIZAR{pendingSync>0&&<span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[9px]">{pendingSync}</span>}</span><span className="mt-0.5 text-[9px] font-medium leading-none text-slate-500">{lastSync?`Sinc. ${lastSync}`:"Sin sincronización"}</span></Button><InstallAppButton/>{currentUser?.rol === "ADMINISTRADOR" && <AccessDialog/>}<div className="max-w-40 text-center"><p className="truncate px-2 text-[11px] font-medium text-slate-200" title={currentUser?.nombre||currentUser?.usuario}>{currentUser?.nombre||currentUser?.usuario}</p><Button variant="ghost" className="h-8 text-white hover:bg-white/10 hover:text-white" onClick={() => { logout(); setAuthenticated(false); setCurrentUser(null); }}><LogOut className="h-4 w-4" /><span className="hidden sm:inline">Cerrar sesión</span></Button></div></div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-7 sm:px-8 sm:py-10">
        <section className="mb-7 flex flex-col gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
            <button type="button" onClick={()=>setSelected("SELLOS")} className="flex items-center gap-3 text-left"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#f5b51b] text-[#0d2c3e]"><ShieldCheck className="h-6 w-6"/></span><span><strong className="block">CONTROL DE PRECINTOS</strong><span className="text-sm text-slate-600">{records.SELLOS?.length || 0} registros de seguridad</span></span></button>
            <div className="grid grid-cols-2 gap-2" aria-label="Últimos precintos registrados">
              <div className="rounded-xl border border-amber-200 bg-white px-4 py-3"><span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">PRECINTO INDUGEL</span><strong className="mt-1 block text-xl tabular-nums text-[#0d2c3e]">{String(latestPrecinto?.selloIndugel ?? "—")}</strong></div>
              <div className="rounded-xl border border-amber-200 bg-white px-4 py-3"><span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">PRECINTO ANFO</span><strong className="mt-1 block text-xl tabular-nums text-[#0d2c3e]">{String(latestPrecinto?.selloAnfo ?? "—")}</strong></div>
            </div>
          </div>
          <RecordDialog initialType="SELLOS" onSaved={loadRecords} triggerLabel="REGISTRAR PRECINTOS" triggerClassName="h-10 bg-[#0d2c3e] px-5 text-xs font-semibold text-white hover:bg-[#16445d]" />
        </section>
        <section className="mb-7 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <p className="mb-1 text-sm font-medium uppercase tracking-[0.14em] text-slate-500">Inventario actual</p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">EXPLOSIVOS Y ACCESORIOS</h1>
            <div className="mt-4 flex flex-wrap gap-3"><RecordDialog initialType="INDUGEL" onSaved={async result=>{await loadRecords();if(result?.loteIngreso)setVerificationSignal(value=>value+1);}} triggerLabel="REGISTRAR INGRESOS" triggerClassName="h-12 bg-[#0d2c3e] px-5 font-semibold text-white hover:bg-[#16445d]"/><MovementDialog records={records} onSaved={loadRecords}/><VerificationDialog records={records} onSaved={loadRecords} autoOpenSignal={verificationSignal}/></div>
          </div>
          <div className="grid min-w-64 gap-2"><label className="relative block">
            <span className="sr-only">Buscar registros</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} className="h-11 bg-white pl-10" placeholder="Buscar serial, caja o lote" />
          </label><div className="grid grid-cols-2 gap-2"><Input type="date" value={dateFilter} onChange={e=>setDateFilter(e.target.value)} aria-label="Filtrar por fecha de ingreso"/><select value={verificationFilter} onChange={e=>setVerificationFilter(e.target.value)} className="h-10 rounded-md border bg-white px-2 text-sm"><option value="TODOS">TODOS</option><option value="VERIFICADOS">VERIFICADOS</option><option value="PENDIENTES">PENDIENTES</option></select></div></div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Clases de inventario">
          {modules.map(({ name, detail, tone }) => (
            <div key={name} className={`relative rounded-2xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${selected === name ? "border-[#f5b51b] ring-2 ring-[#f5b51b]/20" : "border-slate-200"}`}>
              <button type="button" onClick={() => setSelected(name)} className="group block w-full text-left">
                <span className={`module-icon module-icon-${tone}`}><MaterialIcon name={name}/></span>
                {name==="DETONADORES"&&<span title="Material de manejo especial" className="absolute right-4 top-4 grid h-7 w-7 place-items-center rounded-full bg-yellow-100 text-yellow-700"><AlertTriangle className="h-4 w-4" aria-label="Precaución"/></span>}
                <span className="mt-5 block text-sm font-semibold leading-tight">{name}</span>
                <span className="mt-1 flex items-center justify-between text-sm text-slate-500">{detail}<ChevronRight className="h-4 w-4 transition group-hover:translate-x-1" /></span>
              </button>
            </div>
          ))}
        </section>

        <section className="mt-7 grid gap-5 lg:grid-cols-[1.55fr_0.75fr]">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div><h2 className="text-lg font-semibold">{selected === "SELLOS" ? "PRECINTOS" : selected}</h2><p className="text-sm text-slate-500">Registros disponibles</p></div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">{selectedRecords.length} registros</span>
            </div>
            {selectedRecords.length === 0 ? <div className="grid min-h-56 place-items-center px-6 py-10 text-center">
              <div><Archive className="mx-auto h-9 w-9 text-slate-300" /><p className="mt-3 font-medium">Aún no hay registros en {selected === "SELLOS" ? "PRECINTOS" : selected}</p><p className="mt-1 text-sm text-slate-500">El primer ingreso aparecerá aquí con su ubicación actual.</p></div>
            </div> : <div className="divide-y divide-slate-100">{selectedRecords.map((record) => <article key={String(record.id)} className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-center"><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{String(record.serial || record.cajaNumero || `Registro ${record.id}`)}</p>{record.verificado===false&&<span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">PENDIENTE DE VERIFICAR</span>}</div><p className="text-sm text-slate-500">{String(record.loteProduccion || record.contenido || "Registro individual")}</p>{selected!=="SELLOS"&&<p className="mt-1 text-xs text-slate-500">Ingreso: {String(record.fechaIngreso||"")} · Fabricación: {String(record.fechaFabricacion||record.fechaProduccion||"")} · Vencimiento: {String(record.fechaVencimiento||"")}</p>}</div>{selected!=="SELLOS"&&<div className="flex items-center gap-2 text-sm text-slate-600 sm:justify-end"><MapPin className="h-4 w-4" />{String(record.ubicacion||"")}</div>}</article>)}</div>}
          </div>

          <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><MapPin className="h-5 w-5" /></span>
              <div><h2 className="font-semibold">DISTRIBUCIÓN</h2><p className="text-sm text-slate-500">Existencias por polvorín</p></div>
            </div>
            <div className="mt-5 space-y-3">
              {["Polvorín superficie", "Polvorín interior de mina"].map((location) => (
                <div key={location} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3"><span className="text-sm font-medium">{location}</span><span className="text-sm tabular-nums text-slate-500">{Object.values(records).flat().filter((record) => record.ubicacion === location&&record.verificado!==false).length}</span></div>
              ))}
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}

function ConnectionPending() {
  return <main className="grid min-h-screen place-items-center bg-slate-50 px-5"><section className="max-w-lg rounded-2xl border bg-white p-8 text-center shadow-sm"><ShieldCheck className="mx-auto h-11 w-11 text-[#0d2c3e]" /><h1 className="mt-4 text-2xl font-semibold">Servidor empresarial pendiente</h1><p className="mt-2 text-slate-600">La interfaz ya está preparada. Falta agregar en <b>public/config.js</b> la URL de Google Apps Script para habilitar el acceso y los registros.</p></section></main>;
}

function AccessForm({ bootstrap, onSuccess }: { bootstrap: boolean; onSuccess: (user: { usuario: string; nombre: string; rol: string }) => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const result = bootstrap ? await createInitialAdmin(String(data.usuario), String(data.nombre), String(data.password)) : await login(String(data.usuario), String(data.password));
      onSuccess(result.usuario);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo iniciar sesión."); }
    finally { setSaving(false); }
  }
  return <main className="grid min-h-screen place-items-center bg-slate-50 px-5"><section className="w-full max-w-md rounded-2xl border bg-white p-7 shadow-sm"><div className="text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-[#f5b51b]"><ShieldCheck className="h-7 w-7 text-[#0d2c3e]" /></span><h1 className="mt-4 text-2xl font-semibold">CONTROL EXPLOSIVOS SK</h1><p className="mt-1 text-sm text-slate-500">{bootstrap ? "Crear administrador inicial" : "INICIAR SESIÓN"}</p></div><form onSubmit={submit} className="mt-6 space-y-4">{bootstrap && <label className="block text-sm font-medium">NOMBRE COMPLETO<Input name="nombre" required className="mt-1.5" /></label>}<label className="block text-sm font-medium">USUARIO<Input name="usuario" required autoComplete="username" className="mt-1.5" /></label><label className="block text-sm font-medium">CONTRASEÑA<Input name="password" type="password" required minLength={8} autoComplete={bootstrap ? "new-password" : "current-password"} className="mt-1.5" /></label>{error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}<Button className="h-11 w-full bg-[#0d2c3e]" disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}{bootstrap ? "CREAR ADMINISTRADOR" : "INGRESAR"}</Button></form></section></main>;
}
