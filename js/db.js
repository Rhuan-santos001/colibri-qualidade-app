// =====================================================================
// CAMADA DE ACESSO AO SUPABASE
// =====================================================================
const supa = window.supabase.createClient(
  window.APP_CONFIG.SUPABASE_URL,
  window.APP_CONFIG.SUPABASE_ANON_KEY
);

const DB = {
  // ---------------- AUTENTICAÇÃO ----------------
  async login(usuario, senha) {
    const { data, error } = await supa.rpc("app_login", {
      p_usuario: usuario,
      p_senha: senha,
    });
    if (error) throw error;
    return data && data.length ? data[0] : null;
  },

  async criarUsuario(admin, novo) {
    const { data, error } = await supa.rpc("app_criar_usuario", {
      p_admin_usuario: admin.usuario,
      p_admin_senha: admin.senha,
      p_novo_usuario: novo.usuario,
      p_novo_senha: novo.senha,
      p_novo_nome: novo.nome,
      p_novo_perfil: novo.perfil,
    });
    if (error) throw error;
    return data && data.length ? data[0] : { ok: false, mensagem: "Erro desconhecido." };
  },

  async listarUsuarios(admin) {
    const { data, error } = await supa.rpc("app_listar_usuarios", {
      p_admin_usuario: admin.usuario,
      p_admin_senha: admin.senha,
    });
    if (error) throw error;
    return data || [];
  },

  async atualizarUsuario(admin, usuarioId, { ativo, novaSenha }) {
    const { data, error } = await supa.rpc("app_atualizar_usuario", {
      p_admin_usuario: admin.usuario,
      p_admin_senha: admin.senha,
      p_usuario_id: usuarioId,
      p_ativo: ativo ?? null,
      p_nova_senha: novaSenha ?? null,
    });
    if (error) throw error;
    return data && data.length ? data[0] : { ok: false, mensagem: "Erro desconhecido." };
  },

  // ---------------- SETORES / RECURSOS ----------------
  async setores() {
    const { data, error } = await supa.from("setores").select("*").order("nome");
    if (error) throw error;
    return data || [];
  },

  async recursosPorSetor(setorId) {
    if (!setorId) return [];
    const { data, error } = await supa
      .from("recursos")
      .select("*")
      .eq("setor_id", setorId)
      .order("codigo");
    if (error) throw error;
    return data || [];
  },

  // ---------------- LOTES / ORDENS / PEÇAS (importados diariamente pelo script) ----------------
  async buscarLotePorNumero(numeroLote) {
    if (!numeroLote) return null;
    const { data, error } = await supa
      .from("lotes")
      .select("*")
      .eq("numero", numeroLote.trim())
      .limit(1);
    if (error) throw error;
    return data && data.length ? data[0] : null;
  },

  async listarLotes() {
    const { data, error } = await supa
      .from("lotes")
      .select("id, numero")
      .order("criado_em", { ascending: false })
      .limit(1000);
    if (error) throw error;
    return data || [];
  },

  async ordensPorLote(loteId) {
    if (!loteId) return [];
    const { data, error } = await supa
      .from("ordens")
      .select("id, numero, peca_id, pecas:peca_id(codigo)")
      .eq("lote_id", loteId)
      .order("numero");
    if (error) throw error;
    return data || [];
  },

  // ---------------- ANEXOS ----------------
  async upload(file, pasta) {
    const nomeArquivo = `${pasta}/${Date.now()}_${file.name.replace(/\s+/g, "_")}`;
    const { error } = await supa.storage.from("anexos").upload(nomeArquivo, file);
    if (error) throw error;
    const { data } = supa.storage.from("anexos").getPublicUrl(nomeArquivo);
    return { nome: file.name, url: data.publicUrl };
  },

  // ---------------- INSPEÇÕES ----------------
  async inspecaoExistente(recursoId, ordemNumero) {
    if (!recursoId || !ordemNumero) return null;
    const { data, error } = await supa
      .from("inspecoes")
      .select("id, criado_em, inspetor_nome, conforme")
      .eq("recurso_id", recursoId)
      .eq("ordem_fabricacao", ordemNumero)
      .limit(1);
    if (error) throw error;
    return data && data.length ? data[0] : null;
  },

  async ordensJaInspecionadas(recursoId, ordensNumeros) {
    if (!recursoId || !ordensNumeros || !ordensNumeros.length) return [];
    const { data, error } = await supa
      .from("inspecoes")
      .select("ordem_fabricacao")
      .eq("recurso_id", recursoId)
      .in("ordem_fabricacao", ordensNumeros);
    if (error) throw error;
    return (data || []).map((r) => r.ordem_fabricacao);
  },

  async criarInspecao(payload) {
    const { data, error } = await supa.from("inspecoes").insert(payload).select().single();
    if (error) throw error;
    return data;
  },

  async listarInspecoes({ setorId, busca } = {}) {
    let q = supa
      .from("inspecoes")
      .select("*, setores:setor_id(nome), recursos:recurso_id(codigo,nome)")
      .order("criado_em", { ascending: false })
      .limit(100);
    if (setorId) q = q.eq("setor_id", setorId);
    if (busca) q = q.ilike("numero_lote", `%${busca}%`);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },

  // ---------------- FCA ----------------
  async criarFca(payload) {
    const { data, error } = await supa.from("fca").insert(payload).select().single();
    if (error) throw error;
    return data;
  },

  async listarFcaPendentes({ setorId } = {}) {
    let q = supa
      .from("fca")
      .select(
        "*, encontrado:setor_encontrado_id(nome), origem:setor_origem_id(nome)"
      )
      .eq("status", "Pendente")
      .order("criado_em", { ascending: false });
    if (setorId) q = q.eq("setor_encontrado_id", setorId);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },

  async concluirFca(fcaId, payload) {
    const { data, error } = await supa
      .from("fca_retorno")
      .insert({ fca_id: fcaId, ...payload })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async contarInspecoesHoje(inspetorId) {
    if (!inspetorId) return 0;
    const inicio = new Date();
    inicio.setHours(0, 0, 0, 0);
    const { count, error } = await supa
      .from("inspecoes")
      .select("id", { count: "exact", head: true })
      .eq("inspetor_id", inspetorId)
      .gte("criado_em", inicio.toISOString());
    if (error) throw error;
    return count || 0;
  },

  // ---------------- DASHBOARD ----------------
  async dashboardInspecoes({ setorId, tipoProcesso, recursoId, dataInicio, dataFim } = {}) {
    let q = supa
      .from("inspecoes")
      .select("id, setor_id, recurso_id, tipo_processo, conforme, criado_em, setores:setor_id(nome), recursos:recurso_id(codigo,nome)")
      .order("criado_em", { ascending: false })
      .limit(3000);
    if (setorId) q = q.eq("setor_id", setorId);
    if (tipoProcesso) q = q.eq("tipo_processo", tipoProcesso);
    if (recursoId) q = q.eq("recurso_id", recursoId);
    if (dataInicio) q = q.gte("criado_em", dataInicio);
    if (dataFim) q = q.lte("criado_em", dataFim);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },

  async dashboardFca({ setorId, dataInicio, dataFim } = {}) {
    let q = supa
      .from("fca")
      .select("id, setor_encontrado_id, status, criado_em, setores:setor_encontrado_id(nome)")
      .order("criado_em", { ascending: false })
      .limit(3000);
    if (setorId) q = q.eq("setor_encontrado_id", setorId);
    if (dataInicio) q = q.gte("criado_em", dataInicio);
    if (dataFim) q = q.lte("criado_em", dataFim);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },
};
