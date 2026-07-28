# Gestão da Qualidade

Sistema web (mobile-first) para inspeção de qualidade, FCA e retorno de FCA,
substituindo o Power App atual. 100% estático — feito para rodar no
**GitHub Pages** e usar o **Supabase** como banco de dados.

## Telas

- **Login** — usuário e senha próprios do sistema.
- **Início** — boas-vindas, atalhos e contador de FCAs pendentes.
- **Cadastro de Inspeção** — Nº lote, ordem de fabricação, código da peça,
  tipo de processo (Máquina/Pulmão), descrição, setor, recurso/máquina
  (carregado a partir do setor escolhido), anexos e resultado
  Conforme/Não Conforme.
- **Cadastro FCA** — abrir FCA (sim/não), setor encontrado, setor de
  origem, operador, quantidade de peças, como foi identificado, detalhes
  do problema e anexos.
- **Retorno FCA** — lista as FCAs com status "Pendente"; ao tocar em uma,
  abre o formulário de causa raiz / ação corretiva / responsável e marca
  a FCA como "Concluída".
- **Consulta** — lista as inspeções, com filtro por setor e busca por lote
  (equivalente à tela "Selecione o Setor" do Power App).
- **Configurações** (só para usuários com perfil `admin`) — cria e
  ativa/desativa inspetores.

## 1. Criar o projeto no Supabase

1. Crie um projeto em [supabase.com](https://supabase.com).
2. Vá em **SQL Editor** e rode, **nesta ordem**, os arquivos da pasta `sql/`:
   1. `01_schema.sql`
   2. `02_seed_setores_recursos.sql` (já traz todos os Setores e Recursos
      extraídos da sua planilha `SETORES_E_RECURSOS.xlsx`)
   3. `03_funcoes_auth.sql` (cria as funções de login/senha e o usuário
      administrador inicial)
   4. `04_storage.sql` (cria o bucket `anexos`)

   Ou rode tudo de uma vez com `00_TUDO_EM_UM.sql`.

3. Usuário administrador inicial:
   - **login:** `admin`
   - **senha:** `admin123`

   Entre no sistema com esse usuário e **troque a senha imediatamente**
   em Configurações → (crie seu usuário definitivo e desative o `admin`,
   ou apenas gere uma nova senha por ele).

4. **Lotes e Peças**: as tabelas `lotes` e `pecas` ficam vazias de
   propósito — preencha pelo **Table Editor** do Supabase ou importando
   um CSV, como você pediu.

### Por que não usei o Supabase Auth?

O app é 100% estático (sem servidor próprio) e você pediu uma tela de
Configurações dentro do próprio sistema para cadastrar inspetores. Para
isso funcionar sem expor a chave `service_role` (que nunca pode ir para
um site público), criei um esquema de login e senha próprio: uma tabela
`usuarios` com a senha em hash (`pgcrypto`) e funções `SECURITY DEFINER`
que fazem toda a conferência **dentro do banco**. A tabela `usuarios`
tem RLS ativa sem nenhuma policy pública — só é acessível através dessas
funções.

**Limitação importante:** como não é o Auth "de verdade" do Supabase, o
Postgres não sabe *quem* está logado — a política de acesso das tabelas
de inspeções/FCA fica liberada para a chave `anon` (a proteção de tela
acontece no app, depois do login). Para um ambiente com dados mais
sensíveis, o próximo passo natural é migrar para Supabase Auth (e-mail
ou telefone) com RLS por `auth.uid()`. Posso te ajudar a evoluir isso
quando quiser.

## 2. Configurar o app

Edite `js/config.js`:

```js
window.APP_CONFIG = {
  SUPABASE_URL: "https://SEU-PROJETO.supabase.co",
  SUPABASE_ANON_KEY: "SUA-CHAVE-ANON-PUBLICA-AQUI",
  NOME_EMPRESA: "Gestão da Qualidade",
};
```

Esses dados estão em **Project Settings → API** no painel do Supabase
(use a chave `anon public`, nunca a `service_role`).

## 3. Publicar no GitHub Pages

1. Crie um repositório no GitHub e suba esta pasta inteira (`index.html`,
   `css/`, `js/`, `sql/`).
2. No repositório: **Settings → Pages → Source: Deploy from a branch**,
   escolha a branch `main` e a pasta `/ (root)`.
3. Aguarde alguns minutos — o site fica disponível em
   `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`.

## Estrutura de arquivos

```
gestao-qualidade/
├── index.html
├── css/style.css
├── js/
│   ├── config.js   <- preencha com os dados do seu Supabase
│   ├── db.js       <- toda comunicação com o Supabase
│   └── app.js       <- telas e navegação
├── sql/
│   ├── 00_TUDO_EM_UM.sql
│   ├── 01_schema.sql
│   ├── 02_seed_setores_recursos.sql
│   ├── 03_funcoes_auth.sql
│   └── 04_storage.sql
└── README.md
```

## Melhorias em relação ao Power App atual

- Setor → Recurso/Máquina em cascata (o Power App só tinha Setor solto).
- Retorno FCA vira de fato uma fila de pendências, com causa raiz e
  ação corretiva registradas, em vez de uma tela solta.
- Consulta com busca por lote além do filtro por setor.
- Login e controle de usuários (o Power App não tinha).
- Dados de setor/recurso centralizados no banco, então atualizar uma
  máquina não exige nova publicação do app.
# colibri-inspe-o-app
