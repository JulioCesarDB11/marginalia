'use strict';

// Leitura de sumários colados como texto.
// Entende: numeração (1, 1.2, 1.2.3), "Capítulo 3", "Parte I", títulos markdown (#, ##),
// marcadores (-, •), recuo com espaços/tab e números de página no fim da linha.
const TOC = (() => {
  const PAGE_RE = /^(.*?\S)(?:\s*[.·…_]{2,}\s*|\s+)(\d{1,4})$/;
  const KEYWORD_ONLY = /^(cap[ií]tulo|chapter|parte|part|se[cç][aã]o|section|ap[eê]ndice|appendix|unidade|m[oó]dulo|li[cç][aã]o)$/i;
  const PART_RE = /^((?:parte|part)\s+(?:\d+|[IVXLC]+\b|[A-Z]\b|[a-zà-ú]+(?=\s*[.:\-–—]|\s*$)))\s*[.:\-–—]?\s*(.*)$/i;
  const CHAPTER_RE = /^((?:cap[ií]tulo|chapter|cap\.|ap[eê]ndice|appendix|unidade|m[oó]dulo|li[cç][aã]o)\s+(?:\d+|[IVXLC]+\b|[A-Z]\b))\s*[.:\-–—]?\s*(.*)$/i;
  const NUM_RE = /^(\d{1,3}(?:\.\d{1,3})*|[A-Z](?:\.\d{1,3})+)(?:\.(?!\d)|\))?\s*[-–—:]?\s+(?=\S)(.*)$/;

  function parseLine(raw, pages) {
    const exp = raw.replace(/\t/g, '    ').replace(/ /g, ' ').replace(/\s+$/, '');
    const L = { indent: exp.length - exp.trimStart().length, kind: 'item', prefix: '', page: null };
    let s = exp.trim();
    let m;
    if ((m = s.match(/^(#{1,6})\s+(.*)$/))) { L.md = m[1].length; s = m[2]; }
    if ((m = s.match(/^[-*+•·▪◦‣]\s+(.*)$/))) { s = m[1]; }
    if (pages && (m = s.match(PAGE_RE))) {
      const head = m[1].replace(/[\s.·…_:–—-]+$/, '');
      if (head && !KEYWORD_ONLY.test(head) && !/^\d+(\.\d+)*\.?$/.test(head)) { s = head; L.page = +m[2]; }
    } else if (pages && (m = s.match(/^(.*?\S)\s*[.·…_]{2,}\s*([ivxlc]+)$/i))) {
      s = m[1]; L.page = m[2].toLowerCase(); // páginas em romano (prefácio), só com pontilhado
    }
    if ((m = s.match(PART_RE))) { L.kind = 'part'; L.prefix = m[1]; s = m[2]; }
    else if ((m = s.match(CHAPTER_RE))) { L.kind = 'chapter'; L.prefix = m[1]; s = m[2]; }
    else if ((m = s.match(NUM_RE))) { L.kind = 'num'; L.prefix = m[1]; L.depth = m[1].split('.').length; s = m[2]; }
    s = s.trim();
    if (!s) { s = L.prefix; L.prefix = ''; }
    L.title = s;
    return L;
  }

  function parse(text, { pages = true } = {}) {
    const lines = String(text || '').split(/\r?\n/)
      .filter(l => l.trim())
      .map(l => parseLine(l, pages))
      .filter(L => L.title);

    const hasParts = lines.some(L => L.kind === 'part' && !L.md);
    lines.forEach(L => {
      if (L.md) L.explicit = L.md;
      else if (L.kind === 'part') L.explicit = 1;
      else if (L.kind === 'chapter') L.explicit = hasParts ? 2 : 1;
      else if (L.kind === 'num') L.explicit = L.depth + (hasParts ? 1 : 0);
    });
    const ex = lines.filter(L => L.explicit).map(L => L.explicit);
    const shift = ex.length ? Math.min(...ex) - 1 : 0;
    lines.forEach(L => { if (L.explicit) L.explicit -= shift; });

    let prev = null;
    lines.forEach((L, i) => {
      let lvl;
      if (L.explicit) lvl = L.explicit;
      else if (!prev) lvl = 1;
      else if (L.indent > prev.indent) lvl = prev.lvl + 1;
      // linha sem número logo abaixo de um capítulo numerado = seção dele
      else if (L.indent === prev.indent) lvl = prev.explicit ? prev.lvl + 1 : prev.lvl;
      else {
        let q = null;
        for (let j = i - 1; j >= 0; j--) if (lines[j].indent <= L.indent) { q = lines[j]; break; }
        lvl = !q ? 1 : q.indent === L.indent ? q.lvl : q.lvl + 1;
      }
      L.lvl = Math.max(1, Math.min(lvl, prev ? prev.lvl + 1 : 1, 6));
      prev = L;
    });

    return lines.map(L => ({ title: L.title, prefix: L.prefix, page: L.page, level: L.lvl, kind: L.kind }));
  }

  // Garante que nenhum nível "pula" (ex.: de 1 direto para 3)
  function normalize(nodes) {
    let prev = 0;
    return nodes.map(n => {
      const level = Math.max(1, Math.min(n.level, prev + 1, 6));
      prev = level;
      return { ...n, level };
    });
  }

  function serialize(nodes) {
    return nodes.map(n =>
      '  '.repeat(n.level - 1) + (n.prefix ? n.prefix + ' ' : '') + n.title + (n.page ? ' ' + n.page : '')
    ).join('\n');
  }

  const TEMPLATES = [{
    id: 'dsdz2',
    label: 'Data Science do Zero (2ª ed.)',
    title: 'Data Science do Zero: Noções Fundamentais com Python',
    author: 'Joel Grus',
    edition: '2ª edição',
    text: [
      'Prefácio à Segunda Edição',
      'Prefácio à Primeira Edição',
      '1 Introdução',
      '  A Ascensão dos Dados',
      '  O Que É Data Science?',
      '  Hipótese Motivadora: DataSciencester',
      '    Encontrando Conectores-chave',
      '    Cientistas de Dados que Você Talvez Conheça',
      '    Salários e Experiência',
      '    Contas Pagas',
      '    Tópicos de Interesse',
      '  Em Frente',
      '2 Um Curso Intensivo de Python',
      '3 Visualizando Dados',
      '4 Álgebra Linear',
      '5 Estatística',
      '6 Probabilidade',
      '7 Hipótese e Inferência',
      '8 Gradiente Descendente',
      '9 Obtendo Dados',
      '10 Trabalhando com Dados',
      '11 Aprendizado de Máquina',
      '12 k-Vizinhos Mais Próximos',
      '13 Naive Bayes',
      '14 Regressão Linear Simples',
      '15 Regressão Múltipla',
      '16 Regressão Logística',
      '17 Árvores de Decisão',
      '18 Redes Neurais',
      '19 Deep Learning',
      '20 Agrupamento',
      '21 Processamento de Linguagem Natural',
      '22 Análise de Redes',
      '23 Sistemas Recomendadores',
      '24 Bancos de Dados e SQL',
      '25 MapReduce',
      '26 Ética de Dados',
      '27 Vá em Frente e Pratique Data Science',
    ].join('\n'),
  }];

  return { parse, normalize, serialize, TEMPLATES };
})();
