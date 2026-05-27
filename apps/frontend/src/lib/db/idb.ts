import { browser } from "$app/environment";

// Offline-first local cache. Mirrors the server's Task / Project rows plus an
// outbox of pending mutations and a meta store for sync cursors.
//
// We use raw IndexedDB (no extra dep). Reads return arrays; writes resolve
// when the tx commits. All access funnels through `withStore` so the open
// promise is shared.
//
// Schema (v1):
//   tasks         keyPath="id"   index "userId"
//   projects      keyPath="id"   index "userId"
//   outbox        keyPath="seq"  autoIncrement, index "status"
//   meta          keyPath="key"  (single rows: lastSyncAt, userId, schemaVer)

const DB_NAME = "eos";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!browser) return Promise.reject(new Error("IDB not available on server"));
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("tasks")) {
        const s = db.createObjectStore("tasks", { keyPath: "id" });
        s.createIndex("userId", "userId");
      }
      if (!db.objectStoreNames.contains("projects")) {
        const s = db.createObjectStore("projects", { keyPath: "id" });
        s.createIndex("userId", "userId");
      }
      if (!db.objectStoreNames.contains("outbox")) {
        const s = db.createObjectStore("outbox", { keyPath: "seq", autoIncrement: true });
        s.createIndex("status", "status");
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function withStore<T>(
  storeName: "tasks" | "projects" | "outbox" | "meta",
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => T | Promise<T> | IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    let resolved: T | undefined;
    let didResolve = false;
    const out = fn(store);
    if (out && typeof (out as IDBRequest).onsuccess !== "undefined") {
      const req = out as IDBRequest<T>;
      req.onsuccess = () => {
        resolved = req.result;
        didResolve = true;
      };
      req.onerror = () => reject(req.error);
    } else if (out instanceof Promise) {
      out.then((v) => {
        resolved = v;
        didResolve = true;
      }, reject);
    } else {
      resolved = out as T;
      didResolve = true;
    }
    tx.oncomplete = () => resolve(didResolve ? (resolved as T) : (undefined as unknown as T));
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function getAll<T>(storeName: "tasks" | "projects"): Promise<T[]> {
  return withStore<T[]>(storeName, "readonly", (s) => s.getAll() as IDBRequest<T[]>);
}

export async function put<T>(storeName: "tasks" | "projects" | "meta", value: T): Promise<void> {
  await withStore(storeName, "readwrite", (s) => s.put(value as never));
}

export async function putMany<T>(storeName: "tasks" | "projects", values: T[]): Promise<void> {
  if (!values.length) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    for (const v of values) store.put(v as never);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function del(storeName: "tasks" | "projects", id: string): Promise<void> {
  await withStore(storeName, "readwrite", (s) => s.delete(id));
}

export async function clearAll(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(["tasks", "projects", "outbox", "meta"], "readwrite");
    tx.objectStore("tasks").clear();
    tx.objectStore("projects").clear();
    tx.objectStore("outbox").clear();
    tx.objectStore("meta").clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getMeta<T = string>(key: string): Promise<T | null> {
  const row = await withStore<{ key: string; value: T } | undefined>("meta", "readonly", (s) =>
    s.get(key) as IDBRequest<{ key: string; value: T } | undefined>,
  );
  return row ? row.value : null;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await put("meta", { key, value });
}
