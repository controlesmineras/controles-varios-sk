export type OfflineOperation={id:string;action:string;data:Record<string,unknown>;createdAt:string};
const DB="control-explosivos-local";const VERSION=1;const STORE="data";
function open(){return new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open(DB,VERSION);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE);};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
export async function getLocal<T>(key:string,fallback:T):Promise<T>{if(typeof indexedDB==="undefined")return fallback;const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,"readonly");const request=tx.objectStore(STORE).get(key);request.onsuccess=()=>resolve((request.result as T)??fallback);request.onerror=()=>reject(request.error);tx.oncomplete=()=>db.close();});}
export async function setLocal<T>(key:string,value:T){const db=await open();return new Promise<void>((resolve,reject)=>{const tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).put(value,key);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);});}
export const getCachedRecords=()=>getLocal<Record<string,Array<Record<string,unknown>>>>("records",{});
export const setCachedRecords=(records:Record<string,Array<Record<string,unknown>>>)=>setLocal("records",records);
export const getOperations=()=>getLocal<OfflineOperation[]>("operations",[]);
export async function enqueue(action:string,data:Record<string,unknown>){const operations=await getOperations();const operation={id:crypto.randomUUID(),action,data,createdAt:new Date().toISOString()};operations.push(operation);await setLocal("operations",operations);return operation;}
export async function removeOperation(id:string){await setLocal("operations",(await getOperations()).filter(operation=>operation.id!==id));}
