/* ============================================================
 * Speicher (IndexedDB), nur auf diesem Gerät:
 *   trip, places – Reise, Orte, Einstellungen
 *   work         – Übergangsspeicher: die gewählten Aufnahmen und Songs
 *                  angefangener Projekte, 30 Tage nach der letzten
 *                  Bearbeitung automatisch gelöscht
 * ============================================================ */

const DB_NAME = 'cinebeat';
const DB_VER = 3;
const STORES = ['trip', 'places', 'work'];

class Store {
  constructor() { this.db = null; this.mem = null; }

  async open() {
    const memory = () => { this.db = null; this.mem = { trip: new Map(), places: new Map(), work: new Map() }; };
    if (!('indexedDB' in window)) { memory(); return; }
    try {
      this.db = await new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VER);
        req.onupgradeneeded = () => {
          const db = req.result;
          for (const n of STORES) if (!db.objectStoreNames.contains(n)) db.createObjectStore(n, { keyPath: 'id' });
          // Altbestände früherer Versionen (Kopien von Fotos, Videos, Songs) restlos entfernen
          for (const n of Array.from(db.objectStoreNames)) if (!STORES.includes(n)) db.deleteObjectStore(n);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error('Datenbank blockiert'));
      });
    } catch (e) {
      memory();
    }
  }


  _tx(store, mode, fn) {
    if (!this.db) {
      const m = this.mem[store];
      return Promise.resolve(fn({
        get: (k) => m.get(k), put: (v) => { m.set(v.id, v); }, delete: (k) => { m.delete(k); }, all: () => Array.from(m.values()), clear: () => m.clear(),
      }));
    }
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(store, mode);
      const os = tx.objectStore(store);
      let result;
      const wrap = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
      Promise.resolve(fn({
        get: (k) => wrap(os.get(k)), put: (v) => wrap(os.put(v)), delete: (k) => wrap(os.delete(k)), all: () => wrap(os.getAll()), clear: () => wrap(os.clear()),
      })).then((r) => { result = r; }, reject);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Speichern abgebrochen'));
    });
  }

  get(store, id) { return this._tx(store, 'readonly', (s) => s.get(id)); }
  put(store, v) { return this._tx(store, 'readwrite', (s) => s.put(v)); }
  del(store, id) { return this._tx(store, 'readwrite', (s) => s.delete(id)); }
  all(store) { return this._tx(store, 'readonly', (s) => s.all()); }
  clear(store) { return this._tx(store, 'readwrite', (s) => s.clear()); }

  /** Löscht die komplette Datenbank dieser App. */
  async wipe() {
    if (this.db) { this.db.close(); this.db = null; }
    await new Promise((resolve) => {
      try {
        const req = indexedDB.deleteDatabase(DB_NAME);
        req.onsuccess = req.onerror = req.onblocked = () => resolve();
      } catch (e) { resolve(); }
    });
    try { localStorage.removeItem('cinebeat.export'); } catch (e) { /* egal */ }
  }

  /** Bittet den Browser, den Speicher nicht eigenmächtig zu leeren (iOS: vor allem als Home-Bildschirm-App). */
  async persist() {
    try { if (navigator.storage && navigator.storage.persist && !(await navigator.storage.persisted())) await navigator.storage.persist(); } catch (e) { /* optional */ }
  }

  async usage() {
    try {
      if (navigator.storage && navigator.storage.estimate) return await navigator.storage.estimate();
    } catch (e) { /* ignore */ }
    return null;
  }
}
