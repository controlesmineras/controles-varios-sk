import { materialTypes, overlayPending, validateInventory, type Inventory } from './sync-state';
export type OfflineOperation = { id: string; action: string; data: Record<string, unknown>; createdAt: string };
const DB = 'control-explosivos-local', VERSION = 1, STORE = 'data';
function open() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB, VERSION);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function getLocal<T>(key: string, fallback: T): Promise<T> {
  if (typeof indexedDB === 'undefined') return fallback;
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly'), request = tx.objectStore(STORE).get(key);
    tx.oncomplete = () => { db.close(); resolve((request.result as T) ?? fallback); };
    tx.onabort = () => { db.close(); reject(tx.error || request.error || new Error('No se pudo leer el almacenamiento local.')); };
  });
}
export async function setLocal<T>(key: string, value: T) {
  const db = await open();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('No se pudo guardar en este dispositivo.')); };
  });
}
// Merge against the latest value inside the write transaction, also across tabs.
export async function updateLocal<T>(key: string, fallback: T, mutate: (current: T) => T): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite'), store = tx.objectStore(STORE), request = store.get(key);
    let result: T, failure: unknown;
    request.onsuccess = () => {
      try { result = mutate(request.result ?? fallback); store.put(result, key); }
      catch (error) { failure = error; tx.abort(); }
    };
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onabort = () => { db.close(); reject(failure || tx.error || new Error('No se pudo guardar en este dispositivo.')); };
  });
}
// Inventory and pending operations commit in one transaction, also across tabs.
function changeState<T>(mutate: (records: Inventory, operations: OfflineOperation[]) => { records: Inventory; operations: OfflineOperation[]; result: T; syncedAt?: string }): Promise<T> {
  return open().then(db => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite'), store = tx.objectStore(STORE);
    const recordsRequest = store.get('records'), operationsRequest = store.get('operations');
    let result: T, failure: unknown;
    operationsRequest.onsuccess = () => {
      try {
        const records = recordsRequest.result || {};
        for (const type of materialTypes) records[type] ||= [];
        const next = mutate(records, operationsRequest.result || []);
        store.put(next.records, 'records');
        store.put(next.operations, 'operations');
        if (next.syncedAt) store.put(next.syncedAt, 'lastSync');
        result = next.result;
      } catch (error) { failure = error; tx.abort(); }
    };
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onabort = () => { db.close(); reject(failure || tx.error || new Error('No se pudo guardar el registro. Inténtalo de nuevo.')); };
  }));
}
export const getCachedRecords = () => getLocal<Inventory>('records', {});
export const setCachedRecords = (records: Inventory) => setLocal('records', records);
export const getOperations = () => getLocal<OfflineOperation[]>('operations', []);
export function enqueue(action: string, data: Record<string, unknown>, mutate?: (records: Inventory) => void) {
  const operation = { id: crypto.randomUUID(), action, data, createdAt: new Date().toISOString() };
  return changeState((records, operations) => {
    mutate?.(records);
    operations.push(operation);
    return { records, operations, result: operation };
  });
}
export function removeOperation(id: string) {
  return changeState((records, operations) => ({ records, operations: operations.filter(op => op.id !== id), result: undefined }));
}
export function acceptSnapshot(remote: Inventory, processed: string[] = []) {
  validateInventory(remote);
  return changeState((_records, operations) => {
    const acknowledged = new Set(processed), remaining = operations.filter(op => !acknowledged.has(op.id));
    const records = overlayPending(remote, remaining), syncedAt = remaining.length ? undefined : new Date().toISOString();
    return { records, operations: remaining, syncedAt, result: { records, pending: remaining.length, syncedAt } };
  });
}

