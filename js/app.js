// =====================================================================
// GESTÃO DA QUALIDADE — App (vanilla JS, sem build step, GitHub Pages)
// =====================================================================

const App = document.getElementById("app");
const NOME_EMPRESA = window.APP_CONFIG.NOME_EMPRESA || "Gestão da Qualidade";

const State = {
  route: "login",
  session: null,        // {id, usuario, nome, perfil}
  adminSenha: null,     // senha em memória (não persistida) p/ ações admin
  setores: [],
  recursosCache: {},
  lotes: null,
  ordensCache: {},
  form: {},             // rascunho do formulário ativo
};

// ---------------------------------------------------------------------
// util
// ---------------------------------------------------------------------
function toast(msg, type = "") {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "toast show " + type;
  clearTimeout(toast._tm);
  toast._tm = setTimeout(() => (t.className = "toast"), 3200);
}

function fmtDataHora(d = new Date()) {
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function loadSession() {
  try {
    const raw = localStorage.getItem("gq_session");
    if (raw) State.session = JSON.parse(raw);
  } catch (e) {}
}
function saveSession(s) {
  State.session = s;
  localStorage.setItem("gq_session", JSON.stringify(s));
}
function clearSession() {
  State.session = null;
  State.adminSenha = null;
  localStorage.removeItem("gq_session");
}

function navigate(route, extra = {}) {
  State.route = route;
  State.form = extra;
  render();
  window.scrollTo(0, 0);
}

async function ensureSetores() {
  if (!State.setores.length) {
    try {
      State.setores = await DB.setores();
    } catch (e) {
      toast("Não foi possível carregar os setores. Confira a configuração do Supabase.", "error");
    }
  }
  return State.setores;
}

async function ensureLotes() {
  if (!State.lotes) {
    try {
      State.lotes = await DB.listarLotes();
    } catch (e) {
      console.error(e);
      State.lotes = [];
      toast("Não foi possível carregar os lotes. Confira a configuração do Supabase.", "error");
    }
  }
  return State.lotes;
}

// ---------------------------------------------------------------------
// shell / navegação
// ---------------------------------------------------------------------
const NAV_ITEMS = [
  { route: "home", label: "Início", icon: "◆" },
  { route: "inspecao", label: "Inspeção", icon: "✓" },
  { route: "fca", label: "FCA", icon: "▲" },
  { route: "retorno", label: "Retorno", icon: "↺" },
  { route: "consulta", label: "Consulta", icon: "⌕" },
  { route: "dashboard", label: "Painel", icon: "▥" },
];

function shell(innerHtml, { title, subtitle, back } = {}) {
  const isAdmin = State.session?.perfil === "admin";
  return `
    <div class="topbar">
      <div class="topbar__row">
        <div>
          ${back ? `<button class="icon-btn" data-back style="margin-bottom:8px">‹</button>` : ""}
          <div class="topbar__title">${title || NOME_EMPRESA}</div>
          ${subtitle ? `<div class="topbar__sub">${subtitle}</div>` : ""}
        </div>
        <div style="display:flex;gap:8px;">
          ${isAdmin ? `<button class="icon-btn" data-route="config" title="Configurações">⚙</button>` : ""}
          <button class="icon-btn" data-logout title="Sair">⏻</button>
        </div>
      </div>
      <div class="topbar__stripe"></div>
    </div>
    <div class="screen">${innerHtml}</div>
    <div class="bottom-nav">
      ${NAV_ITEMS.map(
        (i) => `
        <button data-route="${i.route}" class="${State.route === i.route ? "active" : ""}">
          <span class="dot">${i.icon}</span>${i.label}
        </button>`
      ).join("")}
    </div>
  `;
}

function configPendente() {
  const c = window.APP_CONFIG || {};
  return !c.SUPABASE_URL || !c.SUPABASE_ANON_KEY || c.SUPABASE_URL.includes("SEU-PROJETO") || c.SUPABASE_ANON_KEY.includes("AQUI");
}

function screenConfigMissing() {
  App.innerHTML = `
    <div class="login-screen">
      <div class="login-brand">Configuração necessária</div>
      <div class="login-title">Gestão da<br/>Qualidade</div>
      <div class="login-card">
        <p style="margin-top:0;">O app ainda não foi conectado ao Supabase.</p>
        <p style="font-size:13.5px;color:var(--ink-soft);">
          Abra o arquivo <code>js/config.js</code> e preencha
          <code>SUPABASE_URL</code> e <code>SUPABASE_ANON_KEY</code> com os
          dados do seu projeto (Project Settings → API no painel do
          Supabase). Depois disso, rode o SQL da pasta <code>sql/</code>
          (se ainda não rodou) e recarregue esta página.
        </p>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------
// LOGIN
// ---------------------------------------------------------------------
function screenLogin() {
  if (configPendente()) {
    screenConfigMissing();
    return;
  }
  App.innerHTML = `
    <div class="login-screen">
      <div class="login-brand">Painel de qualidade</div>
      <div class="login-title">Gestão da<br/>Qualidade</div>
      <div class="login-card">
        <div id="login-error"></div>
        <form id="login-form">
          <div class="field">
            <label>Usuário</label>
            <input type="text" id="f-usuario" autocomplete="username" required />
          </div>
          <div class="field" style="margin-bottom:8px;">
            <label>Senha</label>
            <input type="password" id="f-senha" autocomplete="current-password" required />
          </div>
          <button class="btn btn-primary" type="submit" style="margin-top:10px;">Entrar</button>
        </form>
      </div>
      <div class="login-foot">Acesso restrito à equipe de inspeção.<br/>Fale com um administrador para obter seu login.</div>
    </div>
  `;

  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const usuario = document.getElementById("f-usuario").value.trim();
    const senha = document.getElementById("f-senha").value;
    const btn = e.target.querySelector("button");
    btn.disabled = true;
    btn.textContent = "Entrando...";
    try {
      const user = await DB.login(usuario, senha);
      if (!user) {
        document.getElementById("login-error").innerHTML = `<div class="login-error">Usuário ou senha inválidos.</div>`;
        btn.disabled = false;
        btn.textContent = "Entrar";
        return;
      }
      saveSession(user);
      State.adminSenha = user.perfil === "admin" ? senha : null;
      navigate("home");
    } catch (err) {
      console.error(err);
      const detalhe = err?.message ? ` (${err.message})` : "";
      document.getElementById("login-error").innerHTML = `<div class="login-error">Não foi possível conectar ao Supabase${detalhe}. Confira a URL/chave em js/config.js e se o SQL da pasta sql/ já foi executado.</div>`;
      btn.disabled = false;
      btn.textContent = "Entrar";
    }
  });
}

// ---------------------------------------------------------------------
// HOME
// ---------------------------------------------------------------------
function screenHome() {
  const s = State.session;
  const html = `
    <div class="hero">
      <div class="hero__eyebrow">Painel do inspetor</div>
      <div class="hero__title">Bem-vindo</div>
      <div class="hero__welcome">Logado como <b>${s.nome}</b></div>
    </div>

    <div class="stat-row">
      <div class="stat-chip">
        <div class="stat-chip__n" id="home-inspecoes-count">–</div>
        <div class="stat-chip__label">Inspeções hoje</div>
      </div>
      <div class="stat-chip">
        <div class="stat-chip__n" id="home-fca-count">–</div>
        <div class="stat-chip__label">FCA pendentes</div>
      </div>
    </div>

    <div class="menu-grid">
      <button class="menu-card" data-route="inspecao">
        <div class="menu-card__icon">✓</div>
        <div>
          <div class="menu-card__title">Cadastro de Inspeção</div>
          <div class="menu-card__desc">Registrar uma nova inspeção de qualidade</div>
        </div>
        <div class="menu-card__chevron">›</div>
      </button>
      <button class="menu-card" data-route="fca">
        <div class="menu-card__icon">▲</div>
        <div>
          <div class="menu-card__title">Cadastro FCA</div>
          <div class="menu-card__desc">Abrir uma Ficha de Controle de Ação</div>
        </div>
        <div class="menu-card__chevron">›</div>
      </button>
      <button class="menu-card" data-route="retorno">
        <div class="menu-card__icon">↺</div>
        <div>
          <div class="menu-card__title">Retorno FCA</div>
          <div class="menu-card__desc">Dar baixa nas FCAs pendentes</div>
        </div>
        <div class="menu-card__chevron">›</div>
      </button>
      <button class="menu-card" data-route="consulta">
        <div class="menu-card__icon">⌕</div>
        <div>
          <div class="menu-card__title">Consulta</div>
          <div class="menu-card__desc">Ver inspeções já registradas</div>
        </div>
        <div class="menu-card__chevron">›</div>
      </button>
    </div>
  `;
  App.innerHTML = shell(html);

  DB.listarFcaPendentes()
    .then((rows) => {
      const el = document.getElementById("home-fca-count");
      if (el) el.textContent = rows.length;
    })
    .catch(() => {});

  DB.contarInspecoesHoje(State.session.id)
    .then((n) => {
      const el = document.getElementById("home-inspecoes-count");
      if (el) el.textContent = n;
    })
    .catch(() => {});
}

// ---------------------------------------------------------------------
// CADASTRO DE INSPEÇÃO (2 passos)
// ---------------------------------------------------------------------
function screenInspecao() {
  const step = State.form.step || 1;
  const d = (State.form.data ||= {
    numero_lote: "",
    ordem_fabricacao: "",
    codigo_peca: "",
    tipo_processo: "Maquina",
    descricao: "",
    setor_id: "",
    recurso_id: "",
    lote_id: null,
    conforme: true,
    abrir_fca: false,
    anexos: [],
  });

  let html = `<div class="step-track"><div class="${step >= 1 ? "done" : ""}"></div><div class="${step >= 2 ? "done" : ""}"></div></div>`;

  if (step === 1) {
    Promise.all([ensureSetores(), ensureLotes()]).then(renderStep1);
    return;
  }

  function renderStep1() {
    const lotes = State.lotes || [];
    const setorAtual = State.setores.find((s) => String(s.id) === String(d.setor_id));

    html += `
      <form id="f1">
        <div class="field">
          <label>Setor<span class="req">*</span></label>
          <select id="setor_id" required>
            <option value="">Selecione...</option>
            ${State.setores.map((s) => `<option value="${s.id}" ${String(d.setor_id) === String(s.id) ? "selected" : ""}>${s.nome}</option>`).join("")}
          </select>
        </div>

        <div class="field">
          <label>Tipo de processo</label>
          <div class="radio-group">
            <label class="radio-option ${d.tipo_processo === "Maquina" ? "checked" : ""}">
              <input type="radio" name="tipo_processo" value="Maquina" ${d.tipo_processo === "Maquina" ? "checked" : ""}/> Máquina
            </label>
            <label class="radio-option ${d.tipo_processo === "Pulmao" ? "checked" : ""}">
              <input type="radio" name="tipo_processo" value="Pulmao" ${d.tipo_processo === "Pulmao" ? "checked" : ""}/> Pulmão
            </label>
          </div>

          <div id="recurso-wrap" style="${d.tipo_processo === "Pulmao" ? "display:none;" : ""}margin-top:14px;">
            <label>Recurso / Máquina<span class="req">*</span></label>
            <select id="recurso_id"><option value="">Selecione o setor primeiro</option></select>
          </div>

          <div id="pulmao-info" style="${d.tipo_processo === "Pulmao" ? "" : "display:none;"}">
            <div class="info-box">
              <span>🛈</span>
              <span><b>Inspeção de Pulmão</b>Referente ao setor: <b>${setorAtual ? setorAtual.nome : "selecione o setor acima"}</b></span>
            </div>
          </div>
        </div>

        <div id="duplicidade-alerta"></div>

        <div class="field">
          <label>Nº Lote<span class="req">*</span></label>
          <select id="numero_lote" required>
            <option value="">Selecione o lote...</option>
            ${lotes
              .map(
                (l) =>
                  `<option value="${l.id}" data-numero="${l.numero}" ${String(d.lote_id) === String(l.id) ? "selected" : ""}>${l.numero}</option>`
              )
              .join("")}
          </select>
          <div class="hint">${lotes.length ? lotes.length + " lote(s) disponível(is), mais recentes primeiro." : "Nenhum lote importado ainda — rode o script de importação (scripts/atualizar_lotes_ordens_pecas.py)."}</div>
        </div>
        <div class="field">
          <label>Ordem de fabricação<span class="req">*</span></label>
          <select id="ordem_fabricacao" required disabled>
            <option value="">Selecione o lote primeiro</option>
          </select>
          <div class="hint" id="ordem-legenda">${d.tipo_processo === "Maquina" ? "🟢 disponível para inspeção neste recurso · 🔴 já inspecionada neste recurso" : ""}</div>
        </div>
        <div class="field">
          <label>Código da Peça<span class="req">*</span></label>
          <input class="mono" type="text" id="codigo_peca" value="${d.codigo_peca}" readonly required />
          <div class="hint">Preenchido automaticamente ao escolher a ordem.</div>
        </div>
        <div class="field">
          <label>Descrição</label>
          <textarea id="descricao">${d.descricao}</textarea>
        </div>
        <div class="btn-row"><button class="btn btn-primary" type="submit" id="btn-continuar">Continuar</button></div>
      </form>
    `;
    App.innerHTML = shell(html, { title: "Inspeção de Qualidade", subtitle: `Inspetor: ${State.session.nome} · ${fmtDataHora()}` });

    bindRadios(() => {
      const pulmao = d.tipo_processo === "Pulmao";
      document.getElementById("recurso-wrap").style.display = pulmao ? "none" : "block";
      document.getElementById("pulmao-info").style.display = pulmao ? "block" : "none";
      if (pulmao) {
        d.recurso_id = "";
        const rs = document.getElementById("recurso_id");
        if (rs) rs.value = "";
      }
      const legenda = document.getElementById("ordem-legenda");
      if (legenda) legenda.textContent = pulmao ? "" : "🟢 disponível para inspeção neste recurso · 🔴 já inspecionada neste recurso";
      if (d.lote_id) carregarOrdens(d.lote_id);
      checarDuplicidade();
    });

    const setorSelect = document.getElementById("setor_id");
    const recursoSelect = document.getElementById("recurso_id");
    const loteSelect = document.getElementById("numero_lote");
    const ordemSelect = document.getElementById("ordem_fabricacao");
    const pecaInput = document.getElementById("codigo_peca");
    const btnContinuar = document.getElementById("btn-continuar");
    const alertaBox = document.getElementById("duplicidade-alerta");

    async function carregarRecursos(setorId, selecionado) {
      recursoSelect.innerHTML = `<option value="">Carregando...</option>`;
      try {
        const recursos = (State.recursosCache[setorId] ||= await DB.recursosPorSetor(setorId));
        recursoSelect.innerHTML =
          `<option value="">Selecione...</option>` +
          recursos.map((r) => `<option value="${r.id}" ${String(selecionado) === String(r.id) ? "selected" : ""}>${r.codigo} - ${r.nome}</option>`).join("");
      } catch (e) {
        recursoSelect.innerHTML = `<option value="">Erro ao carregar</option>`;
      }
    }
    if (d.setor_id) carregarRecursos(d.setor_id, d.recurso_id);

    setorSelect.addEventListener("change", (e) => {
      d.setor_id = e.target.value;
      d.recurso_id = "";
      const nomeSetor = e.target.selectedOptions[0]?.textContent || "selecione o setor acima";
      const info = document.querySelector("#pulmao-info b:last-child");
      if (info) info.textContent = d.setor_id ? nomeSetor : "selecione o setor acima";
      if (d.setor_id) carregarRecursos(d.setor_id);
      else recursoSelect.innerHTML = `<option value="">Selecione o setor primeiro</option>`;
      checarDuplicidade();
    });

    recursoSelect.addEventListener("change", (e) => {
      d.recurso_id = e.target.value;
      if (d.lote_id) carregarOrdens(d.lote_id);
      checarDuplicidade();
    });

    async function carregarOrdens(loteId) {
      ordemSelect.disabled = true;
      ordemSelect.innerHTML = `<option value="">Carregando...</option>`;
      try {
        const ordens = (State.ordensCache[loteId] ||= await DB.ordensPorLote(loteId));
        if (!ordens.length) {
          ordemSelect.innerHTML = `<option value="">Nenhuma ordem importada para este lote</option>`;
          return;
        }

        // Se já temos setor+recurso (Máquina), marca quais ordens desse
        // lote já foram inspecionadas nesse recurso (vermelho/indisponível)
        // e quais ainda estão livres (verde/disponível).
        let jaInspecionadas = new Set();
        const podeChecar = d.tipo_processo === "Maquina" && d.recurso_id;
        if (podeChecar) {
          try {
            const numeros = ordens.map((o) => o.numero);
            const existentes = await DB.ordensJaInspecionadas(d.recurso_id, numeros);
            jaInspecionadas = new Set(existentes);
          } catch (e) {
            console.error(e);
          }
        }

        ordemSelect.disabled = false;
        ordemSelect.innerHTML =
          `<option value="">Selecione a ordem...</option>` +
          ordens
            .map((o) => {
              const indisponivel = podeChecar && jaInspecionadas.has(o.numero);
              const marcador = podeChecar ? (indisponivel ? "🔴" : "🟢") : "";
              const rotulo = marcador ? `${marcador} ${o.numero}${indisponivel ? " — já inspecionada" : ""}` : o.numero;
              return `<option value="${o.numero}" data-peca="${o.pecas?.codigo || ""}" ${d.ordem_fabricacao === o.numero ? "selected" : ""} ${indisponivel ? "disabled" : ""}>${rotulo}</option>`;
            })
            .join("");
        if (d.ordem_fabricacao) {
          const sel = ordens.find((o) => o.numero === d.ordem_fabricacao);
          if (sel) pecaInput.value = sel.pecas?.codigo || "";
        }
      } catch (err) {
        console.error(err);
        ordemSelect.innerHTML = `<option value="">Erro ao carregar ordens</option>`;
      }
    }
    if (d.lote_id) carregarOrdens(d.lote_id);

    loteSelect.addEventListener("change", (e) => {
      d.lote_id = e.target.value || null;
      d.numero_lote = e.target.selectedOptions[0]?.dataset.numero || "";
      d.ordem_fabricacao = "";
      d.codigo_peca = "";
      pecaInput.value = "";
      if (d.lote_id) {
        carregarOrdens(d.lote_id);
      } else {
        ordemSelect.disabled = true;
        ordemSelect.innerHTML = `<option value="">Selecione o lote primeiro</option>`;
      }
      checarDuplicidade();
    });

    ordemSelect.addEventListener("change", (e) => {
      const opt = e.target.selectedOptions[0];
      d.ordem_fabricacao = e.target.value;
      const codigoPeca = opt ? opt.dataset.peca : "";
      pecaInput.value = codigoPeca || "";
      d.codigo_peca = codigoPeca || "";
      if (d.ordem_fabricacao && !codigoPeca) {
        toast("Essa ordem não tem peça vinculada na base — confira a importação.", "error");
      }
      checarDuplicidade();
    });

    // REGRA: por recurso, a mesma ordem só pode ser inspecionada 1 vez.
    let duplicidadeCheckId = 0;
    async function checarDuplicidade() {
      const meuCheckId = ++duplicidadeCheckId;
      if (d.tipo_processo !== "Maquina" || !d.recurso_id || !d.ordem_fabricacao) {
        alertaBox.innerHTML = "";
        btnContinuar.disabled = false;
        return;
      }
      try {
        const existente = await DB.inspecaoExistente(d.recurso_id, d.ordem_fabricacao);
        if (meuCheckId !== duplicidadeCheckId) return; // resposta de uma checagem antiga, ignora
        if (existente) {
          alertaBox.innerHTML = `
            <div class="alert-box">
              <span>⚠</span>
              <span><b>Ordem já inspecionada neste recurso</b>
              Registrada em ${new Date(existente.criado_em).toLocaleString("pt-BR")} por ${existente.inspetor_nome}
              (${existente.conforme ? "Conforme" : "Não conforme"}). Não é permitido inspecionar a mesma ordem
              duas vezes no mesmo recurso.</span>
            </div>`;
          btnContinuar.disabled = true;
        } else {
          alertaBox.innerHTML = "";
          btnContinuar.disabled = false;
        }
      } catch (err) {
        console.error(err);
      }
    }
    checarDuplicidade();

    document.getElementById("f1").addEventListener("submit", (e) => {
      e.preventDefault();
      if (!d.setor_id) {
        toast("Selecione o setor.", "error");
        return;
      }
      if (d.tipo_processo === "Maquina" && !d.recurso_id) {
        toast("Selecione o recurso/máquina.", "error");
        return;
      }
      if (!d.lote_id) {
        toast("Selecione o lote.", "error");
        return;
      }
      if (!d.ordem_fabricacao) {
        toast("Selecione a ordem.", "error");
        return;
      }
      if (!d.codigo_peca) {
        toast("Essa ordem não tem peça vinculada. Confira a importação antes de continuar.", "error");
        return;
      }
      d.descricao = document.getElementById("descricao").value.trim();
      navigate("inspecao", { step: 2, data: d });
    });
  }

  // step 2 — anexos e resultado
  renderStep2();

  function renderStep2() {
    html += `
      <form id="f2">
        <div class="field">
          <label>Anexos</label>
          <div class="attach-box">
            <div id="attach-list">
              ${d.anexos.length ? d.anexos.map((a) => `<div class="attach-item">📎 ${a.nome}</div>`).join("") : `<div class="attach-empty">Não há nada em anexo.</div>`}
            </div>
            <label class="attach-label">📎 Anexar arquivo<input type="file" id="anexo-input" /></label>
          </div>
        </div>

        <div class="field">
          <label>Conforme?</label>
          <div class="stamp-row">
            <div class="stamp-wrap">
              <div class="stamp-ring"></div>
              <div class="stamp ${d.conforme ? "ok" : "bad"}" id="stamp-preview">${d.conforme ? "Conforme" : "Não<br/>Conforme"}</div>
            </div>
          </div>
          <div class="radio-group">
            <label class="radio-option conforme ${d.conforme ? "checked" : ""}">
              <input type="radio" name="conforme" value="1" ${d.conforme ? "checked" : ""}/> Conforme
            </label>
            <label class="radio-option nao-conforme ${!d.conforme ? "checked" : ""}">
              <input type="radio" name="conforme" value="0" ${!d.conforme ? "checked" : ""}/> Não Conforme
            </label>
          </div>
        </div>

        <div class="field">
          <label>Abrir FCA para esta peça?</label>
          <div class="hint" style="margin-top:-2px;margin-bottom:10px;">Se marcar "Sim", ao salvar você já vai direto para o cadastro da FCA vinculada a este lote/ordem/peça.</div>
          <div class="radio-group">
            <label class="radio-option nao-conforme ${d.abrir_fca ? "checked" : ""}">
              <input type="radio" name="abrir_fca_insp" value="1" ${d.abrir_fca ? "checked" : ""}/> Sim
            </label>
            <label class="radio-option ${!d.abrir_fca ? "checked" : ""}">
              <input type="radio" name="abrir_fca_insp" value="0" ${!d.abrir_fca ? "checked" : ""}/> Não
            </label>
          </div>
        </div>

        <div class="btn-row">
          <button class="btn btn-ghost" type="button" id="btn-voltar">Voltar</button>
          <button class="btn btn-primary" type="submit">Salvar inspeção</button>
        </div>
      </form>
    `;
    App.innerHTML = shell(html, { title: "Inspeção de Qualidade", subtitle: `Inspetor: ${State.session.nome} · ${fmtDataHora()}` });

    document.getElementById("anexo-input").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      toast("Enviando anexo...");
      try {
        const a = await DB.upload(file, "inspecoes");
        d.anexos.push(a);
        navigate("inspecao", { step: 2, data: d });
      } catch (err) {
        console.error(err);
        toast("Falha ao enviar anexo. Confira o bucket 'anexos' no Supabase.", "error");
      }
    });

    bindRadios(() => {
      const conformeEl = document.querySelector('input[name=conforme]:checked');
      if (conformeEl) {
        d.conforme = conformeEl.value === "1";
        const stampEl = document.getElementById("stamp-preview");
        stampEl.className = "stamp " + (d.conforme ? "ok" : "bad");
        stampEl.innerHTML = d.conforme ? "Conforme" : "Não<br/>Conforme";
      }
      const fcaEl = document.querySelector('input[name=abrir_fca_insp]:checked');
      if (fcaEl) d.abrir_fca = fcaEl.value === "1";
    });

    document.getElementById("btn-voltar").addEventListener("click", () => navigate("inspecao", { step: 1, data: d }));

    document.getElementById("f2").addEventListener("submit", async (e) => {
      e.preventDefault();
      const abrirFcaChecked = document.querySelector('input[name=abrir_fca_insp]:checked')?.value === "1";
      d.abrir_fca = abrirFcaChecked;
      const btn = e.target.querySelector("button[type=submit]");
      btn.disabled = true;
      btn.textContent = "Salvando...";
      try {
        const inspecaoCriada = await DB.criarInspecao({
          numero_lote: d.numero_lote,
          ordem_fabricacao: d.ordem_fabricacao,
          codigo_peca: d.codigo_peca,
          tipo_processo: d.tipo_processo,
          descricao: d.descricao || null,
          setor_id: Number(d.setor_id),
          recurso_id: d.recurso_id ? Number(d.recurso_id) : null,
          conforme: d.conforme,
          anexos: d.anexos,
          inspetor_id: State.session.id,
          inspetor_nome: State.session.nome,
        });

        if (abrirFcaChecked) {
          toast("Inspeção registrada. Complete os dados da FCA.", "success");
          navigate("fca", {
            step: 1,
            data: {
              abrir_fca: true,
              inspecao_id: inspecaoCriada.id,
              numero_lote: d.numero_lote,
              ordem_fabricacao: d.ordem_fabricacao,
              codigo_peca: d.codigo_peca,
              setor_encontrado_id: d.setor_id,
              setor_origem_id: "",
              nome_operador: "",
              quantidade_pecas: "",
              como_identificado: "",
              detalhes_problema: "",
              anexos: [],
            },
          });
          return;
        }

        toast("Inspeção registrada com sucesso.", "success");
        navigate("home");
      } catch (err) {
        console.error(err);
        if (err?.code === "23505") {
          toast("Essa ordem já foi inspecionada nesse recurso por outro inspetor há pouco.", "error");
          navigate("inspecao", { step: 1, data: d });
          return;
        }
        toast("Erro ao salvar. Verifique a conexão com o Supabase.", "error");
        btn.disabled = false;
        btn.textContent = "Salvar inspeção";
      }
    });
  }
}

function bindRadios(onChange) {
  document.querySelectorAll(".radio-option input[type=radio]").forEach((inp) => {
    inp.addEventListener("change", () => {
      document.querySelectorAll(`input[name=${inp.name}]`).forEach((sib) => {
        sib.closest(".radio-option").classList.toggle("checked", sib.checked);
      });
      const tpEl = document.querySelector('input[name=tipo_processo]:checked');
      if (tpEl && State.form.data) State.form.data.tipo_processo = tpEl.value;
      if (onChange) onChange();
    });
  });
}

// ---------------------------------------------------------------------
// CADASTRO FCA (2 passos)
// ---------------------------------------------------------------------
function screenFca() {
  const step = State.form.step || 1;
  const d = (State.form.data ||= {
    abrir_fca: true,
    inspecao_id: null,
    numero_lote: "",
    ordem_fabricacao: "",
    codigo_peca: "",
    setor_encontrado_id: "",
    setor_origem_id: "",
    nome_operador: "",
    quantidade_pecas: "",
    como_identificado: "",
    detalhes_problema: "",
    anexos: [],
  });
  const vinculada = !!d.inspecao_id;

  if (step === 1) {
    ensureSetores().then(renderStep1);
  }

  function renderStep1() {
    const html = `
      <div class="step-track"><div class="done"></div><div></div></div>
      ${
        vinculada
          ? `<div class="info-box" style="margin-bottom:18px;">
              <span>🛈</span>
              <span><b>FCA vinculada a uma peça específica</b>
              Lote: <b>${d.numero_lote || "—"}</b> · Ordem: <b>${d.ordem_fabricacao || "—"}</b> · Peça: <b>${d.codigo_peca || "—"}</b></span>
            </div>`
          : `<div class="field">
              <label>Abrir FCA?<span class="req">*</span></label>
              <div class="radio-group">
                <label class="radio-option ${d.abrir_fca ? "checked" : ""}"><input type="radio" name="abrir_fca" value="1" ${d.abrir_fca ? "checked" : ""}/> Sim</label>
                <label class="radio-option ${!d.abrir_fca ? "checked" : ""}"><input type="radio" name="abrir_fca" value="0" ${!d.abrir_fca ? "checked" : ""}/> Não</label>
              </div>
            </div>`
      }
      <form id="f1">
        <div class="field">
          <label>Setor Encontrado</label>
          <select id="setor_encontrado_id">
            <option value="">Selecione...</option>
            ${State.setores.map((s) => `<option value="${s.id}" ${String(d.setor_encontrado_id) === String(s.id) ? "selected" : ""}>${s.nome}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label>Setor de origem</label>
          <select id="setor_origem_id">
            <option value="">Selecione...</option>
            ${State.setores.map((s) => `<option value="${s.id}" ${String(d.setor_origem_id) === String(s.id) ? "selected" : ""}>${s.nome}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label>Nome Operador ou Auxiliar</label>
          <input type="text" id="nome_operador" value="${d.nome_operador}" />
        </div>
        <div class="field">
          <label>Quantidade de peças</label>
          <input type="number" min="0" id="quantidade_pecas" value="${d.quantidade_pecas}" />
        </div>
        <div class="btn-row"><button class="btn btn-primary" type="submit">Continuar</button></div>
      </form>
    `;
    App.innerHTML = shell(html, { title: "FCA", subtitle: `Inspetor: ${State.session.nome} · ${fmtDataHora()}` });
    bindRadios();
    document.getElementById("f1").addEventListener("submit", (e) => {
      e.preventDefault();
      if (!vinculada) {
        d.abrir_fca = document.querySelector('input[name=abrir_fca]:checked').value === "1";
      }
      d.setor_encontrado_id = document.getElementById("setor_encontrado_id").value;
      d.setor_origem_id = document.getElementById("setor_origem_id").value;
      d.nome_operador = document.getElementById("nome_operador").value.trim();
      d.quantidade_pecas = document.getElementById("quantidade_pecas").value;
      navigate("fca", { step: 2, data: d });
    });
  }

  if (step === 2) {
    const html = `
      <div class="step-track"><div class="done"></div><div class="done"></div></div>
      <form id="f2">
        <div class="field">
          <label>Como foi identificado</label>
          <select id="como_identificado">
            <option value="">Selecione...</option>
            <option ${d.como_identificado === "Inspeção de processo" ? "selected" : ""}>Inspeção de processo</option>
            <option ${d.como_identificado === "Inspeção final" ? "selected" : ""}>Inspeção final</option>
            <option ${d.como_identificado === "Reclamação de cliente" ? "selected" : ""}>Reclamação de cliente</option>
            <option ${d.como_identificado === "Auditoria interna" ? "selected" : ""}>Auditoria interna</option>
            <option ${d.como_identificado === "Outro" ? "selected" : ""}>Outro</option>
          </select>
        </div>
        <div class="field">
          <label>Detalhes do problema (FATO)</label>
          <textarea id="detalhes_problema">${d.detalhes_problema}</textarea>
        </div>
        <div class="field">
          <label>Anexos</label>
          <div class="attach-box">
            <div id="attach-list">
              ${d.anexos.length ? d.anexos.map((a) => `<div class="attach-item">📎 ${a.nome}</div>`).join("") : `<div class="attach-empty">Não há nada em anexo.</div>`}
            </div>
            <label class="attach-label">📎 Anexar arquivo<input type="file" id="anexo-input" /></label>
          </div>
        </div>
        <div class="btn-row">
          <button class="btn btn-ghost" type="button" id="btn-voltar">Voltar</button>
          <button class="btn btn-primary" type="submit">Salvar FCA</button>
        </div>
      </form>
    `;
    App.innerHTML = shell(html, { title: "FCA", subtitle: `Inspetor: ${State.session.nome} · ${fmtDataHora()}` });

    document.getElementById("anexo-input").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      toast("Enviando anexo...");
      try {
        const a = await DB.upload(file, "fca");
        d.anexos.push(a);
        navigate("fca", { step: 2, data: d });
      } catch (err) {
        console.error(err);
        toast("Falha ao enviar anexo. Confira o bucket 'anexos' no Supabase.", "error");
      }
    });

    document.getElementById("btn-voltar").addEventListener("click", () => navigate("fca", { step: 1, data: d }));

    document.getElementById("f2").addEventListener("submit", async (e) => {
      e.preventDefault();
      d.como_identificado = document.getElementById("como_identificado").value;
      d.detalhes_problema = document.getElementById("detalhes_problema").value.trim();
      const btn = e.target.querySelector("button[type=submit]");
      btn.disabled = true;
      btn.textContent = "Salvando...";
      try {
        await DB.criarFca({
          inspecao_id: d.inspecao_id || null,
          numero_lote: d.numero_lote || null,
          ordem_fabricacao: d.ordem_fabricacao || null,
          codigo_peca: d.codigo_peca || null,
          abrir_fca: d.abrir_fca,
          setor_encontrado_id: d.setor_encontrado_id ? Number(d.setor_encontrado_id) : null,
          setor_origem_id: d.setor_origem_id ? Number(d.setor_origem_id) : null,
          nome_operador: d.nome_operador || null,
          quantidade_pecas: d.quantidade_pecas ? Number(d.quantidade_pecas) : null,
          como_identificado: d.como_identificado || null,
          detalhes_problema: d.detalhes_problema || null,
          anexos: d.anexos,
          status: d.abrir_fca ? "Pendente" : "Concluida",
          inspetor_id: State.session.id,
          inspetor_nome: State.session.nome,
        });
        toast("FCA registrada com sucesso.", "success");
        navigate("home");
      } catch (err) {
        console.error(err);
        toast("Erro ao salvar a FCA.", "error");
        btn.disabled = false;
        btn.textContent = "Salvar FCA";
      }
    });
  }
}

// ---------------------------------------------------------------------
// RETORNO FCA — lista pendentes e dá baixa
// ---------------------------------------------------------------------
function screenRetorno() {
  ensureSetores().then(render);

  function render() {
    const html = `
      <div class="filter-panel">
        <div class="field" style="margin-bottom:4px;">
          <label>Setor Encontrado</label>
          <select id="filtro-setor-retorno">
            <option value="">Todos</option>
            ${State.setores.map((s) => `<option value="${s.id}">${s.nome}</option>`).join("")}
          </select>
        </div>
      </div>
      <div id="lista-fca"><div class="empty-state">Carregando...</div></div>
    `;
    App.innerHTML = shell(html, { title: "Retorno FCA", subtitle: "FCAs pendentes de fechamento" });

    document.getElementById("filtro-setor-retorno").addEventListener("change", carregar);
    carregar();
  }

  function carregar() {
    const setorId = document.getElementById("filtro-setor-retorno")?.value || null;
    const box = document.getElementById("lista-fca");
    box.innerHTML = `<div class="empty-state">Carregando...</div>`;

    DB.listarFcaPendentes({ setorId })
      .then((rows) => {
        if (!rows.length) {
          box.innerHTML = `<div class="empty-state"><div class="glyph">↺</div>Nenhuma FCA pendente com esse filtro.</div>`;
          return;
        }
        box.innerHTML = rows
          .map(
            (f) => `
          <div class="card" data-fca="${f.id}">
            <div class="card__top">
              <div>
                <span class="tag tag-pending">Pendente</span>
                <div class="card__meta" style="margin-top:8px;">
                  ${f.numero_lote || f.ordem_fabricacao || f.codigo_peca ? `<span><b>Lote/Ordem/Peça:</b> ${f.numero_lote || "—"} / ${f.ordem_fabricacao || "—"} / ${f.codigo_peca || "—"}</span>` : ""}
                  <span><b>Encontrado:</b> ${f.encontrado?.nome || "—"}</span>
                  <span><b>Origem:</b> ${f.origem?.nome || "—"}</span>
                  <span><b>Operador:</b> ${f.nome_operador || "—"}</span>
                  <span><b>Qtd. peças:</b> ${f.quantidade_pecas ?? "—"}</span>
                  <span><b>Aberta em:</b> ${new Date(f.criado_em).toLocaleString("pt-BR")}</span>
                </div>
              </div>
            </div>
          </div>`
          )
          .join("");

        box.querySelectorAll("[data-fca]").forEach((card) => {
          card.addEventListener("click", () => abrirModalRetorno(card.dataset.fca));
        });
      })
      .catch((err) => {
        console.error(err);
        box.innerHTML = `<div class="empty-state">Erro ao carregar FCAs.</div>`;
      });
  }
}

function abrirModalRetorno(fcaId) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal-sheet">
      <h3>Dar baixa na FCA</h3>
      <form id="form-retorno">
        <div class="field">
          <label>Causa raiz<span class="req">*</span></label>
          <textarea id="causa_raiz" required></textarea>
        </div>
        <div class="field">
          <label>Ação corretiva<span class="req">*</span></label>
          <textarea id="acao_corretiva" required></textarea>
        </div>
        <div class="field">
          <label>Responsável<span class="req">*</span></label>
          <input type="text" id="responsavel" required />
        </div>
        <div class="btn-row">
          <button type="button" class="btn btn-ghost" id="btn-cancelar">Cancelar</button>
          <button type="submit" class="btn btn-primary">Concluir FCA</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(backdrop);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) backdrop.remove();
  });
  backdrop.querySelector("#btn-cancelar").addEventListener("click", () => backdrop.remove());
  backdrop.querySelector("#form-retorno").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button[type=submit]");
    btn.disabled = true;
    btn.textContent = "Salvando...";
    try {
      await DB.concluirFca(fcaId, {
        causa_raiz: document.getElementById("causa_raiz").value.trim(),
        acao_corretiva: document.getElementById("acao_corretiva").value.trim(),
        responsavel: document.getElementById("responsavel").value.trim(),
        inspetor_id: State.session.id,
        inspetor_nome: State.session.nome,
      });
      toast("FCA concluída.", "success");
      backdrop.remove();
      screenRetorno();
    } catch (err) {
      console.error(err);
      toast("Erro ao concluir a FCA.", "error");
      btn.disabled = false;
      btn.textContent = "Concluir FCA";
    }
  });
}

// ---------------------------------------------------------------------
// CONSULTA
// ---------------------------------------------------------------------
function screenConsulta() {
  ensureSetores().then(render);

  function render() {
    const html = `
      <div class="filter-bar">
        <div class="field" style="margin-bottom:10px;">
          <label>Selecione o Setor</label>
          <select id="filtro-setor">
            <option value="">Todos</option>
            ${State.setores.map((s) => `<option value="${s.id}">${s.nome}</option>`).join("")}
          </select>
        </div>
        <input type="text" id="filtro-busca" placeholder="Buscar por Nº lote..." class="mono" />
      </div>
      <div id="lista-inspecoes"><div class="empty-state">Carregando...</div></div>
    `;
    App.innerHTML = shell(html, { title: "Consulta", subtitle: "Inspeções registradas" });

    let debounce;
    const carregar = () => {
      const setorId = document.getElementById("filtro-setor").value || null;
      const busca = document.getElementById("filtro-busca").value.trim() || null;
      DB.listarInspecoes({ setorId, busca })
        .then((rows) => {
          const box = document.getElementById("lista-inspecoes");
          if (!rows.length) {
            box.innerHTML = `<div class="empty-state"><div class="glyph">⌕</div>Nenhuma inspeção encontrada.</div>`;
            return;
          }
          box.innerHTML = rows
            .map(
              (r) => `
            <div class="card">
              <div class="card__top">
                <div>
                  <div class="card__lote">LOTE: ${r.numero_lote || "—"}</div>
                  <div class="card__meta">
                    <span>COD. PEÇA: ${r.codigo_peca || "—"}</span>
                    <span>OF: ${r.ordem_fabricacao || "—"}</span>
                    <span>SETOR: ${r.setores?.nome || "—"}</span>
                    <span>MÁQUINA/RECURSO: ${r.recursos ? r.recursos.codigo + " - " + r.recursos.nome : "—"}</span>
                    <span>${new Date(r.criado_em).toLocaleString("pt-BR")} · ${r.inspetor_nome}</span>
                  </div>
                </div>
                <span class="tag ${r.conforme ? "tag-ok" : "tag-bad"}">${r.conforme ? "Conforme" : "Não conforme"}</span>
              </div>
            </div>`
            )
            .join("");
        })
        .catch((err) => {
          console.error(err);
          document.getElementById("lista-inspecoes").innerHTML = `<div class="empty-state">Erro ao carregar.</div>`;
        });
    };

    document.getElementById("filtro-setor").addEventListener("change", carregar);
    document.getElementById("filtro-busca").addEventListener("input", () => {
      clearTimeout(debounce);
      debounce = setTimeout(carregar, 350);
    });
    carregar();
  }
}

// ---------------------------------------------------------------------
// CONFIGURAÇÕES (admin) — criar/gerenciar usuários
// ---------------------------------------------------------------------
function screenConfig() {
  if (State.session.perfil !== "admin") {
    navigate("home");
    return;
  }
  if (!State.adminSenha) {
    App.innerHTML = shell(
      `
      <div class="field">
        <p style="color:var(--ink-soft); font-size:13.5px;">Por segurança, confirme sua senha de administrador para acessar as configurações.</p>
        <label>Senha</label>
        <input type="password" id="confirm-senha" />
      </div>
      <div class="btn-row"><button class="btn btn-primary" id="btn-confirmar">Confirmar</button></div>
      `,
      { title: "Configurações" }
    );
    document.getElementById("btn-confirmar").addEventListener("click", async () => {
      const senha = document.getElementById("confirm-senha").value;
      try {
        const check = await DB.login(State.session.usuario, senha);
        if (!check) {
          toast("Senha incorreta.", "error");
          return;
        }
        State.adminSenha = senha;
        screenConfig();
      } catch (e) {
        toast("Erro ao validar senha.", "error");
      }
    });
    return;
  }

  App.innerHTML = shell(
    `
    <div class="section-title">Novo usuário</div>
    <form id="form-novo-usuario">
      <div class="field"><label>Nome completo</label><input type="text" id="nu-nome" required /></div>
      <div class="field"><label>Usuário (login)</label><input type="text" id="nu-usuario" required /></div>
      <div class="field"><label>Senha</label><input type="password" id="nu-senha" required /></div>
      <div class="field">
        <label>Perfil</label>
        <select id="nu-perfil">
          <option value="inspetor">Inspetor</option>
          <option value="admin">Administrador</option>
        </select>
      </div>
      <div class="btn-row"><button class="btn btn-accent" type="submit">Criar usuário</button></div>
    </form>

    <div class="section-title">Usuários cadastrados</div>
    <div id="lista-usuarios"><div class="empty-state">Carregando...</div></div>
    `,
    { title: "Configurações", subtitle: "Gerenciar inspetores" }
  );

  async function carregarUsuarios() {
    try {
      const rows = await DB.listarUsuarios({ usuario: State.session.usuario, senha: State.adminSenha });
      document.getElementById("lista-usuarios").innerHTML = rows
        .map(
          (u) => `
        <div class="user-row">
          <div>
            <div class="user-row__name">${u.nome} ${u.perfil === "admin" ? "· admin" : ""}</div>
            <div class="user-row__meta">${u.usuario} · ${u.ativo ? "ativo" : "inativo"}</div>
          </div>
          <button class="link-btn" data-toggle="${u.id}" data-ativo="${u.ativo}">${u.ativo ? "Desativar" : "Ativar"}</button>
        </div>`
        )
        .join("");

      document.querySelectorAll("[data-toggle]").forEach((b) => {
        b.addEventListener("click", async () => {
          try {
            await DB.atualizarUsuario(
              { usuario: State.session.usuario, senha: State.adminSenha },
              b.dataset.toggle,
              { ativo: b.dataset.ativo !== "true" }
            );
            carregarUsuarios();
          } catch (e) {
            toast("Erro ao atualizar usuário.", "error");
          }
        });
      });
    } catch (e) {
      document.getElementById("lista-usuarios").innerHTML = `<div class="empty-state">Erro ao carregar usuários.</div>`;
    }
  }
  carregarUsuarios();

  document.getElementById("form-novo-usuario").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      const res = await DB.criarUsuario(
        { usuario: State.session.usuario, senha: State.adminSenha },
        {
          nome: document.getElementById("nu-nome").value.trim(),
          usuario: document.getElementById("nu-usuario").value.trim(),
          senha: document.getElementById("nu-senha").value,
          perfil: document.getElementById("nu-perfil").value,
        }
      );
      if (res.ok) {
        toast(res.mensagem, "success");
        e.target.reset();
        carregarUsuarios();
      } else {
        toast(res.mensagem, "error");
      }
    } catch (err) {
      console.error(err);
      toast("Erro ao criar usuário.", "error");
    } finally {
      btn.disabled = false;
    }
  });
}

// ---------------------------------------------------------------------
// DASHBOARD (Painel) — Inspeções e FCA, com filtro por setor, período
// e tipo (Recurso/Máquina ou Pulmão)
// ---------------------------------------------------------------------
function screenDashboard() {
  const f = (State.form.filtros ||= {
    setorId: "",
    tipo: "",       // "" | "Maquina" | "Pulmao"
    recursoId: "",
    dataInicio: "",
    dataFim: "",
  });

  ensureSetores().then(renderFiltros);

  function renderFiltros() {
    const html = `
      <div class="filter-panel">
        <div class="field">
          <label>Setor</label>
          <select id="f-setor">
            <option value="">Todos</option>
            ${State.setores.map((s) => `<option value="${s.id}" ${String(f.setorId) === String(s.id) ? "selected" : ""}>${s.nome}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label>Tipo</label>
          <select id="f-tipo">
            <option value="">Todos (Recurso e Pulmão)</option>
            <option value="Maquina" ${f.tipo === "Maquina" ? "selected" : ""}>Recurso (Máquina)</option>
            <option value="Pulmao" ${f.tipo === "Pulmao" ? "selected" : ""}>Pulmão</option>
          </select>
        </div>
        <div class="field" id="f-recurso-wrap" style="${f.tipo === "Maquina" ? "" : "display:none;"}">
          <label>Recurso específico</label>
          <select id="f-recurso"><option value="">Todos os recursos</option></select>
        </div>
        <div class="filter-grid">
          <div class="field">
            <label>De</label>
            <input type="date" id="f-data-inicio" value="${f.dataInicio}" />
          </div>
          <div class="field">
            <label>Até</label>
            <input type="date" id="f-data-fim" value="${f.dataFim}" />
          </div>
        </div>
        <button class="btn btn-primary" id="btn-aplicar-filtros" style="margin-bottom:16px;">Aplicar filtros</button>
      </div>
      <div id="dashboard-conteudo"><div class="empty-state">Carregando dados...</div></div>
    `;
    App.innerHTML = shell(html, { title: "Painel", subtitle: "Inspeções e FCA" });

    const setorSelect = document.getElementById("f-setor");
    const tipoSelect = document.getElementById("f-tipo");
    const recursoWrap = document.getElementById("f-recurso-wrap");
    const recursoSelect = document.getElementById("f-recurso");

    async function carregarRecursosFiltro() {
      if (!f.setorId) {
        recursoSelect.innerHTML = `<option value="">Escolha um setor para filtrar por recurso</option>`;
        return;
      }
      recursoSelect.innerHTML = `<option value="">Carregando...</option>`;
      try {
        const recursos = (State.recursosCache[f.setorId] ||= await DB.recursosPorSetor(f.setorId));
        recursoSelect.innerHTML =
          `<option value="">Todos os recursos</option>` +
          recursos.map((r) => `<option value="${r.id}" ${String(f.recursoId) === String(r.id) ? "selected" : ""}>${r.codigo} - ${r.nome}</option>`).join("");
      } catch (e) {
        recursoSelect.innerHTML = `<option value="">Erro ao carregar</option>`;
      }
    }
    if (f.tipo === "Maquina") carregarRecursosFiltro();

    tipoSelect.addEventListener("change", (e) => {
      f.tipo = e.target.value;
      if (f.tipo !== "Maquina") f.recursoId = "";
      recursoWrap.style.display = f.tipo === "Maquina" ? "block" : "none";
      if (f.tipo === "Maquina") carregarRecursosFiltro();
    });
    setorSelect.addEventListener("change", (e) => {
      f.setorId = e.target.value;
      f.recursoId = "";
      if (f.tipo === "Maquina") carregarRecursosFiltro();
    });
    recursoSelect.addEventListener("change", (e) => (f.recursoId = e.target.value));

    document.getElementById("btn-aplicar-filtros").addEventListener("click", () => {
      f.dataInicio = document.getElementById("f-data-inicio").value;
      f.dataFim = document.getElementById("f-data-fim").value;
      carregarDashboard();
    });

    carregarDashboard();
  }

  async function carregarDashboard() {
    const box = document.getElementById("dashboard-conteudo");
    box.innerHTML = `<div class="empty-state">Carregando dados...</div>`;

    const filtroBase = {
      setorId: f.setorId || null,
      dataInicio: f.dataInicio ? `${f.dataInicio}T00:00:00` : null,
      dataFim: f.dataFim ? `${f.dataFim}T23:59:59` : null,
    };

    try {
      const [inspecoes, fcas] = await Promise.all([
        DB.dashboardInspecoes({ ...filtroBase, tipoProcesso: f.tipo || null, recursoId: f.recursoId || null }),
        DB.dashboardFca(filtroBase),
      ]);

      const totalInsp = inspecoes.length;
      const conformes = inspecoes.filter((i) => i.conforme).length;
      const naoConformes = totalInsp - conformes;
      const pctNaoConforme = totalInsp ? Math.round((naoConformes / totalInsp) * 100) : 0;

      const fcaPendentes = fcas.filter((x) => x.status === "Pendente").length;
      const fcaConcluidas = fcas.filter((x) => x.status === "Concluida").length;

      // agrupamento simples por setor (calculado no cliente a partir do
      // que já foi buscado — sem necessidade de outra função no banco)
      const porSetor = {};
      inspecoes.forEach((i) => {
        const nome = i.setores?.nome || "Sem setor";
        porSetor[nome] ||= { total: 0, naoConforme: 0 };
        porSetor[nome].total += 1;
        if (!i.conforme) porSetor[nome].naoConforme += 1;
      });
      const setoresOrdenados = Object.entries(porSetor).sort((a, b) => b[1].total - a[1].total).slice(0, 8);
      const maiorTotal = Math.max(1, ...setoresOrdenados.map(([, v]) => v.total));

      box.innerHTML = `
        <div class="section-title">Inspeções</div>
        <div class="stat-grid">
          <div class="stat-chip"><div class="stat-chip__n">${totalInsp}</div><div class="stat-chip__label">Total</div></div>
          <div class="stat-chip ok"><div class="stat-chip__n">${conformes}</div><div class="stat-chip__label">Conformes</div></div>
          <div class="stat-chip bad"><div class="stat-chip__n">${naoConformes}</div><div class="stat-chip__label">Não conformes</div></div>
          <div class="stat-chip warn"><div class="stat-chip__n">${pctNaoConforme}%</div><div class="stat-chip__label">Taxa não conf.</div></div>
        </div>

        <div class="section-title">FCA</div>
        <div class="stat-grid">
          <div class="stat-chip"><div class="stat-chip__n">${fcas.length}</div><div class="stat-chip__label">Total</div></div>
          <div class="stat-chip warn"><div class="stat-chip__n">${fcaPendentes}</div><div class="stat-chip__label">Pendentes</div></div>
          <div class="stat-chip ok"><div class="stat-chip__n">${fcaConcluidas}</div><div class="stat-chip__label">Concluídas</div></div>
          <div class="stat-chip"><div class="stat-chip__n">${fcas.length ? Math.round((fcaPendentes / fcas.length) * 100) : 0}%</div><div class="stat-chip__label">% pendente</div></div>
        </div>

        <div class="section-title">Inspeções por setor</div>
        ${
          setoresOrdenados.length
            ? setoresOrdenados
                .map(
                  ([nome, v]) => `
              <div class="bar-row">
                <div class="bar-row__head"><span>${nome}</span><b>${v.total} (${v.naoConforme} não conf.)</b></div>
                <div class="bar-row__track"><div class="bar-row__fill" style="width:${(v.total / maiorTotal) * 100}%"></div></div>
              </div>`
                )
                .join("")
            : `<div class="empty-state">Nenhuma inspeção encontrada com esse filtro.</div>`
        }
      `;
    } catch (err) {
      console.error(err);
      box.innerHTML = `<div class="empty-state">Erro ao carregar o painel.</div>`;
    }
  }
}

// ---------------------------------------------------------------------
// router / render
// ---------------------------------------------------------------------
const SCREENS = {
  login: screenLogin,
  home: screenHome,
  inspecao: screenInspecao,
  fca: screenFca,
  retorno: screenRetorno,
  consulta: screenConsulta,
  dashboard: screenDashboard,
  config: screenConfig,
};

function render() {
  if (configPendente()) {
    screenConfigMissing();
    return;
  }
  if (!State.session) {
    State.route = "login";
    screenLogin();
    return;
  }
  (SCREENS[State.route] || screenHome)();
}

document.addEventListener("click", (e) => {
  const routeBtn = e.target.closest("[data-route]");
  if (routeBtn) {
    navigate(routeBtn.dataset.route);
    return;
  }
  if (e.target.closest("[data-logout]")) {
    clearSession();
    navigate("login");
    return;
  }
  if (e.target.closest("[data-back]")) {
    navigate("home");
  }
});

loadSession();
render();
