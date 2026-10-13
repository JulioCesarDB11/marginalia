'use strict';

// Sincronização com o Google Drive do próprio usuário.
// Os dados vão para a "pasta do app" (appDataFolder): fica oculta no Drive e o app
// não enxerga nenhum outro arquivo seu. Cada aparelho continua guardando tudo localmente;
// ao sincronizar, a versão mais recente de cada livro e de cada bloco vence (campo updatedAt).
const Sync = (() => {
  const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  const FILE = 'marginalia-sync.json';
  const API = 'https://www.googleapis.com/drive/v3';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
  const K = {
    connected: 'marginalia:sync:connected',
    last: 'marginalia:sync:last',
    tombs: 'marginalia:sync:tombstones',
    token: 'marginalia:sync:token',
  };

  const clientId = () => ((typeof CONFIG !== 'undefined' && CONFIG.googleClientId) || '').trim();
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  class NeedsAuth extends Error {}

  // O token do Google vale ~1 hora e fica só nesta aba (sessionStorage)
  let token = null, tokenExp = 0;
  try {
    const t = JSON.parse(sessionStorage.getItem(K.token));
    if (t && t.exp > Date.now()) { token = t.token; tokenExp = t.exp; }
  } catch {}
  const hasToken = () => !!token && tokenExp - 60000 > Date.now();
  function setToken(t, expiresInSec) {
    token = t;
    tokenExp = Date.now() + (expiresInSec || 3600) * 1000;
    try { sessionStorage.setItem(K.token, JSON.stringify({ token, exp: tokenExp })); } catch {}
  }
  function clearToken() {
    token = null; tokenExp = 0;
    try { sessionStorage.removeItem(K.token); } catch {}
  }

  const state = { status: 'unconfigured', error: '', last: lsGet(K.last, 0) };
  const listeners = new Set();
  function setStatus(status, error = '') {
    state.status = status;
    state.error = error;
    listeners.forEach(fn => fn({ ...state }));
  }

  let hooks = { beforeSync: async () => {}, afterSync: async () => {} };

  // ---------- Login (Google Identity Services) ----------
  let gisP = null;
  function loadGis() {
    if (window.google?.accounts?.oauth2) return Promise.resolve();
    if (!gisP) {
      gisP = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://accounts.google.com/gsi/client';
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => { gisP = null; reject(new Error('Não consegui carregar o login do Google. Verifique a internet.')); };
        document.head.append(s);
      });
    }
    return gisP;
  }

  // Precisa ser chamado direto de um clique, senão o navegador bloqueia a janela de login
  function login() {
    if (!clientId()) return Promise.reject(new Error('Sincronização não configurada (falta o ID do cliente em js/config.js).'));
    if (!window.google?.accounts?.oauth2) {
      loadGis().catch(() => {});
      return Promise.reject(new Error('O login do Google ainda está carregando. Tente de novo em alguns segundos.'));
    }
    return new Promise((resolve, reject) => {
      const tc = google.accounts.oauth2.initTokenClient({
        client_id: clientId(),
        scope: SCOPE,
        callback: r => {
          if (r.error) return reject(new Error(r.error_description || r.error));
          if (!google.accounts.oauth2.hasGrantedAllScopes(r, SCOPE)) return reject(new Error('É preciso permitir o acesso à pasta do app no Drive.'));
          setToken(r.access_token, r.expires_in);
          lsSet(K.connected, true);
          resolve();
        },
        error_callback: e => reject(new Error(e?.type === 'popup_closed' ? 'Login cancelado.' : e?.type === 'popup_failed_to_open' ? 'O navegador bloqueou a janela de login. Permita pop-ups para este site.' : (e?.message || 'Falha no login.'))),
      });
      tc.requestAccessToken({ prompt: lsGet(K.connected, false) ? '' : 'consent' });
    });
  }

  // ---------- Google Drive ----------
  async function api(url, opts = {}) {
    const res = await fetch(url, { ...opts, headers: { Authorization: 'Bearer ' + token, ...(opts.headers || {}) } });
    if (res.status === 401) { clearToken(); throw new NeedsAuth('Login expirado.'); }
    if (!res.ok) {
      let msg = 'erro ' + res.status;
      try { msg = (await res.json()).error.message || msg; } catch {}
      throw new Error('Google Drive: ' + msg);
    }
    return res;
  }

  async function findFile() {
    const q = encodeURIComponent(`name='${FILE}' and trashed=false`);
    const r = await api(`${API}/files?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)&orderBy=modifiedTime%20desc`);
    return (await r.json()).files?.[0]?.id || null;
  }

  const download = async id => (await api(`${API}/files/${id}?alt=media`)).json();

  function upload(id, data) {
    const body = JSON.stringify(data);
    if (id) {
      return api(`${UPLOAD}/files/${id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
    }
    const b = 'marginalia' + Math.random().toString(36).slice(2);
    const meta = JSON.stringify({ name: FILE, parents: ['appDataFolder'], mimeType: 'application/json' });
    return api(`${UPLOAD}/files?uploadType=multipart`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${b}` },
      body: `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${b}--`,
    });
  }

  // ---------- Mesclagem ----------
  // Livro ou tópico excluído em qualquer aparelho = excluído em todos (registro em "tombstones",
  // pelo id do livro ou pelo id da nota).
  function merge(local, remote) {
    const rt = remote.tombstones || {};
    const tombs = { ...rt };
    for (const [id, t] of Object.entries(local.tombstones || {})) tombs[id] = Math.max(tombs[id] || 0, t);
    let remoteChanged = Object.entries(tombs).some(([id, t]) => rt[id] !== t);

    const merged = { books: [], notes: [], tombstones: tombs };
    const toLocal = { books: [], notes: [] };
    const deleteBooks = new Set();
    const deleteNotes = new Set();

    const side = (L, R, key, isDead, deleteLocal) => {
      const lm = new Map(L.map(x => [x.id, x]));
      const rm = new Map(R.map(x => [x.id, x]));
      for (const id of new Set([...lm.keys(), ...rm.keys()])) {
        const l = lm.get(id), r = rm.get(id);
        if (isDead(l || r)) {
          if (l) deleteLocal(l);
          if (r) remoteChanged = true;
          continue;
        }
        if (l && r && (l.updatedAt || 0) === (r.updatedAt || 0)) { merged[key].push(l); continue; }
        const win = !l ? r : !r ? l : (r.updatedAt || 0) > (l.updatedAt || 0) ? r : l;
        merged[key].push(win);
        if (win !== l) toLocal[key].push(win);
        if (win !== r) remoteChanged = true;
      }
    };
    side(local.books || [], remote.books || [], 'books', b => !!tombs[b.id], b => deleteBooks.add(b.id));
    side(local.notes || [], remote.notes || [], 'notes', n => !!(tombs[n.bookId] || tombs[n.id]),
      n => (tombs[n.bookId] ? deleteBooks.add(n.bookId) : deleteNotes.add(n.id)));
    return { merged, toLocal, deleteBooks: [...deleteBooks], deleteNotes: [...deleteNotes], remoteChanged };
  }

  // ---------- Sincronizar ----------
  let running = null;
  let again = false; // alguém pediu outra sincronização enquanto esta rodava
  function syncNow() {
    if (!lsGet(K.connected, false) || !clientId()) return Promise.resolve();
    if (!hasToken()) { setStatus('needs-auth'); return Promise.resolve(); }
    if (running) { again = true; return running; }
    running = (async () => {
      setStatus('syncing');
      try {
        await hooks.beforeSync();
        const id = await findFile();
        const remote = id ? await download(id) : null;
        const [books, notes] = await Promise.all([DB.getBooks(), DB.getAllNotes()]);
        const r = merge({ books, notes, tombstones: lsGet(K.tombs, {}) }, remote || {});
        if (r.toLocal.books.length || r.toLocal.notes.length) await DB.importAll(r.toLocal);
        for (const bid of r.deleteBooks) await DB.deleteBook(bid);
        for (const nid of r.deleteNotes) await DB.deleteNote(nid);
        lsSet(K.tombs, r.merged.tombstones);
        if (!remote || r.remoteChanged) {
          await upload(id, { app: 'marginalia', version: 1, savedAt: new Date().toISOString(), ...r.merged });
        }
        state.last = Date.now();
        lsSet(K.last, state.last);
        setStatus('idle');
        await hooks.afterSync({
          books: r.toLocal.books.map(b => b.id),
          notes: r.toLocal.notes.map(n => n.id),
          deleted: [...r.deleteBooks, ...r.deleteNotes],
        });
      } catch (err) {
        if (err instanceof NeedsAuth) setStatus('needs-auth');
        else { console.error(err); setStatus('error', err.message || String(err)); }
      } finally {
        running = null;
      }
      if (again) { again = false; return syncNow(); }
    })();
    return running;
  }

  // Chamado direto de um clique: pede login se precisar e sincroniza
  function connectAndSync() {
    if (hasToken()) return syncNow();
    let p;
    try { p = login(); } catch (err) { p = Promise.reject(err); }
    return p.then(syncNow, err => setStatus(lsGet(K.connected, false) ? 'needs-auth' : 'off', err.message));
  }

  // Depois de cada alteração: espera um pouco e sincroniza (se já houver login nesta sessão)
  let timer = null;
  function schedule() {
    if (!lsGet(K.connected, false) || !clientId()) return;
    clearTimeout(timer);
    timer = setTimeout(() => { timer = null; syncNow(); }, 8000);
  }

  function disconnect() {
    try { if (token && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(token, () => {}); } catch {}
    clearToken();
    lsSet(K.connected, false);
    setStatus('off');
  }

  // id de um livro (apaga o livro todo) ou de uma nota (apaga só aquele tópico)
  function markDeleted(id) {
    const t = lsGet(K.tombs, {});
    t[id] = Date.now();
    lsSet(K.tombs, t);
  }

  function init(h) {
    hooks = { ...hooks, ...h };
    if (!clientId()) { setStatus('unconfigured'); return; }
    loadGis().catch(() => {});
    if (!lsGet(K.connected, false)) setStatus('off');
    else if (hasToken()) syncNow();
    else setStatus('needs-auth');
  }

  return {
    init, syncNow, connectAndSync, schedule, disconnect, markDeleted,
    onChange: fn => { listeners.add(fn); fn({ ...state }); },
    get state() { return { ...state }; },
    get configured() { return !!clientId(); },
    get connected() { return !!lsGet(K.connected, false); },
    hasToken,
    _test: { merge, setToken },
  };
})();
