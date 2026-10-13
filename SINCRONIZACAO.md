# Sincronização com o Google Drive — configuração (uma vez só)

O Marginália salva uma cópia das suas anotações numa **pasta oculta do app** no seu Google Drive
(a "appDataFolder"). O app só enxerga essa pasta, nunca seus outros arquivos. Ocupa o espaço
normal do seu Drive (15 GB grátis) e não tem custo.

Para o Google deixar o app fazer login, você cria um **ID do cliente** gratuito. Leva uns 10 minutos.
Não precisa de cartão de crédito.

> Os nomes dos menus podem aparecer em português ou inglês, dependendo do idioma da sua conta.
> Coloquei os dois.

## 1. Criar o projeto

1. Abra https://console.cloud.google.com e entre com a sua conta Google.
2. No seletor de projetos (barra de cima) → **Novo projeto** (*New project*).
3. Nome: `Marginalia` → **Criar**. Confira que o projeto novo ficou selecionado.

## 2. Ativar a API do Google Drive

1. Menu ☰ → **APIs e serviços** → **Biblioteca** (*APIs & Services → Library*).
2. Busque **Google Drive API** → **Ativar** (*Enable*).

## 3. Tela de consentimento (Google Auth Platform)

1. Menu ☰ → **APIs e serviços** → **Tela de permissão OAuth** (*OAuth consent screen*).
   Ela abre a **Google Auth Platform**. Clique em **Começar** (*Get started*).
2. **Informações do app**: nome `Marginalia`, e-mail de suporte = o seu.
3. **Público** (*Audience*): **Externo** (*External*).
4. **Dados de contato**: o seu e-mail. Aceite os termos → **Criar**.
5. Na seção **Público** (*Audience*) → **Usuários de teste** (*Test users*) → **Adicionar usuários** →
   coloque o **seu e-mail do Gmail** → Salvar.
   (O app fica em modo "Teste": só os e-mails da lista conseguem entrar. Para uso pessoal é o ideal.)
6. Na seção **Acesso a dados** (*Data access*) → **Adicionar ou remover escopos** →
   procure `drive.appdata` (ou cole `https://www.googleapis.com/auth/drive.appdata` no campo de escopo manual) →
   marque → **Atualizar** → **Salvar**.

## 4. Criar o ID do cliente

1. Seção **Clientes** (*Clients*) → **Criar cliente** (*Create client*).
2. Tipo de aplicativo: **Aplicativo da Web** (*Web application*). Nome: `Marginalia web`.
3. Em **Origens JavaScript autorizadas** (*Authorized JavaScript origins*) → **Adicionar URI**:
   - `http://localhost:5173`
   - (depois, quando publicarmos para o tablet, você vai adicionar o endereço do site aqui também)
4. Deixe "URIs de redirecionamento" vazio → **Criar**.
5. Copie o **ID do cliente** — algo como `1234567890-abc123.apps.googleusercontent.com`.

## 5. Colar no app

Abra `js/config.js` e cole o ID entre as aspas:

```js
const CONFIG = {
  googleClientId: '1234567890-abc123.apps.googleusercontent.com',
};
```

(Ou me mande o ID que eu coloco. Ele não é senha — só identifica o app.)

Pode levar alguns minutos para o Google aplicar as configurações.

## 6. Usar

1. Abra o app (`abrir.bat`) → aparece o botão de nuvem no topo → **Conectar Google Drive**.
2. Na janela do Google, escolha sua conta. Vai aparecer o aviso **"O Google não verificou este app"** —
   é normal, porque o app é seu e está em modo de teste: clique em **Continuar**.
3. Pronto. Dali em diante:
   - Depois de cada alteração, o app envia em ~8 segundos.
   - Ao voltar para a aba/app, ele busca o que mudou no outro aparelho.
   - O login do Google vale ~1 hora; depois disso o botão mostra **Sincronizar** e basta tocar nele.

## Como funciona a mesclagem

- Cada bloco guarda a hora da última alteração. Se você mexeu num bloco no PC e em outro no tablet,
  os dois são mantidos. Se mexeu **no mesmo bloco** nos dois antes de sincronizar, vale a edição mais recente.
- Excluir um livro exclui em todos os aparelhos.
- **No aparelho novo, não crie o livro de novo**: na tela inicial use
  "Já uso em outro aparelho — trazer minhas anotações do Google Drive".
