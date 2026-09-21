const APP = Object.freeze({
  sheets: {
    INDUGEL: ["ID", "SERIAL", "FECHA DE FABRICACIÓN", "FECHA DE VENCIMIENTO", "FECHA DE INGRESO", "FECHA DEL MOVIMIENTO", "UBICACIÓN", "FECHA DE REGISTRO", "USUARIO"],
    ANFO: ["ID", "SERIAL", "FECHA DE FABRICACIÓN", "FECHA DE VENCIMIENTO", "FECHA DE INGRESO", "FECHA DEL MOVIMIENTO", "UBICACIÓN", "FECHA DE REGISTRO", "USUARIO"],
    "MECHA DE SEGURIDAD": ["ID", "CAJA No.", "CANTIDAD", "CONTENIDO", "FECHA DE FABRICACIÓN", "FECHA DE VENCIMIENTO", "FECHA DE INGRESO", "FECHA DEL MOVIMIENTO", "UBICACIÓN", "BOBINA 1 INICIAL 1", "BOBINA 1 FINAL 1", "BOBINA 1 INICIAL 2", "BOBINA 1 FINAL 2", "BOBINA 2 INICIAL 1", "BOBINA 2 FINAL 1", "BOBINA 2 INICIAL 2", "BOBINA 2 FINAL 2", "FECHA DE REGISTRO", "USUARIO"],
    DETONADORES: ["ID", "CAJA No.", "CONTENIDO", "LOTE DE PRODUCCIÓN", "FECHA DE PRODUCCIÓN", "FECHA DE VENCIMIENTO", "FECHA DE INGRESO", "FECHA DEL MOVIMIENTO", "UBICACIÓN", "FECHA DE REGISTRO", "USUARIO"],
    "CONTROL DE SELLOS": ["ID", "FECHA", "SELLO DE SEGURIDAD INDUGEL", "SELLO DE SEGURIDAD ANFO", "FECHA DE REGISTRO", "USUARIO"],
    USUARIOS: ["USUARIO", "NOMBRE", "SALT", "HASH", "ROL", "ACTIVO", "CREADO"],
    SESIONES: ["TOKEN HASH", "USUARIO", "VENCE"]
  },
  locations: ["Polvorín superficie", "Polvorín interior de mina"],
  sessionHours: 12
});

function doGet() { return json_({ ok: true, servicio: "CONTROL EXPLOSIVOS SK" }); }

function doPost(e) {
  try {
    ensureSheets_();
    const body = JSON.parse((e && e.parameter && e.parameter.payload) || "{}");
    const action = String(body.action || "");
    if (action === "status") return json_(status_(body.token));
    if (action === "bootstrap") return json_(bootstrap_(body));
    if (action === "login") return json_(login_(body));
    const user = requireSession_(body.token);
    if (action === "list") return json_({ ok: true, records: list_() });
    if (action === "create") return json_(create_(body.record || {}, user));
    throw new Error("Operación no reconocida.");
  } catch (error) { return json_({ ok: false, error: error.message || String(error) }); }
}

function status_(token) {
  const needsBootstrap = dataRows_("USUARIOS").length === 0;
  let authenticated = false;
  try { authenticated = Boolean(requireSession_(token)); } catch (_) {}
  return { ok: true, needsBootstrap: needsBootstrap, authenticated: authenticated };
}

function bootstrap_(body) {
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    if (dataRows_("USUARIOS").length) throw new Error("El administrador inicial ya fue creado.");
    const usuario = required_(body.usuario, "usuario").toLowerCase();
    const nombre = required_(body.nombre, "nombre");
    const password = password_(body.password);
    const salt = token_();
    sheet_("USUARIOS").appendRow([usuario, nombre, salt, hash_(salt + password), "ADMINISTRADOR", true, new Date()]);
    return session_(usuario);
  } finally { lock.releaseLock(); }
}

function login_(body) {
  const usuario = required_(body.usuario, "usuario").toLowerCase();
  const password = required_(body.password, "contraseña");
  const row = dataRows_("USUARIOS").find(r => String(r[0]).toLowerCase() === usuario);
  if (!row || row[5] !== true || hash_(String(row[2]) + password) !== String(row[3])) throw new Error("Usuario o contraseña incorrectos.");
  return session_(usuario);
}

function session_(usuario) {
  const token = token_() + token_();
  const expires = new Date(Date.now() + APP.sessionHours * 3600000);
  sheet_("SESIONES").appendRow([hash_(token), usuario, expires]);
  return { ok: true, token: token, usuario: usuario, vence: expires.toISOString() };
}

function requireSession_(token) {
  if (!token) throw new Error("Debes iniciar sesión.");
  const key = hash_(String(token));
  const now = Date.now();
  const row = dataRows_("SESIONES").find(r => String(r[0]) === key && new Date(r[2]).getTime() > now);
  if (!row) throw new Error("La sesión venció. Inicia sesión nuevamente.");
  return String(row[1]);
}

function list_() {
  return {
    INDUGEL: objects_("INDUGEL"), ANFO: objects_("ANFO"),
    "MECHA DE SEGURIDAD": objects_("MECHA DE SEGURIDAD"),
    DETONADORES: objects_("DETONADORES"), SELLOS: objects_("CONTROL DE SELLOS")
  };
}

