export type SealPerson={documento:string;nombre:string;cargo:string;empresa:string;area?:string;origen:"SK Admin"|"Externo"};
export const sealReasons=["Inventario","Traslado de material","Inspección física"] as const;
export function sealPerson(value:unknown):SealPerson{
  const p=value as SealPerson;
  if(!p||![p.documento,p.nombre,p.cargo,p.empresa].every(v=>typeof v==="string"&&v.trim()))throw new Error("Completa documento, nombre, cargo y empresa de cada participante.");
  return {documento:p.documento.trim(),nombre:p.nombre.trim(),cargo:p.cargo.trim(),empresa:p.empresa.trim(),area:p.area||"",origen:p.origen==="SK Admin"?"SK Admin":"Externo"};
}
export function sealParticipants(responsable:unknown,asistentes:unknown[]){
  const funcionario=sealPerson(responsable),people=asistentes.map(sealPerson),docs=[funcionario.documento,...people.map(p=>p.documento)];
  if(new Set(docs).size!==docs.length)throw new Error("Una persona no puede figurar dos veces en el mismo registro.");
  return {funcionarioSeguridad:funcionario,asistentes:people};
}
export function sealDate(fecha:string,hora:string){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(fecha)||!/^\d{2}:\d{2}$/.test(hora))throw new Error("Completa fecha y hora de la novedad.");
  const iso=`${fecha}T${hora}:00-05:00`,d=new Date(iso);
  if(!Number.isFinite(d.getTime())||new Date(d.getTime()-5*3600000).toISOString().slice(0,16)!==`${fecha}T${hora}`)throw new Error("Fecha u hora de la novedad no válida.");
  return iso;
}
