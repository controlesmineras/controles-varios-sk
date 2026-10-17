import {createDeviceAccess} from "@/lib/device-access";
const deviceAccess=createDeviceAccess("explosivos");
import {sealPerson,type SealPerson} from "@/lib/seal-people";
import {enqueue,getCachedRecords,getOperations,acceptSnapshot,getLocal,setLocal} from "@/lib/offline-store";
import {operationKeys,operationLabel,validateInventory} from "@/lib/sync-state";
import type {OfflineOperation} from "@/lib/offline-store";
declare global{interface Window{CONTROL_EXPLOSIVOS_CONFIG?:{apiUrl?:string};}}
const apiUrl=()=>window.CONTROL_EXPLOSIVOS_CONFIG?.apiUrl?.trim()||"";type ApiResult=Record<string,any>;
export function backendConfigured(){return Boolean(apiUrl());}
class ApiRejection extends Error {}
async function request(action:string,data:Record<string,unknown>={},expectedToken?:string):Promise<ApiResult>{
 const url=apiUrl();if(!url)throw new Error("La aplicación aún no está conectada al servidor de la empresa.");
 const token=localStorage.getItem("control_explosivos_token")||"";
 if(expectedToken!==undefined&&token!==expectedToken)throw new Error("La sesión cambió. Vuelve a sincronizar con tu sesión actual.");
 let response:Response;
 try{response=await fetch(url,{method:"POST",body:new URLSearchParams({payload:JSON.stringify({action,token,...data})}),signal:AbortSignal.timeout(45000)});}
 catch(error){throw new Error(error instanceof Error&&/Timeout|Abort/.test(error.name)?"El servidor tardó demasiado en responder. Los pendientes se conservan; vuelve a sincronizar.":"No se pudo conectar con el servidor. Los pendientes se conservan; verifica tu conexión.");}
 if(response.ok===false)throw new Error(`El servidor respondió con error ${response.status}. Los pendientes se conservan.`);
 let result:ApiResult;try{result=await response.json();}catch{throw new Error("El servidor devolvió una respuesta inválida. Los pendientes se conservan.");}
 if(!result||result.ok!==true)throw new ApiRejection(result?.error||"No se pudo completar la operación.");
 if(expectedToken!==undefined&&localStorage.getItem("control_explosivos_token")!==expectedToken)throw new Error("La sesión cambió durante la sincronización. Los pendientes se conservan.");
 return result;
}
function useSession(result:ApiResult){localStorage.setItem("control_explosivos_token",result.token);localStorage.setItem("control_explosivos_user",JSON.stringify(result.usuario));return result;}
async function refreshAccess(token:string){try{const result=await request("status");if(localStorage.getItem("control_explosivos_token")!==token)return;if(result.authenticated&&result.usuario){const serialized=JSON.stringify(result.usuario),changed=localStorage.getItem("control_explosivos_user")!==serialized;localStorage.setItem("control_explosivos_user",serialized);deviceAccess.refresh(token,{token,usuario:result.usuario});if(changed)window.dispatchEvent(new Event("explosivos-access-updated"));}else if(result.authenticated===false){logout();window.dispatchEvent(new Event("explosivos-access-updated"));}}catch{}}
export async function getStatus(){
 const token=localStorage.getItem("control_explosivos_token")||"";
 let user:ApiResult|null=null;
 try{user=JSON.parse(localStorage.getItem("control_explosivos_user")||"null");}catch{}
 if(token&&user?.usuario){
  if(navigator.onLine)void refreshAccess(token);
  return {ok:true,needsBootstrap:false,authenticated:true,usuario:user,offline:!navigator.onLine,local:true};
 }
 const localStatus={ok:true,needsBootstrap:false,authenticated:false,usuario:null,offline:true,local:true};
 // The sign-in form must also open offline after an explicit logout.
 if(!navigator.onLine)return localStatus;
 try{return await request("status");}catch{return localStatus;}
}
export async function login(usuario:string,password:string){
 const cached=await deviceAccess.verify(usuario,password);
 if(navigator.onLine){
  try{const result=await request("login",{usuario,password});useSession(result);await deviceAccess.remember(usuario,password,{token:result.token,usuario:result.usuario});return result;}
  catch(error){if(error instanceof ApiRejection){if(/contraseña|desactiv|no autorizado|no tiene acceso|credenciales|usuario.*incorrect/i.test(error.message)){deviceAccess.remove(usuario);logout();}throw error;}if(!cached)throw error;}
 }
 if(cached){useSession(cached);return {...cached,ok:true,local:true};}
 throw new Error("Usuario o contraseña no reconocidos en este dispositivo. El primer acceso requiere conexión.");
}
export async function createInitialAdmin(usuario:string,nombre:string,password:string){const result=await request("bootstrap",{usuario,nombre,password});localStorage.setItem("control_explosivos_token",result.token);localStorage.setItem("control_explosivos_user",JSON.stringify(result.usuario));await deviceAccess.remember(usuario,password,{token:result.token,usuario:result.usuario});return result;}
export function logout(){localStorage.removeItem("control_explosivos_token");localStorage.removeItem("control_explosivos_user");}
export type SyncIssue={id:string;label:string;message:string};
function compatibilityError(operation:OfflineOperation,version:number){
 const record=operation.data.record as Record<string,unknown>|undefined;
 if(version<6&&(operation.action==="externalUpsert"||record?.sealSchema===2))return "Actualiza el servidor de Explosivos para sincronizar participantes y externos.";
 if(version<5&&record?.tipo==="SELLOS"&&record?.motivo)return "Actualiza el servidor de Explosivos para sincronizar precintos con su motivo.";
 if(version<4&&operation.action==="deleteRecord")return "Actualiza el servidor de Explosivos para sincronizar eliminaciones.";
 return "";
}
function deletionAlreadyApplied(operation:OfflineOperation,message:string,records:Parameters<typeof acceptSnapshot>[0]){
 const type=String(operation.data.tipo),id=String(operation.data.id);
 return operation.action==="deleteRecord"&&message==="El registro que intentas eliminar ya no existe."&&Array.isArray(records[type])&&!records[type].some(record=>String(record.id)===id);
}
function independentRejection(error:unknown){
 return error instanceof ApiRejection&&/ya existe|ya está registrado|ya se encuentra|no se encontró|no encontrado|ya no existe|no puede figurar dos veces|debe verificarse|campo .* obligatorio|no (?:es )?válid|no reconocido|rango|seriales|requiere rol administrador|documento ya pertenece/i.test(error.message);
}
// Keep payloads and server work bounded; dependent changes retain their order.
function synchronizationGroups(operations:OfflineOperation[],version:number){
 const groups:OfflineOperation[][]=[];let group:OfflineOperation[]=[],bytes=0,keys=new Set<string>();
 const flush=()=>{if(group.length)groups.push(group);group=[];bytes=0;keys=new Set<string>();};
 for(const operation of operations){
  if(["createBatch","verifyBatch","externalUpsert"].includes(operation.action)){flush();groups.push([operation]);continue;}
  const operationBytes=new TextEncoder().encode(JSON.stringify(operation)).byteLength,operationIds=operationKeys(operation);
  if(group.length>=(version>=7?50:5)||bytes+operationBytes>64*1024||(version<7&&operationIds.some(id=>keys.has(id))))flush();
  group.push(operation);bytes+=operationBytes;operationIds.forEach(id=>keys.add(id));
 }
 flush();return groups;
}
async function runSynchronization(){
 if(!navigator.onLine)throw new Error("Sin conexión. Los pendientes siguen guardados en este dispositivo.");
 const token=localStorage.getItem("control_explosivos_token")||"";
 if(!token)throw new Error("Inicia sesión nuevamente para sincronizar. Los pendientes se conservan.");
 const operations=await getOperations(),issues:SyncIssue[]=[],blocked=new Set<string>();
 let latestRecords:Parameters<typeof acceptSnapshot>[0]|null=null;
 if(operations.length){
  const status=await request("status",{},token),version=Number(status.apiVersion||0);
  if(status.authenticated!==true)throw new Error("La sesión del servidor venció. Cierra sesión y vuelve a ingresar con internet para sincronizar. Los pendientes se conservan.");
  if(version<3)throw new Error("Actualiza el servidor de Explosivos antes de sincronizar. Los pendientes se conservan.");
  const report=(operation:OfflineOperation,message:string)=>{operationKeys(operation).forEach(key=>blocked.add(key));issues.push({id:operation.id,label:operationLabel(operation),message});};
  async function sendGroup(group:OfflineOperation[]):Promise<void>{
   const eligible:OfflineOperation[]=[];
   for(const operation of group){
    const message=operationKeys(operation).some(key=>blocked.has(key))?"Espera la confirmación de un cambio anterior de este registro.":compatibilityError(operation,version);
    if(message)report(operation,message);else eligible.push(operation);
   }
   if(!eligible.length)return;
   try{
    const result=await request("sync",{syncProtocol:version>=7?"explosivos-receipts-v1":undefined,operations:eligible.map(operation=>({id:operation.id,action:operation.action,data:operation.data}))},token);
    validateInventory(result.records);
    const expected=new Set(eligible.map(operation=>operation.id));
    const rejections:SyncIssue[]=result.syncProtocol==="explosivos-receipts-v1"&&Array.isArray(result.rejected)?result.rejected:[];
    const processed:unknown[]=Array.isArray(result.processed)?result.processed:[];
    const receipts=[...processed,...rejections.map(issue=>issue?.id)];
    if(!Array.isArray(result.processed)||receipts.length!==expected.size||new Set(receipts).size!==expected.size||receipts.some(id=>typeof id!=="string"||!expected.has(id))||rejections.some(issue=>!issue||typeof issue.message!=="string"||!issue.message.trim()))throw new Error("El servidor no confirmó todos los pendientes enviados. Se conservan para reintentar.");
    const reconciled=rejections.filter(issue=>deletionAlreadyApplied(eligible.find(operation=>operation.id===issue.id)!,issue.message,result.records));
    await acceptSnapshot(result.records,[...result.processed,...reconciled.map(issue=>issue.id)]);
    for(const issue of rejections)if(!reconciled.includes(issue))report(eligible.find(operation=>operation.id===issue.id)!,issue.message);
    latestRecords=result.records;
    window.dispatchEvent(new Event("explosivos-sync-progress"));
   }catch(error){
    if(!independentRejection(error))throw error;
    if(eligible.length===1){
     const operation=eligible[0],message=(error as Error).message;
     if(operation.action==="deleteRecord"&&message==="El registro que intentas eliminar ya no existe."){
      const remote=(await request("list",{},token)).records;validateInventory(remote);
      if(deletionAlreadyApplied(operation,message,remote)){await acceptSnapshot(remote,[operation.id]);latestRecords=remote;window.dispatchEvent(new Event("explosivos-sync-progress"));return;}
     }
     report(operation,message);return;
    }
    // A rejected batch may already have committed a prefix. Stable IDs make these retries safe.
    for(const operation of eligible)await sendGroup([operation]);
   }
  }
  for(const group of synchronizationGroups(operations,version))await sendGroup(group);
 }
 // Every successful sync already returns a full inventory. Avoid downloading it again.
 // Commit again locally to include changes queued while the final response was being handled.
 const remote=latestRecords??(await request("list",{},token)).records;
 const snapshot=await acceptSnapshot(remote);
 return {...snapshot,issues};
}
let syncing:ReturnType<typeof runSynchronization>|null=null;
export function synchronize(){
 if(!syncing){
  const run=()=>runSynchronization();
  const task=Promise.resolve(navigator.locks?navigator.locks.request("explosivos-synchronize",run):run());
  syncing=task.finally(()=>{syncing=null;});
 }
 return syncing!;
}
// Reading local inventory never pretends to be a successful server synchronization.
export const listRecords=()=>getCachedRecords();

