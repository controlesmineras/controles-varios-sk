const APP = Object.freeze({
  fileName: "control-explosivos-sk-central.json",
  property: "CONTROL_EXPLOSIVOS_FILE_ID",
  sessionHours: 12,
  locations: ["Polvorín superficie", "Polvorín interior de mina"]
});

function configurarSistema() {
  const db = load_();
  save_(db);
  Logger.log("Base privada creada: " + DriveApp.getFileById(PropertiesService.getScriptProperties().getProperty(APP.property)).getUrl());
}

function doGet() { return json_({ ok: true, servicio: "CONTROL EXPLOSIVOS SK" }); }

function doPost(e) {
  try {
    const body = JSON.parse((e && e.parameter && e.parameter.payload) || "{}");
    const action = String(body.action || "");
    if (action === "status") return json_(status_(body.token));
    if (action === "bootstrap") return json_(bootstrap_(body));
    if (action === "login") return json_(login_(body));
    const user = requireSession_(body.token);
    if (action === "list") return json_({ ok: true, records: publicRecords_(load_()) });
    if (action === "create") return json_(create_(body.record || {}, user.usuario));
    if (action === "createBatch") return json_(createBatch_(body.batch || {}, user.usuario));
    if (action === "move") return json_(move_(body, user.usuario));
    if (action === "usersList") return json_(usersList_(user));
    if (action === "userCreate") return json_(userCreate_(body, user));
    if (action === "userResetPassword") return json_(userResetPassword_(body, user));
    if (action === "userSetActive") return json_(userSetActive_(body, user));
    throw new Error("Operación no reconocida.");
  } catch (error) { return json_({ ok: false, error: error.message || String(error) }); }
}

function emptyDb_() {
  return { version: 1, records: { INDUGEL: [], ANFO: [], "MECHA DE SEGURIDAD": [], DETONADORES: [], SELLOS: [] }, users: [], sessions: [] };
}

function load_() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty(APP.property);
  if (!id) {
    const file = DriveApp.createFile(APP.fileName, JSON.stringify(emptyDb_()), MimeType.PLAIN_TEXT);
    id = file.getId(); props.setProperty(APP.property, id);
  }
  try {
    const db = JSON.parse(DriveApp.getFileById(id).getBlob().getDataAsString("UTF-8"));
    db.records = db.records || emptyDb_().records; db.users = db.users || []; db.sessions = db.sessions || [];
    if(db.users.length&&!db.users.some(u=>u.protegido===true))db.users[0].protegido=true;
    return db;
  } catch (_) { throw new Error("No se pudo leer la base privada. Verifica que el archivo no haya sido eliminado."); }
}

function save_(db) {
  const id = PropertiesService.getScriptProperties().getProperty(APP.property);
  if (!id) throw new Error("La base aún no ha sido configurada.");
  DriveApp.getFileById(id).setContent(JSON.stringify(db));
}

function status_(token) {
  const db = load_(); let current = null;
  try { current = sessionFromDb_(db, token); } catch (_) {}
  return { ok: true, needsBootstrap: db.users.length === 0, authenticated: Boolean(current), usuario: current };
}

function bootstrap_(body) {
  return locked_(function(db) {
    if (db.users.length) throw new Error("El administrador inicial ya fue creado.");
    const usuario = required_(body.usuario,"usuario").toLowerCase(); const nombre=required_(body.nombre,"nombre"); const password=password_(body.password); const salt=token_();
    db.users.push({ usuario:usuario,nombre:nombre,salt:salt,hash:hash_(salt+password),rol:"ADMINISTRADOR",activo:true,protegido:true,creado:iso_() });
    const result = newSession_(db,usuario); return result;
  });
}

function login_(body) {
  return locked_(function(db) {
    const usuario=required_(body.usuario,"usuario").toLowerCase(); const password=required_(body.password,"contraseña");
    const account=db.users.find(u=>u.usuario===usuario);
    if(!account||!account.activo||account.hash!==hash_(account.salt+password))throw new Error("Usuario o contraseña incorrectos.");
    return newSession_(db,usuario);
  });
}

function newSession_(db,usuario) {
  const account=db.users.find(u=>u.usuario===usuario); const token=token_()+token_(); const vence=new Date(Date.now()+APP.sessionHours*3600000).toISOString();
  db.sessions=db.sessions.filter(s=>new Date(s.vence).getTime()>Date.now()); db.sessions.push({tokenHash:hash_(token),usuario:usuario,vence:vence});
  return {ok:true,token:token,usuario:{usuario:usuario,nombre:account.nombre,rol:account.rol},vence:vence};
}

function requireSession_(token) { return sessionFromDb_(load_(),token); }
function sessionFromDb_(db,token) {
  if(!token)throw new Error("Debes iniciar sesión."); const key=hash_(String(token)); const session=db.sessions.find(s=>s.tokenHash===key&&new Date(s.vence).getTime()>Date.now());
  if(!session)throw new Error("La sesión venció. Inicia sesión nuevamente."); const account=db.users.find(u=>u.usuario===session.usuario&&u.activo);
  if(!account)throw new Error("El usuario no está activo."); return {usuario:account.usuario,nombre:account.nombre,rol:account.rol};
}

