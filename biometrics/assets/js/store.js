/* Persistencia local en el navegador (IndexedDB). Los datos nunca salen del equipo. */
(function () {
  const DB_NAME = 'control-asistencia';
  const VERSION = 1;
  let dbp = null;
  const mem = { punches: new Map(), files: new Map() }; // respaldo si IndexedDB no está disponible

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('punches')) db.createObjectStore('punches', { keyPath: 'id' }).createIndex('file', 'file');
          if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    });
    return dbp;
  }

  function tx(db, stores, mode, fn) {
    return new Promise((resolve, reject) => {
      const t = db.transaction(stores, mode);
      const out = fn(t);
      t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  const Store = {
    async all(store) {
      const db = await open();
      if (!db) return Array.from(mem[store].values());
      return tx(db, [store], 'readonly', (t) => t.objectStore(store).getAll());
    },
    /* Inserta marcaciones; devuelve cuántas eran nuevas */
    async addPunches(punches, fileMeta) {
      const db = await open();
      const existing = new Set((await Store.all('punches')).map((p) => p.id));
      const fresh = punches.filter((p) => !existing.has(p.id));
      // dedup dentro del mismo lote
      const seen = new Set();
      const unique = fresh.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
      fileMeta.added = unique.length;
      fileMeta.duplicates = punches.length - unique.length;
      if (!db) {
        unique.forEach((p) => mem.punches.set(p.id, p));
        mem.files.set(fileMeta.id, fileMeta);
        return unique.length;
      }
      await tx(db, ['punches', 'files'], 'readwrite', (t) => {
        const ps = t.objectStore('punches');
        unique.forEach((p) => ps.put(p));
        t.objectStore('files').put(fileMeta);
      });
      return unique.length;
    },
    async removeFile(fileId) {
      const db = await open();
      if (!db) {
        for (const [k, p] of mem.punches) if (p.file === fileId) mem.punches.delete(k);
        mem.files.delete(fileId);
        return;
      }
      await tx(db, ['punches', 'files'], 'readwrite', (t) => {
        const idx = t.objectStore('punches').index('file');
        const req = idx.openKeyCursor(IDBKeyRange.only(fileId));
        req.onsuccess = () => { const c = req.result; if (c) { t.objectStore('punches').delete(c.primaryKey); c.continue(); } };
        t.objectStore('files').delete(fileId);
      });
    },
    async clear() {
      const db = await open();
      mem.punches.clear(); mem.files.clear();
      if (!db) return;
      await tx(db, ['punches', 'files'], 'readwrite', (t) => { t.objectStore('punches').clear(); t.objectStore('files').clear(); });
    },
  };

  window.Store = Store;
})();