export async function saveRecord(record:Record<string,unknown>){const id=crypto.randomUUID();const type=String(record.tipo);const user=JSON.parse(localStorage.getItem("control_explosivos_user")||"{}");const item={...record,...(type==="SELLOS"?{registradoPor:{usuario:user.usuario||"",nombre:user.nombre||user.usuario||""}}:{}),id,fechaRegistro:new Date().toISOString(),...((type==="INDUGEL"||type==="ANFO")?{verificado:true,fechaVerificacion:new Date().toISOString()}:{}),movimientos:[]};await enqueue("create",{record:item},records=>{if((type==="INDUGEL"||type==="ANFO")&&records[type].some(value=>String(value.serial)===String(record.serial)))throw new Error("Ese serial ya está registrado en este dispositivo.");records[type].unshift(item);});return {ok:true,id,local:true};}
export async function saveBatchRecords(batch:Record<string,any>){const type=String(batch.tipo);const loteIngreso=crypto.randomUUID();const items:Array<Record<string,unknown>>=[];const generated=new Set<number>();for(const range of batch.rangos||[]){const from=Number(range.desde),to=Number(range.hasta);if(!Number.isFinite(from)||!Number.isFinite(to)||to<from)throw new Error("El rango de seriales no es válido.");for(let serial=from;serial<=to;serial++){if(generated.has(serial))throw new Error(`El serial ${serial} está repetido entre los grupos.`);generated.add(serial);items.push({id:crypto.randomUUID(),serial,tipo:type,fechaFabricacion:batch.fechaFabricacion,fechaVencimiento:batch.fechaVencimiento,fechaIngreso:batch.fechaIngreso,ubicacion:batch.ubicacion,fechaRegistro:new Date().toISOString(),verificado:false,movimientos:[],loteIngreso});}}await enqueue("createBatch",{batch:{...batch,items,loteIngreso}},records=>{const existing=new Set(records[type].map(value=>Number(value.serial)));const duplicate=items.find(item=>existing.has(Number(item.serial)));if(duplicate)throw new Error(`El serial ${duplicate.serial} ya está registrado en este dispositivo.`);records[type].unshift(...items);});return {ok:true,cantidad:items.length,loteIngreso,local:true};}
export async function verifyBatchRecords(tipo:string,unidades:Array<Record<string,unknown>>){const ids=new Set(unidades.map(unit=>String(unit.id)));await enqueue("verifyBatch",{tipo,unidades},records=>records[tipo].forEach(item=>{if(ids.has(String(item.id))){const unit=unidades.find(value=>String(value.id)===String(item.id))!;item.fechaFabricacion=unit.fechaFabricacion;item.fechaVencimiento=unit.fechaVencimiento;item.verificado=true;item.fechaVerificacion=new Date().toISOString();}}));return {ok:true,cantidad:unidades.length,local:true};}
export async function moveRecord(tipo:string,id:string,ubicacion:string,fechaMovimiento:string){if(!Number.isFinite(Date.parse(fechaMovimiento)))throw new Error("La fecha y hora del movimiento no son válidas.");await enqueue("move",{tipo,id,ubicacion,fechaMovimiento},records=>{const item=records[tipo].find(value=>String(value.id)===id);if(!item)throw new Error("Registro no encontrado.");const origen=item.ubicacion;item.ubicacion=ubicacion;const movements=(item.movimientos as Array<Record<string,unknown>>)||[];movements.unshift({fecha:fechaMovimiento,origen,destino:ubicacion});item.movimientos=movements;});return {ok:true,local:true};}
export async function deleteRecord(tipo:string,id:string){await enqueue("deleteRecord",{tipo,id},records=>{const index=records[tipo].findIndex(value=>String(value.id)===id);if(index<0)throw new Error("Registro no encontrado.");records[tipo].splice(index,1);});return {ok:true,local:true};}
export const pendingOperations=async()=> (await getOperations()).length;
export async function listUsers(){return (await request("usersList")).users;}export async function createUser(usuario:string,nombre:string,password:string,rol:string){return request("userCreate",{usuario,nombre,password,rol});}export async function resetUserPassword(usuario:string,password:string){return request("userResetPassword",{usuario,password});}export async function setUserActive(usuario:string,activo:boolean){return request("userSetActive",{usuario,activo});}