function create_(r,usuario) {
  return locked_(function(db) {
    const type=required_(r.tipo,"tipo"); if(!db.records[type])throw new Error("Tipo de registro no reconocido.");
    const base={id:Utilities.getUuid(),fechaRegistro:iso_(),usuario:usuario}; let item;
    if(type==="INDUGEL"||type==="ANFO") { const serial=number_(r.serial,"serial"); unique_(db.records[type],"serial",serial); const fabricacion=required_(r.fechaFabricacion,"fecha de fabricación"); const vencimiento=required_(r.fechaVencimiento,"fecha de vencimiento"); item=Object.assign(base,{serial:serial,fechaFabricacion:fabricacion,fechaVencimiento:vencimiento,movimientos:[]},common_(r)); }
    else if(type==="DETONADORES") { const caja=required_(r.cajaNumero,"caja"); unique_(db.records[type],"cajaNumero",caja); item=Object.assign(base,{cajaNumero:caja,contenido:required_(r.contenido,"contenido"),loteProduccion:required_(r.loteProduccion,"lote"),fechaProduccion:required_(r.fechaProduccion,"fecha de producción"),fechaVencimiento:required_(r.fechaVencimiento,"fecha de vencimiento"),movimientos:[]},common_(r)); }
    else if(type==="MECHA DE SEGURIDAD") { const caja=required_(r.cajaNumero,"caja"); unique_(db.records[type],"cajaNumero",caja); const ranges={bobina1Inicial1:number_(r.bobina1Inicial1,"serial"),bobina1Final1:number_(r.bobina1Final1,"serial"),bobina1Inicial2:optionalNumber_(r.bobina1Inicial2),bobina1Final2:optionalNumber_(r.bobina1Final2),bobina2Inicial1:number_(r.bobina2Inicial1,"serial"),bobina2Final1:number_(r.bobina2Final1,"serial"),bobina2Inicial2:optionalNumber_(r.bobina2Inicial2),bobina2Final2:optionalNumber_(r.bobina2Final2)}; range_(ranges.bobina1Inicial1,ranges.bobina1Final1);rangeOptional_(ranges.bobina1Inicial2,ranges.bobina1Final2);range_(ranges.bobina2Inicial1,ranges.bobina2Final1);rangeOptional_(ranges.bobina2Inicial2,ranges.bobina2Final2); item=Object.assign(base,{cajaNumero:caja,cantidad:number_(r.cantidad,"cantidad"),contenido:required_(r.contenido,"contenido"),fechaFabricacion:required_(r.fechaFabricacion,"fecha de fabricación"),fechaVencimiento:required_(r.fechaVencimiento,"fecha de vencimiento"),movimientos:[]},common_(r),ranges); }
    else { item=Object.assign(base,{fecha:required_(r.fecha,"fecha"),selloIndugel:number_(r.selloIndugel,"sello Indugel"),selloAnfo:number_(r.selloAnfo,"sello Anfo")}); }
    db.records[type].unshift(item); return {ok:true,id:item.id};
  });
}

function createBatch_(r,usuario) {
  return locked_(function(db) {
    const type=required_(r.tipo,"tipo"); if(type!=="INDUGEL"&&type!=="ANFO")throw new Error("El ingreso por rangos solo está disponible para INDUGEL y ANFO.");
    if(!Array.isArray(r.rangos)||!r.rangos.length)throw new Error("Debes agregar al menos un rango de seriales.");
    const fabricacion=required_(r.fechaFabricacion,"fecha de fabricación"); const vencimiento=required_(r.fechaVencimiento,"fecha de vencimiento"); const common=common_(r);
    const seriales=[]; const vistos={};
    r.rangos.forEach(function(rango,index){
      if(rango.verificado!==true)throw new Error("Debes verificar las fechas del rango "+(index+1)+".");
      const desde=number_(rango.desde,"serial inicial del rango "+(index+1)); const hasta=number_(rango.hasta,"serial final del rango "+(index+1)); range_(desde,hasta);
      if(hasta-desde+1>5000)throw new Error("Un rango no puede contener más de 5.000 seriales.");
      for(let serial=desde;serial<=hasta;serial++){if(vistos[serial])throw new Error("El serial "+serial+" está repetido entre los rangos.");vistos[serial]=true;seriales.push(serial);}
    });
    const existentes={}; db.records[type].forEach(function(item){existentes[item.serial]=true;}); const repetido=seriales.find(function(serial){return existentes[serial];}); if(repetido!==undefined)throw new Error("El serial "+repetido+" ya existe y no se guardó ningún registro.");
    const fechaRegistro=iso_(); const lote=Utilities.getUuid(); const items=seriales.map(function(serial){return Object.assign({id:Utilities.getUuid(),fechaRegistro:fechaRegistro,usuario:usuario,serial:serial,fechaFabricacion:fabricacion,fechaVencimiento:vencimiento,movimientos:[],loteIngreso:lote},common);});
    db.records[type]=items.concat(db.records[type]); return {ok:true,cantidad:items.length,loteIngreso:lote};
  });
}

