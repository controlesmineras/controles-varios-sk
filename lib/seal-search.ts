import type {SealPerson} from "./seal-people";
const normalize=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("es").trim();
const documentKey=(value:string)=>normalize(value).replace(/[.\s-]/g,"");
export function isSecurityPerson(person:SealPerson){return person.origen==="SK Admin"&&/^seguridad(?:\s|$)/.test(normalize(person.area||""));}
export function searchSealPeople(people:SealPerson[],query:string){
 const term=normalize(query);if(!term)return [];
 const key=documentKey(query),byDocument=/^[\d.\s-]+$/.test(query);
 return people.map(person=>{const doc=documentKey(person.documento),name=normalize(person.nombre);const rank=doc===key?0:doc.startsWith(key)?1:doc.includes(key)?2:!byDocument&&name.startsWith(term)?3:!byDocument&&name.includes(term)?4:99;return {person,rank};}).filter(row=>row.rank<99).sort((a,b)=>a.rank-b.rank||a.person.nombre.localeCompare(b.person.nombre,"es")).slice(0,12).map(row=>row.person);
}