function create_(r, user) {
  const type = required_(r.tipo, "tipo");
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const id = Utilities.getUuid(); const stamp = new Date(); let row; let target;
    if (type === "INDUGEL" || type === "ANFO") {
      target = type; const serial = number_(r.serial, "serial"); unique_(target, 1, serial);
      row = [id, serial, required_(r.fechaFabricacion, "fecha de fabricación"), required_(r.fechaVencimiento, "fecha de vencimiento")].concat(common_(r), [stamp, user]);
    } else if (type === "DETONADORES") {
      target = type; const caja = required_(r.cajaNumero, "caja"); unique_(target, 1, caja);
      row = [id, caja, required_(r.contenido, "contenido"), required_(r.loteProduccion, "lote"), required_(r.fechaProduccion, "fecha de producción"), required_(r.fechaVencimiento, "fecha de vencimiento")].concat(common_(r), [stamp, user]);
    } else if (type === "MECHA DE SEGURIDAD") {
      target = type; const caja = required_(r.cajaNumero, "caja"); unique_(target, 1, caja);
      const ranges = [number_(r.bobina1Inicial1,"bobina 1 inicial 1"), number_(r.bobina1Final1,"bobina 1 final 1"), optionalNumber_(r.bobina1Inicial2), optionalNumber_(r.bobina1Final2), number_(r.bobina2Inicial1,"bobina 2 inicial 1"), number_(r.bobina2Final1,"bobina 2 final 1"), optionalNumber_(r.bobina2Inicial2), optionalNumber_(r.bobina2Final2)];
      range_(ranges[0], ranges[1]); rangeOptional_(ranges[2], ranges[3]); range_(ranges[4], ranges[5]); rangeOptional_(ranges[6], ranges[7]);
      row = [id, caja, number_(r.cantidad,"cantidad"), required_(r.contenido,"contenido"), required_(r.fechaFabricacion,"fecha de fabricación"), required_(r.fechaVencimiento,"fecha de vencimiento")].concat(common_(r), ranges, [stamp, user]);
    } else if (type === "SELLOS") {
      target = "CONTROL DE SELLOS";
      row = [id, required_(r.fecha,"fecha"), number_(r.selloIndugel,"sello Indugel"), number_(r.selloAnfo,"sello Anfo"), stamp, user];
    } else throw new Error("Tipo de registro no reconocido.");
    sheet_(target).appendRow(row); return { ok: true, id: id };
  } finally { lock.releaseLock(); }
}

function common_(r) {
  const location = required_(r.ubicacion, "ubicación");
  if (APP.locations.indexOf(location) < 0) throw new Error("Ubicación no válida.");
  return [required_(r.fechaIngreso,"fecha de ingreso"), required_(r.fechaMovimiento,"fecha del movimiento"), location];
}
function objects_(name) {
  const sh = sheet_(name); const values = sh.getDataRange().getDisplayValues(); if (values.length < 2) return [];
  const keys = name === "CONTROL DE SELLOS" ? ["id","fecha","selloIndugel","selloAnfo","fechaRegistro","usuario"] : values[0].map(key_);
  return values.slice(1).reverse().slice(0, 500).map(row => Object.fromEntries(keys.map((k,i) => [k,row[i]])));
}
function key_(h) { const map={"ID":"id","SERIAL":"serial","CAJA No.":"cajaNumero","CONTENIDO":"contenido","LOTE DE PRODUCCIÓN":"loteProduccion","UBICACIÓN":"ubicacion"}; return map[h] || h.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+(.)/g,(_,c)=>c.toUpperCase()); }
function ensureSheets_() { Object.keys(APP.sheets).forEach(name => { let sh=SpreadsheetApp.getActive().getSheetByName(name); if(!sh){sh=SpreadsheetApp.getActive().insertSheet(name); sh.getRange(1,1,1,APP.sheets[name].length).setValues([APP.sheets[name]]).setFontWeight("bold"); sh.setFrozenRows(1);} }); }
function sheet_(name) { return SpreadsheetApp.getActive().getSheetByName(name); }
function dataRows_(name) { const s=sheet_(name); return s.getLastRow()<2?[]:s.getRange(2,1,s.getLastRow()-1,s.getLastColumn()).getValues(); }
function required_(v,label){const x=String(v==null?"":v).trim();if(!x)throw new Error("El campo "+label+" es obligatorio.");return x;}
function number_(v,label){const x=Number(v);if(!Number.isFinite(x))throw new Error("El campo "+label+" debe ser numérico.");return x;}
function optionalNumber_(v){return v===""||v==null?"":Number(v);}
function password_(v){const p=required_(v,"contraseña");if(p.length<8)throw new Error("La contraseña debe tener al menos 8 caracteres.");return p;}
function range_(a,b){if(b<a)throw new Error("Un serial final no puede ser menor que el inicial.");}
function rangeOptional_(a,b){if(a===""&&b==="")return;if(a===""||b==="")throw new Error("El intervalo opcional debe tener serial inicial y final.");range_(a,b);}
function unique_(name,index,value){if(dataRows_(name).some(r=>String(r[index])===String(value)))throw new Error("Ya existe un registro con ese serial o número de caja.");}
function token_(){return Utilities.getUuid().replace(/-/g,"");}
function hash_(text){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,text,Utilities.Charset.UTF_8).map(b=>(b+256)%256).map(b=>("0"+b.toString(16)).slice(-2)).join("");}
function json_(value){return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);}