function move_(body,usuario) {
  return locked_(function(db) {
    const tipo=required_(body.tipo,"tipo"); if(tipo==="SELLOS"||!db.records[tipo])throw new Error("Tipo de material no válido.");
    const item=db.records[tipo].find(x=>x.id===required_(body.id,"registro")); if(!item)throw new Error("Registro no encontrado.");
    const destino=required_(body.ubicacion,"ubicación"); if(APP.locations.indexOf(destino)<0)throw new Error("Ubicación no válida."); if(item.ubicacion===destino)throw new Error("El material ya se encuentra en esa ubicación.");
    item.movimientos=item.movimientos||[]; item.movimientos.unshift({fecha:iso_(),origen:item.ubicacion,destino:destino,usuario:usuario}); item.ubicacion=destino;
    return {ok:true};
  });
}

function publicRecords_(db){return {INDUGEL:db.records.INDUGEL.slice(0,500),ANFO:db.records.ANFO.slice(0,500),"MECHA DE SEGURIDAD":db.records["MECHA DE SEGURIDAD"].slice(0,500),DETONADORES:db.records.DETONADORES.slice(0,500),SELLOS:db.records.SELLOS.slice(0,500)};}
function requireAdmin_(u){if(!u||u.rol!=="ADMINISTRADOR")throw new Error("Esta operación requiere rol administrador.");}
function usersList_(u){requireAdmin_(u);return {ok:true,users:load_().users.map(x=>({usuario:x.usuario,nombre:x.nombre,rol:x.rol,activo:x.activo,protegido:x.protegido===true,creado:x.creado}))};}
function userCreate_(b,a){requireAdmin_(a);return locked_(db=>{const usuario=required_(b.usuario,"usuario").toLowerCase();if(db.users.some(u=>u.usuario===usuario))throw new Error("Ese usuario ya existe.");const rol=String(b.rol||"OPERADOR").toUpperCase();if(["ADMINISTRADOR","OPERADOR"].indexOf(rol)<0)throw new Error("Rol no válido.");const salt=token_();db.users.push({usuario:usuario,nombre:required_(b.nombre,"nombre"),salt:salt,hash:hash_(salt+password_(b.password)),rol:rol,activo:true,protegido:false,creado:iso_()});return {ok:true};});}
function userResetPassword_(b,a){requireAdmin_(a);return locked_(db=>{const u=db.users.find(x=>x.usuario===required_(b.usuario,"usuario").toLowerCase());if(!u)throw new Error("Usuario no encontrado.");u.salt=token_();u.hash=hash_(u.salt+password_(b.password));return {ok:true};});}
function userSetActive_(b,a){requireAdmin_(a);return locked_(db=>{const usuario=required_(b.usuario,"usuario").toLowerCase();const u=db.users.find(x=>x.usuario===usuario);if(!u)throw new Error("Usuario no encontrado.");if((usuario===a.usuario||u.protegido===true)&&b.activo===false)throw new Error("La cuenta administradora principal no puede desactivarse.");u.activo=b.activo===true;return {ok:true};});}

function locked_(fn){const lock=LockService.getScriptLock();lock.waitLock(30000);try{const db=load_();const result=fn(db);save_(db);return result;}finally{lock.releaseLock();}}
function common_(r){const ubicacion=required_(r.ubicacion,"ubicación");if(APP.locations.indexOf(ubicacion)<0)throw new Error("Ubicación no válida.");return {fechaIngreso:required_(r.fechaIngreso,"fecha de ingreso"),ubicacion:ubicacion};}
function required_(v,l){const x=String(v==null?"":v).trim();if(!x)throw new Error("El campo "+l+" es obligatorio.");return x;}
function number_(v,l){const x=Number(v);if(!Number.isFinite(x))throw new Error("El campo "+l+" debe ser numérico.");return x;}
function optionalNumber_(v){return v===""||v==null?null:Number(v);}
function password_(v){const p=required_(v,"contraseña");if(p.length<8)throw new Error("La contraseña debe tener al menos 8 caracteres.");return p;}
function range_(a,b){if(b<a)throw new Error("Un serial final no puede ser menor que el inicial.");}
function rangeOptional_(a,b){if(a===null&&b===null)return;if(a===null||b===null)throw new Error("El intervalo opcional debe tener serial inicial y final.");range_(a,b);}
function unique_(list,key,value){if(list.some(x=>String(x[key])===String(value)))throw new Error("Ya existe un registro con ese serial o número de caja.");}
function token_(){return Utilities.getUuid().replace(/-/g,"");}
function hash_(text){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,text,Utilities.Charset.UTF_8).map(b=>(b+256)%256).map(b=>("0"+b.toString(16)).slice(-2)).join("");}
function iso_(){return new Date().toISOString();}
function json_(v){return ContentService.createTextOutput(JSON.stringify(v)).setMimeType(ContentService.MimeType.JSON);}
