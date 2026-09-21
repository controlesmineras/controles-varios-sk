"use client";

import { FormEvent, useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveBatchRecords, saveRecord } from "@/lib/backend";

const materialTypes = ["INDUGEL", "ANFO", "MECHA DE SEGURIDAD", "DETONADORES"];

function Field({ name, label, type = "text", required = true }: { name: string; label: string; type?: string; required?: boolean }) {
  return <div className="space-y-1.5"><Label htmlFor={name}>{label}</Label><Input id={name} name={name} type={type} required={required} inputMode={type === "number" ? "numeric" : undefined} /></div>;
}

function CommonFields() {
  return <>
    <FechaIngreso />
    <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="ubicacion">UBICACIÓN</Label><select id="ubicacion" name="ubicacion" required className="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm">
      <option value="">Seleccionar ubicación</option><option>Polvorín superficie</option><option>Polvorín interior de mina</option>
    </select></div>
  </>;
}

function localToday(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
function FechaIngreso(){const [mode,setMode]=useState<"HOY"|"OTRA">("HOY");const [date,setDate]=useState(localToday);return <fieldset className="space-y-2 sm:col-span-2"><legend className="text-sm font-medium">FECHA DE INGRESO</legend><div className="grid grid-cols-2 rounded-lg border bg-slate-100 p-1"><button type="button" onClick={()=>{setMode("HOY");setDate(localToday());}} className={`rounded-md px-3 py-2 text-sm font-semibold ${mode==="HOY"?"bg-[#0d2c3e] text-white":"text-slate-600"}`}>HOY</button><button type="button" onClick={()=>{setMode("OTRA");setDate(localToday());}} className={`rounded-md px-3 py-2 text-sm font-semibold ${mode==="OTRA"?"bg-[#0d2c3e] text-white":"text-slate-600"}`}>OTRA</button></div><input type="hidden" name="fechaIngreso" value={date} required/>{mode==="OTRA"&&<Input type="date" value={date} onChange={e=>setDate(e.target.value)} required/>}</fieldset>}

function AutoExpiryDates() {
  const [fabricacion,setFabricacion]=useState(""); const [vencimiento,setVencimiento]=useState("");
  function changeFabricacion(value:string){setFabricacion(value);setVencimiento(value?`${Number(value.slice(0,4))+1}${value.slice(4)}`:"");}
  return <><div className="space-y-1.5"><Label htmlFor="fechaFabricacion">FECHA DE FABRICACIÓN</Label><Input id="fechaFabricacion" name="fechaFabricacion" type="date" required value={fabricacion} onChange={e=>changeFabricacion(e.target.value)}/></div><div className="space-y-1.5"><Label htmlFor="fechaVencimiento">FECHA DE VENCIMIENTO</Label><Input id="fechaVencimiento" name="fechaVencimiento" type="date" required value={vencimiento} onChange={e=>setVencimiento(e.target.value)}/><p className="text-xs text-slate-500">Sugerida automáticamente: fabricación + 1 año. Puede corregirse.</p></div></>;
}

function BatchRanges({ count, setCount }: { count: number; setCount: (value: number) => void }) {
  return <fieldset className="space-y-3 sm:col-span-2 rounded-xl border border-amber-200 bg-amber-50/40 p-4">
    <legend className="px-2 text-sm font-semibold">GRUPOS DE SERIALES CONSECUTIVOS</legend>
    <p className="text-xs text-slate-600">Cada grupo corresponde a un conjunto consecutivo del mismo ingreso masivo. Se incluirán todos los seriales desde el inicial hasta el final, ambos incluidos.</p>
    {Array.from({length:count},(_,index)=><div key={index} className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2">
      <p className="text-sm font-semibold text-[#0d2c3e] sm:col-span-2">GRUPO {index+1}</p>
      <Field name={`rangoDesde${index}`} label="SERIAL INICIAL" type="number" />
      <Field name={`rangoHasta${index}`} label="SERIAL FINAL" type="number" />
      {count>1&&index===count-1&&<Button type="button" variant="outline" onClick={()=>setCount(count-1)} className="justify-self-start text-red-700 sm:col-span-2"><Trash2 className="h-4 w-4"/>QUITAR ÚLTIMO GRUPO</Button>}
    </div>)}
    <Button type="button" variant="outline" onClick={()=>setCount(count+1)}><Plus className="h-4 w-4"/>AGREGAR OTRO GRUPO</Button>
  </fieldset>;
}

function Bobina({ number }: { number: 1 | 2 }) {
  return <fieldset className="sm:col-span-2 rounded-xl border border-slate-200 p-4"><legend className="px-2 text-sm font-semibold">BOBINA {number}</legend><div className="grid gap-3 sm:grid-cols-2">
    <Field name={`bobina${number}Inicial1`} label="SERIAL INICIAL 1" type="number" /><Field name={`bobina${number}Final1`} label="SERIAL FINAL 1" type="number" />
    <Field name={`bobina${number}Inicial2`} label="SERIAL INICIAL 2" type="number" /><Field name={`bobina${number}Final2`} label="SERIAL FINAL 2" type="number" />
  </div></fieldset>;
}

export function RecordDialog({ initialType = "INDUGEL", onSaved, triggerLabel, triggerClassName }: { initialType?: string; onSaved?: (result?:Record<string,unknown>) => void; triggerLabel?: string; triggerClassName?: string }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState(initialType);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [batchMode,setBatchMode]=useState(false);
  const [rangeCount,setRangeCount]=useState(1);
  useEffect(() => setType(initialType), [initialType]);
  const choices=initialType==="SELLOS"?["SELLOS"]:materialTypes;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    try {
      let result:Record<string,unknown>;
      if(batchMode&&(type==="INDUGEL"||type==="ANFO")){
        const rangos=Array.from({length:rangeCount},(_,index)=>({desde:form.get(`rangoDesde${index}`),hasta:form.get(`rangoHasta${index}`)}));
        result=await saveBatchRecords({tipo:type,fechaFabricacion:payload.fechaFabricacion,fechaVencimiento:payload.fechaVencimiento,fechaIngreso:payload.fechaIngreso,ubicacion:payload.ubicacion,rangos});
      }else result=await saveRecord({ ...payload, tipo: type });
      setOpen(false); onSaved?.(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo guardar."); }
    finally { setSaving(false); }
  }

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button className={triggerClassName || "shrink-0 bg-white text-[#0d2c3e] hover:bg-slate-100"}><Plus className="h-4 w-4" />{triggerLabel || "NUEVO REGISTRO"}</Button></DialogTrigger>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle>NUEVO REGISTRO</DialogTitle></DialogHeader>
      <form onSubmit={submit} className="space-y-5">
        {choices.length>1&&<div className="space-y-2"><Label>TIPO DE MATERIAL</Label><div className="grid gap-2 sm:grid-cols-2">{choices.map(value=><button key={value} type="button" onClick={()=>{setType(value);setBatchMode(false);setRangeCount(1);}} className={`rounded-lg border px-3 py-3 text-sm font-semibold ${type===value?"border-[#f5b51b] bg-amber-50 text-[#0d2c3e]":"bg-white text-slate-600"}`}>{value}</button>)}</div></div>}
        {(type==="INDUGEL"||type==="ANFO")&&<div className="grid grid-cols-2 rounded-lg border bg-slate-100 p-1"><button type="button" onClick={()=>setBatchMode(false)} className={`rounded-md px-3 py-2 text-sm font-semibold ${!batchMode?"bg-[#0d2c3e] text-white":"text-slate-600"}`}>INGRESO INDIVIDUAL</button><button type="button" onClick={()=>setBatchMode(true)} className={`rounded-md px-3 py-2 text-sm font-semibold ${batchMode?"bg-[#0d2c3e] text-white":"text-slate-600"}`}>INGRESO POR CANTIDAD</button></div>}
        <div className="grid gap-4 sm:grid-cols-2" key={type}>
          {(type === "INDUGEL" || type === "ANFO") && <>{batchMode?<BatchRanges count={rangeCount} setCount={setRangeCount}/>:<Field name="serial" label="SERIAL" type="number" />}<AutoExpiryDates/><CommonFields /></>}
          {type === "DETONADORES" && <><Field name="cajaNumero" label="CAJA No." /><Field name="contenido" label="CONTENIDO" /><Field name="loteProduccion" label="LOTE DE PRODUCCIÓN" /><Field name="fechaProduccion" label="FECHA DE PRODUCCIÓN" type="date" /><Field name="fechaVencimiento" label="FECHA DE VENCIMIENTO" type="date" /><CommonFields /></>}
          {type === "MECHA DE SEGURIDAD" && <><Field name="cajaNumero" label="CAJA No." /><Field name="cantidad" label="CANTIDAD" type="number" /><Field name="contenido" label="CONTENIDO" /><AutoExpiryDates/><CommonFields /><Bobina number={1} /><Bobina number={2} /></>}
          {type === "SELLOS" && <><Field name="fecha" label="FECHA" type="date" /><Field name="selloIndugel" label="SELLO DE SEGURIDAD INDUGEL" type="number" /><Field name="selloAnfo" label="SELLO DE SEGURIDAD ANFO" type="number" /></>}
        </div>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-3"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}Guardar registro</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}
