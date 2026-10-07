"use client";
import {useEffect,useState} from "react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {listSealPeople,saveExternalPerson} from "@/lib/backend";
import {sealPerson,type SealPerson} from "@/lib/seal-people";
export function SealParticipants({onChange}:{onChange:(responsable:SealPerson|null,asistentes:SealPerson[])=>void}){
 const [people,setPeople]=useState<SealPerson[]>([]),[officer,setOfficer]=useState<SealPerson|null>(null),[attendees,setAttendees]=useState<SealPerson[]>([]),[query,setQuery]=useState(""),[role,setRole]=useState<"officer"|"attendee">("officer"),[manual,setManual]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState(""),[saving,setSaving]=useState(false);
 const [draft,setDraft]=useState({documento:"",nombre:"",cargo:"",empresa:""});
 useEffect(()=>{let active=true;listSealPeople().then(result=>{if(active){setPeople(result.people);setNotice(result.warning||"");}}).catch(e=>active&&setNotice(e.message));return()=>{active=false};},[]);
 function choose(person:SealPerson){const nextOfficer=role==="officer"?person:officer,nextAttendees=role==="attendee"?[...attendees,person]:attendees;if(nextAttendees.some(p=>p.documento===nextOfficer?.documento)||new Set(nextAttendees.map(p=>p.documento)).size!==nextAttendees.length){setError("Esta persona ya está incluida.");return;}setOfficer(nextOfficer);setAttendees(nextAttendees);onChange(nextOfficer,nextAttendees);setQuery("");setError("");setManual(false);}
 async function external(){try{setSaving(true);setError("");const p=sealPerson({...draft,origen:"Externo"});await saveExternalPerson(p);setPeople(current=>[...current.filter(x=>x.documento!==p.documento),p]);choose(p);setDraft({documento:"",nombre:"",cargo:"",empresa:""});}catch(e){setError(e instanceof Error?e.message:"No se pudo guardar.");}finally{setSaving(false);}}
 const term=query.trim().toLocaleLowerCase("es"),matches=term?people.filter(p=>(role!=="officer"||p.origen==="Externo"||/seguridad/i.test(p.area||p.cargo))&&`${p.documento} ${p.nombre} ${p.empresa}`.toLocaleLowerCase("es").includes(term)).slice(0,12):[];
 return <fieldset className="space-y-3 rounded-xl border p-4 sm:col-span-2"><legend className="px-2 font-semibold">PARTICIPANTES</legend>
 <p className="text-sm"><b>FUNCIONARIO DE SEGURIDAD DE TURNO *</b></p>{officer?<p className="text-sm">{officer.nombre} · {officer.documento} · {officer.cargo} · {officer.empresa}</p>:<p className="text-sm text-slate-500">Selecciona el funcionario responsable.</p>}
 <Button type="button" variant="outline" onClick={()=>{setRole("officer");setQuery("");setManual(false);}}>Seleccionar funcionario</Button>
 <p className="text-sm font-semibold">ASISTENTES</p>{attendees.map(p=><div key={p.documento} className="flex items-center justify-between gap-2 text-sm"><span>{p.nombre} · {p.documento} · {p.cargo} · {p.empresa}</span><button type="button" aria-label={`Quitar a ${p.nombre}`} onClick={()=>{const next=attendees.filter(x=>x.documento!==p.documento);setAttendees(next);onChange(officer,next);}}>×</button></div>)}
 <Button type="button" variant="outline" onClick={()=>{setRole("attendee");setQuery("");setManual(false);}}>+ Agregar asistente</Button>
 <label className="block space-y-1 text-sm">{role==="officer"?"Buscar funcionario de seguridad":"Buscar asistente"}<Input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Documento o nombre" autoComplete="off"/></label>
 {matches.length>0&&<div className="max-h-48 overflow-auto rounded-lg border">{matches.map(p=><button key={`${p.origen}-${p.documento}`} type="button" className="block w-full border-b p-2 text-left text-sm hover:bg-slate-50" onClick={()=>choose(p)}>{p.nombre} · {p.documento}<span className="block text-xs text-slate-500">{p.cargo} · {p.empresa} · {p.origen}</span></button>)}</div>}
 {notice&&<p className="text-xs text-amber-800">{notice}</p>}
 <Button type="button" variant="outline" onClick={()=>setManual(!manual)}>+ Registrar persona externa</Button>
 {manual&&<div className="grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">{([['documento','DOCUMENTO'],['nombre','NOMBRE COMPLETO'],['cargo','CARGO'],['empresa','EMPRESA']] as const).map(([key,label])=><label key={key} className="text-sm">{label}<Input value={draft[key]} onChange={e=>setDraft({...draft,[key]:e.target.value})}/></label>)}<Button type="button" disabled={saving} onClick={()=>void external()} className="sm:col-span-2">{saving?"Guardando…":"Guardar externo y seleccionar"}</Button><p className="text-xs text-slate-500 sm:col-span-2">Se guarda solo en el directorio de Explosivos.</p></div>}
 {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
 </fieldset>;
}
