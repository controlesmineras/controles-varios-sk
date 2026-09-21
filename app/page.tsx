"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Archive, Bomb, Cable, ChevronRight, Loader2, LogOut, MapPin, Search, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RecordDialog } from "@/components/record-dialog";
import { AccessDialog } from "@/components/access-dialog";
import { backendConfigured, createInitialAdmin, getStatus, listRecords, login, logout } from "@/lib/backend";

const modules = [
  { name: "INDUGEL", detail: "Seriales y ubicación", icon: Bomb, tone: "orange" },
  { name: "ANFO", detail: "Seriales y ubicación", icon: Archive, tone: "amber" },
  { name: "MECHA DE SEGURIDAD", detail: "Cajas, bobinas y rangos", icon: Cable, tone: "blue" },
  { name: "DETONADORES", detail: "Cajas y lotes", icon: ShieldCheck, tone: "red" },
] as const;

export default function Home() {
  const [authenticated, setAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ usuario: string; nombre: string; rol: string } | null>(null);
  const [needsBootstrap, setNeedsBootstrap] = useState(false);
  const [checking, setChecking] = useState(true);
  const [selected, setSelected] = useState("INDUGEL");
  const [query, setQuery] = useState("");
  const [records, setRecords] = useState<Record<string, Array<Record<string, unknown>>>>({});
  const loadRecords = useCallback(async () => {
    try {
      setRecords(await listRecords());
    } catch { /* la interfaz conserva un estado recuperable */ }
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
          superficie: Object.values(records).flat().filter((record) => record.ubicacion === "Polvorín superficie").length,
          interiorMina: Object.values(records).flat().filter((record) => record.ubicacion === "Polvorín interior de mina").length,
        },
      }),
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, [records]);
  const selectedRecords = useMemo(
    () => (records[selected] || []).filter((record) => JSON.stringify(record).toLowerCase().includes(query.toLowerCase())),
    [records, selected, query],
  );

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
          <div className="flex items-center gap-2">{currentUser?.rol === "ADMINISTRADOR" && <AccessDialog/>}<RecordDialog initialType={selected} onSaved={loadRecords} /><Button variant="ghost" className="text-white hover:bg-white/10 hover:text-white" onClick={() => { logout(); setAuthenticated(false); setCurrentUser(null); }}><LogOut className="h-4 w-4" /><span className="hidden sm:inline">Cerrar sesión</span></Button></div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-7 sm:px-8 sm:py-10">
        <section className="mb-7 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <p className="mb-1 text-sm font-medium uppercase tracking-[0.14em] text-slate-500">Inventario actual</p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Explosivos y accesorios</h1>
          </div>
          <label className="relative block min-w-64">
            <span className="sr-only">Buscar registros</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} className="h-11 bg-white pl-10" placeholder="Buscar serial, caja o lote" />
          </label>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Clases de inventario">
          {modules.map(({ name, detail, icon: Icon, tone }) => (
            <button key={name} type="button" onClick={() => setSelected(name)}
              className={`group rounded-2xl border bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${selected === name ? "border-[#f5b51b] ring-2 ring-[#f5b51b]/20" : "border-slate-200"}`}>
              <span className={`module-icon module-icon-${tone}`}><Icon className="h-5 w-5" /></span>
              <span className="mt-5 block text-sm font-semibold leading-tight">{name}</span>
              <span className="mt-1 flex items-center justify-between text-sm text-slate-500">
                {detail}<ChevronRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </span>
            </button>
          ))}
        </section>

        <section className="mt-7 grid gap-5 lg:grid-cols-[1.55fr_0.75fr]">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div><h2 className="text-lg font-semibold">{selected}</h2><p className="text-sm text-slate-500">Registros disponibles</p></div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">{selectedRecords.length} registros</span>
            </div>
            {selectedRecords.length === 0 ? <div className="grid min-h-56 place-items-center px-6 py-10 text-center">
              <div><Archive className="mx-auto h-9 w-9 text-slate-300" /><p className="mt-3 font-medium">Aún no hay registros en {selected}</p><p className="mt-1 text-sm text-slate-500">El primer ingreso aparecerá aquí con su ubicación actual.</p></div>
            </div> : <div className="divide-y divide-slate-100">{selectedRecords.map((record) => <article key={String(record.id)} className="grid gap-1 px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-center"><div><p className="font-semibold">{String(record.serial || record.cajaNumero || `Registro ${record.id}`)}</p><p className="text-sm text-slate-500">{String(record.loteProduccion || record.contenido || "Registro individual")}</p></div><div className="mt-1 flex items-center gap-2 text-sm text-slate-600 sm:mt-0"><MapPin className="h-4 w-4" />{String(record.ubicacion || "")}</div></article>)}</div>}
          </div>

          <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><MapPin className="h-5 w-5" /></span>
              <div><h2 className="font-semibold">DISTRIBUCIÓN</h2><p className="text-sm text-slate-500">Existencias por polvorín</p></div>
            </div>
            <div className="mt-5 space-y-3">
              {["Polvorín superficie", "Polvorín interior de mina"].map((location) => (
                <div key={location} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3"><span className="text-sm font-medium">{location}</span><span className="text-sm tabular-nums text-slate-500">{Object.values(records).flat().filter((record) => record.ubicacion === location).length}</span></div>
              ))}
            </div>
            <Button variant="outline" onClick={() => setSelected("SELLOS")} className="mt-5 h-11 w-full border-slate-300"><ShieldCheck className="h-4 w-4" />Control de sellos</Button>
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
