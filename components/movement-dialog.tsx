"use client";

import { FormEvent, useMemo, useState } from "react";
import { ArrowRightLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { moveRecord } from "@/lib/backend";

const types=["INDUGEL","ANFO","MECHA DE SEGURIDAD","DETONADORES"];
type Records=Record<string,Array<Record<string,unknown>>>;

export function MovementDialog({records,onSaved}:{records:Records;onSaved:()=>void}){
  const [open,setOpen]=useState(false);const [type,setType]=useState("INDUGEL");const [id,setId]=useState("");const [saving,setSaving]=useState(false);const [error,setError]=useState("");
  const options=records[type]||[];const selected=useMemo(()=>options.find(r=>String(r.id)===id),[options,id]);
  const destination=selected?.ubicacion==="Polvorín superficie"?"Polvorín interior de mina":"Polvorín superficie";
  function label(r:Record<string,unknown>){return String(r.serial||r.cajaNumero||r.loteProduccion||r.id);}
  async function submit(e:FormEvent){e.preventDefault();if(!selected)return;setSaving(true);setError("");try{await moveRecord(type,id,destination);setOpen(false);setId("");onSaved();}catch(c){setError(c instanceof Error?c.message:"No se pudo registrar el movimiento.");}finally{setSaving(false);}}
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button variant="outline" className="h-12 border-[#0d2c3e] px-5 font-semibold text-[#0d2c3e]"><ArrowRightLeft className="h-4 w-4"/>REGISTRAR MOVIMIENTOS</Button></DialogTrigger><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>REGISTRAR MOVIMIENTO</DialogTitle></DialogHeader><form onSubmit={submit} className="space-y-4"><div className="space-y-2"><Label>TIPO DE MATERIAL</Label><div className="grid gap-2 sm:grid-cols-2">{types.map(value=><button key={value} type="button" onClick={()=>{setType(value);setId("");}} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${type===value?"border-[#f5b51b] bg-amber-50":"bg-white text-slate-600"}`}>{value}</button>)}</div></div><div className="space-y-1.5"><Label htmlFor="material">MATERIAL REGISTRADO</Label><select id="material" required value={id} onChange={e=>setId(e.target.value)} className="h-11 w-full rounded-md border bg-white px-3 text-sm"><option value="">Seleccionar material</option>{options.map(r=><option key={String(r.id)} value={String(r.id)}>{label(r)} · {String(r.ubicacion||"")}</option>)}</select>{options.length===0&&<p className="text-sm text-slate-500">No existen materiales registrados en esta categoría.</p>}</div>{selected&&<div className="rounded-xl bg-slate-50 p-4 text-sm"><p><b>UBICACIÓN ACTUAL:</b> {String(selected.ubicacion)}</p><p className="mt-1"><b>NUEVA UBICACIÓN:</b> {destination}</p></div>}{error&&<p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}<div className="flex justify-end gap-3"><Button type="button" variant="outline" onClick={()=>setOpen(false)}>CANCELAR</Button><Button disabled={!selected||saving} className="bg-[#0d2c3e]">{saving&&<Loader2 className="h-4 w-4 animate-spin"/>}GUARDAR MOVIMIENTO</Button></div></form></DialogContent></Dialog>;
}
