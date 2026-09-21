declare global {
  interface Window {
    CONTROL_EXPLOSIVOS_CONFIG?: { apiUrl?: string };
  }
}

const apiUrl = () => window.CONTROL_EXPLOSIVOS_CONFIG?.apiUrl?.trim() || "";

export function backendConfigured() {
  return Boolean(apiUrl());
}

type ApiResult = Record<string, any>;

async function request(action: string, data: Record<string, unknown> = {}): Promise<ApiResult> {
  const url = apiUrl();
  if (!url) throw new Error("La aplicación aún no está conectada al servidor de la empresa.");
  const token = localStorage.getItem("control_explosivos_token") || "";
  const body = new URLSearchParams({ payload: JSON.stringify({ action, token, ...data }) });
  const response = await fetch(url, { method: "POST", body });
  const result = await response.json() as ApiResult;
  if (!result.ok) throw new Error(result.error || "No se pudo completar la operación.");
  return result;
}

export async function getStatus() { return request("status"); }
export async function login(usuario: string, password: string) {
  const result = await request("login", { usuario, password });
  localStorage.setItem("control_explosivos_token", result.token);
  return result;
}
export async function createInitialAdmin(usuario: string, nombre: string, password: string) {
  const result = await request("bootstrap", { usuario, nombre, password });
  localStorage.setItem("control_explosivos_token", result.token);
  return result;
}
export function logout() { localStorage.removeItem("control_explosivos_token"); }
export async function listRecords() { return (await request("list")).records; }
export async function saveRecord(record: Record<string, unknown>) { return request("create", { record }); }
export async function saveBatchRecords(batch: Record<string, unknown>) { return request("createBatch", { batch }); }
export async function listUsers() { return (await request("usersList")).users; }
export async function createUser(usuario: string, nombre: string, password: string, rol: string) { return request("userCreate", { usuario, nombre, password, rol }); }
export async function resetUserPassword(usuario: string, password: string) { return request("userResetPassword", { usuario, password }); }
export async function setUserActive(usuario: string, activo: boolean) { return request("userSetActive", { usuario, activo }); }
export async function moveRecord(tipo: string, id: string, ubicacion: string) { return request("move", { tipo, id, ubicacion }); }
