type CachedAccess={salt:string;hash:string;session:any;confirmedAt:string};
export function createDeviceAccess(namespace:string){
 const key=namespace+':device-access:v1';
 const id=(value:string)=>String(value).trim().toLowerCase();
 const read=():Record<string,CachedAccess>=>{try{return Object.assign(Object.create(null),JSON.parse(localStorage.getItem(key)||'{}'))}catch{return Object.create(null)}};
 const write=(rows:Record<string,CachedAccess>)=>localStorage.setItem(key,JSON.stringify(rows));
 const hex=(bytes:Uint8Array)=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
 async function hash(password:string,salt:string){const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);return hex(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:150000,hash:'SHA-256'},material,256)));}
 return {
  async remember(username:string,password:string,session:any){const salt=hex(crypto.getRandomValues(new Uint8Array(16))),derived=await hash(password,salt),rows=read();rows[id(username)]={salt,hash:derived,session,confirmedAt:new Date().toISOString()};write(rows);},
  async verify(username:string,password:string){const row=read()[id(username)];if(!row||await hash(password,row.salt)!==row.hash)return null;return row.session;},
  byToken(token:string){return Object.values(read()).find(row=>row.session?.token===token)?.session||null;},
  refresh(token:string,session:any){const rows=read();for(const row of Object.values(rows))if(row.session?.token===token){row.session=session;row.confirmedAt=new Date().toISOString();}write(rows);},
  remove(username:string){const rows=read();delete rows[id(username)];write(rows);},
  revokeToken(token:string){const rows=read();for(const name of Object.keys(rows))if(rows[name].session?.token===token)delete rows[name];write(rows);}
 };
}
