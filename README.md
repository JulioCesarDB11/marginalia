# Marginália

Caderno de estudos organizado pelo sumário do livro. Cada capítulo/seção vira um bloco com texto, desenhos e código, e você marca o que já leu.

Custo zero: HTML, CSS e JavaScript puro, sem dependências e sem servidor. Os dados ficam no seu navegador (IndexedDB).

## Como abrir

**Online (qualquer aparelho):** https://juliocesardb11.github.io/marginalia/ — no iPad, abra no Safari e use
Compartilhar › **Adicionar à Tela de Início**.

**No PC, localmente:** Dê dois cliques em **`abrir.bat`**. Ele sobe um servidorzinho local com o Python e abre http://localhost:5173 no navegador. Para parar, feche a janela minimizada “Marginalia - servidor”.

Ou, pelo terminal (de dentro da pasta `marginalia`):

```bash
python -m http.server 5173
```

## Onde ficam os dados

- **No navegador (IndexedDB)**: livros, sumários e anotações. Ficam presos ao navegador e ao endereço
  (abra sempre por http://localhost:5173 no mesmo navegador).
- **No seu Google Drive (opcional)**: uma cópia sincronizada numa pasta oculta do app, para usar
  em vários aparelhos. Configuração em [SINCRONIZACAO.md](SINCRONIZACAO.md).
- **Backup manual**: Aparência e dados › Fazer backup / Restaurar backup (.json).

## O que já faz

- **Meus livros**: biblioteca com cada livro como uma pasta (iniciais + cor), barra de progresso e “Continuar” do ponto onde parou.
- **No sumário**: clique na bolinha para mudar o status (A ler, Lendo, Lido, Revisar) sem abrir a página; no ⋯ de cada tópico dá para adicionar subtópico, adicionar tópico abaixo, renomear ou excluir.
- **Importar sumário** colando o texto: entende numeração (1, 1.2, 1.2.3), “Capítulo N”, “Parte I”, `#`/`##`, marcadores e recuo; detecta número de página no fim da linha. Na prévia dá para ajustar o nível de cada linha.
- **Editar o sumário depois** sem perder anotações (os blocos são casados pelo título).
- **Blocos de conteúdo** por seção:
  - Texto com negrito, itálico, destaque, subtítulo, listas, citação, código inline, imagens (coladas com Ctrl+V ou inseridas).
  - Atalhos ao digitar: `- ` lista, `1. ` lista numerada, `> ` citação, `# ` subtítulo.
  - Tipos de nota: Nota, Definição, Importante, Dúvida, Resumo.
  - Desenho: caneta (com pressão de caneta stylus), marca-texto, borracha, linha, seta, retângulo, elipse, cores, espessuras, desfazer/refazer, fundo liso/pontilhado/quadriculado/pautado, altura ajustável.
  - Código Python com recuo automático (Tab, Shift+Tab, Enter após `:`).
- **Status de leitura** por bloco (A ler, Lendo, Lido, Revisar) e barra de progresso.
- **Busca** no sumário e no conteúdo das notas (Ctrl+K).
- **7 temas** (Papel, Sépia, Lavanda, Ardósia, Meia-noite, Floresta, Quadro-negro) e **9 fontes**, tamanho do texto e largura da página. A cor “tinta” dos desenhos acompanha o tema.
- **Exportar** as anotações de um livro em HTML (abre no navegador e dá para imprimir em PDF).
- **Backup/restauração** de tudo em `.json`.
- Atalhos: `Alt+↓` / `Alt+↑` próximo/anterior bloco.

> Ao alterar CSS/JS, aumente o número `?v=` em `index.html` para o navegador não usar a versão antiga em cache.

## Estrutura

```
index.html       página e diálogos
css/app.css      temas e layout
js/config.js     ID do cliente Google (sincronização)
js/util.js       ícones e funções auxiliares
js/db.js         armazenamento (IndexedDB)
js/sync.js       sincronização com o Google Drive
js/toc.js        leitor de sumário + modelo do livro
js/board.js      quadro de desenho
js/app.js        interface
```

## Ideias para as próximas versões

- Publicar de graça no GitHub Pages e instalar como app (PWA) no celular/tablet.
- Painel “Minhas dúvidas” juntando todos os blocos do tipo Dúvida.
- Realce de sintaxe Python nos blocos de código.
- Flashcards gerados a partir das definições.
