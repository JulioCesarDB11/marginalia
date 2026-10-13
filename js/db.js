'use strict';

// Armazenamento local no navegador (IndexedDB). Nada sai do seu computador.
const DB = (() => {
  let dbp = null;

  function open() {
    if (!dbp) {
      dbp = new Promise((resolve, reject) => {
        const r = indexedDB.open('marginalia', 1);
        r.onupgradeneeded = () => {
          const db = r.result;
          db.createObjectStore('books', { keyPath: 'id' });
          db.createObjectStore('notes', { keyPath: 'id' }).createIndex('bookId', 'bookId');
        };
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    }
    return dbp;
  }

  async function run(stores, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(stores, mode);
      let out;
      t.oncomplete = () => resolve(out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
      fn(t, v => { out = v; });
    });
  }

  const getAll = (store, index, key) => run(store, 'readonly', (t, set) => {
    const s = t.objectStore(store);
    (index ? s.index(index).getAll(key) : s.getAll()).onsuccess = e => set(e.target.result);
  });

  return {
    getBooks: () => getAll('books'),
    putBook: book => run('books', 'readwrite', t => t.objectStore('books').put(book)),
    getNotes: bookId => getAll('notes', 'bookId', bookId),
    getAllNotes: () => getAll('notes'),
    putNote: note => run('notes', 'readwrite', t => t.objectStore('notes').put(note)),
    deleteNote: id => run('notes', 'readwrite', t => t.objectStore('notes').delete(id)),
    deleteBook: id => run(['books', 'notes'], 'readwrite', t => {
      t.objectStore('books').delete(id);
      const notes = t.objectStore('notes');
      notes.index('bookId').getAllKeys(id).onsuccess = e => e.target.result.forEach(k => notes.delete(k));
    }),
    importAll: ({ books = [], notes = [] }) => run(['books', 'notes'], 'readwrite', t => {
      books.forEach(b => t.objectStore('books').put(b));
      notes.forEach(n => t.objectStore('notes').put(n));
    }),
  };
})();
