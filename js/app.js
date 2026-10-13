'use strict';

(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const LS = {
    get(k, d) { try { const v = localStorage.getItem('marginalia:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('marginalia:' + k, JSON.stringify(v)); } catch {} },
  };

  const THEMES = [
    { id: 'papel', name: 'Papel' },
    { id: 'sepia', name: 'Sépia' },
    { id: 'lavanda', name: 'Lavanda' },
    { id: 'oceano', name: 'Oceano' },
    { id: 'menta', name: 'Menta' },
    { id: 'rose', name: 'Rosé' },
    { id: 'solar', name: 'Solar' },
    { id: 'contraste', name: 'Alto contraste' },
    { id: 'ardosia', name: 'Ardósia', dark: true },
    { id: 'meianoite', name: 'Meia-noite', dark: true },
    { id: 'floresta', name: 'Floresta', dark: true },
    { id: 'quadro', name: 'Quadro-negro', dark: true },
    { id: 'cafe', name: 'Café', dark: true },
    { id: 'grafite', name: 'Grafite', dark: true },
    { id: 'artico', name: 'Ártico', dark: true },
    { id: 'noiteroxa', name: 'Noite roxa', dark: true },
  ];
  const FONTS = {
    literata: { name: 'Literata', css: "'Literata', Georgia, serif" },
    merriweather: { name: 'Merriweather', css: "'Merriweather', Georgia, serif", scale: 0.94 },
    lora: { name: 'Lora', css: "'Lora', Georgia, serif" },
    atkinson: { name: 'Atkinson Hyperlegible', css: "'Atkinson Hyperlegible', system-ui, sans-serif" },
    inter: { name: 'Inter', css: "'Inter', system-ui, sans-serif", scale: 0.95 },
    patrick: { name: 'Patrick Hand', css: "'Patrick Hand', 'Comic Sans MS', cursive", scale: 1.12 },
    caveat: { name: 'Caveat', css: "'Caveat', 'Segoe Print', cursive", scale: 1.32 },
    mono: { name: 'JetBrains Mono', css: "'JetBrains Mono', Consolas, monospace", scale: 0.88 },
    system: { name: 'Fonte do sistema', css: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
  };
  const UI_FONTS = ['inter', 'atkinson', 'literata', 'system'];
  const WIDTHS = [['s', 'Estreita', '640px'], ['m', 'Média', '780px'], ['l', 'Larga', '1040px']];
  const STATUS = [
    { id: 'none', label: 'A ler' },
    { id: 'reading', label: 'Lendo' },
    { id: 'done', label: 'Lido' },
    { id: 'review', label: 'Revisar' },
  ];
  const CALLOUTS = [
    { id: '', label: 'Nota' },
    { id: 'definition', label: 'Definição' },
    { id: 'key', label: 'Importante' },
    { id: 'question', label: 'Dúvida' },
    { id: 'summary', label: 'Resumo' },
  ];

  const S = {
    books: [],
    book: null,
    notes: new Map(),
    nodeId: null,
    note: null,
    boards: [],
    search: '',
    settings: Object.assign({ theme: 'papel', notesFont: 'literata', uiFont: 'inter', size: 18, width: 'm' }, LS.get('settings', {})),
  };

  // ---------- Aparência ----------
  function applySettings() {
    const st = S.settings;
    const root = document.documentElement;
    root.dataset.theme = st.theme;
    const nf = FONTS[st.notesFont] || FONTS.literata;
    root.style.setProperty('--font-notes', nf.css);
    root.style.setProperty('--notes-size', Math.round(st.size * (nf.scale || 1)) + 'px');
    root.style.setProperty('--font-ui', (FONTS[st.uiFont] || FONTS.inter).css);
    root.style.setProperty('--page-w', (WIDTHS.find(w => w[0] === st.width) || WIDTHS[1])[2]);
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(root).getPropertyValue('--bg').trim();
    LS.set('settings', st);
    Board.refreshAll();
  }

  // ---------- Notas ----------
  const newItem = type => ({
    text: { id: uid(), type: 'text', html: '', style: '' },
    draw: { id: uid(), type: 'draw', strokes: [], h: 560, bg: Board.defaultBg() },
    code: { id: uid(), type: 'code', code: '', lang: 'python' },
  }[type]);

  function getNote(nodeId) {
    return S.notes.get(nodeId) || {
      id: S.book.id + '::' + nodeId, bookId: S.book.id, nodeId, status: 'none', items: [], updatedAt: 0,
    };
  }

  function itemHasContent(it) {
    if (it.type === 'text') return /\S/.test(stripHtml(it.html)) || /<img/i.test(it.html || '');
    if (it.type === 'draw') return (it.strokes || []).length > 0;
    if (it.type === 'code') return /\S/.test(it.code || '');
    return false;
  }
  const hasContent = n => !!n && n.items.some(itemHasContent);

  const textCache = new WeakMap();
  function noteText(n) {
    if (!textCache.has(n) || textCache.get(n).at !== n.updatedAt) {
      const t = n.items.map(it => it.type === 'text' ? stripHtml(it.html) : it.type === 'code' ? it.code : '').join(' ');
      textCache.set(n, { at: n.updatedAt, t: norm(t) });
    }
    return textCache.get(n).t;
  }

  function setSaveState(s) {
    const el = $('#saveState');
    el.dataset.state = s;
    el.textContent = { dirty: 'Editando…', saving: 'Salvando…', saved: 'Salvo', error: 'Erro ao salvar' }[s] || '';
  }

  async function saveNote() {
    const n = S.note;
    if (!n) return;
    n.updatedAt = Date.now();
    S.notes.set(n.nodeId, n);
    setSaveState('saving');
    try {
      await DB.putNote(n);
      setSaveState('saved');
      Sync.schedule();
    } catch (err) {
      console.error(err);
      setSaveState('error');
    }
    renderToc();
    renderBookMeta();
  }
  // S.saving guarda a gravação em andamento, para a sincronização poder esperar por ela
  const save = debounce(() => { S.saving = saveNote(); }, 500);

  function changed(now) {
    S.notes.set(S.note.nodeId, S.note);
    setSaveState('dirty');
    save();
    if (now) save.flush();
  }

  // ---------- Barra lateral ----------
  function renderBookHead() {
    $('#btnLibrary').hidden = !S.books.length;
    $('#bookPicker').hidden = !S.book;
    $('#bookTitle').textContent = S.book ? S.book.title : '';
  }

  function renderBookMeta() {
    const el = $('#bookMeta');
    if (!S.book) { el.innerHTML = ''; return; }
    const toc = S.book.toc;
    const done = toc.filter(n => S.notes.get(n.id)?.status === 'done').length;
    const pct = toc.length ? Math.round(done / toc.length * 100) : 0;
    const by = [S.book.author, S.book.edition].filter(Boolean).map(esc).join(' · ');
    el.innerHTML = `${by ? `<div class="meta-line">${by}</div>` : ''}
      <div class="progress" title="${pct}% lido"><span style="width:${pct}%"></span></div>
      <div class="meta-line small">${done} de ${toc.length} blocos lidos · ${pct}%</div>`;
  }

  function collapsedSet() { return new Set(S.book ? LS.get('collapsed:' + S.book.id, []) : []); }

  function toggleCollapse(id) {
    const set = collapsedSet();
    set.has(id) ? set.delete(id) : set.add(id);
    LS.set('collapsed:' + S.book.id, [...set]);
    renderToc();
  }

  function ancestorsIdx(idx) {
    const toc = S.book.toc;
    const out = [];
    let lvl = toc[idx].level;
    for (let j = idx - 1; j >= 0 && lvl > 1; j--) {
      if (toc[j].level < lvl) { out.unshift(j); lvl = toc[j].level; }
    }
    return out;
  }

  function renderToc() {
    if (S.tocEditing) return; // não destrói o campo de edição de um tópico
    const nav = $('#toc');
    const keepScroll = nav.scrollTop;
    nav.innerHTML = '';
    if (!S.book) return;
    const toc = S.book.toc;
    if (!toc.length) {
      nav.append(h('div', { class: 'toc-empty' }, 'Sumário vazio. Use ⋯ › Editar sumário.'));
      return;
    }
    const q = norm(S.search);
    let show = null;
    if (q) {
      show = new Set();
      toc.forEach((n, i) => {
        const note = S.notes.get(n.id);
        if (norm(`${n.prefix} ${n.title}`).includes(q) || (note && noteText(note).includes(q))) {
          show.add(i);
          ancestorsIdx(i).forEach(j => show.add(j));
        }
      });
      if (!show.size) {
        nav.append(h('div', { class: 'toc-empty' }, 'Nada encontrado.'));
        return;
      }
    }
    const collapsed = collapsedSet();
    const frag = document.createDocumentFragment();
    let hideBelow = Infinity;
    toc.forEach((n, i) => {
      const hasKids = (toc[i + 1]?.level || 0) > n.level;
      if (show) { if (!show.has(i)) return; }
      else {
        if (n.level > hideBelow) return;
        hideBelow = hasKids && collapsed.has(n.id) ? n.level : Infinity;
      }
      const note = S.notes.get(n.id);
      const isCollapsed = !show && collapsed.has(n.id);
      const row = h('div', {
        class: `toc-row lvl-${Math.min(n.level, 4)}${n.id === S.nodeId ? ' active' : ''}`,
        style: `--lvl:${n.level}`, 'data-id': n.id, role: 'treeitem', tabindex: '0',
        'aria-current': n.id === S.nodeId ? 'true' : null,
      },
        hasKids
          ? h('button', { type: 'button', class: 'toc-caret' + (isCollapsed ? '' : ' open'), 'aria-label': isCollapsed ? 'Expandir' : 'Recolher', html: icon('chev', 14),
            onclick: e => { e.stopPropagation(); toggleCollapse(n.id); } })
          : h('span', { class: 'toc-caret-sp' }),
        h('button', { type: 'button', class: 'toc-dot-btn', title: `${statusLabel(note)} — clique para mudar`, 'aria-label': `Status: ${statusLabel(note)}. Mudar status`,
          onclick: e => { e.stopPropagation(); statusMenu(e.currentTarget, n.id); } },
          h('span', { class: `toc-dot st-${note?.status || 'none'}` })),
        h('span', { class: 'toc-label' },
          n.prefix ? h('span', { class: 'toc-num' }, n.prefix) : null,
          h('span', { class: 'toc-title' }, n.title)),
        hasContent(note) ? h('span', { class: 'toc-has', title: 'Tem anotações', html: icon('pen', 12) }) : null,
        n.page ? h('span', { class: 'toc-page' }, n.page) : null,
        h('button', { type: 'button', class: 'toc-more', title: 'Opções do tópico', 'aria-label': `Opções de ${n.title}`, html: icon('more', 16),
          onclick: e => { e.stopPropagation(); nodeMenu(e.currentTarget, n.id); } }));
      row.addEventListener('click', () => openNode(n.id));
      row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openNode(n.id); } });
      frag.append(row);
    });
    nav.append(frag);
    nav.scrollTop = keepScroll;
  }

  function renderSidebar() {
    renderBookHead();
    renderBookMeta();
    renderToc();
  }

  // ---------- Status e tópicos direto no sumário ----------
  const statusLabel = note => STATUS.find(s => s.id === (note?.status || 'none')).label;

  function statusMenu(anchor, nodeId) {
    const cur = (nodeId === S.nodeId && S.note ? S.note : S.notes.get(nodeId))?.status || 'none';
    showMenu(anchor, STATUS.map(s => ({ dot: s.id, label: s.label, checked: s.id === cur, action: () => setNodeStatus(nodeId, s.id) })), { align: 'left' });
  }

  function setNodeStatus(nodeId, status) {
    if (nodeId === S.nodeId && S.note) {
      S.note.status = status;
      S.renderStatus?.();
      changed(true);
      return;
    }
    const n = getNote(nodeId);
    n.status = status;
    n.updatedAt = Date.now();
    S.notes.set(nodeId, n);
    DB.putNote(n).then(() => Sync.schedule()).catch(err => { console.error(err); setSaveState('error'); });
    renderToc();
    renderBookMeta();
  }

  async function saveBook(b) {
    b.updatedAt = Date.now();
    await DB.putBook(b);
    Sync.schedule();
  }

  // índice logo depois do último descendente do tópico i
  function subtreeEnd(i) {
    const toc = S.book.toc;
    let j = i + 1;
    while (j < toc.length && toc[j].level > toc[i].level) j++;
    return j;
  }

  function nodeMenu(anchor, nodeId) {
    const node = S.book.toc.find(n => n.id === nodeId);
    showMenu(anchor, [
      { icon: 'subtopic', label: 'Adicionar subtópico', action: () => addNode(nodeId, 'child'), disabled: node.level >= 6 },
      { icon: 'rowBelow', label: 'Adicionar tópico abaixo', action: () => addNode(nodeId, 'sibling') },
      { icon: 'edit', label: 'Renomear', action: () => startRename(nodeId, false) },
      '-',
      { icon: 'trash', label: 'Excluir tópico', danger: true, action: () => deleteNode(nodeId) },
    ]);
  }

  function addNode(refId, where) {
    const toc = S.book.toc;
    const i = toc.findIndex(n => n.id === refId);
    if (i < 0) return;
    const level = where === 'child' ? Math.min(toc[i].level + 1, 6) : toc[i].level;
    const node = { id: uid(), title: '', prefix: '', page: null, level, kind: 'item' };
    toc.splice(subtreeEnd(i), 0, node);
    if (where === 'child') {
      const set = collapsedSet();
      if (set.delete(refId)) LS.set('collapsed:' + S.book.id, [...set]);
    }
    if (isMobile()) $('#app').classList.add('drawer-open');
    startRename(node.id, true);
  }

  // Edita o nome do tópico ali mesmo, na linha do sumário
  function startRename(nodeId, isNew) {
    S.search = '';
    $('#search').value = '';
    S.tocEditing = false;
    renderToc();
    const row = $(`.toc-row[data-id="${nodeId}"]`);
    const node = S.book.toc.find(n => n.id === nodeId);
    if (!row || !node) return;
    S.tocEditing = true;
    const input = h('input', { class: 'toc-input', value: node.title, placeholder: isNew ? 'Nome do novo tópico' : 'Nome do tópico', 'aria-label': 'Nome do tópico', maxlength: '200' });
    row.querySelector('.toc-label').replaceWith(input);
    row.classList.add('editing');
    let done = false;
    const finish = async commit => {
      if (done) return;
      done = true;
      S.tocEditing = false;
      const v = input.value.trim();
      if (commit && v) {
        node.title = v;
        await saveBook(S.book);
        if (isNew) { openNode(nodeId, { keepDrawer: isMobile() }); return; }
        if (nodeId === S.nodeId) { const t = $('.page-title'); if (t) t.textContent = v; }
      } else if (isNew) {
        S.book.toc = S.book.toc.filter(n => n.id !== nodeId);
      }
      renderToc();
    };
    input.addEventListener('click', e => e.stopPropagation());
    input.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
    input.focus();
    input.select();
    row.scrollIntoView({ block: 'nearest' });
  }

  async function deleteNode(nodeId) {
    const toc = S.book.toc;
    const i = toc.findIndex(n => n.id === nodeId);
    if (i < 0) return;
    const end = subtreeEnd(i);
    const removed = toc.slice(i, end);
    const withNotes = removed.filter(n => hasContent(n.id === S.nodeId ? S.note : S.notes.get(n.id))).length;
    let msg = removed.length > 1
      ? `Excluir "${toc[i].title}" e ${removed.length - 1} subtópico(s)?`
      : `Excluir o tópico "${toc[i].title}"?`;
    if (withNotes) msg += `\n\n${withNotes === 1 ? '1 deles tem anotações, que também serão apagadas' : withNotes + ' deles têm anotações, que também serão apagadas'}.`;
    if (!confirm(msg)) return;
    save.flush();
    await S.saving;
    const removedIds = new Set(removed.map(n => n.id));
    const wasOpen = removedIds.has(S.nodeId);
    toc.splice(i, end - i);
    for (const n of removed) {
      const noteId = S.book.id + '::' + n.id;
      if (S.notes.has(n.id)) { await DB.deleteNote(noteId); S.notes.delete(n.id); }
      Sync.markDeleted(noteId);
    }
    if (wasOpen) S.note = null;
    await saveBook(S.book);
    renderBookMeta();
    if (wasOpen) openNode((toc[i - 1] || toc[i])?.id, { keepDrawer: true });
    else renderToc();
  }

  // ---------- Navegação ----------
  async function openBook(id) {
    save.flush();
    const b = S.books.find(x => x.id === id) || S.books[0];
    if (!b) { showLibrary(); return; }
    S.book = b;
    setView('book');
    LS.set('lastBook', b.id);
    LS.set('opened:' + b.id, Date.now());
    const notes = await DB.getNotes(b.id);
    S.notes = new Map(notes.map(n => [n.nodeId, n]));
    S.search = '';
    $('#search').value = '';
    $('#search').disabled = false;
    renderSidebar();
    const last = LS.get('last:' + b.id);
    openNode(b.toc.some(n => n.id === last) ? last : b.toc[0]?.id, { keepDrawer: true });
  }

  function openNode(id, opts = {}) {
    save.flush();
    S.nodeId = id;
    if (S.book && id) {
      LS.set('last:' + S.book.id, id);
      // garante que o bloco aberto esteja visível no sumário
      const idx = S.book.toc.findIndex(n => n.id === id);
      if (idx >= 0) {
        const set = collapsedSet();
        const anc = ancestorsIdx(idx).map(j => S.book.toc[j].id).filter(x => set.has(x));
        if (anc.length) { anc.forEach(x => set.delete(x)); LS.set('collapsed:' + S.book.id, [...set]); }
      }
    }
    renderToc();
    renderPage();
    $('#scroller').scrollTop = 0;
    $('.toc-row.active')?.scrollIntoView({ block: 'nearest' });
    if (!opts.keepDrawer) closeDrawer();
  }

  function step(dir) {
    if (!S.book || S.view !== 'book') return;
    const toc = S.book.toc;
    const i = toc.findIndex(n => n.id === S.nodeId);
    const next = toc[i + dir];
    if (next) openNode(next.id);
  }

  // ---------- Página do bloco ----------
  function destroyBoards() {
    S.boards.forEach(b => b.destroy());
    S.boards = [];
  }

  function renderPage() {
    destroyBoards();
    const page = $('#page');
    page.innerHTML = '';
    page.className = 'page';
    const crumbs = $('#crumbs');
    crumbs.innerHTML = '';
    if (!S.book) return;
    const toc = S.book.toc;
    const idx = toc.findIndex(n => n.id === S.nodeId);
    const node = toc[idx];
    if (!node) {
      S.note = null;
      page.append(h('div', { class: 'empty-state' },
        h('h2', {}, 'Este livro ainda não tem sumário'),
        h('p', {}, 'Cole o sumário para criar os blocos de estudo.'),
        h('button', { type: 'button', class: 'btn primary', onclick: () => openImport(S.book) }, 'Editar sumário')));
      return;
    }

    const note = getNote(node.id);
    if (!note.items.length) note.items.push(newItem('text'));
    S.note = note;

    // trilha
    crumbs.append(h('button', { type: 'button', class: 'crumb book', onclick: () => openNode(toc[0].id) }, S.book.title));
    ancestorsIdx(idx).forEach(j => {
      crumbs.append(h('span', { class: 'crumb-sep', html: icon('chev', 12) }),
        h('button', { type: 'button', class: 'crumb', onclick: () => openNode(toc[j].id) }, (toc[j].prefix ? toc[j].prefix + ' ' : '') + toc[j].title));
    });

    const kicker = [node.prefix && (node.kind === 'num' && node.level === 1 ? 'Capítulo ' + node.prefix : node.prefix), node.page && 'p. ' + node.page]
      .filter(Boolean).join(' · ');

    const statusBar = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Status de leitura' });
    const renderStatus = () => {
      statusBar.innerHTML = '';
      STATUS.forEach(s => statusBar.append(h('button', {
        type: 'button', class: `seg st-${s.id}${note.status === s.id ? ' on' : ''}`, role: 'radio',
        'aria-checked': String(note.status === s.id),
        onclick: () => { note.status = s.id; renderStatus(); changed(true); },
      }, h('span', { class: 'dot' }), s.label)));
    };
    renderStatus();
    S.renderStatus = renderStatus;

    const items = h('div', { class: 'items', id: 'items' });

    const addBar = h('div', { class: 'add-bar' },
      h('span', { class: 'add-label' }, 'Adicionar'),
      h('button', { type: 'button', class: 'btn add', onclick: () => addItem('text'), html: icon('text', 16) + '<span>Texto</span>' }),
      h('button', { type: 'button', class: 'btn add', onclick: () => addItem('draw'), html: icon('pen', 16) + '<span>Desenho</span>' }),
      h('button', { type: 'button', class: 'btn add', onclick: () => addItem('code'), html: icon('code', 16) + '<span>Código</span>' }));

    const prev = toc[idx - 1], next = toc[idx + 1];
    const label = n => (n.prefix ? n.prefix + ' ' : '') + n.title;
    const pager = h('nav', { class: 'pager' },
      prev ? h('button', { type: 'button', class: 'pager-btn', onclick: () => step(-1) },
        h('span', { class: 'pager-dir', html: icon('arrowLeft', 14) + ' Anterior' }), h('span', { class: 'pager-title' }, label(prev))) : h('span'),
      next ? h('button', { type: 'button', class: 'pager-btn next', onclick: () => step(1) },
        h('span', { class: 'pager-dir', html: 'Próximo ' + icon('arrowRight', 14) }), h('span', { class: 'pager-title' }, label(next))) : h('span'));

    const finish = next && note.status !== 'done'
      ? h('button', { type: 'button', class: 'btn finish', html: icon('check', 16) + '<span>Marcar como lido e seguir</span>',
        onclick: () => { note.status = 'done'; changed(true); step(1); } })
      : null;

    page.append(
      h('header', { class: 'page-head' },
        kicker ? h('div', { class: 'kicker' }, kicker) : null,
        h('h1', { class: 'page-title' }, node.title),
        h('div', { class: 'head-row' },
          statusBar,
          node.level < 6 ? h('button', { type: 'button', class: 'btn ghost sm', html: icon('subtopic', 15) + '<span>Subtópico</span>',
            title: 'Adicionar um subtópico dentro desta seção', onclick: () => addNode(node.id, 'child') }) : null)),
      items, addBar, finish, pager);

    renderItems();
  }

  function renderItems() {
    destroyBoards();
    const box = $('#items');
    box.innerHTML = '';
    S.note.items.forEach((it, i) => box.append(renderItem(it, i)));
  }

  function iconBtn(name, title, onclick, disabled) {
    return h('button', { type: 'button', class: 'icon-btn sm', title, 'aria-label': title, html: icon(name, 16), onclick, disabled });
  }

  function renderItem(it, i) {
    const n = S.note.items.length;
    const sec = h('section', { class: `item item-${it.type}`, 'data-id': it.id });
    const head = h('div', { class: 'item-tools' });

    if (it.type === 'text') {
      const applyStyle = () => {
        sec.className = `item item-text${it.style ? ' callout callout-' + it.style : ''}`;
        sec.dataset.label = CALLOUTS.find(c => c.id === (it.style || ''))?.label || '';
      };
      applyStyle();
      const ed = textEditor(it);
      head.append(
        h('select', { class: 'callout-select', title: 'Tipo de bloco', 'aria-label': 'Tipo de bloco',
          onchange: e => { it.style = e.target.value; applyStyle(); changed(); } },
          CALLOUTS.map(c => h('option', { value: c.id, selected: (it.style || '') === c.id }, c.label))),
        formatBar(ed));
      sec.append(head, ed);
    } else if (it.type === 'draw') {
      head.append(h('span', { class: 'item-kind', html: icon('pen', 14) + ' Desenho' }));
      const b = Board.create(it, () => changed());
      S.boards.push(b);
      sec.append(head, b.el);
    } else if (it.type === 'code') {
      const ta = codeEditor(it);
      head.append(h('span', { class: 'item-kind', html: icon('code', 14) + ' Python' }),
        iconBtn('copy', 'Copiar código', async e => {
          try { await navigator.clipboard.writeText(ta.value); flash(e.currentTarget); } catch {}
        }));
      sec.append(head, ta);
    }

    head.append(h('span', { class: 'spacer' }),
      iconBtn('up', 'Mover para cima', () => moveItem(i, -1), i === 0),
      iconBtn('down', 'Mover para baixo', () => moveItem(i, 1), i === n - 1),
      iconBtn('trash', 'Excluir bloco', () => deleteItem(i)));
    return sec;
  }

  function flash(el) {
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 700);
  }

  function moveItem(i, d) {
    const arr = S.note.items;
    const j = i + d;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    renderItems();
    changed();
  }

  function deleteItem(i) {
    const it = S.note.items[i];
    if (itemHasContent(it) && !confirm('Excluir este bloco e o conteúdo dele?')) return;
    S.note.items.splice(i, 1);
    if (!S.note.items.length) S.note.items.push(newItem('text'));
    renderItems();
    changed();
  }

  function addItem(type) {
    const it = newItem(type);
    S.note.items.push(it);
    renderItems();
    changed();
    const el = $(`.item[data-id="${it.id}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.querySelector('.rte, textarea')?.focus();
  }

  // ---------- Editor de texto ----------
  function textEditor(it) {
    // começa sempre com um parágrafo, para o texto não ficar "solto" no editor
    const ed = h('div', { class: 'rte', contenteditable: 'true', spellcheck: 'true', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Anotações', 'data-placeholder': 'Escreva suas anotações…', html: it.html || '<p><br></p>' });
    const syncEmpty = () => ed.classList.toggle('is-empty', !ed.textContent.trim() && !ed.querySelector('img'));
    syncEmpty();
    ed.addEventListener('input', () => { it.html = ed.innerHTML; syncEmpty(); changed(); });
    ed.addEventListener('paste', async e => {
      const cd = e.clipboardData;
      if (!cd) return;
      e.preventDefault();
      const file = [...cd.items].find(x => x.kind === 'file' && x.type.startsWith('image/'))?.getAsFile();
      if (file) {
        try { document.execCommand('insertHTML', false, `<img src="${await imageFileToDataURL(file)}" alt="">`); } catch {}
        return;
      }
      document.execCommand('insertText', false, cd.getData('text/plain'));
    });
    ed.addEventListener('keydown', e => {
      // atalhos: "- " vira lista, "1. " vira lista numerada, "> " vira citação
      if (e.key !== ' ') return;
      const sel = getSelection();
      if (!sel.rangeCount || !sel.isCollapsed) return;
      const node = sel.anchorNode;
      if (node.nodeType !== 3) return;
      const before = node.textContent.slice(0, sel.anchorOffset);
      const block = node.parentElement.closest('p, div, h3, li, blockquote');
      if (!block || block.closest('li') || (block !== ed && block.textContent.trim() !== before.trim())) return;
      const cmd = { '-': ['insertUnorderedList'], '*': ['insertUnorderedList'], '1.': ['insertOrderedList'], '>': ['formatBlock', '<blockquote>'], '#': ['formatBlock', '<h3>'] }[before];
      if (!cmd) return;
      e.preventDefault();
      const r = document.createRange();
      r.setStart(node, 0);
      r.setEnd(node, sel.anchorOffset);
      sel.removeAllRanges();
      sel.addRange(r);
      document.execCommand('delete');
      document.execCommand(cmd[0], false, cmd[1]);
      fixLists(ed);
      ed.dispatchEvent(new Event('input'));
    });
    return ed;
  }

  // O Chrome às vezes cria <p><ul>…</ul></p>; tira a lista de dentro do parágrafo sem perder o cursor
  function fixLists(ed) {
    const bad = ed.querySelectorAll('p > ul, p > ol');
    if (!bad.length) return;
    const sel = getSelection();
    const pos = sel.rangeCount ? [sel.anchorNode, sel.anchorOffset] : null;
    bad.forEach(list => {
      const p = list.parentElement;
      p.replaceWith(...[...p.childNodes].filter(n => n.nodeType === 1 || n.textContent.trim()));
    });
    if (pos && ed.contains(pos[0])) sel.collapse(pos[0], pos[1]);
  }

  function formatBar(ed) {
    const exec = (cmd, val) => {
      ensureFocus(ed);
      document.execCommand(cmd, false, val);
      fixLists(ed);
      ed.dispatchEvent(new Event('input'));
    };
    const toggleBlock = tag => {
      ensureFocus(ed);
      const cur = String(document.queryCommandValue('formatBlock') || '').toLowerCase();
      exec('formatBlock', cur === tag ? '<p>' : `<${tag}>`);
    };
    const toggleWrap = tag => {
      ensureFocus(ed);
      const sel = getSelection();
      if (!sel.rangeCount) return;
      const r = sel.getRangeAt(0);
      let el = r.commonAncestorContainer;
      if (el.nodeType === 3) el = el.parentElement;
      const found = el.closest(tag);
      if (found && ed.contains(found)) {
        const parent = found.parentNode;
        while (found.firstChild) parent.insertBefore(found.firstChild, found);
        found.remove();
        ed.dispatchEvent(new Event('input'));
        return;
      }
      if (r.collapsed) return;
      const tmp = document.createElement('div');
      tmp.append(r.cloneContents());
      exec('insertHTML', `<${tag}>${tmp.innerHTML}</${tag}>`);
    };
    const insertImage = () => {
      ensureFocus(ed);
      const sel = getSelection();
      const range = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
      const input = h('input', { type: 'file', accept: 'image/*' });
      input.onchange = async () => {
        const f = input.files[0];
        if (!f) return;
        const url = await imageFileToDataURL(f);
        ed.focus();
        if (range) { sel.removeAllRanges(); sel.addRange(range); }
        exec('insertHTML', `<img src="${url}" alt="">`);
      };
      input.click();
    };
    const B = [
      ['<b>B</b>', 'Negrito (Ctrl+B)', () => exec('bold')],
      ['<i>I</i>', 'Itálico (Ctrl+I)', () => exec('italic')],
      ['<u>U</u>', 'Sublinhado (Ctrl+U)', () => exec('underline')],
      [icon('highlighter', 16), 'Destacar', () => toggleWrap('mark')],
      ['<b>H</b>', 'Subtítulo', () => toggleBlock('h3')],
      [icon('list', 16), 'Lista', () => exec('insertUnorderedList')],
      [icon('listOl', 16), 'Lista numerada', () => exec('insertOrderedList')],
      [icon('quote', 16), 'Citação do livro', () => toggleBlock('blockquote')],
      [icon('code', 16), 'Código no texto', () => toggleWrap('code')],
      [icon('image', 16), 'Inserir imagem (ou cole com Ctrl+V)', insertImage],
      ['<span class="tx">T<sub>x</sub></span>', 'Limpar formatação', () => { exec('removeFormat'); exec('formatBlock', '<p>'); }],
    ];
    return h('div', { class: 'fmt-bar' }, B.map(([html, title, fn]) =>
      h('button', { type: 'button', class: 'fmt', title, 'aria-label': title, html, onmousedown: e => e.preventDefault(), onclick: fn })));
  }

  function ensureFocus(ed) {
    const sel = getSelection();
    if (!sel.rangeCount || !ed.contains(sel.anchorNode)) {
      ed.focus();
      const r = document.createRange();
      r.selectNodeContents(ed);
      r.collapse(false);
      sel.removeAllRanges();
      sel.addRange(r);
    }
  }

  // ---------- Editor de código ----------
  function codeEditor(it) {
    const ta = h('textarea', { class: 'code', spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', placeholder: '# código Python…', rows: '3' });
    ta.value = it.code || '';
    const grow = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 2 + 'px'; };
    requestAnimationFrame(grow);
    ta.addEventListener('input', () => { it.code = ta.value; grow(); changed(); });
    ta.addEventListener('keydown', e => {
      const { selectionStart: s, selectionEnd: en, value: v } = ta;
      if (e.key === 'Tab') {
        e.preventDefault();
        const lineStart = v.lastIndexOf('\n', s - 1) + 1;
        if (e.shiftKey) {
          const m = v.slice(lineStart).match(/^ {1,4}/);
          if (m) { ta.setRangeText('', lineStart, lineStart + m[0].length, 'end'); ta.setSelectionRange(Math.max(lineStart, s - m[0].length), Math.max(lineStart, en - m[0].length)); }
        } else {
          ta.setRangeText('    ', s, en, 'end');
        }
        ta.dispatchEvent(new Event('input'));
      } else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
        // mantém o recuo da linha e adiciona 4 espaços depois de ":"
        const lineStart = v.lastIndexOf('\n', s - 1) + 1;
        const line = v.slice(lineStart, s);
        let ind = line.match(/^\s*/)[0];
        if (/:\s*$/.test(line)) ind += '    ';
        e.preventDefault();
        ta.setRangeText('\n' + ind, s, en, 'end');
        ta.dispatchEvent(new Event('input'));
      }
    });
    return ta;
  }

  // ---------- Biblioteca ----------
  function setView(v) {
    S.view = v;
    if (v === 'library' || v === 'book') LS.set('view', v);
    $('#app').classList.toggle('library-mode', v !== 'book');
    $('#app').classList.toggle('start-mode', v === 'start');
  }

  const STOPWORDS = new Set(['a', 'o', 'as', 'os', 'à', 'às', 'ao', 'aos', 'de', 'do', 'da', 'dos', 'das', 'e', 'em', 'no', 'na', 'nos', 'nas', 'um', 'uma', 'com', 'para', 'por', 'the', 'of', 'and', 'for', 'to', 'in', 'an']);
  function initials(title) {
    const words = String(title).split(/[\s:;,.—–\-()]+/).filter(w => w && !STOPWORDS.has(w.toLowerCase()));
    return (words.slice(0, 2).map(w => w[0]).join('') || '?').toUpperCase();
  }
  const COVER_COLORS = ['#2f5bd3', '#b4235a', '#2e8b57', '#c2410c', '#6d4fd8', '#0f766e', '#9a5b1e', '#475569'];
  function coverColor(book) {
    let hsh = 0;
    for (const c of book.id + book.title) hsh = (hsh * 31 + c.charCodeAt(0)) >>> 0;
    return COVER_COLORS[hsh % COVER_COLORS.length];
  }

  async function showLibrary() {
    save.flush();
    destroyBoards();
    S.note = null;
    setView('library');
    closeDrawer();
    renderSidebar();
    const crumbs = $('#crumbs');
    crumbs.innerHTML = '';
    crumbs.append(h('span', { class: 'crumb book' }, 'Meus livros'));

    // progresso de cada livro
    const all = await DB.getAllNotes();
    const stats = new Map(S.books.map(b => [b.id, { done: 0, reading: 0, ids: new Set(b.toc.map(n => n.id)) }]));
    for (const n of all) {
      const st = stats.get(n.bookId);
      if (!st || !st.ids.has(n.nodeId)) continue;
      if (n.status === 'done') st.done++;
      else if (n.status === 'reading') st.reading++;
    }
    const books = [...S.books].sort((a, b) => (LS.get('opened:' + b.id, 0) - LS.get('opened:' + a.id, 0)) || (b.createdAt - a.createdAt));

    const page = $('#page');
    page.className = 'page library-page';
    page.innerHTML = '';
    const grid = h('div', { class: 'lib-grid' });
    for (const b of books) {
      const st = stats.get(b.id);
      const total = b.toc.length;
      const pct = total ? Math.round(st.done / total * 100) : 0;
      const lastNode = b.toc.find(n => n.id === LS.get('last:' + b.id));
      const card = h('article', { class: 'lib-card', style: `--cover:${coverColor(b)}` },
        h('button', { type: 'button', class: 'folder', 'aria-label': `Abrir ${b.title}`, onclick: () => openBook(b.id) },
          h('span', { class: 'folder-tab' }),
          h('span', { class: 'folder-sheet' }),
          h('span', { class: 'folder-front' },
            h('span', { class: 'folder-initials' }, initials(b.title)),
            pct === 100 ? h('span', { class: 'folder-badge', html: icon('check', 14) + ' Concluído' }) : null)),
        h('div', { class: 'lib-info' },
          h('div', { class: 'lib-title-row' },
            h('h3', { class: 'lib-title', title: b.title }, h('button', { type: 'button', onclick: () => openBook(b.id) }, b.title)),
            h('button', { type: 'button', class: 'icon-btn sm', title: 'Opções do livro', 'aria-label': `Opções de ${b.title}`, html: icon('more', 16),
              onclick: e => bookMenu(e.currentTarget, b) })),
          [b.author, b.edition].some(Boolean) ? h('div', { class: 'lib-meta' }, [b.author, b.edition].filter(Boolean).join(' · ')) : null,
          h('div', { class: 'progress', title: `${pct}% lido` }, h('span', { style: `width:${pct}%` })),
          h('div', { class: 'lib-meta small' }, `${pct}% · ${st.done} de ${total} lidos${st.reading ? ` · ${st.reading} em leitura` : ''}`),
          lastNode ? h('button', { type: 'button', class: 'lib-continue', onclick: () => openBook(b.id) },
            h('span', {}, 'Continuar: '), (lastNode.prefix ? lastNode.prefix + ' ' : '') + lastNode.title) : null));
      grid.append(card);
    }
    grid.append(h('article', { class: 'lib-card new' },
      h('button', { type: 'button', class: 'folder', onclick: () => openImport(), 'aria-label': 'Adicionar novo livro' },
        h('span', { class: 'folder-tab' }),
        h('span', { class: 'folder-front', html: icon('plus', 34) })),
      h('div', { class: 'lib-info' }, h('h3', { class: 'lib-title' }, h('button', { type: 'button', onclick: () => openImport() }, 'Novo livro')),
        h('div', { class: 'lib-meta' }, 'Importe o sumário de um livro'))));
    // modelo pronto, enquanto o livro dele ainda não existe
    const tpl = TOC.TEMPLATES[0];
    if (!S.books.some(b => norm(b.title) === norm(tpl.title))) {
      grid.append(h('article', { class: 'lib-card new tpl' },
        h('button', { type: 'button', class: 'folder', onclick: () => openImport(null, tpl), 'aria-label': `Começar com ${tpl.label}` },
          h('span', { class: 'folder-tab' }),
          h('span', { class: 'folder-front' }, h('span', { class: 'folder-initials' }, initials(tpl.title)))),
        h('div', { class: 'lib-info' }, h('h3', { class: 'lib-title' }, h('button', { type: 'button', onclick: () => openImport(null, tpl) }, tpl.label)),
          h('div', { class: 'lib-meta' }, 'Modelo de sumário pronto'))));
    }

    page.append(
      h('header', { class: 'lib-head' },
        h('div', { class: 'lib-head-text' },
          h('h1', {}, 'Meus livros'),
          h('span', { class: 'lib-count' }, !books.length ? 'Comece adicionando o livro que você está lendo' : books.length === 1 ? '1 livro' : `${books.length} livros`)),
        accountChip()),
      grid);
    $('#scroller').scrollTop = 0;
  }

  // ---------- Conta ----------
  function avatar(u, size = 28) {
    const style = `width:${size}px;height:${size}px`;
    if (u?.photo) return h('img', { class: 'avatar', src: u.photo, alt: '', referrerpolicy: 'no-referrer', style });
    const ini = u?.name ? initials(u.name) : '';
    return h('span', { class: 'avatar', style, html: ini ? esc(ini) : icon('user', Math.round(size * 0.55)) });
  }

  function accountChip() {
    const u = Sync.connected ? Sync.user : null;
    const label = u ? (u.name || u.email || 'Conta Google') : 'Sem login';
    return h('button', { type: 'button', class: 'account-chip', title: u?.email || 'Usando só neste aparelho', onclick: e => accountMenu(e.currentTarget) },
      avatar(u), h('span', { class: 'account-name' }, label), h('span', { html: icon('chevDown', 14) }));
  }

  function accountMenu(anchor) {
    const entries = Sync.connected
      ? [
        { icon: 'refresh', label: 'Sincronizar agora', action: () => Sync.connectAndSync() },
        { icon: 'sliders', label: 'Aparência e dados', action: () => openSettings() },
        { icon: 'home', label: 'Tela inicial', action: showStart },
        '-',
        { icon: 'logout', label: 'Sair da conta', danger: true, action: logout },
      ]
      : [
        { icon: 'cloud', label: 'Entrar com Google', action: () => Sync.connectAndSync().then(ok => { if (ok) enterApp(); }), disabled: !Sync.configured },
        { icon: 'sliders', label: 'Aparência e dados', action: () => openSettings() },
        { icon: 'home', label: 'Tela inicial', action: showStart },
      ];
    showMenu(anchor, entries);
  }

  function logout() {
    if (!confirm('Sair da conta do Google neste aparelho?\n\nSuas anotações continuam salvas aqui e no seu Drive.')) return;
    Sync.disconnect();
    try { sessionStorage.removeItem('marginalia:entered'); } catch {}
    showStart();
  }

  // Sai da tela inicial e vai para "Meus livros"
  async function enterApp() {
    try { sessionStorage.setItem('marginalia:entered', '1'); } catch {}
    S.books = (await DB.getBooks()).sort((a, b) => a.createdAt - b.createdAt);
    if (S.book && !S.books.some(b => b.id === S.book.id)) S.book = null;
    await showLibrary();
  }

  // ---------- Tela inicial ----------
  const GOOGLE_G = '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';

  function showStart() {
    save.flush();
    destroyBoards();
    S.note = null;
    setView('start');
    closeDrawer();
    closeMenu();

    const page = $('#page');
    page.className = 'page start-page';
    page.innerHTML = '';

    const FEATURES = [
      ['book', 'Importe o sumário', 'Cole o sumário do livro e cada capítulo e seção vira um bloco de estudo.'],
      ['pen', 'Anote, desenhe e programe', 'Texto, desenhos à mão (com a caneta do iPad) e trechos de código em cada seção.'],
      ['check', 'Acompanhe o progresso', 'Marque A ler, Lendo, Lido ou Revisar e veja quanto falta em cada livro.'],
      ['cloud', 'Continue em outro aparelho', 'Entre com o Google e suas anotações sincronizam entre PC e iPad.'],
    ];

    const errorBox = h('p', { class: 'start-error', role: 'alert', hidden: true });
    const showError = msg => { errorBox.textContent = msg; errorBox.hidden = !msg; };

    const doLogin = async (btn, opts) => {
      showError('');
      const original = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = icon('refresh', 18) + '<span>Entrando…</span>';
      btn.classList.add('busy');
      const ok = await Sync.connectAndSync(opts); // abre a janela do Google na hora do clique
      btn.disabled = false;
      btn.innerHTML = original;
      btn.classList.remove('busy');
      if (ok) enterApp();
      else showError(Sync.state.error || 'Não foi possível entrar. Tente de novo.');
    };

    const u = Sync.connected ? Sync.user : null;
    const login = h('section', { class: 'start-card start-login' }, h('h2', {}, 'Entrar'));
    if (!Sync.configured) {
      login.append(h('p', { class: 'start-note' }, 'O login com Google não está configurado nesta cópia do app.'));
    } else if (u) {
      const btn = h('button', { type: 'button', class: 'btn primary lg block', onclick: () => doLogin(btn, {}) },
        avatar(u, 26), h('span', {}, `Continuar como ${u.name ? u.name.split(' ')[0] : u.email}`));
      login.append(
        h('div', { class: 'start-account' }, avatar(u, 40), h('div', {}, h('b', {}, u.name || 'Conta Google'), h('span', {}, u.email))),
        btn,
        h('button', { type: 'button', class: 'link-btn', onclick: e => doLogin(e.currentTarget, { switchAccount: true }) }, 'Usar outra conta'));
    } else {
      const btn = h('button', { type: 'button', class: 'btn google lg block', html: GOOGLE_G + '<span>Entrar com Google</span>', onclick: () => doLogin(btn, {}) });
      login.append(btn);
    }
    if (Sync.configured) login.append(h('p', { class: 'start-note' }, 'Suas anotações ficam numa pasta privada deste app no seu Google Drive. O app não vê seus outros arquivos.'));
    login.append(
      errorBox,
      h('div', { class: 'start-or' }, h('span', {}, 'ou')),
      h('button', { type: 'button', class: 'btn lg block', onclick: enterApp }, 'Usar sem login neste aparelho'),
      h('p', { class: 'start-note small' }, 'Sem login, tudo fica salvo só neste navegador.'));

    const prefs = h('section', { class: 'start-card start-prefs' },
      h('div', { class: 'start-card-head' },
        h('h2', {}, 'Aparência'),
        h('button', { type: 'button', class: 'link-btn', onclick: () => openSettings() }, 'Fontes e mais opções')),
      themePicker());

    page.append(h('div', { class: 'start-wrap' },
      h('div', { class: 'start-hero' },
        h('div', { class: 'start-brand' }, h('span', { class: 'brand-mark lg' }, 'M'), h('span', {}, 'Marginália')),
        h('h1', {}, 'Seu caderno de estudos, organizado pelo sumário do livro'),
        h('p', { class: 'lead' }, 'Leia com o livro aberto e anote em cada seção: o app guarda suas notas, desenhos e códigos no lugar certo do sumário.'),
        h('ul', { class: 'start-features' }, FEATURES.map(([ic, t, d]) =>
          h('li', {}, h('span', { class: 'sf-icon', html: icon(ic, 18) }), h('div', {}, h('b', {}, t), h('span', {}, d)))))),
      h('div', { class: 'start-side' }, login, prefs)));
    $('#scroller').scrollTop = 0;
  }

  // ---------- Importar / editar sumário ----------
  let imp = { book: null, nodes: [] };

  function openImport(book = null, tpl = null) {
    imp.book = book;
    const dlg = $('#dlgImport');
    $('#impHeading').textContent = book ? 'Editar livro e sumário' : 'Novo livro';
    $('#impSave').textContent = book ? 'Salvar alterações' : 'Criar livro';
    $('#impTitle').value = book?.title || tpl?.title || '';
    $('#impAuthor').value = book?.author || tpl?.author || '';
    $('#impEdition').value = book?.edition || tpl?.edition || '';
    $('#impText').value = book ? TOC.serialize(book.toc) : tpl?.text || '';
    $('#impTplNote').hidden = !tpl;
    const tplBtn = $('#impTemplate');
    tplBtn.hidden = !!book;
    tplBtn.textContent = 'Usar modelo: ' + TOC.TEMPLATES[0].label;
    reparse();
    dlg.showModal();
    (book || tpl ? $('#impText') : $('#impTitle')).focus();
  }

  function reparse() {
    imp.nodes = TOC.parse($('#impText').value, { pages: $('#impPages').checked });
    renderPreview();
  }

  function renderPreview() {
    const box = $('#impPreview');
    box.innerHTML = '';
    const nodes = imp.nodes;
    $('#impCount').textContent = nodes.length ? `${nodes.length} blocos` : '';
    if (!nodes.length) {
      box.append(h('div', { class: 'preview-empty' }, 'A pré-visualização aparece aqui conforme você cola o sumário.'));
      return;
    }
    nodes.forEach((n, i) => {
      const setLevel = d => { n.level = Math.max(1, Math.min(6, n.level + d)); renderPreview(); };
      box.append(h('div', { class: 'pv-row', style: `--lvl:${n.level}` },
        h('span', { class: 'pv-text' },
          n.prefix ? h('span', { class: 'toc-num' }, n.prefix) : null,
          h('span', {}, n.title),
          n.page ? h('span', { class: 'toc-page' }, 'p. ' + n.page) : null),
        h('span', { class: 'pv-ctl' },
          h('button', { type: 'button', class: 'icon-btn xs', title: 'Subir nível', html: icon('chevLeft', 14), onclick: () => setLevel(-1), disabled: n.level <= 1 }),
          h('button', { type: 'button', class: 'icon-btn xs', title: 'Descer nível', html: icon('chev', 14), onclick: () => setLevel(1), disabled: i === 0 || n.level > nodes[i - 1].level }))));
    });
  }

  async function saveImport(e) {
    e.preventDefault();
    const title = $('#impTitle').value.trim();
    if (!title) { $('#impTitle').focus(); $('#impTitle').classList.add('invalid'); return; }
    const nodes = TOC.normalize(imp.nodes);
    const now = Date.now();
    let book = imp.book;
    if (book) {
      // reaproveita os ids antigos pelo título, para não perder as anotações
      const pool = new Map();
      book.toc.forEach(n => { const k = norm(n.title); if (!pool.has(k)) pool.set(k, []); pool.get(k).push(n.id); });
      const toc = nodes.map(n => ({ ...n, id: pool.get(norm(n.title))?.shift() || uid() }));
      const kept = new Set(toc.map(n => n.id));
      const notesMap = book.id === S.book?.id ? S.notes : new Map((await DB.getNotes(book.id)).map(n => [n.nodeId, n]));
      const lost = book.toc.filter(n => !kept.has(n.id) && hasContent(notesMap.get(n.id)));
      if (lost.length && !confirm(`${lost.length} bloco(s) com anotações não existem no novo sumário:\n\n${lost.slice(0, 8).map(n => '• ' + n.title).join('\n')}\n\nAs anotações continuam guardadas e voltam se você restaurar o título. Continuar?`)) return;
      Object.assign(book, { title, author: $('#impAuthor').value.trim(), edition: $('#impEdition').value.trim(), toc, updatedAt: now });
    } else {
      book = {
        id: uid(), title, author: $('#impAuthor').value.trim(), edition: $('#impEdition').value.trim(),
        toc: nodes.map(n => ({ ...n, id: uid() })), createdAt: now, updatedAt: now,
      };
      S.books.push(book);
    }
    await DB.putBook(book);
    Sync.schedule();
    $('#dlgImport').close();
    await openBook(book.id);
  }

  // ---------- Menus ----------
  function showMenu(anchor, entries, opts = {}) {
    closeMenu();
    const menu = h('div', { class: 'menu' + (opts.align === 'left' ? ' compact' : ''), role: 'menu', id: 'popMenu' }, entries.map(en => en === '-' ? h('hr') :
      h('button', {
        type: 'button', role: en.checked != null ? 'menuitemradio' : 'menuitem', 'aria-checked': en.checked != null ? String(en.checked) : null,
        class: 'menu-item' + (en.danger ? ' danger' : '') + (en.checked ? ' checked' : ''), disabled: en.disabled,
        html: (en.dot ? `<span class="menu-dot"><span class="toc-dot st-${en.dot}"></span></span>` : icon(en.icon, 16)) + `<span>${esc(en.label)}</span>` + (en.checked ? icon('check', 15) : ''),
        onclick: () => { closeMenu(); en.action(); },
      })));
    document.body.append(menu);
    const r = anchor.getBoundingClientRect();
    const mw = menu.offsetWidth;
    menu.style.top = Math.min(r.bottom + 6, innerHeight - menu.offsetHeight - 8) + 'px';
    const left = opts.align === 'left' ? r.left - 6 : r.right - mw;
    menu.style.left = Math.max(8, Math.min(left, innerWidth - mw - 8)) + 'px';
    setTimeout(() => document.addEventListener('pointerdown', outside), 0);
    function outside(e) { if (!menu.contains(e.target)) closeMenu(); }
    menu._outside = outside;
    menu.querySelector('button')?.focus();
  }
  function closeMenu() {
    const m = $('#popMenu');
    if (!m) return;
    document.removeEventListener('pointerdown', m._outside);
    m.remove();
  }

  function bookMenu(anchor, book = S.book) {
    if (!book) return;
    const inLibrary = S.view === 'library';
    showMenu(anchor, [
      inLibrary ? { icon: 'book', label: 'Abrir', action: () => openBook(book.id) } : null,
      { icon: 'edit', label: 'Editar livro e sumário', action: () => openImport(book) },
      inLibrary ? null : { icon: 'download', label: 'Exportar anotações (HTML)', action: exportBookHTML },
      '-',
      { icon: 'trash', label: 'Excluir livro', danger: true, action: () => deleteBook(book) },
    ].filter(Boolean));
  }

  async function deleteBook(b) {
    if (!confirm(`Excluir "${b.title}" e todas as anotações dele?\n\nIsso não pode ser desfeito (a menos que você tenha um backup).`)) return;
    save.flush();
    await S.saving;
    if (S.book?.id === b.id) { S.note = null; S.book = null; }
    await DB.deleteBook(b.id);
    Sync.markDeleted(b.id);
    Sync.schedule();
    S.books = S.books.filter(x => x.id !== b.id);
    showLibrary();
  }

  // ---------- Exportar / backup ----------
  function exportBookHTML() {
    save.flush();
    const b = S.book;
    const colors = { ink: '#1f1d1a', paper: '#ffffff', line: '#e6e2d8' };
    const parts = [];
    b.toc.forEach(n => {
      const note = S.notes.get(n.id);
      const content = note ? note.items.filter(itemHasContent) : [];
      const lvl = Math.min(n.level + 1, 6);
      const st = note && note.status !== 'none' ? `<span class="st st-${note.status}">${STATUS.find(s => s.id === note.status).label}</span>` : '';
      parts.push(`<h${lvl} class="${content.length ? '' : 'empty'}">${n.prefix ? `<span class="num">${esc(n.prefix)}</span> ` : ''}${esc(n.title)}${n.page ? ` <span class="pg">p. ${n.page}</span>` : ''} ${st}</h${lvl}>`);
      content.forEach(it => {
        if (it.type === 'text') {
          const lab = it.style ? `<div class="lab">${esc(CALLOUTS.find(c => c.id === it.style)?.label || '')}</div>` : '';
          parts.push(`<div class="text${it.style ? ' callout ' + it.style : ''}">${lab}${it.html}</div>`);
        } else if (it.type === 'draw') {
          parts.push(`<img class="drawing" alt="Desenho" src="${Board.toDataURL(it, colors, 1200)}">`);
        } else if (it.type === 'code') {
          parts.push(`<pre><code>${esc(it.code)}</code></pre>`);
        }
      });
    });
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(b.title)} — anotações</title>
<style>
body{font:17px/1.65 Georgia,'Times New Roman',serif;color:#1f1d1a;background:#fff;max-width:780px;margin:40px auto;padding:0 20px}
h1{font-size:2rem;line-height:1.2;margin:0 0 4px}.by{color:#6f6a61;margin:0 0 32px}
h2,h3,h4,h5,h6{font-family:system-ui,sans-serif;margin:2em 0 .4em;line-height:1.3}h2{border-top:1px solid #e6e2d8;padding-top:1.2em}
.empty{color:#9a958c;font-weight:500;font-size:.95rem;margin:.8em 0 .2em}
.num{color:#9a958c;margin-right:.3em}.pg{color:#9a958c;font-size:.75em;font-weight:400}
.st{font-size:.65em;font-weight:600;padding:2px 8px;border-radius:99px;background:#eee;vertical-align:middle;margin-left:6px}
.st-done{background:#d9f2e3;color:#1d6b3e}.st-reading{background:#fdf0c4;color:#7a5a00}.st-review{background:#fde2d4;color:#9a3412}
.text{margin:.6em 0}.callout{border-left:3px solid #999;background:#f6f5f2;padding:8px 14px;border-radius:4px}
.callout.definition{border-color:#2f5bd3}.callout.key{border-color:#e0a100}.callout.question{border-color:#c2410c}.callout.summary{border-color:#2e9d5b}
.lab{font:600 .72rem system-ui,sans-serif;text-transform:uppercase;letter-spacing:.06em;color:#6f6a61}
mark{background:#fff3a3}blockquote{border-left:3px solid #ccc;margin:.6em 0;padding-left:14px;color:#555;font-style:italic}
pre{background:#f4f2ec;padding:12px 14px;border-radius:6px;overflow:auto;font:14px/1.5 Consolas,monospace}
code{font-family:Consolas,monospace;font-size:.9em;background:#f4f2ec;padding:1px 4px;border-radius:3px}pre code{background:none;padding:0}
img{max-width:100%}.drawing{border:1px solid #e6e2d8;border-radius:6px;margin:.6em 0;display:block}
@media print{body{margin:0}h2{break-after:avoid}.drawing,pre{break-inside:avoid}}
</style></head><body>
<h1>${esc(b.title)}</h1><p class="by">${esc([b.author, b.edition].filter(Boolean).join(' · '))} — exportado em ${new Date().toLocaleDateString('pt-BR')}</p>
${parts.join('\n')}
</body></html>`;
    download(`${slug(b.title)}-anotacoes.html`, html, 'text/html');
  }

  async function backup() {
    save.flush();
    const [books, notes] = await Promise.all([DB.getBooks(), DB.getAllNotes()]);
    const data = { app: 'marginalia', version: 1, exportedAt: new Date().toISOString(), books, notes };
    download(`marginalia-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data), 'application/json');
    LS.set('lastBackup', Date.now());
    renderSettings();
  }

  function restore() {
    const input = h('input', { type: 'file', accept: '.json,application/json' });
    input.onchange = async () => {
      const f = input.files[0];
      if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        if (data.app !== 'marginalia' || !Array.isArray(data.books)) throw new Error('Arquivo não é um backup do Marginália.');
        if (!confirm(`Restaurar ${data.books.length} livro(s) e ${data.notes?.length || 0} anotação(ões)?\n\nLivros com o mesmo id serão substituídos pela versão do backup.`)) return;
        await DB.importAll(data);
        Sync.schedule();
        S.books = (await DB.getBooks()).sort((a, b) => a.createdAt - b.createdAt);
        $('#dlgSettings').close();
        openBook(S.book && S.books.some(b => b.id === S.book.id) ? S.book.id : S.books[0]?.id);
      } catch (err) {
        alert('Não foi possível restaurar: ' + err.message);
      }
    };
    input.click();
  }

  // ---------- Configurações ----------
  function themePicker() {
    const wrap = h('div', { class: 'theme-groups' });
    const pick = id => {
      S.settings.theme = id;
      applySettings();
      wrap.querySelectorAll('.theme-card').forEach(b => {
        b.classList.toggle('on', b.dataset.id === id);
        b.setAttribute('aria-pressed', String(b.dataset.id === id));
      });
    };
    for (const [label, list] of [['Claros', THEMES.filter(t => !t.dark)], ['Escuros', THEMES.filter(t => t.dark)]]) {
      wrap.append(h('div', { class: 'theme-group-label' }, label), h('div', { class: 'theme-grid' }, list.map(t =>
        h('button', { type: 'button', class: 'theme-card' + (S.settings.theme === t.id ? ' on' : ''), 'data-id': t.id, 'aria-pressed': String(S.settings.theme === t.id), onclick: () => pick(t.id) },
          h('span', { class: 'tc-preview', 'data-theme': t.id },
            h('span', { class: 'tc-side' }, h('i'), h('i'), h('i')),
            h('span', { class: 'tc-page' }, h('b'), h('i'), h('i'), h('em'))),
          h('span', { class: 'tc-name' }, t.name)))));
    }
    return wrap;
  }

  function renderSettings() {
    const st = S.settings;
    const body = $('#settingsBody');
    body.innerHTML = '';
    const set = (k, v) => { st[k] = v; applySettings(); renderSettings(); };

    body.append(
      h('h3', { class: 'set-title' }, 'Tema'),
      themePicker(),

      h('h3', { class: 'set-title' }, 'Fonte das anotações'),
      h('div', { class: 'font-list' }, Object.entries(FONTS).map(([id, f]) =>
        h('button', { type: 'button', class: 'font-opt' + (st.notesFont === id ? ' on' : ''), style: `font-family:${f.css}`, onclick: () => set('notesFont', id) },
          h('span', { class: 'fo-sample' }, 'Aa'), h('span', { class: 'fo-name' }, f.name)))),

      h('div', { class: 'set-row' },
        h('label', { for: 'setSize' }, 'Tamanho do texto'),
        h('input', { type: 'range', id: 'setSize', min: '14', max: '26', step: '1', value: String(st.size),
          oninput: e => { st.size = +e.target.value; applySettings(); e.target.nextElementSibling.textContent = st.size + 'px'; } }),
        h('output', {}, st.size + 'px')),

      h('div', { class: 'set-row' },
        h('span', { class: 'set-label' }, 'Largura da página'),
        h('div', { class: 'segmented small' }, WIDTHS.map(([id, label]) =>
          h('button', { type: 'button', class: 'seg' + (st.width === id ? ' on' : ''), onclick: () => set('width', id) }, label)))),

      h('div', { class: 'set-row' },
        h('label', { for: 'setUiFont' }, 'Fonte da interface'),
        h('select', { id: 'setUiFont', onchange: e => set('uiFont', e.target.value) },
          UI_FONTS.map(id => h('option', { value: id, selected: st.uiFont === id }, FONTS[id].name)))),

      renderSyncSection(),

      h('h3', { class: 'set-title' }, 'Backup manual'),
      h('p', { class: 'set-note' }, 'Uma cópia de tudo num arquivo .json — útil antes de limpar os dados do navegador.'),
      (() => {
        const lb = LS.get('lastBackup');
        return h('p', { class: 'set-note small' }, lb ? 'Último backup: ' + new Date(lb).toLocaleString('pt-BR') : 'Você ainda não fez nenhum backup.');
      })(),
      h('div', { class: 'set-actions' },
        h('button', { type: 'button', class: 'btn', html: icon('download', 16) + '<span>Fazer backup (.json)</span>', onclick: backup }),
        h('button', { type: 'button', class: 'btn', html: icon('upload', 16) + '<span>Restaurar backup</span>', onclick: restore })));
  }

  function openSettings(focusSync) {
    renderSettings();
    $('#dlgSettings').showModal();
    if (focusSync) $('#syncSection')?.scrollIntoView({ block: 'start' });
  }

  // ---------- Sincronização ----------
  const timeStr = t => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const dateTimeStr = t => new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  function syncInfo(st) {
    return {
      unconfigured: ['cloudOff', 'Sincronização com o Google Drive não configurada', ''],
      off: ['cloudOff', 'Conectar ao Google Drive', ''],
      'needs-auth': ['cloud', 'Toque para entrar no Google e sincronizar', 'Sincronizar'],
      syncing: ['refresh', 'Sincronizando…', ''],
      idle: ['cloudCheck', st.last ? 'Sincronizado às ' + timeStr(st.last) : 'Sincronizado', ''],
      error: ['cloudOff', 'Erro na sincronização: ' + st.error, 'Erro'],
    }[st.status] || ['cloud', '', ''];
  }

  function renderSyncButton(st) {
    const b = $('#btnSync');
    const [ic, title, label] = syncInfo(st);
    b.hidden = st.status === 'unconfigured';
    b.dataset.state = st.status;
    b.title = st.error && st.status !== 'error' ? `${title} (${st.error})` : title;
    b.setAttribute('aria-label', title);
    b.innerHTML = icon(ic, 18) + (label ? `<span>${label}</span>` : '');
  }

  function onSyncClick() {
    const st = Sync.state;
    if (st.status === 'unconfigured') openSettings(true);
    else if (st.status !== 'syncing') Sync.connectAndSync();
  }

  function renderSyncSection() {
    const st = Sync.state;
    const box = h('section', { id: 'syncSection' }, h('h3', { class: 'set-title' }, 'Sincronização (Google Drive)'));
    if (!Sync.configured) {
      box.append(h('p', { class: 'set-note' }, 'Para continuar suas anotações em outro aparelho (tablet, celular), configure o login do Google uma única vez. O passo a passo está no arquivo SINCRONIZACAO.md, na pasta do app.'));
      return box;
    }
    box.append(h('p', { class: 'set-note' }, 'Suas anotações vão para uma pasta oculta deste app no seu Google Drive. O app não enxerga nenhum outro arquivo seu.'));
    if (!Sync.connected) {
      box.append(h('div', { class: 'set-actions' },
        h('button', { type: 'button', class: 'btn primary', html: icon('cloud', 16) + '<span>Conectar Google Drive</span>', onclick: () => Sync.connectAndSync() })));
    } else {
      const [, title] = syncInfo(st);
      box.append(
        h('p', { class: 'set-note small' }, st.status === 'idle' ? `Último envio/recebimento: ${dateTimeStr(st.last)}` : title),
        h('div', { class: 'set-actions' },
          h('button', { type: 'button', class: 'btn', html: icon('refresh', 16) + '<span>Sincronizar agora</span>', onclick: () => Sync.connectAndSync(), disabled: st.status === 'syncing' }),
          h('button', { type: 'button', class: 'btn ghost', html: '<span>Desconectar</span>', onclick: () => { if (confirm('Parar de sincronizar neste aparelho? As anotações continuam aqui e no Drive.')) Sync.disconnect(); } })));
    }
    if (st.error) box.append(h('p', { class: 'set-note error' }, st.error));
    return box;
  }

  // Aplica na tela o que chegou de outro aparelho
  async function applyRemote(ch) {
    if (!ch.books.length && !ch.notes.length && !ch.deleted.length) return;
    S.books = (await DB.getBooks()).sort((a, b) => a.createdAt - b.createdAt);
    if (S.view === 'start') return; // a tela inicial leva para a biblioteca depois do login
    if (S.view === 'library' || !S.books.length) { showLibrary(); return; }
    const cur = S.book && S.books.find(b => b.id === S.book.id);
    if (!cur) { showLibrary(); return; }
    const tocChanged = ch.books.includes(cur.id);
    const noteChanged = !!S.note && ch.notes.includes(S.note.id);
    S.book = cur;
    const notes = await DB.getNotes(cur.id);
    S.notes = new Map(notes.map(n => [n.nodeId, n]));
    // mantém o objeto da nota aberta (o editor está ligado a ele) se ela não mudou lá fora
    if (S.note && !noteChanged && S.notes.has(S.note.nodeId)) S.notes.set(S.note.nodeId, S.note);
    renderSidebar();
    if (tocChanged || noteChanged) {
      if (!cur.toc.some(n => n.id === S.nodeId)) { openNode(cur.toc[0]?.id, { keepDrawer: true }); return; }
      const sc = $('#scroller'), top = sc.scrollTop;
      renderPage();
      sc.scrollTop = top;
    }
  }

  // ---------- Layout ----------
  const isMobile = () => matchMedia('(max-width: 900px)').matches;
  function toggleSidebar() {
    const app = $('#app');
    if (isMobile()) app.classList.toggle('drawer-open');
    else { app.classList.toggle('sidebar-hidden'); LS.set('sidebarHidden', app.classList.contains('sidebar-hidden')); }
  }
  function closeDrawer() { $('#app').classList.remove('drawer-open'); }

  // ---------- Início ----------
  async function init() {
    applySettings();
    document.execCommand('defaultParagraphSeparator', false, 'p');
    try { navigator.storage?.persist?.(); } catch {}
    if (LS.get('sidebarHidden')) $('#app').classList.add('sidebar-hidden');

    $('#btnToggleSidebar').innerHTML = icon('panel', 20);
    $('#btnCloseSidebar').innerHTML = icon('x', 18);
    $('#btnBookMenu').innerHTML = icon('more', 18);
    $('#btnSettingsTop').innerHTML = icon('sliders', 18);
    $('#searchIcon').innerHTML = icon('search', 15);

    $('#btnToggleSidebar').onclick = toggleSidebar;
    $('#btnCloseSidebar').onclick = closeDrawer;
    $('#backdrop').onclick = closeDrawer;
    $('#btnBookMenu').onclick = e => bookMenu(e.currentTarget);
    $('#btnNewBook').onclick = () => openImport();
    $('#btnSettings').onclick = openSettings;
    $('#btnSettingsTop').onclick = openSettings;
    $('#btnLibrary').innerHTML = icon('library', 17) + '<span>Meus livros</span>';
    $('#btnLibrary').onclick = showLibrary;
    const doSearch = debounce(() => renderToc(), 120);
    $('#search').oninput = e => { S.search = e.target.value; doSearch(); };

    $('#impText').addEventListener('input', debounce(reparse, 150));
    $('#impPages').onchange = reparse;
    $('#impTemplate').onclick = () => {
      const t = TOC.TEMPLATES[0];
      if (!$('#impTitle').value) $('#impTitle').value = t.title;
      if (!$('#impAuthor').value) $('#impAuthor').value = t.author;
      if (!$('#impEdition').value) $('#impEdition').value = t.edition;
      $('#impText').value = t.text;
      $('#impTplNote').hidden = false;
      reparse();
    };
    $('#impTitle').oninput = e => e.target.classList.remove('invalid');
    $('#impForm').onsubmit = saveImport;
    $('#impCancel').onclick = () => $('#dlgImport').close();
    $('#setClose').onclick = () => $('#dlgSettings').close();
    document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));

    document.addEventListener('keydown', e => {
      if (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); step(e.key === 'ArrowDown' ? 1 : -1); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (isMobile()) $('#app').classList.add('drawer-open'); $('#search').focus(); }
      else if (e.key === 'Escape') { closeMenu(); closeDrawer(); }
    });
    $('#btnSync').onclick = onSyncClick;
    Sync.onChange(st => {
      renderSyncButton(st);
      $('.account-chip')?.replaceWith(accountChip());
      if ($('#dlgSettings').open) { const sc = $('#dlgSettings .dlg-body').scrollTop; renderSettings(); $('#dlgSettings .dlg-body').scrollTop = sc; }
    });
    // ao sair da aba envia; ao voltar, busca o que mudou em outro aparelho
    addEventListener('visibilitychange', () => {
      if (document.hidden) save.flush();
      if (Sync.connected && Sync.hasToken()) Sync.syncNow();
    });
    addEventListener('pagehide', () => save.flush());

    try {
      S.books = (await DB.getBooks()).sort((a, b) => a.createdAt - b.createdAt);
    } catch (err) {
      console.error(err);
      $('#page').innerHTML = '<div class="empty-state"><h2>Não consegui abrir o armazenamento do navegador</h2><p>Tente abrir em uma janela normal (não anônima) do Chrome, Edge ou Firefox.</p></div>';
      return;
    }
    // tela inicial a cada vez que o app é aberto, a não ser que já tenha entrado nesta aba
    let entered = false;
    try { entered = !!sessionStorage.getItem('marginalia:entered'); } catch {}
    if (!entered && !(Sync.connected && Sync.hasToken())) showStart();
    else if (!S.books.length || LS.get('view') === 'library') await showLibrary();
    else await openBook(LS.get('lastBook'));
    Sync.init({
      beforeSync: async () => { save.flush(); await S.saving; },
      afterSync: applyRemote,
    });
  }

  init();
})();