export async function listSealPeople():Promise<{people:SealPerson[];warning?:string}>{
 let internal=await getLocal<SealPerson[]>("sealInternalPeople",[]),external=await getLocal<SealPerson[]>("sealExternalPeople",[]),warning="";
 if(navigator.onLine){try{const result=await request("sealPeople");if(!result.warning)internal=result.internal;const remote=result.external as SealPerson[];const pending=await getOperations();const queued=pending.filter(op=>op.action==="externalUpsert").map(op=>op.data.person as SealPerson);external=Array.from(new Map([...remote,...queued].map(p=>[p.documento,p])).values());warning=result.warning||"";await setLocal("sealInternalPeople",internal);await setLocal("sealExternalPeople",external);}catch{warning="Directorio sin actualizar: se usan las personas guardadas. Si es la primera consulta, actualiza el servidor de Explosivos.";}}
 else warning="Sin conexión: se usan las personas guardadas en el dispositivo.";
 return {people:[...internal,...external],warning};
}
export async function saveExternalPerson(value:SealPerson){const person=sealPerson({...value,origen:"Externo"}),existing=await listSealPeople();if(existing.people.some(p=>p.documento===person.documento&&p.origen==="SK Admin"))throw new Error("Este documento ya pertenece a Personal de SK Admin. Selecciónalo en el buscador.");const rows=await getLocal<SealPerson[]>("sealExternalPeople",[]);await setLocal("sealExternalPeople",[...rows.filter(p=>p.documento!==person.documento),person]);await enqueue("externalUpsert",{person});return person;}

