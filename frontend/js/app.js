// ====== CAMADA DE DADOS: SUPABASE (Auth + Postgres com RLS) ======
// O cliente `supabase` vem de js/supabase-config.js (carregado antes deste arquivo).
// Esta camada mantém a MESMA interface que o resto do app.js já usa
// (apiCall, login, register, logout, authToken, currentUser) para que nenhuma
// outra função precise ser alterada — só o "encanamento" mudou.

let currentUser = null;
let authToken = null; // usado só como flag "está logado" pelo resto do app

function saveAuthData(token, user) {
  authToken = token;
  currentUser = user;
  localStorage.setItem("harmonia_user", JSON.stringify(user));
}

function loadAuthData() {
  const userStr = localStorage.getItem("harmonia_user");
  if (userStr) {
    try {
      currentUser = JSON.parse(userStr);
      authToken = "supabase-session"; // presença = logado; sessão real fica no supabase-js
      return true;
    } catch (e) {
      clearAuthData();
      return false;
    }
  }
  return false;
}

function clearAuthData() {
  authToken = null;
  currentUser = null;
  localStorage.removeItem("harmonia_user");
}

// Monta o objeto currentUser (igual formato do backend antigo) a partir do
// usuário logado no Supabase Auth + sua linha em `perfis`.
async function montarCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: perfil, error } = await supabase
    .from("perfis")
    .select("*, igreja:igrejas(id, nome, slug, convite_codigo)")
    .eq("id", user.id)
    .single();

  if (error || !perfil) throw new Error("Perfil não encontrado para este usuário.");

  return {
    id: perfil.id,
    name: perfil.nome,
    email: perfil.email,
    role: perfil.role, // "admin" | "lider" | "member" (papel real do banco)
    souLideranca: perfil.role === "admin" || perfil.role === "lider",
    funcao: perfil.funcao,
    igreja: perfil.igreja,
  };
}

// ====== AUTENTICAÇÃO ======
async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message === "Invalid login credentials" ? "E-mail ou senha incorretos." : error.message);

  const user = await montarCurrentUser();
  saveAuthData(data.session.access_token, user);
  return { token: data.session.access_token, user };
}

// modoIgreja: "criar" (cria igreja nova, usuário vira admin) ou "entrar" (usa código de convite)
async function register(name, email, password, modoIgreja, igrejaCampo) {
  if (modoIgreja === "criar") {
    const nomeDigitado = igrejaCampo.trim();
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/verificar-igreja`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY },
        body: JSON.stringify({ nome: nomeDigitado }),
      });
      const check = await resp.json();
      if (check.existe) {
        const seguir = await confirmarAcao(
          `Já existe uma igreja chamada "${check.nomeEncontrado}" cadastrada no Harmonia.\n\n` +
          `Se é a mesma igreja, cancele e peça o código de convite pra quem já é líder lá — não digite o nome de novo, isso cria uma igreja separada e vazia.\n\n` +
          `Confirme só se for uma igreja realmente diferente, com o mesmo nome por coincidência.`,
          { titulo: "Igreja já cadastrada", textoConfirmar: "É uma igreja diferente", perigo: false }
        );
        if (!seguir) throw new Error("Cadastro cancelado. Peça o código de convite pra entrar na igreja já existente.");
      }
    } catch (e) {
      if (e.message.includes("Cadastro cancelado")) throw e;
      // se a verificação falhar por qualquer motivo de rede, segue o cadastro normalmente
    }
  }

  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw new Error(error.message === "User already registered" ? "E-mail já cadastrado." : error.message);
  if (!data.session) {
    throw new Error("Conta criada, mas a confirmação de e-mail está ativa no projeto. Desative 'Confirm email' em Authentication > Providers no Supabase para testar hoje, ou confirme o e-mail recebido antes de continuar.");
  }

  const userId = data.user.id;
  let igrejaId;
  let role = "member";

  if (modoIgreja === "criar") {
    const nomeIgreja = igrejaCampo.trim();
    if (!nomeIgreja) throw new Error("Informe o nome da igreja.");
    const slug = nomeIgreja.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + Math.random().toString(36).slice(2, 6);

    const { data: igreja, error: igrejaErr } = await supabase
      .from("igrejas")
      .insert({ owner_user_id: userId, nome: nomeIgreja, slug })
      .select()
      .single();
    if (igrejaErr) throw new Error("Erro ao criar igreja: " + igrejaErr.message);

    igrejaId = igreja.id;
    role = "admin";
  } else {
    const codigo = igrejaCampo.trim();
    if (!codigo) throw new Error("Informe o código de convite da igreja.");
    const { data: igreja, error: igrejaErr } = await supabase
      .from("igrejas")
      .select("id")
      .eq("convite_codigo", codigo)
      .single();
    if (igrejaErr || !igreja) throw new Error("Código de convite inválido.");
    igrejaId = igreja.id;
  }

  const { error: perfilErr } = await supabase
    .from("perfis")
    .insert({ id: userId, igreja_id: igrejaId, nome: name, email, role });
  if (perfilErr) throw new Error("Erro ao criar perfil: " + perfilErr.message);

  return { ok: true };
}

async function logout() {
  await supabase.auth.signOut();
  clearAuthData();
  showLoginForm();
}

// ====== SHIM DE API ======
// Traduz as chamadas antigas `apiCall("/endpoint", {...})` para o Supabase,
// mantendo o restante do app.js (renderização, regras de negócio) intacto.
async function apiCall(endpoint, options = {}) {
  const method = options.method || "GET";
  const body = options.body ? JSON.parse(options.body) : null;
  const [path, queryStr] = endpoint.split("?");
  const params = new URLSearchParams(queryStr || "");

  try {
    let m;
    // ---- MÚSICAS ----
    if (path === "/musicas" && method === "GET") {
      const { data, error } = await supabase.from("musicas").select("*").order("criado_em");
      if (error) throw error;
      return data.map(m => ({ id: m.id, titulo: m.titulo, tomOriginal: m.tom_original, link: m.link, observacoes: m.observacoes, cifra: m.cifra, bpm: m.bpm, autor: m.autor, categoria: m.categoria, tags: m.tags || [], vocalistaId: m.vocalista_id }));
    }
    if (path === "/musicas" && method === "POST") {
      const { data, error } = await supabase.from("musicas").insert({
        igreja_id: currentUser.igreja.id, titulo: body.titulo, tom_original: body.tomOriginal,
        link: body.link, observacoes: body.observacoes, cifra: body.cifra, bpm: body.bpm,
        autor: body.autor, categoria: body.categoria, tags: body.tags || [], vocalista_id: body.vocalistaId || null,
      }).select().single();
      if (error) throw error;
      return { id: data.id, titulo: data.titulo, tomOriginal: data.tom_original, link: data.link, observacoes: data.observacoes, cifra: data.cifra, bpm: data.bpm, autor: data.autor, categoria: data.categoria, tags: data.tags || [], vocalistaId: data.vocalista_id };
    }

    // ---- MEMBROS ----
    if (path === "/membros" && method === "GET") {
      const { data, error } = await supabase.from("membros").select("*").order("nome");
      if (error) throw error;
      return data;
    }
    if (path === "/membros" && method === "POST") {
      const { data, error } = await supabase.from("membros").insert({
        igreja_id: currentUser.igreja.id, nome: body.nome, voz: body.voz,
        funcao: body.funcao, aniversario: body.aniversario,
      }).select().single();
      if (error) throw error;
      return data;
    }

    // ---- CULTOS ----
    if (path === "/cultos" && method === "GET") {
      const { data, error } = await supabase.from("cultos")
        .select("*, culto_musicas(musica_id, repertorio_pessoal_id, ordem)")
        .order("data", { ascending: false });
      if (error) throw error;
      return data.map(c => ({
        id: c.id, data: c.data, nome: c.nome, shareSlug: c.share_slug,
        donoId: c.dono_id, ehPessoal: !!c.dono_id,
        musicaIds: c.culto_musicas
          .sort((a, b) => (a.ordem || 0) - (b.ordem || 0))
          .map(cm => cm.musica_id ? `musica:${cm.musica_id}` : `pessoal:${cm.repertorio_pessoal_id}`),
      }));
    }
    if (path === "/cultos" && method === "POST") {
      // Culto oficial (dono_id null) só se for liderança; senão é sempre pessoal (dono_id = eu).
      const donoId = currentUser.souLideranca && !body.pessoal ? null : currentUser.id;
      const { data: culto, error } = await supabase.from("cultos").insert({
        igreja_id: currentUser.igreja.id, data: body.data, nome: body.nome, criado_por: currentUser.id,
        dono_id: donoId,
      }).select().single();
      if (error) throw error;
      if (body.musicaIds?.length) {
        const linhas = body.musicaIds.map((valor, i) => {
          const [origem, id] = valor.split(":");
          return {
            igreja_id: currentUser.igreja.id, culto_id: culto.id, ordem: i + 1,
            musica_id: origem === "musica" ? id : null,
            repertorio_pessoal_id: origem === "pessoal" ? id : null,
          };
        });
        const { error: cmErr } = await supabase.from("culto_musicas").insert(linhas);
        if (cmErr) throw cmErr;
      }
      return culto;
    }
    if ((m = path.match(/^\/cultos\/(.+)$/)) && method === "PUT") {
      const cultoId = m[1];
      const { error } = await supabase.from("cultos").update({ data: body.data, nome: body.nome }).eq("id", cultoId);
      if (error) throw error;

      // substitui o mapa de músicas inteiro (mais simples e seguro que tentar diff)
      const { error: delErr } = await supabase.from("culto_musicas").delete().eq("culto_id", cultoId);
      if (delErr) throw delErr;
      if (body.musicaIds?.length) {
        const linhas = body.musicaIds.map((valor, i) => {
          const [origem, id] = valor.split(":");
          return {
            igreja_id: currentUser.igreja.id, culto_id: cultoId, ordem: i + 1,
            musica_id: origem === "musica" ? id : null,
            repertorio_pessoal_id: origem === "pessoal" ? id : null,
          };
        });
        const { error: cmErr } = await supabase.from("culto_musicas").insert(linhas);
        if (cmErr) throw cmErr;
      }
      return { ok: true };
    }
    if ((m = path.match(/^\/cultos\/(.+)$/)) && method === "DELETE") {
      const { error } = await supabase.from("cultos").delete().eq("id", m[1]);
      if (error) throw error;
      return { ok: true };
    }

    // ---- ESCALAS ----
    if (path === "/escalas" && method === "GET" && params.has("mes")) {
      const { data, error } = await supabase.from("escalas").select("*")
        .eq("mes", Number(params.get("mes"))).eq("ano", Number(params.get("ano")));
      if (error) throw error;
      return data;
    }
    if (path === "/escalas" && method === "GET") {
      const { data, error } = await supabase.from("escalas").select("*").order("ano", { ascending: false }).order("mes", { ascending: false });
      if (error) throw error;
      return data;
    }
    if (path === "/escalas" && method === "POST") {
      const { data, error } = await supabase.from("escalas").insert({
        igreja_id: currentUser.igreja.id, mes: body.mes, ano: body.ano, criado_por: currentUser.id,
      }).select().single();
      if (error) throw error;
      return data;
    }
    if ((m = path.match(/^\/escalas\/(.+)\/aprovar$/)) && method === "PUT") {
      const { error } = await supabase.from("escalas").update({ aprovada: true }).eq("id", m[1]);
      if (error) throw error;
      return { ok: true };
    }
    if ((m = path.match(/^\/escalas\/(.+)\/musicas$/)) && method === "POST") {
      const { data, error } = await supabase.from("escala_musicas").insert({
        igreja_id: currentUser.igreja.id, escala_id: m[1], data: body.data, titulo: body.titulo,
        tom: body.tom, link: body.link, adicionado_por: currentUser.id,
      }).select().single();
      if (error) throw error;
      return data;
    }
    if ((m = path.match(/^\/escalas\/(.+)\/musicas\/(.+)$/)) && method === "DELETE") {
      const { error } = await supabase.from("escala_musicas").delete().eq("id", m[2]);
      if (error) throw error;
      return { ok: true };
    }
    if ((m = path.match(/^\/escalas\/(.+)\/trocas$/)) && method === "POST") {
      const { data, error } = await supabase.from("trocas_escala").insert({
        igreja_id: currentUser.igreja.id, escala_id: m[1], solicitante_id: currentUser.id,
        receptor_id: body.receptorId, data: body.data, funcao: body.funcao, observacao: body.observacao,
      }).select().single();
      if (error) throw error;
      return data;
    }

    // ---- PERFIL ----
    if (path === "/auth/perfil" && method === "GET") {
      const { data, error } = await supabase.from("perfis").select("*").eq("igreja_id", currentUser.igreja.id);
      if (error) throw error;
      return data;
    }

    // ---- TROCAS ----
    if (path === "/trocas" && method === "GET") {
      const { data, error } = await supabase.from("trocas_escala")
        .select(`*, solicitante:perfis!trocas_escala_solicitante_id_fkey(id, nome), receptor:perfis!trocas_escala_receptor_id_fkey(id, nome),
          celula:escala_celulas(id, coluna:escala_colunas(nome), linha:escala_linhas(dias, datas))`)
        .order("solicitado_em", { ascending: false });
      if (error) throw error;
      return data.map(t => ({
        id: t.id, status: t.status, data: t.data, funcao: t.funcao || t.celula?.coluna?.nome, observacao: t.observacao,
        solicitadoEm: t.solicitado_em, solicitanteId: t.solicitante_id, receptorId: t.receptor_id,
        solicitante: t.solicitante ? { name: t.solicitante.nome } : null,
        receptor: t.receptor ? { name: t.receptor.nome } : null,
        celulaInfo: t.celula ? `${t.celula.linha?.dias} (${t.celula.linha?.datas})` : null,
      }));
    }
    if ((m = path.match(/^\/trocas\/(.+)\/responder$/)) && method === "PUT") {
      const novoStatus = body.aceitar ? "aceita_receptor" : "recusada";
      const { error } = await supabase.from("trocas_escala").update({ status: novoStatus, aceito_em: new Date().toISOString() }).eq("id", m[1]);
      if (error) throw error;
      return { ok: true };
    }
    if ((m = path.match(/^\/trocas\/(.+)\/aprovar$/)) && method === "PUT") {
      const novoStatus = body.aprovar ? "aprovada" : "recusada";
      const { error } = await supabase.from("trocas_escala").update({ status: novoStatus, aprovado_em: new Date().toISOString(), aprovado_por: currentUser.id }).eq("id", m[1]);
      if (error) throw error;
      return { ok: true };
    }

    // ---- HISTÓRICO ----
    if (path === "/historico" && method === "GET") {
      let q = supabase.from("historico").select("*, user:perfis(nome)").order("data", { ascending: false }).limit(200);
      if (params.get("userId")) q = q.eq("user_id", params.get("userId"));
      if (params.get("acao")) q = q.ilike("acao", `%${params.get("acao")}%`);
      if (params.get("dataInicio")) q = q.gte("data", params.get("dataInicio"));
      if (params.get("dataFim")) q = q.lte("data", params.get("dataFim"));
      const { data, error } = await q;
      if (error) throw error;
      return data.map(h => ({ ...h, user: h.user ? { name: h.user.nome } : null }));
    }

    throw new Error(`Endpoint não mapeado: ${method} ${path}`);
  } catch (error) {
    console.error("Erro na API (Supabase):", error);
    throw new Error(error.message || "Erro inesperado.");
  }
}

// ====== CHAVES LOCALSTORAGE (BACKUP) ======
const STORAGE_KEYS = {
  MUSICAS: "harmonia_musicas",
  MEMBROS: "harmonia_membros",
  CULTOS: "harmonia_cultos",
};

// ====== FUNÇÕES DE STORAGE (BACKUP LOCAL) ======
function loadData(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("Erro ao carregar dados", key, e);
    return [];
  }
}

function saveData(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error("Erro ao salvar dados", key, e);
  }
}

// ====== ESTADO EM MEMÓRIA ======
let musicas = [];
let membros = [];
let cultos = [];

// Controle de carregamento preguiçoso: cada aba isolada só busca dados na primeira
// vez que é aberta, e guarda quando foi a última busca pra não refazer a cada clique.
const CACHE_TTL_MS = 20000; // 20s — dado "fresco o suficiente" pra não parecer travado nem desatualizado
const cacheAbas = { trocas: 0, historico: 0, repertorio: 0, cultos: 0, dashboard: 0 };

function precisaRecarregar(chave) {
  return Date.now() - cacheAbas[chave] > CACHE_TTL_MS;
}
function marcarCarregado(chave) {
  cacheAbas[chave] = Date.now();
}

// Feedback visual imediato: desabilita o botão e troca o texto enquanto a ação roda,
// pra nunca dar a impressão de que o clique não funcionou.
async function comFeedbackDeCarregamento(botao, textoCarregando, acaoAsync) {
  if (!botao) return acaoAsync();
  const textoOriginal = botao.textContent;
  botao.disabled = true;
  botao.textContent = textoCarregando;
  try {
    return await acaoAsync();
  } finally {
    botao.disabled = false;
    botao.textContent = textoOriginal;
  }
}

// ====== INTERFACE DE LOGIN ======
// Substitui o confirm() nativo do navegador por um modal com a cara do app.
// Uso: if (await confirmarAcao("Excluir isso?")) { ...faz a ação... }
function confirmarAcao(mensagem, { titulo = "Confirmar ação", textoConfirmar = "Confirmar", perigo = true } = {}) {
  return new Promise((resolve) => {
    const modal = document.getElementById("modalConfirmar");
    document.getElementById("confirmarTitulo").textContent = titulo;
    document.getElementById("confirmarMensagem").textContent = mensagem;
    const btnOk = document.getElementById("btnConfirmarOk");
    const btnCancelar = document.getElementById("btnConfirmarCancelar");
    btnOk.textContent = textoConfirmar;
    btnOk.className = "btn " + (perigo ? "danger" : "primary");

    function limpar(resultado) {
      modal.style.display = "none";
      btnOk.removeEventListener("click", onOk);
      btnCancelar.removeEventListener("click", onCancelar);
      resolve(resultado);
    }
    function onOk() { limpar(true); }
    function onCancelar() { limpar(false); }

    btnOk.addEventListener("click", onOk);
    btnCancelar.addEventListener("click", onCancelar);
    modal.style.display = "block";
  });
}

// Botão de "olho" nos campos de senha — funciona em qualquer tela que use a classe .btn-olho
function initTogglesSenha(escopo = document) {
  escopo.querySelectorAll(".btn-olho").forEach((btn) => {
    if (btn.dataset.wired) return;
    btn.dataset.wired = "1";
    btn.addEventListener("click", () => {
      const input = document.getElementById(btn.dataset.alvo);
      if (!input) return;
      const vaiMostrar = input.type === "password";
      input.type = vaiMostrar ? "text" : "password";
      btn.textContent = vaiMostrar ? "🙈" : "👁️";
      btn.title = vaiMostrar ? "Ocultar senha" : "Mostrar senha";
      btn.setAttribute("aria-label", btn.title);
    });
  });
}

function showLoginForm() {
  const app = document.querySelector('.app-main');
  const header = document.querySelector('.app-header');
  
  header.style.display = 'none';
  
  app.innerHTML = `
    <div style="max-width: 400px; margin: 2rem auto; padding: 2rem; background: #1a1a1a; border-radius: 1rem;">
      <div style="text-align: center; margin-bottom: 2rem;">
        <img src="/assets/logo-h-160.png" alt="Harmonia" style="width:64px; height:64px; margin: 0 auto 1rem; display:block; filter: drop-shadow(0 0 10px rgba(212,162,76,0.5));" />
        <h1 style="margin: 0; color: #fff;">Harmonia</h1>
        <p style="color: #bbb; margin: 0.5rem 0 0;">Faça login para continuar</p>
      </div>
      
      <form id="loginForm">
        <div class="field-group">
          <label for="loginEmail">E-mail</label>
          <input id="loginEmail" type="email" required>
        </div>
        <div class="field-group">
          <label for="loginPassword">Senha</label>
          <div class="campo-senha">
            <input id="loginPassword" type="password" required>
            <button type="button" class="btn-olho" data-alvo="loginPassword" title="Mostrar senha" aria-label="Mostrar senha">👁️</button>
          </div>
        </div>
        <button type="submit" class="btn primary" style="width: 100%; margin-bottom: 1rem;">Entrar</button>
      </form>
      
      <div style="text-align: center; border-top: 1px solid #333; padding-top: 1rem;">
        <p style="color: #bbb; margin-bottom: 1rem;">Não tem conta?</p>
        <button id="showRegister" class="btn" style="width: 100%;">Criar conta</button>
      </div>
      
      <div id="registerForm" style="display: none; border-top: 1px solid #333; padding-top: 1rem; margin-top: 1rem;">
        <h3 style="color: #fff; margin-bottom: 1rem;">Criar conta</h3>
        <form id="registerFormElement">
          <div class="field-group">
            <label for="registerName">Nome</label>
            <input id="registerName" type="text" required>
          </div>
          <div class="field-group">
            <label for="registerEmail">E-mail</label>
            <input id="registerEmail" type="email" required>
          </div>
          <div class="field-group">
            <label for="registerPassword">Senha</label>
            <div class="campo-senha">
              <input id="registerPassword" type="password" required minlength="6">
              <button type="button" class="btn-olho" data-alvo="registerPassword" title="Mostrar senha" aria-label="Mostrar senha">👁️</button>
            </div>
          </div>
          <div class="field-group">
            <label style="display:block; margin-bottom:0.5rem;">Sua igreja</label>
            <label style="display:flex; align-items:center; gap:0.5rem; color:var(--branco); font-weight:normal; margin-bottom:0.4rem;">
              <input type="radio" name="modoIgreja" value="criar" checked> Sou a primeira pessoa da minha igreja a usar o Harmonia
            </label>
            <label style="display:flex; align-items:center; gap:0.5rem; color:var(--branco); font-weight:normal;">
              <input type="radio" name="modoIgreja" value="entrar"> Minha igreja já usa o Harmonia (tenho um código de convite)
            </label>
          </div>
          <div class="field-group">
            <label for="registerIgrejaCampo" id="labelIgrejaCampo">Nome da igreja</label>
            <input id="registerIgrejaCampo" type="text" required placeholder="Ex: Igreja Batista Central">
          </div>
          <button type="submit" class="btn primary" style="width: 100%; margin-bottom: 1rem;">Criar conta</button>
          <button type="button" id="showLogin" class="btn" style="width: 100%;">Voltar ao login</button>
        </form>
      </div>
      
      <div id="authMessage" style="margin-top: 1rem; padding: 0.5rem; border-radius: 0.5rem; display: none;"></div>
    </div>
  `;
  
  // Event listeners
  document.getElementById('loginForm').addEventListener('submit', handleLogin);
  document.getElementById('registerFormElement').addEventListener('submit', handleRegister);
  initTogglesSenha();
  document.getElementById('showRegister').addEventListener('click', () => {
    document.getElementById('registerForm').style.display = 'block';
    document.getElementById('showRegister').style.display = 'none';
  });
  document.getElementById('showLogin').addEventListener('click', () => {
    document.getElementById('registerForm').style.display = 'none';
    document.getElementById('showRegister').style.display = 'block';
  });
  document.querySelectorAll('input[name="modoIgreja"]').forEach((radio) => {
    radio.addEventListener('change', (e) => {
      const label = document.getElementById('labelIgrejaCampo');
      const input = document.getElementById('registerIgrejaCampo');
      if (e.target.value === 'criar') {
        label.textContent = 'Nome da igreja';
        input.placeholder = 'Ex: Igreja Batista Central';
      } else {
        label.textContent = 'Código de convite';
        input.placeholder = 'Cole aqui o código recebido do admin da sua igreja';
      }
    });
  });
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  const messageEl = document.getElementById('authMessage');
  const botao = e.target.querySelector('button[type="submit"]');

  try {
    messageEl.style.display = 'block';
    messageEl.style.background = '#2563eb';
    messageEl.style.color = '#fff';
    messageEl.textContent = 'Fazendo login...';
    if (botao) { botao.disabled = true; botao.textContent = 'Entrando...'; }

    await login(email, password);
    window.location.reload();
  } catch (error) {
    messageEl.style.background = '#dc2626';
    const senhaInput = document.getElementById('loginPassword');
    const ehCredencialErrada = error.message === "E-mail ou senha incorretos.";
    messageEl.textContent = ehCredencialErrada
      ? "Senha incorreta. Verifique seus dados e tente novamente."
      : error.message;

    if (ehCredencialErrada && senhaInput) {
      senhaInput.classList.add('campo-erro', 'campo-shake');
      senhaInput.addEventListener('animationend', () => senhaInput.classList.remove('campo-shake'), { once: true });
      senhaInput.addEventListener('input', () => senhaInput.classList.remove('campo-erro'), { once: true });
      senhaInput.focus();
    }
    // O e-mail NUNCA é apagado — só a senha some se der erro, pra tentar de novo é só digitar a senha

    if (botao) { botao.disabled = false; botao.textContent = 'Entrar'; }
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById('registerName').value;
  const email = document.getElementById('registerEmail').value;
  const password = document.getElementById('registerPassword').value;
  const modoIgreja = document.querySelector('input[name="modoIgreja"]:checked').value;
  const igrejaCampo = document.getElementById('registerIgrejaCampo').value;
  const messageEl = document.getElementById('authMessage');
  
  try {
    messageEl.style.display = 'block';
    messageEl.style.background = '#2563eb';
    messageEl.style.color = '#fff';
    messageEl.textContent = 'Criando conta...';
    
    await register(name, email, password, modoIgreja, igrejaCampo);
    
    messageEl.style.background = '#059669';
    messageEl.textContent = 'Conta criada! Agora faça login.';
    
    // Resetar formulário e mostrar login
    document.getElementById('registerFormElement').reset();
    document.getElementById('showLogin').click();
  } catch (error) {
    messageEl.style.background = '#dc2626';
    messageEl.textContent = error.message;
  }
}

function showMainApp() {
  const header = document.querySelector('.app-header');
  header.style.display = 'block';

  console.log("🚀 Mostrando app principal...");
  console.log("🔑 Token atual:", authToken ? "Presente" : "Ausente");
  console.log("👤 Usuário atual:", currentUser);

  // Adicionar informações do usuário (mini-card à direita da marca, não espremido com as abas)
  const existingUserInfo = header.querySelector('.user-info');
  if (!existingUserInfo) {
    const brand = header.querySelector('.brand');

    const userInfo = document.createElement('div');
    userInfo.className = 'user-info';

    const userSpan = document.createElement('span');
    const igrejaInfo = currentUser?.igreja ? ` · ${currentUser.igreja.nome}` : '';
    const rotuloPapel = currentUser?.role === 'admin' ? 'Admin' : currentUser?.role === 'lider' ? 'Líder' : 'Membro';
    userSpan.innerHTML = `<strong>${currentUser?.name || 'Usuário'}</strong>${igrejaInfo} <span class="user-info-papel">${rotuloPapel}</span>`;

    const logoutBtn = document.createElement('button');
    logoutBtn.className = 'btn small secondary';
    logoutBtn.textContent = 'Sair';
    logoutBtn.addEventListener('click', logout);

    userInfo.appendChild(userSpan);
    userInfo.appendChild(logoutBtn);
    brand.appendChild(userInfo);
  }

  // Restaurar conteúdo principal
  initMainApp();
}

// ====== TABS (trocar telas) ======
function initTabs() {
  const buttons = document.querySelectorAll(".tab-btn");
  const sections = document.querySelectorAll(".section");

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;

      buttons.forEach((b) => b.classList.remove("active"));
      sections.forEach((s) => s.classList.remove("active"));

      btn.classList.add("active");
      document.getElementById(tab).classList.add("active");

      // Fora do Modo Palco, o cabeçalho/abas sempre voltam a aparecer normalmente
      if (tab !== "modopalco") {
        document.body.classList.remove("palco-header-oculto");
      }

      if (tab === "aniversarios") {
        renderAniversariantes();
      }
      if (tab === "dashboard") {
        carregarDashboardSeNecessario();
      }
      if (tab === "modopalco") {
        popularSelectPalco();
        requestWakeLock(true); // liga sozinho, sem toast — não depende de lembrar de ativar em Config antes
        document.body.classList.add("palco-header-oculto"); // esconde cabeçalho/abas pra dar mais espaço à cifra
      }
      if (tab === "trocas") {
        carregarTrocasSeNecessario();
      }
      if (tab === "historico") {
        carregarHistoricoSeNecessario();
      }
      if (tab === "meurepertorio") {
        carregarRepertorioSeNecessario();
      }
      if (tab === "cultos") {
        carregarCultosSeNecessario();
      }
    });
  });
}

// ====== UTIL: SANITIZAÇÃO DE TEXTO COLADO (proteção contra clipboard URL-encoded) ======
function sanitizarTextoColado(texto) {
  if (!texto) return texto;
  // Detecta padrão típico de URL-encoding (%20, %5B, %0A, %23 etc)
  const pareceEncoded = /%[0-9A-Fa-f]{2}/.test(texto) && (texto.match(/%[0-9A-Fa-f]{2}/g) || []).length >= 3;
  if (!pareceEncoded) return texto;
  try {
    return decodeURIComponent(texto);
  } catch (e) {
    // Se decodeURIComponent falhar (encoding malformado), retorna o original
    return texto;
  }
}

// ====== UTIL: TRANSPOSIÇÃO DE NOTAS / ACORDES ======
const ESCALA = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const MAPA_BEMOL = {
  Db: "C#",
  Eb: "D#",
  Gb: "F#",
  Ab: "G#",
  Bb: "A#",
};

function normalizarNota(nota) {
  if (!nota) return null;
  nota = nota.toUpperCase();
  if (MAPA_BEMOL[nota]) return MAPA_BEMOL[nota];
  return nota;
}

function transporNota(nota, semitons) {
  const n = normalizarNota(nota);
  if (!n) return nota;
  const idx = ESCALA.indexOf(n);
  if (idx === -1) return nota;
  const novoIdx = (idx + semitons + ESCALA.length) % ESCALA.length;
  return ESCALA[novoIdx];
}

function transporSimboloDeAcorde(simbolo, semitons) {
  const m = simbolo.match(/^([A-G](#|b)?)(.*)$/);
  if (!m) return simbolo;
  const raiz = m[1];
  const resto = m[3] || "";
  const novaRaiz = transporNota(raiz, semitons);
  return novaRaiz + resto;
}

function transporAcorde(acorde, semitons) {
  if (acorde.includes("/")) {
    const [principal, baixo] = acorde.split("/");
    return (
      transporSimboloDeAcorde(principal, semitons) +
      "/" +
      transporSimboloDeAcorde(baixo, semitons)
    );
  }
  return transporSimboloDeAcorde(acorde, semitons);
}

function pareceAcorde(token) {
  const limpo = token.replace(/^[\(\[]/, "").replace(/[\)\],;:]$/, "");
  return /^[A-G](#|b)?[a-zA-Z0-9º°+\-\/]*$/.test(limpo);
}

function transporLinhaDeCifra(linha, semitons) {
  const partes = linha.split(/(\s+)/); // preserva espaços
  const transpostas = partes.map((parte) => {
    if (!parte.trim()) return parte;
    if (!pareceAcorde(parte.trim())) return parte;

    const prefixo = parte.match(/^\s*/)[0] || "";
    const sufixo = parte.match(/\s*$/)[0] || "";

    const token = parte.trim();
    let base = token.replace(/^[\(\[]/, "").replace(/[\)\],;:]$/, "");
    const inicio = token.startsWith("(") || token.startsWith("[") ? token[0] : "";
    const fim =
      token.endsWith(")") || token.endsWith("]") || token.endsWith(",")
        ? token[token.length - 1]
        : "";

    const resultado = transporAcorde(base, semitons);
    return prefixo + inicio + resultado + fim + sufixo;
  });

  return transpostas.join("");
}

function transporTextoCifra(cifra, semitons) {
  if (!cifra) return "";
  const linhas = cifra.split("\n");
  return linhas.map((linha) => transporLinhaDeCifra(linha, semitons)).join("\n");
}

// ====== MÚSICAS COM API ======
async function loadMusicas() {
  try {
    musicas = await apiCall("/musicas");
    renderMusicas();
    renderMusicasNoSelectCulto();
  } catch (error) {
    console.error("Erro ao carregar músicas:", error);
    // Fallback para dados locais
    musicas = loadData(STORAGE_KEYS.MUSICAS);
    renderMusicas();
    renderMusicasNoSelectCulto();
  }
}

let filtroMusicasTexto = "";

function initMusicas() {
  loadMusicas();

  const cardNova = document.getElementById("cardNovaMusica");
  if (cardNova) cardNova.style.display = currentUser?.souLideranca ? "block" : "none";

  const selectVocalista = document.getElementById("musicaVocalista");
  if (selectVocalista) popularSelectVocalista();

  document.getElementById("musicasBusca")?.addEventListener("input", (e) => {
    filtroMusicasTexto = e.target.value.trim().toLowerCase();
    renderMusicas();
  });

  const form = document.getElementById("formMusica");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const titulo = document.getElementById("musicaTitulo").value.trim();
    const autor = document.getElementById("musicaAutor").value.trim();
    const tom = document.getElementById("musicaTom").value.trim();
    const bpm = document.getElementById("musicaBpm").value ? Number(document.getElementById("musicaBpm").value) : null;
    const categoria = document.getElementById("musicaCategoria").value;
    const tags = document.getElementById("musicaTags").value.split(",").map((t) => t.trim()).filter(Boolean);
    const vocalistaId = document.getElementById("musicaVocalista").value || null;
    const link = document.getElementById("musicaLink").value.trim();
    const cifra = sanitizarTextoColado(document.getElementById("musicaCifra").value);
    const obs = document.getElementById("musicaObs").value.trim();

    if (!titulo) {
      showNotification("Informe o título da música.", "error");
      return;
    }

    const botaoSalvar = document.getElementById("btnSalvarMusica");
    const textoOriginal = botaoSalvar.textContent;
    botaoSalvar.disabled = true;
    botaoSalvar.textContent = "Salvando...";

    try {
      await apiCall("/musicas", {
        method: "POST",
        body: JSON.stringify({
          titulo,
          autor,
          tomOriginal: tom,
          bpm,
          categoria,
          tags,
          vocalistaId,
          link,
          observacoes: obs,
          cifra,
        }),
      });

      form.reset();
      await loadMusicas();

      showNotification("Música criada com sucesso!", "success");
    } catch (error) {
      showNotification("Erro ao criar música: " + error.message, "error");
    } finally {
      botaoSalvar.disabled = false;
      botaoSalvar.textContent = textoOriginal;
    }
  });
}

function renderMusicas() {
  const listaEl = document.getElementById("listaMusicas");
  listaEl.innerHTML = "";

  if (musicas.length === 0) {
    listaEl.innerHTML =
      "<p style='font-size:0.85rem;color:var(--texto-secundario);'>Nenhuma música cadastrada ainda.</p>";
    return;
  }

  const filtradas = musicas.filter((m) => {
    if (!filtroMusicasTexto) return true;
    const vocalista = m.vocalistaId ? perfisDaIgreja.find((p) => p.id === m.vocalistaId)?.nome || "" : "";
    const alvo = [m.titulo, m.autor, m.tomOriginal, m.categoria, (m.tags || []).join(" "), vocalista]
      .filter(Boolean).join(" ").toLowerCase();
    return alvo.includes(filtroMusicasTexto);
  });

  if (filtradas.length === 0) {
    listaEl.innerHTML =
      "<p style='font-size:0.85rem;color:var(--texto-secundario);'>Nenhuma música encontrada.</p>";
    return;
  }

  filtradas
    .slice()
    .sort((a, b) => a.titulo.localeCompare(b.titulo))
    .forEach((m) => {
      const item = document.createElement("div");
      item.className = "list-item";

      const vocalista = m.vocalistaId ? perfisDaIgreja.find((p) => p.id === m.vocalistaId)?.nome : null;
      const tags = (m.tags || []).map((t) => `<span class="membro-tag">${t}</span>`).join("");

      const main = document.createElement("div");
      main.className = "list-item-main";
      main.innerHTML = `
        <strong>${m.titulo}</strong>
        <span>${[m.autor, m.tomOriginal ? `Tom: ${m.tomOriginal}` : null, m.categoria].filter(Boolean).join(" • ") || "-"}</span>
        ${vocalista ? `<span style="font-size:0.75rem;color:var(--texto-secundario);">🎤 ${vocalista}</span>` : ""}
        ${tags ? `<div class="membro-tags" style="margin-top:0.2rem;">${tags}</div>` : ""}
        ${
          m.link
            ? `<a href="${m.link}" target="_blank" style="font-size:0.75rem;color:#2ecc71;">Abrir link</a>`
            : ""
        }
        ${
          m.cifra
            ? `<span style="font-size:0.75rem;color:var(--texto-secundario);">Cifra cadastrada</span>`
            : ""
        }
      `;

      const btnMapa = document.createElement("button");
      btnMapa.className = "btn primary small";
      btnMapa.textContent = "Mapa";

      btnMapa.addEventListener("click", (e) => {
        e.stopPropagation();
        mostrarMapaMusica(m);
      });

      item.appendChild(main);
      item.appendChild(btnMapa);
      listaEl.appendChild(item);
    });
}

// Estado do picker de músicas do culto: fonte da verdade em vez do <select multiple>
// (mais claro pra usar no celular: toca pra adicionar, cada item já mostra a ordem).
let cultoMusicasEscolhidas = []; // [{ valor: "musica:id" | "pessoal:id", titulo, tom, origem }]

function musicaJaEscolhida(valor) {
  return cultoMusicasEscolhidas.some((m) => m.valor === valor);
}

function adicionarMusicaAoCulto(valor, titulo, tom, origem) {
  if (musicaJaEscolhida(valor)) return;
  cultoMusicasEscolhidas.push({ valor, titulo, tom, origem });
  renderMusicasNoSelectCulto();
  renderCultoMusicasSelecionadas();
}

function removerMusicaDoCulto(valor) {
  cultoMusicasEscolhidas = cultoMusicasEscolhidas.filter((m) => m.valor !== valor);
  renderMusicasNoSelectCulto();
  renderCultoMusicasSelecionadas();
}

function moverMusicaDoCulto(valor, direcao) {
  const i = cultoMusicasEscolhidas.findIndex((m) => m.valor === valor);
  const j = i + direcao;
  if (i < 0 || j < 0 || j >= cultoMusicasEscolhidas.length) return;
  [cultoMusicasEscolhidas[i], cultoMusicasEscolhidas[j]] = [cultoMusicasEscolhidas[j], cultoMusicasEscolhidas[i]];
  renderCultoMusicasSelecionadas();
}

function renderMusicasNoSelectCulto() {
  const container = document.getElementById("cultoMusicasDisponiveis");
  if (!container) return;

  container.innerHTML = "";

  if (musicas.length === 0 && repertorioPessoal.length === 0) {
    container.innerHTML = `<p class="musica-picker-vazio">Cadastre músicas primeiro (no catálogo da igreja ou no seu Meu Repertório).</p>`;
    return;
  }

  const montaGrupo = (titulo, lista, origem, tomKey) => {
    if (lista.length === 0) return;
    const h = document.createElement("div");
    h.className = "musica-picker-grupo-titulo";
    h.textContent = titulo;
    container.appendChild(h);

    lista
      .slice()
      .sort((a, b) => a.titulo.localeCompare(b.titulo))
      .forEach((m) => {
        const valor = `${origem}:${m.id}`;
        const tom = m[tomKey] || "-";
        const jaEscolhida = musicaJaEscolhida(valor);

        const item = document.createElement("div");
        item.className = "musica-picker-item" + (jaEscolhida ? " ja-selecionada" : "");
        item.innerHTML = `
          <span>${m.titulo} (${tom})</span>
          <span class="musica-picker-item-check">${jaEscolhida ? "✓ adicionada" : "+ tocar pra adicionar"}</span>
        `;
        if (!jaEscolhida) {
          item.addEventListener("click", () => adicionarMusicaAoCulto(valor, m.titulo, tom, origem));
        }
        container.appendChild(item);
      });
  };

  montaGrupo("Catálogo da igreja", musicas, "musica", "tomOriginal");
  montaGrupo("Meu repertório pessoal", repertorioPessoal, "pessoal", "tom_original");
}

function renderCultoMusicasSelecionadas() {
  const lista = document.getElementById("cultoMusicasSelecionadas");
  const vazioMsg = document.getElementById("cultoMusicasVazioMsg");
  const contagem = document.getElementById("cultoMusicasContagem");
  if (!lista) return;

  if (contagem) contagem.textContent = cultoMusicasEscolhidas.length;
  if (vazioMsg) vazioMsg.style.display = cultoMusicasEscolhidas.length === 0 ? "block" : "none";

  lista.innerHTML = cultoMusicasEscolhidas.map((m, i) => `
    <li class="musica-picker-selecionada-item">
      <span class="musica-picker-selecionada-ordem">${i + 1}</span>
      <span class="musica-picker-selecionada-titulo">
        ${m.titulo} (${m.tom})
        ${m.origem === "pessoal" ? '<span class="musica-picker-selecionada-origem">meu repertório</span>' : ""}
      </span>
      <span class="musica-picker-acoes">
        <button type="button" data-acao="subir" data-valor="${m.valor}" ${i === 0 ? "disabled" : ""} title="Subir">▲</button>
        <button type="button" data-acao="descer" data-valor="${m.valor}" ${i === cultoMusicasEscolhidas.length - 1 ? "disabled" : ""} title="Descer">▼</button>
        <button type="button" class="remover" data-acao="remover" data-valor="${m.valor}" title="Remover">✕</button>
      </span>
    </li>
  `).join("");

  lista.querySelectorAll("button[data-acao]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const valor = btn.dataset.valor;
      const acao = btn.dataset.acao;
      if (acao === "remover") removerMusicaDoCulto(valor);
      if (acao === "subir") moverMusicaDoCulto(valor, -1);
      if (acao === "descer") moverMusicaDoCulto(valor, 1);
    });
  });
}

function mostrarMapaMusica(musica) {
  const card = document.getElementById("musicaDetalhesCard");
  const el = document.getElementById("musicaDetalhes");
  if (!card || !el) return;

  const tomOriginal = musica.tomOriginal
    ? musica.tomOriginal.toUpperCase()
    : null;
  let offset = 0;

  function calcularTomAtual() {
    if (!tomOriginal) return "-";
    return transporNota(tomOriginal, offset);
  }

  function renderConteudo() {
    const cifraTransposta = transporTextoCifra(musica.cifra || "", offset);

    const linkHtml = musica.link
      ? `<a href="${musica.link}" target="_blank" style="color:#2ecc71;">Abrir cifra cadastrada</a>`
      : `<a href="https://www.cifraclub.com.br/?q=${encodeURIComponent(
          musica.titulo
        )}" target="_blank" style="color:#2ecc71;">Buscar cifra no Cifra Club</a>`;

    el.innerHTML = `
      <p><strong>${musica.titulo}</strong></p>
      <p>Tom original: ${tomOriginal || "-"}</p>
      <div style="margin:0.5rem 0;">
        <button id="diminuirTom" class="btn small" style="margin-right:0.4rem;">-</button>
        Tom atual: <span id="tomAtual">${calcularTomAtual()}</span>
        <button id="aumentarTom" class="btn small" style="margin-left:0.4rem;">+</button>
      </div>

      <p style="margin-top:0.6rem;">${linkHtml}</p>

      ${
        cifraTransposta
          ? `
        <p style="margin-top:0.6rem;"><strong>Cifra transposta:</strong></p>
        <pre style="background:#101010;color:#e8dfd2;padding:0.6rem;border-radius:0.5rem;white-space:pre-wrap;font-size:0.8rem;">${cifraTransposta}</pre>
      `
          : ""
      }

      <p style="margin-top:0.6rem;"><strong>Observações:</strong></p>
      <p>${musica.observacoes || "Nenhuma observação cadastrada."}</p>
    `;

    const btnMenos = el.querySelector("#diminuirTom");
    const btnMais = el.querySelector("#aumentarTom");
    const tomAtualSpan = el.querySelector("#tomAtual");

    if (btnMenos && btnMais && tomAtualSpan) {
      btnMenos.addEventListener("click", () => {
        offset = offset - 1;
        tomAtualSpan.textContent = calcularTomAtual();
        const novoTexto = transporTextoCifra(musica.cifra || "", offset);
        const pre = el.querySelector("pre");
        if (pre) pre.textContent = novoTexto;
      });

      btnMais.addEventListener("click", () => {
        offset = offset + 1;
        tomAtualSpan.textContent = calcularTomAtual();
        const novoTexto = transporTextoCifra(musica.cifra || "", offset);
        const pre = el.querySelector("pre");
        if (pre) pre.textContent = novoTexto;
      });
    }
  }

  renderConteudo();
  card.style.display = "block";
}

// ====== MEU REPERTÓRIO (biblioteca particular, vinculada ao dono) ======
let repertorioPessoal = [];
let filtroRepertorioTexto = "";

async function carregarRepertorioSeNecessario() {
  if (!precisaRecarregar("repertorio")) return;
  await loadRepertorioPessoal();
  marcarCarregado("repertorio");
}

async function loadRepertorioPessoal() {
  try {
    const { data, error } = await supabase.from("repertorio_pessoal")
      .select("*").eq("perfil_id", currentUser.id).order("titulo");
    if (error) throw error;
    repertorioPessoal = data;
    renderRepertorioPessoal();
    renderMusicasNoSelectCulto();
  } catch (error) {
    console.error("Erro ao carregar repertório pessoal:", error);
  }
}

function limparFormRepertorio() {
  const form = document.getElementById("formRepertorioPessoal");
  form.reset();
  document.getElementById("repertorioEditandoId").value = "";
  document.getElementById("tituloFormRepertorio").textContent = "Nova música no meu repertório";
  document.getElementById("btnSalvarRepertorio").textContent = "Salvar na minha biblioteca";
  document.getElementById("btnCancelarEdicaoRepertorio").style.display = "none";
}

function initMeuRepertorio() {
  document.getElementById("btnCancelarEdicaoRepertorio").addEventListener("click", limparFormRepertorio);

  document.getElementById("repertorioBusca").addEventListener("input", (e) => {
    filtroRepertorioTexto = e.target.value.trim().toLowerCase();
    renderRepertorioPessoal();
  });

  const form = document.getElementById("formRepertorioPessoal");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const editandoId = document.getElementById("repertorioEditandoId").value || null;
    const titulo = document.getElementById("repertorioTitulo").value.trim();
    const autor = document.getElementById("repertorioAutor").value.trim();
    const tom = document.getElementById("repertorioTom").value.trim();
    const categoria = document.getElementById("repertorioCategoria").value;
    const tags = document.getElementById("repertorioTags").value.split(",").map((t) => t.trim()).filter(Boolean);
    const link = document.getElementById("repertorioLink").value.trim();
    const cifra = sanitizarTextoColado(document.getElementById("repertorioCifra").value);
    const obs = document.getElementById("repertorioObs").value.trim();

    if (!titulo) {
      showNotification("Informe o título da música.", "error");
      return;
    }

    const payload = {
      titulo, autor: autor || null, tom_original: tom || null, categoria: categoria || null, tags,
      link: link || null, cifra: cifra || null, observacoes: obs || null,
    };

    try {
      if (editandoId) {
        const { error } = await supabase.from("repertorio_pessoal")
          .update({ ...payload, atualizado_em: new Date().toISOString() }).eq("id", editandoId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("repertorio_pessoal")
          .insert({ igreja_id: currentUser.igreja.id, perfil_id: currentUser.id, ...payload });
        if (error) throw error;
      }

      limparFormRepertorio();
      await loadRepertorioPessoal();
      showNotification(editandoId ? "Música atualizada!" : "Adicionada ao seu repertório!", "success");
    } catch (error) {
      showNotification("Erro ao salvar: " + error.message, "error");
    }
  });
}

function renderRepertorioPessoal() {
  const listaEl = document.getElementById("listaRepertorioPessoal");
  listaEl.innerHTML = "";

  const filtradas = repertorioPessoal.filter((m) => {
    if (!filtroRepertorioTexto) return true;
    const alvo = [m.titulo, m.autor, m.tom_original, m.categoria, (m.tags || []).join(" ")]
      .filter(Boolean).join(" ").toLowerCase();
    return alvo.includes(filtroRepertorioTexto);
  });

  if (filtradas.length === 0) {
    listaEl.innerHTML = repertorioPessoal.length === 0
      ? "<p style='font-size:0.85rem;color:var(--texto-secundario);'>Sua biblioteca está vazia. Adicione a primeira música ao lado.</p>"
      : "<p style='font-size:0.85rem;color:var(--texto-secundario);'>Nenhuma música encontrada.</p>";
    return;
  }

  filtradas
    .slice()
    .sort((a, b) => a.titulo.localeCompare(b.titulo))
    .forEach((m) => {
      const item = document.createElement("div");
      item.className = "list-item";

      const tags = (m.tags || []).map((t) => `<span class="membro-tag">${t}</span>`).join("");

      const main = document.createElement("div");
      main.className = "list-item-main";
      main.innerHTML = `
        <strong>${m.titulo}</strong>
        <span>${[m.autor, m.tom_original ? `Tom: ${m.tom_original}` : null, m.categoria].filter(Boolean).join(" • ") || "-"}</span>
        ${tags ? `<div class="membro-tags" style="margin-top:0.2rem;">${tags}</div>` : ""}
        ${m.link ? `<a href="${m.link}" target="_blank" style="font-size:0.75rem;color:#2ecc71;">Abrir link</a>` : ""}
      `;

      const acoes = document.createElement("div");
      acoes.style.display = "flex";
      acoes.style.gap = "0.3rem";
      acoes.style.flexWrap = "wrap";

      const btnMapa = document.createElement("button");
      btnMapa.className = "btn primary small";
      btnMapa.textContent = "Mapa";
      btnMapa.addEventListener("click", (e) => { e.stopPropagation(); mostrarMapaRepertorioPessoal(m); });

      const btnEditar = document.createElement("button");
      btnEditar.className = "btn secondary small";
      btnEditar.textContent = "Editar";
      btnEditar.addEventListener("click", (e) => {
        e.stopPropagation();
        document.getElementById("repertorioEditandoId").value = m.id;
        document.getElementById("repertorioTitulo").value = m.titulo;
        document.getElementById("repertorioAutor").value = m.autor || "";
        document.getElementById("repertorioTom").value = m.tom_original || "";
        document.getElementById("repertorioCategoria").value = m.categoria || "";
        document.getElementById("repertorioTags").value = (m.tags || []).join(", ");
        document.getElementById("repertorioLink").value = m.link || "";
        document.getElementById("repertorioCifra").value = m.cifra || "";
        document.getElementById("repertorioObs").value = m.observacoes || "";
        document.getElementById("tituloFormRepertorio").textContent = "Editar música";
        document.getElementById("btnSalvarRepertorio").textContent = "Salvar alterações";
        document.getElementById("btnCancelarEdicaoRepertorio").style.display = "inline-block";
        document.getElementById("formRepertorioPessoal").scrollIntoView({ behavior: "smooth", block: "start" });
      });

      const btnExcluir = document.createElement("button");
      btnExcluir.className = "btn danger small";
      btnExcluir.textContent = "Excluir";
      btnExcluir.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!(await confirmarAcao(`Excluir "${m.titulo}" do seu repertório?`, { titulo: "Excluir música", textoConfirmar: "Excluir" }))) return;
        try {
          const { error } = await supabase.from("repertorio_pessoal").delete().eq("id", m.id);
          if (error) throw error;
          await loadRepertorioPessoal();
          showNotification("Música removida.", "success");
        } catch (error) {
          showNotification("Erro ao excluir: " + error.message, "error");
        }
      });

      acoes.appendChild(btnMapa);
      acoes.appendChild(btnEditar);
      acoes.appendChild(btnExcluir);

      item.appendChild(main);
      item.appendChild(acoes);
      listaEl.appendChild(item);
    });
}

function mostrarMapaRepertorioPessoal(musica) {
  const card = document.getElementById("repertorioDetalhesCard");
  const el = document.getElementById("repertorioDetalhes");
  if (!card || !el) return;

  const tomOriginal = musica.tom_original ? musica.tom_original.toUpperCase() : null;
  let offset = 0;

  function calcularTomAtual() {
    return tomOriginal ? transporNota(tomOriginal, offset) : "-";
  }

  function renderConteudo() {
    const cifraTransposta = transporTextoCifra(musica.cifra || "", offset);
    el.innerHTML = `
      <p><strong>${musica.titulo}</strong></p>
      <p>Tom original: ${tomOriginal || "-"}</p>
      <div style="margin:0.5rem 0;">
        <button id="repDiminuirTom" class="btn small" style="margin-right:0.4rem;">-</button>
        Tom atual: <span id="repTomAtual">${calcularTomAtual()}</span>
        <button id="repAumentarTom" class="btn small" style="margin-left:0.4rem;">+</button>
      </div>
      ${musica.link ? `<p style="margin-top:0.6rem;"><a href="${musica.link}" target="_blank" style="color:#2ecc71;">Abrir link</a></p>` : ""}
      ${cifraTransposta ? `<p style="margin-top:0.6rem;"><strong>Cifra transposta:</strong></p>
        <pre style="background:#101010;color:#e8dfd2;padding:0.6rem;border-radius:0.5rem;white-space:pre-wrap;font-size:0.8rem;">${cifraTransposta}</pre>` : ""}
      <p style="margin-top:0.6rem;"><strong>Observações:</strong></p>
      <p>${musica.observacoes || "Nenhuma observação cadastrada."}</p>
    `;

    const btnMenos = el.querySelector("#repDiminuirTom");
    const btnMais = el.querySelector("#repAumentarTom");
    const tomAtualSpan = el.querySelector("#repTomAtual");

    btnMenos?.addEventListener("click", () => {
      offset -= 1;
      tomAtualSpan.textContent = calcularTomAtual();
      const pre = el.querySelector("pre");
      if (pre) pre.textContent = transporTextoCifra(musica.cifra || "", offset);
    });
    btnMais?.addEventListener("click", () => {
      offset += 1;
      tomAtualSpan.textContent = calcularTomAtual();
      const pre = el.querySelector("pre");
      if (pre) pre.textContent = transporTextoCifra(musica.cifra || "", offset);
    });
  }

  renderConteudo();
  card.style.display = "block";
}


let perfisDaIgreja = [];
let avatarSelecionado = null; // File escolhido no input, aguardando upload

async function carregarPerfisDaIgreja() {
  const { data, error } = await supabase.from("perfis").select("id, nome, role")
    .eq("igreja_id", currentUser.igreja.id).order("nome");
  if (!error) perfisDaIgreja = data;
}

function popularSelectVocalista() {
  const selectVocalista = document.getElementById("musicaVocalista");
  if (selectVocalista && perfisDaIgreja.length) {
    const valorAtual = selectVocalista.value;
    selectVocalista.innerHTML = `<option value="">Sem vocalista definido</option>` +
      perfisDaIgreja.map((p) => `<option value="${p.id}">${p.nome}</option>`).join("");
    selectVocalista.value = valorAtual;
  }
}

async function loadMembros() {
  try {
    await carregarPerfisDaIgreja();
    popularSelectVocalista();
    const { data, error } = await supabase.from("membros").select("*").order("nome");
    if (error) throw error;
    membros = data;
    renderMembros();
  } catch (error) {
    console.error("Erro ao carregar membros:", error);
    membros = loadData(STORAGE_KEYS.MEMBROS);
    renderMembros();
  }
}

function iniciaisDoNome(nome) {
  return (nome || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("");
}

function limparFormMembro() {
  const form = document.getElementById("formMembro");
  form.reset();
  document.getElementById("membroEditandoId").value = "";
  document.getElementById("tituloFormMembro").textContent = "Novo membro";
  document.getElementById("btnSalvarMembro").textContent = "Salvar membro";
  document.getElementById("btnCancelarEdicaoMembro").style.display = "none";
  document.getElementById("membroFotoPreview").src = "/assets/avatar-padrao.svg";
  document.getElementById("campoMembroStatus").style.display = "block";
  document.getElementById("campoMembroPerfil").style.display = "block";
  avatarSelecionado = null;
  document.querySelectorAll("#membroInstrumentosBox input[type=checkbox]").forEach((cb) => (cb.checked = false));

  // Volta a esconder o card pra quem não é líder (só fica visível durante "Editar meu perfil")
  const cardNovoMembro = document.getElementById("cardNovoMembro");
  if (cardNovoMembro && !currentUser?.souLideranca) cardNovoMembro.style.display = "none";
}

function preencherFormMembroParaEdicao(m) {
  const cardNovoMembro = document.getElementById("cardNovoMembro");
  if (cardNovoMembro) cardNovoMembro.style.display = "block";

  document.getElementById("membroEditandoId").value = m.id;
  document.getElementById("membroNome").value = m.nome || "";
  document.getElementById("membroVoz").value = m.voz || "";
  document.getElementById("membroFuncao").value = m.funcao || "";
  document.getElementById("membroAniversario").value = m.aniversario || "";
  document.getElementById("membroWhatsapp").value = m.whatsapp || "";
  document.getElementById("membroEmail").value = m.email || "";
  document.getElementById("membroBio").value = m.bio || "";
  document.getElementById("membroDataEntrada").value = m.data_entrada || "";
  document.getElementById("membroDisponibilidade").value = m.disponibilidade || "";
  document.getElementById("membroStatus").value = String(m.ativo !== false);
  document.getElementById("membroPerfil").value = m.perfil_id || "";
  document.getElementById("membroFotoPreview").src = m.foto_url || "/assets/avatar-padrao.svg";

  // Status e vínculo de conta são decisão de liderança — membro comum editando o
  // próprio cadastro não deve mexer nisso (evita se marcar inativo sem querer, etc.)
  const podeVerCamposDeLideranca = currentUser?.souLideranca;
  document.getElementById("campoMembroStatus").style.display = podeVerCamposDeLideranca ? "block" : "none";
  document.getElementById("campoMembroPerfil").style.display = podeVerCamposDeLideranca ? "block" : "none";

  const instrumentos = m.instrumentos || [];
  const outros = [];
  document.querySelectorAll("#membroInstrumentosBox input[type=checkbox]").forEach((cb) => {
    cb.checked = instrumentos.includes(cb.value);
  });
  instrumentos.forEach((i) => {
    const existe = document.querySelector(`#membroInstrumentosBox input[value="${i}"]`);
    if (!existe) outros.push(i);
  });
  document.getElementById("membroInstrumentosOutro").value = outros.join(", ");

  document.getElementById("tituloFormMembro").textContent = "Editar membro";
  document.getElementById("btnSalvarMembro").textContent = "Salvar alterações";
  document.getElementById("btnCancelarEdicaoMembro").style.display = "inline-block";
  document.getElementById("formMembro").scrollIntoView({ behavior: "smooth", block: "start" });
}

function coletarInstrumentosDoForm() {
  const marcados = Array.from(document.querySelectorAll("#membroInstrumentosBox input[type=checkbox]:checked")).map((cb) => cb.value);
  const outros = document.getElementById("membroInstrumentosOutro").value
    .split(",").map((s) => s.trim()).filter(Boolean);
  return [...marcados, ...outros];
}

// Faz upload da foto pro bucket "avatars" no caminho {igreja_id}/{membro_id}.ext e devolve a URL pública
async function enviarFotoMembro(membroId, file) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const caminho = `${currentUser.igreja.id}/${membroId}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(caminho, file, { upsert: true, cacheControl: "3600" });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from("avatars").getPublicUrl(caminho);
  return `${data.publicUrl}?v=${Date.now()}`; // ?v= evita cache de foto antiga
}

function initMembros() {
  loadMembros();

  const cardNovoMembro = document.getElementById("cardNovoMembro");
  if (cardNovoMembro) cardNovoMembro.style.display = currentUser?.souLideranca ? "block" : "none";

  const fotoInput = document.getElementById("membroFoto");
  fotoInput.addEventListener("change", () => {
    const file = fotoInput.files[0];
    avatarSelecionado = file || null;
    if (file) {
      document.getElementById("membroFotoPreview").src = URL.createObjectURL(file);
    }
  });

  document.getElementById("btnCancelarEdicaoMembro").addEventListener("click", limparFormMembro);

  const form = document.getElementById("formMembro");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const editandoId = document.getElementById("membroEditandoId").value || null;
    const nome = document.getElementById("membroNome").value.trim();
    const voz = document.getElementById("membroVoz").value;
    const funcao = document.getElementById("membroFuncao").value.trim();
    const aniversario = document.getElementById("membroAniversario").value || null;
    const perfilId = document.getElementById("membroPerfil").value || null;
    const whatsapp = document.getElementById("membroWhatsapp").value.trim() || null;
    const email = document.getElementById("membroEmail").value.trim() || null;
    const bio = document.getElementById("membroBio").value.trim() || null;
    const dataEntrada = document.getElementById("membroDataEntrada").value || null;
    const disponibilidade = document.getElementById("membroDisponibilidade").value.trim() || null;
    const ativo = document.getElementById("membroStatus").value === "true";
    const instrumentos = coletarInstrumentosDoForm();

    if (!nome) {
      showNotification("Informe o nome do membro.", "error");
      return;
    }

    const payload = {
      nome, voz, funcao, aniversario, perfil_id: perfilId, whatsapp, email, bio,
      data_entrada: dataEntrada, disponibilidade, ativo, instrumentos,
    };

    const botaoSalvar = document.getElementById("btnSalvarMembro");
    const textoOriginalBotao = botaoSalvar.textContent;
    botaoSalvar.disabled = true;
    botaoSalvar.textContent = "Salvando...";

    try {
      let membroId = editandoId;

      if (editandoId) {
        const { error } = await supabase.from("membros").update(payload).eq("id", editandoId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("membros")
          .insert({ igreja_id: currentUser.igreja.id, ...payload })
          .select().single();
        if (error) throw error;
        membroId = data.id;
      }

      if (avatarSelecionado) {
        const url = await enviarFotoMembro(membroId, avatarSelecionado);
        await supabase.from("membros").update({ foto_url: url }).eq("id", membroId);
      }

      limparFormMembro();
      await loadMembros();
      showNotification(editandoId ? "Membro atualizado!" : "Membro cadastrado com sucesso!", "success");
    } catch (error) {
      showNotification("Erro ao salvar membro: " + error.message, "error");
    } finally {
      botaoSalvar.disabled = false;
      botaoSalvar.textContent = textoOriginalBotao;
    }
  });
}

function renderMembros() {
  const listaEl = document.getElementById("listaMembros");
  listaEl.innerHTML = "";
  listaEl.className = "membros-grid";

  document.getElementById("membroPerfil").innerHTML = `<option value="">Sem conta no app</option>` +
    perfisDaIgreja.map((p) => `<option value="${p.id}">${p.nome}</option>`).join("");

  if (membros.length === 0) {
    listaEl.innerHTML =
      "<p style='font-size:0.85rem;color:var(--texto-secundario);'>Nenhum membro cadastrado ainda.</p>";
    return;
  }

  membros
    .slice()
    .sort((a, b) => a.nome.localeCompare(b.nome))
    .forEach((m) => {
      const card = document.createElement("div");
      card.className = "membro-card" + (m.ativo === false ? " inativo" : "");

      const aniversario = m.aniversario ? new Date(m.aniversario + "T00:00:00").toLocaleDateString("pt-BR") : null;
      const perfilVinculado = m.perfil_id ? perfisDaIgreja.find((p) => p.id === m.perfil_id) : null;
      const papel = perfilVinculado?.role;

      const badgesPapel = papel === "admin"
        ? `<span class="badge badge-admin">Admin</span>`
        : papel === "lider"
        ? `<span class="badge badge-lider">Líder</span>`
        : "";

      const badgeStatus = m.ativo === false
        ? `<span class="badge badge-inativo">Inativo</span>`
        : `<span class="badge badge-ativo">Ativo</span>`;

      const tags = (m.instrumentos || []).map((i) => `<span class="membro-tag">${i}</span>`).join("");

      let infoLinhas = "";
      if (m.whatsapp) infoLinhas += `<div class="membro-info-linha">📱 ${m.whatsapp}</div>`;
      if (m.email) infoLinhas += `<div class="membro-info-linha">✉️ ${m.email}</div>`;
      if (aniversario) infoLinhas += `<div class="membro-info-linha">🎂 ${aniversario}</div>`;
      if (m.disponibilidade) infoLinhas += `<div class="membro-info-linha">🗓️ ${m.disponibilidade}</div>`;
      if (m.bio) infoLinhas += `<div class="membro-info-linha">${m.bio}</div>`;

      let acoes = "";
      const ehMeuProprioCadastro = m.perfil_id === currentUser.id;

      if (currentUser?.souLideranca) {
        acoes += `<button class="btn secondary" onclick='editarMembroPorId("${m.id}")'>Editar</button>`;
        acoes += `<button class="btn danger" onclick="excluirMembro('${m.id}', '${m.nome.replace(/'/g, "")}')">Excluir</button>`;
        if (perfilVinculado && papel !== "admin") {
          if (papel === "lider") {
            if (perfilVinculado.id === currentUser.id || currentUser.role === "admin") {
              acoes += `<button class="btn warning" onclick="removerLiderancaMembro('${perfilVinculado.id}')">Remover liderança</button>`;
            }
          } else {
            acoes += `<button class="btn success" onclick="tornarLiderMembro('${perfilVinculado.id}')">Tornar líder</button>`;
          }
        }
      } else if (ehMeuProprioCadastro) {
        acoes += `<button class="btn secondary" onclick='editarMembroPorId("${m.id}")'>Editar meu perfil</button>`;
      }

      card.innerHTML = `
        <div class="membro-card-topo">
          <img class="membro-avatar" src="${m.foto_url || "/assets/avatar-padrao.svg"}" alt="${m.nome}">
          <div class="membro-nome-linha">
            <strong title="${m.nome}">${m.nome}</strong>
            <span class="membro-cargo">${m.funcao || m.voz || "—"}</span>
          </div>
        </div>
        <div>${badgeStatus} ${badgesPapel}</div>
        ${tags ? `<div class="membro-tags">${tags}</div>` : ""}
        ${infoLinhas}
        ${acoes ? `<div class="membro-card-acoes">${acoes}</div>` : ""}
      `;

      listaEl.appendChild(card);
    });
}

function editarMembroPorId(membroId) {
  const m = membros.find((x) => x.id === membroId);
  if (m) preencherFormMembroParaEdicao(m);
}

async function excluirMembro(membroId, nome) {
  const ok = await confirmarAcao(`Tem certeza que deseja excluir "${nome}"? Essa ação não pode ser desfeita.`, { titulo: "Excluir membro", textoConfirmar: "Excluir" });
  if (!ok) return;
  try {
    const { error } = await supabase.rpc("excluir_membro", { p_membro_id: membroId });
    if (error) throw error;
    await loadMembros();
    showNotification("Membro excluído.", "success");
  } catch (error) {
    showNotification("Erro ao excluir: " + error.message, "error");
  }
}

async function tornarLiderMembro(perfilId) {
  try {
    const { error } = await supabase.rpc("promover_lider", { p_perfil_id: perfilId });
    if (error) throw error;
    await loadMembros();
    showNotification("Agora essa pessoa é líder.", "success");
  } catch (error) {
    showNotification("Erro ao promover: " + error.message, "error");
  }
}

async function removerLiderancaMembro(perfilId) {
  const ok = await confirmarAcao("Remover a liderança dessa pessoa? Ela continua no ministério, só deixa de ser líder.", { titulo: "Remover liderança", textoConfirmar: "Remover", perigo: false });
  if (!ok) return;
  try {
    const { error } = await supabase.rpc("remover_lideranca", { p_perfil_id: perfilId });
    if (error) throw error;
    await loadMembros();
    // se a pessoa removeu a própria liderança, atualiza o currentUser em memória
    if (perfilId === currentUser.id) {
      currentUser.role = "member";
      currentUser.souLideranca = false;
      saveAuthData(authToken, currentUser);
      const papelBadge = document.querySelector(".user-info-papel");
      if (papelBadge) papelBadge.textContent = "Membro";
      const cardConvidar = document.getElementById("cardConvidarMembro");
      if (cardConvidar) cardConvidar.style.display = "none";
      const btnCriar = document.getElementById("btnCriarEscala");
      if (btnCriar) btnCriar.style.display = "none";
    }
    showNotification("Liderança removida.", "success");
  } catch (error) {
    showNotification("Erro ao remover liderança: " + error.message, "error");
  }
}

async function vincularContaMembro(membroId, perfilId) {
  try {
    const { error } = await supabase.from("membros").update({ perfil_id: perfilId || null }).eq("id", membroId);
    if (error) throw error;
    await loadMembros();
    showNotification("Vínculo atualizado!", "success");
  } catch (error) {
    showNotification("Erro ao vincular: " + error.message, "error");
  }
}

// ====== ANIVERSÁRIOS ======
function renderAniversariantes() {
  const listaEl = document.getElementById("listaAniversariantes");
  listaEl.innerHTML = "";

  if (membros.length === 0) {
    listaEl.innerHTML =
      "<p style='font-size:0.85rem;color:var(--texto-secundario);'>Nenhum membro cadastrado.</p>";
    return;
  }

  const mesAtual = new Date().getMonth();
  const aniversariantes = membros.filter((m) => {
    if (!m.aniversario) return false;
    const d = new Date(m.aniversario + "T00:00:00");
    return d.getMonth() === mesAtual;
  });

  if (aniversariantes.length === 0) {
    listaEl.innerHTML =
      "<p style='font-size:0.85rem;color:var(--texto-secundario);'>Nenhum aniversariante neste mês.</p>";
    return;
  }

  aniversariantes
    .slice()
    .sort((a, b) => {
      const da = new Date(a.aniversario + "T00:00:00").getDate();
      const db = new Date(b.aniversario + "T00:00:00").getDate();
      return da - db;
    })
    .forEach((m) => {
      const item = document.createElement("div");
      item.className = "list-item";

      const d = new Date(m.aniversario + "T00:00:00");
      const data = d.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
      });

      item.innerHTML = `
        <div class="list-item-main">
          <strong>${m.nome}</strong>
          <span>Data: ${data}</span>
          <span>Voz/Seção: ${m.voz || "-"}</span>
        </div>
      `;
      listaEl.appendChild(item);
    });
}

// ====== CULTOS / MAPAS COM API ======
async function loadCultos() {
  try {
    cultos = await apiCall("/cultos");
    renderCultos();
  } catch (error) {
    console.error("Erro ao carregar cultos:", error);
    // Fallback para dados locais
    cultos = loadData(STORAGE_KEYS.CULTOS);
    renderCultos();
  }
}

async function carregarCultosSeNecessario() {
  // O select de músicas do culto depende tanto do catálogo da igreja quanto do
  // Meu Repertório pessoal (autonomia: membro pode montar culto só com músicas suas).
  if (precisaRecarregar("repertorio")) {
    await loadRepertorioPessoal();
    marcarCarregado("repertorio");
  }
  renderMusicasNoSelectCulto();

  if (!precisaRecarregar("cultos")) return;
  await loadCultos();
  marcarCarregado("cultos");
}

function limparFormCulto() {
  const form = document.getElementById("formCulto");
  form.reset();
  document.getElementById("cultoEditandoId").value = "";
  document.getElementById("tituloFormCulto").textContent = "Novo culto";
  document.getElementById("btnSalvarCulto").textContent = "Criar culto / mapa";
  document.getElementById("btnCancelarEdicaoCulto").style.display = "none";
  cultoMusicasEscolhidas = [];
  renderMusicasNoSelectCulto();
  renderCultoMusicasSelecionadas();
}

function initCultos() {
  // Autonomia: qualquer membro logado pode montar seu próprio culto/mapa.
  // Só liderança escolhe entre "oficial da igreja" x "pessoal"; membro comum sempre cria pessoal.
  const cardNovo = document.getElementById("cardNovoCulto");
  if (cardNovo) cardNovo.style.display = "block";

  const avisoPessoal = document.getElementById("avisoCultoPessoal");
  const grupoPessoal = document.getElementById("grupoCultoPessoal");
  if (currentUser?.souLideranca) {
    if (grupoPessoal) grupoPessoal.style.display = "block";
    if (avisoPessoal) avisoPessoal.style.display = "none";
  } else {
    if (grupoPessoal) grupoPessoal.style.display = "none";
    if (avisoPessoal) avisoPessoal.style.display = "block";
  }

  document.getElementById("btnCancelarEdicaoCulto").addEventListener("click", limparFormCulto);
  renderCultoMusicasSelecionadas();

  const form = document.getElementById("formCulto");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const editandoId = document.getElementById("cultoEditandoId").value || null;
    const data = document.getElementById("cultoData").value;
    const nome = document.getElementById("cultoNome").value.trim();
    const seletorPessoal = document.getElementById("cultoPessoal");
    // Liderança escolhe no seletor; membro comum sempre cria pessoal (true por padrão).
    const pessoal = currentUser?.souLideranca ? seletorPessoal?.value === "true" : true;

    if (!data || !nome) {
      showNotification("Informe data e nome do culto.", "error");
      return;
    }

    const selecionadas = cultoMusicasEscolhidas.map((m) => m.valor);

    if (selecionadas.length === 0) {
      showNotification("Selecione pelo menos uma música para o culto.", "error");
      return;
    }

    const botaoSalvar = document.getElementById("btnSalvarCulto");
    const textoOriginal = botaoSalvar.textContent;
    botaoSalvar.disabled = true;
    botaoSalvar.textContent = editandoId ? "Salvando..." : "Criando...";

    try {
      if (editandoId) {
        await apiCall(`/cultos/${editandoId}`, {
          method: "PUT",
          body: JSON.stringify({ data, nome, musicaIds: selecionadas }),
        });
      } else {
        await apiCall("/cultos", {
          method: "POST",
          body: JSON.stringify({ data, nome, musicaIds: selecionadas, pessoal }),
        });
      }

      limparFormCulto();
      await loadCultos();
      cacheAbas.dashboard = 0;

      showNotification(editandoId ? "Culto atualizado com sucesso!" : "Culto criado com sucesso!", "success");
    } catch (error) {
      showNotification("Erro ao salvar culto: " + error.message, "error");
    } finally {
      botaoSalvar.disabled = false;
      botaoSalvar.textContent = textoOriginal;
    }
  });
}

function criarItemCulto(c) {
  const item = document.createElement("div");
  item.className = "list-item";

  const dataFormatada = new Date(c.data + "T00:00:00").toLocaleDateString("pt-BR");

  const main = document.createElement("div");
  main.className = "list-item-main";
  main.style.cursor = "pointer";

  // culto.musicaIds vem do shim de API (ver apiCall "/cultos" GET)
  const qtdMusicas = Array.isArray(c.musicaIds) ? c.musicaIds.length : 0;

  main.innerHTML = `
    <strong>${c.nome}</strong>
    <span>${dataFormatada}</span>
    <span>Músicas: ${qtdMusicas}</span>
  `;
  main.addEventListener("click", () => mostrarDetalhesCulto(c));

  const acoes = document.createElement("div");
  acoes.style.display = "flex";
  acoes.style.flexDirection = "column";
  acoes.style.gap = "0.3rem";
  acoes.style.alignItems = "flex-end";

  const tag = document.createElement("span");
  tag.className = "tag";
  tag.textContent = "Ver mapa";
  tag.style.cursor = "pointer";
  tag.addEventListener("click", () => mostrarDetalhesCulto(c));
  acoes.appendChild(tag);

  // Pode editar/excluir: liderança nos cultos oficiais, ou o dono no seu próprio culto pessoal.
  const podeGerenciar = c.ehPessoal ? c.donoId === currentUser?.id : currentUser?.souLideranca;

  if (podeGerenciar) {
    const linhaBotoes = document.createElement("div");
    linhaBotoes.style.display = "flex";
    linhaBotoes.style.gap = "0.3rem";

    const btnEditar = document.createElement("button");
    btnEditar.className = "btn secondary small";
    btnEditar.textContent = "Editar";
    btnEditar.addEventListener("click", (e) => { e.stopPropagation(); editarCultoPorId(c.id); });

    const btnExcluir = document.createElement("button");
    btnExcluir.className = "btn danger small";
    btnExcluir.textContent = "Excluir";
    btnExcluir.addEventListener("click", (e) => { e.stopPropagation(); excluirCulto(c.id, c.nome); });

    linhaBotoes.appendChild(btnEditar);
    linhaBotoes.appendChild(btnExcluir);
    acoes.appendChild(linhaBotoes);
  }

  item.appendChild(main);
  item.appendChild(acoes);
  return item;
}

function renderCultos() {
  const listaEl = document.getElementById("listaCultos");
  const listaPessoalEl = document.getElementById("listaCultosPessoais");
  const detalhesCard = document.getElementById("cultoDetalhesCard");
  const detalhesEl = document.getElementById("cultoDetalhes");

  listaEl.innerHTML = "";
  if (listaPessoalEl) listaPessoalEl.innerHTML = "";
  detalhesCard.style.display = "none";
  detalhesEl.innerHTML = "";

  const oficiais = cultos.filter((c) => !c.ehPessoal);
  const pessoais = cultos.filter((c) => c.ehPessoal);

  if (oficiais.length === 0) {
    listaEl.innerHTML =
      "<p style='font-size:0.85rem;color:var(--texto-secundario);'>Nenhum culto oficial cadastrado ainda.</p>";
  } else {
    oficiais
      .slice()
      .sort((a, b) => new Date(a.data) - new Date(b.data))
      .forEach((c) => listaEl.appendChild(criarItemCulto(c)));
  }

  if (listaPessoalEl) {
    if (pessoais.length === 0) {
      listaPessoalEl.innerHTML =
        "<p style='font-size:0.85rem;color:var(--texto-secundario);'>Você ainda não criou nenhum culto pessoal.</p>";
    } else {
      pessoais
        .slice()
        .sort((a, b) => new Date(a.data) - new Date(b.data))
        .forEach((c) => listaPessoalEl.appendChild(criarItemCulto(c)));
    }
  }
}

function editarCultoPorId(cultoId) {
  const c = cultos.find((x) => x.id === cultoId);
  if (!c) return;

  document.getElementById("cultoEditandoId").value = c.id;
  document.getElementById("cultoData").value = c.data;
  document.getElementById("cultoNome").value = c.nome;

  // Reconstrói o estado do picker a partir das músicas já salvas no culto, na ordem certa.
  cultoMusicasEscolhidas = (c.musicaIds || []).map((valor) => {
    const [origem, id] = String(valor).includes(":") ? valor.split(":") : ["musica", valor];
    const mus = origem === "pessoal"
      ? repertorioPessoal.find((x) => x.id === id)
      : musicas.find((x) => x.id === id);
    const tom = mus ? (mus.tomOriginal || mus.tom_original || "-") : "-";
    return { valor, titulo: mus?.titulo || "(música não encontrada)", tom, origem };
  });
  renderMusicasNoSelectCulto();
  renderCultoMusicasSelecionadas();

  document.getElementById("tituloFormCulto").textContent = "Editar culto";
  document.getElementById("btnSalvarCulto").textContent = "Salvar alterações";
  document.getElementById("btnCancelarEdicaoCulto").style.display = "inline-block";
  document.getElementById("formCulto").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function excluirCulto(cultoId, nome) {
  const ok = await confirmarAcao(
    `Excluir o culto "${nome}"? O mapa de músicas dele some junto. Isso não pode ser desfeito.`,
    { titulo: "Excluir culto", textoConfirmar: "Excluir" }
  );
  if (!ok) return;

  try {
    await apiCall(`/cultos/${cultoId}`, { method: "DELETE" });
    await loadCultos();
    cacheAbas.dashboard = 0;
    showNotification("Culto excluído.", "success");
  } catch (error) {
    showNotification("Erro ao excluir culto: " + error.message, "error");
  }
}

function mostrarDetalhesCulto(culto) {
  const card = document.getElementById("cultoDetalhesCard");
  const el = document.getElementById("cultoDetalhes");
  card.style.display = "block";

  const dataFormatada = new Date(culto.data + "T00:00:00").toLocaleDateString("pt-BR");

  let html = `
    <p><strong>${culto.nome}</strong> - ${dataFormatada}</p>
    <br/>
    <p><strong>Ordem das músicas:</strong></p>
    <ol style="margin-top:0.4rem;margin-left:1.2rem;">
  `;

  // Verificar estrutura do culto (backend vs local)
  if (Array.isArray(culto.musicaIds) && culto.musicaIds.length) {
    culto.musicaIds.forEach((valor) => {
      const [origem, id] = String(valor).includes(":") ? valor.split(":") : ["musica", valor];
      const mus = origem === "pessoal"
        ? repertorioPessoal.find((x) => x.id === id)
        : musicas.find((x) => x.id === id);
      if (mus) {
        const tom = mus.tomOriginal || mus.tom_original || "-";
        const sufixo = origem === "pessoal" ? " · meu repertório" : "";
        html += `<li>${mus.titulo} (${tom})${sufixo}</li>`;
      }
    });
  } else if (culto.musicas && Array.isArray(culto.musicas)) {
    culto.musicas.forEach((mItem) => {
      if (mItem.musica) {
        html += `<li>${mItem.musica.titulo} (${mItem.musica.tomOriginal || "-"})</li>`;
      } else {
        const mus = musicas.find((x) => x.id === mItem.musicaId);
        if (mus) html += `<li>${mus.titulo} (${mus.tomOriginal || "-"})</li>`;
      }
    });
  }

  html += "</ol>";

  // Adicionar link de compartilhamento se disponível
  if (culto.shareSlug) {
    html += `
      <div style="margin-top: 1rem; padding: 1rem; background: #2a2a2a; color: #f2e9dc; border-radius: 0.5rem;">
        <p><strong>Link de compartilhamento:</strong></p>
        <code style="word-break: break-all; color: #f2e9dc;">${window.location.origin}/culto/${culto.shareSlug}</code>
      </div>
    `;
  }

  el.innerHTML = html;

  carregarMapaIndividual(culto.id);
}

// ====== MAPA INDIVIDUAL (anotações pessoais por culto — nunca altera o mapa oficial) ======
let cultoAtualParaMapaIndividual = null;

async function carregarMapaIndividual(cultoId) {
  cultoAtualParaMapaIndividual = cultoId;
  const card = document.getElementById("mapaIndividualCard");
  const statusEl = document.getElementById("mapaIndividualStatus");
  if (!card) return;
  card.style.display = "block";
  statusEl.textContent = "";

  try {
    const { data, error } = await supabase.from("mapas_individuais")
      .select("*").eq("culto_id", cultoId).eq("perfil_id", currentUser.id).maybeSingle();
    if (error) throw error;

    document.getElementById("mapaIndividualInstrumento").value = data?.instrumento || currentUser.funcao || "";
    document.getElementById("mapaIndividualConteudo").value = data?.conteudo || "";
  } catch (error) {
    console.error("Erro ao carregar mapa individual:", error);
  }
}

function initMapaIndividual() {
  const btn = document.getElementById("btnSalvarMapaIndividual");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    if (!cultoAtualParaMapaIndividual) return;

    const instrumento = document.getElementById("mapaIndividualInstrumento").value.trim() || null;
    const conteudo = document.getElementById("mapaIndividualConteudo").value;
    const statusEl = document.getElementById("mapaIndividualStatus");

    try {
      const { error } = await supabase.from("mapas_individuais")
        .upsert({
          igreja_id: currentUser.igreja.id,
          culto_id: cultoAtualParaMapaIndividual,
          perfil_id: currentUser.id,
          instrumento, conteudo,
          atualizado_em: new Date().toISOString(),
        }, { onConflict: "culto_id,perfil_id" });
      if (error) throw error;

      statusEl.textContent = "Salvo ✓";
      setTimeout(() => { statusEl.textContent = ""; }, 2500);
    } catch (error) {
      showNotification("Erro ao salvar mapa individual: " + error.message, "error");
    }
  });
}

// ====== CONFIG: WAKE LOCK + RESET ======
let wakeLock = null;

async function requestWakeLock(silencioso = false) {
  try {
    if ("wakeLock" in navigator) {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => {
        console.log("Wake Lock liberado");
      });
      if (!silencioso) showNotification("Tentando manter a tela ligada enquanto o app estiver aberto.", "success");
    } else if (!silencioso) {
      showNotification("Este navegador/dispositivo não suporta manter a tela ligada.", "error");
    }
  } catch (err) {
    console.error(err);
    if (!silencioso) showNotification("Não foi possível ativar o Wake Lock: " + err.message, "error");
  }
}

function aplicarTema(tema) {
  if (tema === "sistema") {
    localStorage.removeItem("harmonia_tema");
    const sistemaClaro = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
    document.documentElement.setAttribute("data-theme", sistemaClaro ? "light" : "dark");
  } else {
    localStorage.setItem("harmonia_tema", tema);
    document.documentElement.setAttribute("data-theme", tema);
  }
  document.querySelectorAll("#temaOpcoes [data-tema]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tema === tema);
  });
}

function initConfig() {
  const temaAtual = localStorage.getItem("harmonia_tema") || "sistema";
  aplicarTema(temaAtual);
  document.querySelectorAll("#temaOpcoes [data-tema]").forEach((btn) => {
    btn.addEventListener("click", () => aplicarTema(btn.dataset.tema));
  });

  // Código de convite: visível pra QUALQUER membro logado (autonomia - não depende do líder pra convidar).
  const codigoConvite = currentUser?.igreja?.convite_codigo || "—";
  const elCodigoPublico = document.getElementById("codigoConvitePublico");
  if (elCodigoPublico) elCodigoPublico.textContent = codigoConvite;

  const btnCopiar = document.getElementById("btnCopiarCodigoConvite");
  const btnCompartilhar = document.getElementById("btnCompartilharCodigoConvite");
  const msgCodigo = document.getElementById("codigoConviteMensagem");

  if (btnCopiar) {
    btnCopiar.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(codigoConvite);
        msgCodigo.style.display = "block";
        msgCodigo.style.color = "#059669";
        msgCodigo.textContent = "Código copiado! Manda pra quem você quiser convidar.";
      } catch {
        msgCodigo.style.display = "block";
        msgCodigo.style.color = "#dc2626";
        msgCodigo.textContent = "Não consegui copiar automaticamente — copia manualmente o código acima.";
      }
    });
  }

  if (btnCompartilhar && navigator.share) {
    btnCompartilhar.style.display = "inline-block";
    btnCompartilhar.addEventListener("click", async () => {
      try {
        await navigator.share({
          title: "Convite pra igreja no Harmonia",
          text: `Entra no Harmonia com a gente! Código da nossa igreja: ${codigoConvite}\nBaixa em: ${window.location.origin}`,
        });
      } catch {
        // usuário cancelou o compartilhamento, sem problema
      }
    });
  }

  const cardConvidar = document.getElementById("cardConvidarMembro");
  if (currentUser?.souLideranca) {
    cardConvidar.style.display = "block";
    const formConvidar = document.getElementById("formConvidarMembro");
    formConvidar.addEventListener("submit", async (e) => {
      e.preventDefault();
      const nome = document.getElementById("convidarNome").value.trim();
      const email = document.getElementById("convidarEmail").value.trim();
      const funcao = document.getElementById("convidarFuncao").value.trim();
      const msgEl = document.getElementById("convidarMensagem");
      const btn = formConvidar.querySelector("button[type=submit]");

      msgEl.style.display = "block";
      msgEl.style.background = "#2563eb";
      msgEl.style.color = "#fff";
      msgEl.textContent = "Enviando convite...";
      btn.disabled = true;

      try {
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/convidar-membro`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${authToken}`,
            "apikey": SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ nome, email, funcao, siteUrl: window.location.origin }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || "Erro ao enviar convite.");

        msgEl.style.background = "#059669";
        msgEl.textContent = `Convite enviado para ${email}! Peça pra conferir a caixa de entrada (e o spam).`;
        formConvidar.reset();
      } catch (error) {
        msgEl.style.background = "#dc2626";
        msgEl.textContent = error.message;
      } finally {
        btn.disabled = false;
      }
    });
  }

  const btnWakeLock = document.getElementById("btnWakeLock");
  btnWakeLock.addEventListener("click", () => requestWakeLock(false));

  document.addEventListener("visibilitychange", () => {
    if (wakeLock !== null && document.visibilityState === "visible") {
      requestWakeLock(true);
    }
  });

  const btnLimpar = document.getElementById("btnLimparDados");
  btnLimpar.addEventListener("click", async () => {
    const ok = await confirmarAcao(
      "Isso apagará todas as músicas, membros e cultos salvos neste dispositivo (dados locais de contingência, não afeta o banco de dados).",
      { titulo: "Apagar dados locais", textoConfirmar: "Apagar" }
    );
    if (!ok) return;

    localStorage.removeItem(STORAGE_KEYS.MUSICAS);
    localStorage.removeItem(STORAGE_KEYS.MEMBROS);
    localStorage.removeItem(STORAGE_KEYS.CULTOS);

    musicas = [];
    membros = [];
    cultos = [];

    renderMusicas();
    renderMusicasNoSelectCulto();
    renderMembros();
    renderCultos();
    renderAniversariantes();

    showNotification("Dados locais apagados.", "success");
  });

  const btnExcluirConta = document.getElementById("btnExcluirConta");
  btnExcluirConta?.addEventListener("click", async () => {
    const ok = await confirmarAcao(
      "Isso apaga sua conta de login e seus dados pessoais (perfil, foto, WhatsApp, repertório particular, mapas individuais) definitivamente. Escalas e cultos em que você participou continuam existindo pra igreja, só sem o vínculo com você. Não tem como desfazer.",
      { titulo: "Excluir minha conta", textoConfirmar: "Quero excluir" }
    );
    if (!ok) return;

    const confirmacao = prompt('Pra confirmar de vez, digite EXCLUIR (em maiúsculas):');
    if (confirmacao !== "EXCLUIR") {
      if (confirmacao !== null) showNotification("Digitado errado — sua conta não foi excluída.", "info");
      return;
    }

    try {
      const { error } = await supabase.rpc("excluir_minha_conta");
      if (error) throw error;

      alert("Conta excluída. Você vai ser desconectado agora.");
      await supabase.auth.signOut();
      clearAuthData();
      window.location.href = "index.html";
    } catch (error) {
      showNotification("Erro ao excluir conta: " + error.message, "error");
    }
  });
}

// ====== INIT GERAL ======
function initMainApp() {
  // HTML já está no index.html, apenas inicializar funcionalidades
  initTabs();
  initEscala();
  initTrocas();       // só liga os listeners agora; dados de trocas carregam no 1º clique na aba
  initMusicas();       // eager: Cultos, Modo Palco e a própria aba Músicas dependem do array `musicas`
  initMeuRepertorio(); // só liga os listeners agora; dados carregam no 1º clique na aba
  initMembros();       // eager: Escala e Trocas dependem do array `membros` pra mostrar nomes
  initCultos();        // só liga os listeners agora; dados carregam no 1º clique na aba
  initMapaIndividual();
  initHistorico();     // só liga os listeners agora; dados carregam no 1º clique na aba
  initConfig();
  carregarDashboardSeNecessario(); // Início é a aba padrão, então esse sim carrega de cara
  initModoPalco();
}

// ====== SISTEMA DE ESCALA (formato planilha) ======
let escalaAtual = null;
let escalaColunas = [];
let escalaLinhas = [];
let escalaCelulas = [];

async function initEscala() {
  const btnCarregarEscala = document.getElementById("btnCarregarEscala");
  const btnCriarEscala = document.getElementById("btnCriarEscala");
  const btnAprovarEscala = document.getElementById("btnAprovarEscala");
  const escalaMes = document.getElementById("escalaMes");
  const escalaAno = document.getElementById("escalaAno");

  if (!btnCarregarEscala) return;

  const agora = new Date();
  if (escalaMes) escalaMes.value = agora.getMonth() + 1;
  if (escalaAno) escalaAno.value = agora.getFullYear();

  btnCarregarEscala.addEventListener("click", carregarEscala);
  btnCriarEscala?.addEventListener("click", criarEscala);
  btnAprovarEscala?.addEventListener("click", aprovarEscala);
  document.getElementById("btnBaixarPdf")?.addEventListener("click", baixarEscalaPdf);
  document.getElementById("btnCopiarZap")?.addEventListener("click", copiarEscalaZap);
}

async function carregarEscala() {
  try {
    const mes = document.getElementById("escalaMes").value;
    const ano = document.getElementById("escalaAno").value;

    showNotification("Carregando escala...", "info");

    const { data: escalas, error } = await supabase.from("escalas").select("*")
      .eq("mes", Number(mes)).eq("ano", Number(ano));
    if (error) throw error;

    if (escalas.length > 0) {
      escalaAtual = escalas[0];
      await carregarPlanilha();
      mostrarBotaoAprovar();
      showNotification(`✅ Escala carregada: ${getMonthName(mes)}/${ano}`, "success");
    } else {
      const confirmar = await confirmarAcao(
        `Nenhuma escala encontrada para ${getMonthName(mes)}/${ano}.\n\nDeseja criar uma nova escala?`,
        { titulo: "Criar nova escala", textoConfirmar: "Criar escala", perigo: false }
      );
      if (confirmar && currentUser?.souLideranca) {
        await criarEscala();
      } else if (confirmar) {
        showNotification("Apenas líderes podem criar escalas.", "error");
      } else {
        escalaAtual = null;
        renderizarPlanilhaVazia();
        mostrarBotaoCriar();
      }
    }
  } catch (error) {
    console.error("Erro ao carregar escala:", error);
    showNotification("Erro ao carregar escala: " + error.message, "error");
  }
}

async function criarEscala() {
  try {
    const mes = Number(document.getElementById("escalaMes").value);
    const ano = Number(document.getElementById("escalaAno").value);

    const { data: escala, error } = await supabase.from("escalas").insert({
      igreja_id: currentUser.igreja.id, mes, ano, criado_por: currentUser.id,
    }).select().single();
    if (error) throw error;

    escalaAtual = escala;
    escalaColunas = [];
    escalaLinhas = [];
    escalaCelulas = [];
    renderizarPlanilha();
    mostrarBotaoAprovar();
    showNotification("Escala criada! Agora adicione as colunas (funções/instrumentos) e as linhas (datas).", "success");
  } catch (error) {
    console.error("Erro ao criar escala:", error);
    showNotification("Erro ao criar escala: " + error.message, "error");
  }
}

async function aprovarEscala() {
  if (!escalaAtual) return;
  const botao = document.getElementById("btnAprovarEscala");
  await comFeedbackDeCarregamento(botao, "Aprovando...", async () => {
    try {
      const { error } = await supabase.from("escalas").update({ aprovada: true }).eq("id", escalaAtual.id);
      if (error) throw error;
      escalaAtual.aprovada = true;
      cacheAbas.dashboard = 0;
      renderizarPlanilha();
      showNotification("Escala aprovada com sucesso!", "success");
    } catch (error) {
      showNotification("Erro ao aprovar escala: " + error.message, "error");
    }
  });
}

function mostrarBotaoCriar() {
  const btnCriar = document.getElementById("btnCriarEscala");
  const btnAprovar = document.getElementById("btnAprovarEscala");
  if (btnCriar) btnCriar.style.display = currentUser?.souLideranca ? "inline-block" : "none";
  if (btnAprovar) btnAprovar.style.display = "none";
}

function mostrarBotaoAprovar() {
  document.getElementById("btnCriarEscala").style.display = "none";
  const btnAprovar = document.getElementById("btnAprovarEscala");
  if (currentUser?.souLideranca && escalaAtual && !escalaAtual.aprovada) {
    btnAprovar.style.display = "inline-block";
  } else {
    btnAprovar.style.display = "none";
  }
}

async function carregarPlanilha() {
  const [colunasRes, linhasRes, celulasRes] = await Promise.all([
    supabase.from("escala_colunas").select("*").eq("escala_id", escalaAtual.id).order("ordem"),
    supabase.from("escala_linhas").select("*").eq("escala_id", escalaAtual.id).order("ordem"),
    supabase.from("escala_celulas").select("*").eq("escala_id", escalaAtual.id),
    loadMembros(),
  ]);
  if (colunasRes.error) throw colunasRes.error;
  if (linhasRes.error) throw linhasRes.error;
  if (celulasRes.error) throw celulasRes.error;

  escalaColunas = colunasRes.data;
  escalaLinhas = linhasRes.data;
  escalaCelulas = celulasRes.data;
  renderizarPlanilha();
}

function celulaDe(linhaId, colunaId) {
  return escalaCelulas.find((c) => c.linha_id === linhaId && c.coluna_id === colunaId);
}

function nomeDaCelula(celula, membrosPorId) {
  if (!celula) return "";
  if (celula.nome_livre) return celula.nome_livre;
  const membro = membrosPorId ? membrosPorId.get(celula.membro_id) : membros.find((m) => m.id === celula.membro_id);
  return membro ? membro.nome : "";
}

async function alternarConfirmacaoCelula(celulaId) {
  const celula = escalaCelulas.find((c) => c.id === celulaId);
  if (!celula) return;
  const novoStatus = celula.status_confirmacao === "confirmado" ? "pendente" : "confirmado";
  try {
    const { error } = await supabase.rpc("confirmar_presenca", { p_celula_id: celulaId, p_status: novoStatus });
    if (error) throw error;
    celula.status_confirmacao = novoStatus;
    cacheAbas.dashboard = 0;
    renderizarPlanilha();
    showNotification(novoStatus === "confirmado" ? "Presença confirmada! ✅" : "Confirmação removida.", "success");
  } catch (error) {
    showNotification("Erro ao confirmar presença: " + error.message, "error");
  }
}

function renderizarPlanilha() {
  const container = document.getElementById("escalaCalendario");
  const souLider = currentUser?.souLideranca;

  if (!escalaAtual) {
    renderizarPlanilhaVazia();
    return;
  }

  document.getElementById("btnBaixarPdf").style.display = "inline-block";
  document.getElementById("btnCopiarZap").style.display = "inline-block";

  // Monta os índices uma vez só (O(1) por célula depois), em vez de escalaCelulas.find()
  // e membros.find() dentro do loop aninhado linha × coluna (que rodava O(n) a cada célula).
  const celulasPorChave = new Map();
  escalaCelulas.forEach((c) => celulasPorChave.set(`${c.linha_id}|${c.coluna_id}`, c));
  const membrosPorId = new Map(membros.map((m) => [m.id, m]));

  let html = `<div class="planilha-wrapper"><table class="planilha-escala"><thead><tr>
    <th>Dias</th><th>Datas</th>`;

  escalaColunas.forEach((col) => {
    html += `<th>${col.nome}${souLider ? ` <button class="btn-icone-remover" onclick="removerColuna('${col.id}')" title="Remover coluna">✕</button>` : ""}</th>`;
  });
  if (souLider) html += `<th><button class="btn small secondary" onclick="adicionarColuna()">+ Coluna</button></th>`;
  html += `</tr></thead><tbody>`;

  if (escalaLinhas.length === 0) {
    html += `<tr><td colspan="${escalaColunas.length + 2 + (souLider ? 1 : 0)}" style="text-align:center; color:var(--texto-secundario); padding:1.5rem;">
      Nenhuma linha ainda.${souLider ? " Clique em \"+ Linha\" abaixo pra adicionar as datas do mês." : ""}
    </td></tr>`;
  }

  escalaLinhas.forEach((linha) => {
    html += `<tr class="${linha.destaque ? "linha-destaque" : ""}">
      <td>${souLider ? `<input type="text" value="${linha.dias}" onchange="editarLinha('${linha.id}', 'dias', this.value)" class="input-inline">` : linha.dias}</td>
      <td>${souLider ? `<input type="text" value="${linha.datas}" onchange="editarLinha('${linha.id}', 'datas', this.value)" class="input-inline">` : linha.datas}</td>`;

    escalaColunas.forEach((col) => {
      const celula = celulasPorChave.get(`${linha.id}|${col.id}`);
      const nome = nomeDaCelula(celula, membrosPorId);
      let onclickAttr = "";
      if (souLider) {
        onclickAttr = `onclick="editarCelula('${linha.id}', '${col.id}')"`;
      } else if (nome) {
        onclickAttr = `onclick="solicitarTrocaCelula('${celula.id}', '${col.nome.replace(/'/g, "\\'")}', '${nome.replace(/'/g, "\\'")}')"`;
      }

      let badgeConfirmacao = "";
      if (celula && (celula.membro_id || (celula.nome_livre && celula.nome_livre.trim()))) {
        const membroDaCelula = celula.membro_id ? membrosPorId.get(celula.membro_id) : null;
        const ehMinhaCelula = membroDaCelula && membroDaCelula.perfil_id === currentUser.id;

        if (ehMinhaCelula || souLider) {
          const status = celula.status_confirmacao || "pendente";
          const icone = status === "confirmado" ? "✅" : "⏳";
          const titulo = ehMinhaCelula ? "Clique pra confirmar sua presença" : "Clique pra confirmar a presença dessa pessoa";
          badgeConfirmacao = ` <span class="badge-confirmacao" title="${titulo}" onclick="event.stopPropagation(); alternarConfirmacaoCelula('${celula.id}')">${icone}</span>`;
        }
      }

      html += `<td class="celula-escala" ${onclickAttr}>${nome ? nome + badgeConfirmacao : (souLider ? '<span style="color:var(--texto-terciario);">+ definir</span>' : "—")}</td>`;
    });

    if (souLider) {
      html += `<td><button class="btn-icone-remover" onclick="removerLinha('${linha.id}')" title="Remover linha">✕</button></td>`;
    }
    html += `</tr>`;
  });

  html += `</tbody></table></div>`;

  if (souLider) {
    html += `<div style="margin-top:1rem; display:flex; gap:0.5rem;">
      <button class="btn secondary" onclick="adicionarLinha()">+ Linha (par de dias)</button>
    </div>`;
  }

  container.innerHTML = html;
}

function renderizarPlanilhaVazia() {
  const container = document.getElementById("escalaCalendario");
  document.getElementById("btnBaixarPdf").style.display = "none";
  document.getElementById("btnCopiarZap").style.display = "none";
  container.innerHTML = `
    <div class="card">
      <h3>Nenhuma escala encontrada</h3>
      <p>Não há escala criada para este mês/ano.</p>
      ${currentUser?.souLideranca ? `<p><strong>Como líder, você pode criar uma nova escala.</strong></p>` : ""}
    </div>
  `;
}

async function adicionarColuna() {
  const nome = prompt("Nome da função/instrumento (ex: Backing, Teclado, Sopro):");
  if (!nome || !nome.trim()) return;
  try {
    const ordem = escalaColunas.length;
    const { error } = await supabase.from("escala_colunas").insert({
      igreja_id: currentUser.igreja.id, escala_id: escalaAtual.id, nome: nome.trim(), ordem,
    });
    if (error) throw error;
    await carregarPlanilha();
  } catch (error) {
    showNotification("Erro ao adicionar coluna: " + error.message, "error");
  }
}

async function removerColuna(colunaId) {
  if (!(await confirmarAcao("Remover esta coluna? As pessoas escaladas nela também serão removidas.", { titulo: "Remover coluna", textoConfirmar: "Remover" }))) return;
  try {
    const { error } = await supabase.from("escala_colunas").delete().eq("id", colunaId);
    if (error) throw error;
    await carregarPlanilha();
  } catch (error) {
    showNotification("Erro ao remover coluna: " + error.message, "error");
  }
}

async function adicionarLinha() {
  const dias = prompt("Dias da semana (ex: DOMINGO/TERÇA):");
  if (!dias || !dias.trim()) return;
  const datas = prompt("Datas (ex: 2 e 4):");
  if (datas === null) return;
  try {
    const ordem = escalaLinhas.length;
    const { error } = await supabase.from("escala_linhas").insert({
      igreja_id: currentUser.igreja.id, escala_id: escalaAtual.id, dias: dias.trim(), datas: (datas || "").trim(), ordem,
    });
    if (error) throw error;
    await carregarPlanilha();
  } catch (error) {
    showNotification("Erro ao adicionar linha: " + error.message, "error");
  }
}

async function removerLinha(linhaId) {
  if (!(await confirmarAcao("Remover esta linha da escala?", { titulo: "Remover linha", textoConfirmar: "Remover" }))) return;
  try {
    const { error } = await supabase.from("escala_linhas").delete().eq("id", linhaId);
    if (error) throw error;
    await carregarPlanilha();
  } catch (error) {
    showNotification("Erro ao remover linha: " + error.message, "error");
  }
}

async function editarLinha(linhaId, campo, valor) {
  try {
    const { error } = await supabase.from("escala_linhas").update({ [campo]: valor }).eq("id", linhaId);
    if (error) throw error;
    const linha = escalaLinhas.find((l) => l.id === linhaId);
    if (linha) linha[campo] = valor;
  } catch (error) {
    showNotification("Erro ao salvar: " + error.message, "error");
  }
}

let celulaEmEdicao = null;

function fecharModal(id) {
  document.getElementById(id).style.display = "none";
}

async function editarCelula(linhaId, colunaId) {
  await loadMembros();
  celulaEmEdicao = { linhaId, colunaId };

  const coluna = escalaColunas.find((c) => c.id === colunaId);
  document.getElementById("tituloEditarCelula").textContent = `Quem vai em "${coluna?.nome || ""}"?`;

  const select = document.getElementById("celulaMembroSelect");
  select.innerHTML = `<option value="">— Selecione —</option>` +
    membros.map((m) => `<option value="${m.id}">${m.nome}</option>`).join("") +
    `<option value="__outro__">Outro (digitar nome)</option>`;

  const nomeLivreGroup = document.getElementById("celulaNomeLivreGroup");
  const nomeLivreInput = document.getElementById("celulaNomeLivre");
  nomeLivreGroup.style.display = "none";
  nomeLivreInput.value = "";

  const celulaAtual = celulaDe(linhaId, colunaId);
  if (celulaAtual?.membro_id) {
    select.value = celulaAtual.membro_id;
  } else if (celulaAtual?.nome_livre) {
    select.value = "__outro__";
    nomeLivreGroup.style.display = "block";
    nomeLivreInput.value = celulaAtual.nome_livre;
  } else {
    select.value = "";
  }

  document.getElementById("modalEditarCelula").style.display = "block";
}

document.addEventListener("DOMContentLoaded", () => {
  const select = document.getElementById("celulaMembroSelect");
  select?.addEventListener("change", () => {
    document.getElementById("celulaNomeLivreGroup").style.display = select.value === "__outro__" ? "block" : "none";
  });

  document.getElementById("btnLimparCelula")?.addEventListener("click", async () => {
    if (!celulaEmEdicao) return;
    await salvarCelula(null, null);
  });

  document.getElementById("formEditarCelula")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!celulaEmEdicao) return;
    const select = document.getElementById("celulaMembroSelect");
    if (select.value === "__outro__") {
      const nome = document.getElementById("celulaNomeLivre").value.trim();
      if (!nome) { showNotification("Digite um nome.", "error"); return; }
      await salvarCelula(null, nome);
    } else if (select.value) {
      await salvarCelula(select.value, null);
    } else {
      await salvarCelula(null, null);
    }
  });
});

async function salvarCelula(membroId, nomeLivre) {
  const { linhaId, colunaId } = celulaEmEdicao;
  try {
    if (!membroId && !nomeLivre) {
      const celula = celulaDe(linhaId, colunaId);
      if (celula) {
        const { error } = await supabase.from("escala_celulas").delete().eq("id", celula.id);
        if (error) throw error;
      }
    } else {
      const payload = {
        igreja_id: currentUser.igreja.id, escala_id: escalaAtual.id, linha_id: linhaId, coluna_id: colunaId,
        membro_id: membroId, nome_livre: nomeLivre,
      };
      const { error } = await supabase.from("escala_celulas").upsert(payload, { onConflict: "linha_id,coluna_id" });
      if (error) throw error;
    }
    fecharModal("modalEditarCelula");
    await carregarPlanilha();
  } catch (error) {
    showNotification("Erro ao salvar escalação: " + error.message, "error");
  }
}

async function solicitarTrocaCelula(celulaId, nomeColuna, nomeAtual) {
  const celula = escalaCelulas.find((c) => c.id === celulaId);
  if (!celula) return;

  if (celula.membro_id) {
    await carregarPerfisDaIgreja();
    const { data: membro } = await supabase.from("membros").select("perfil_id").eq("id", celula.membro_id).single();
    if (!membro?.perfil_id) {
      showNotification(`${nomeAtual} ainda não tem conta no Harmonia, então não dá pra mandar o pedido por aqui. Fala direto com essa pessoa.`, "error");
      return;
    }
    if (membro.perfil_id === currentUser.id) {
      showNotification("Essa escalação já é sua — não faz sentido pedir troca com você mesmo 🙂", "info");
      return;
    }

    const confirmar = await confirmarAcao(`Solicitar troca com ${nomeAtual} em "${nomeColuna}"?`, { titulo: "Solicitar troca", textoConfirmar: "Solicitar", perigo: false });
    if (!confirmar) return;

    const observacao = prompt("Quer deixar uma mensagem junto do pedido? (opcional)") || null;

    try {
      const { error } = await supabase.from("trocas_escala").insert({
        igreja_id: currentUser.igreja.id, escala_id: escalaAtual.id, celula_id: celulaId,
        solicitante_id: currentUser.id, receptor_id: membro.perfil_id, observacao, status: "pendente",
      });
      if (error) throw error;
      showNotification(`Pedido de troca enviado para ${nomeAtual}!`, "success");
    } catch (error) {
      showNotification("Erro ao solicitar troca: " + error.message, "error");
    }
  } else {
    showNotification(`${nomeAtual} ainda não tem conta no Harmonia, então não dá pra mandar o pedido por aqui. Fala direto com essa pessoa.`, "error");
  }
}

function baixarEscalaPdf() {
  if (!escalaAtual) return;
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "landscape" });

    const titulo = `ESCALA EQUIPE DE MÚSICA ${(currentUser.igreja?.nome || "").toUpperCase()} — ${getMonthName(escalaAtual.mes).toUpperCase()}/${String(escalaAtual.ano).slice(-2)}`;
    doc.setFontSize(14);
    doc.text(titulo, doc.internal.pageSize.getWidth() / 2, 15, { align: "center" });

    const head = [["Dias", "Datas", ...escalaColunas.map((c) => c.nome)]];
    const body = escalaLinhas.map((linha) => [
      linha.dias,
      linha.datas,
      ...escalaColunas.map((col) => nomeDaCelula(celulaDe(linha.id, col.id)) || "****"),
    ]);

    doc.autoTable({
      head, body, startY: 22,
      headStyles: { fillColor: [46, 204, 113], textColor: 255, fontStyle: "bold", halign: "center" },
      bodyStyles: { halign: "center", fontStyle: "bold" },
      alternateRowStyles: { fillColor: [255, 249, 219] },
      styles: { fontSize: 9, cellPadding: 3 },
    });

    doc.save(`escala-${getMonthName(escalaAtual.mes).toLowerCase()}-${escalaAtual.ano}.pdf`);
  } catch (error) {
    console.error(error);
    showNotification("Erro ao gerar PDF: " + error.message, "error");
  }
}

async function copiarEscalaZap() {
  if (!escalaAtual) return;
  try {
    let texto = `*ESCALA EQUIPE DE MÚSICA ${(currentUser.igreja?.nome || "").toUpperCase()}*\n`;
    texto += `_${getMonthName(escalaAtual.mes)}/${escalaAtual.ano}_\n\n`;

    escalaLinhas.forEach((linha) => {
      texto += `📅 *${linha.dias} (${linha.datas})*\n`;
      escalaColunas.forEach((col) => {
        const nome = nomeDaCelula(celulaDe(linha.id, col.id));
        if (nome) texto += `   ${col.nome}: ${nome}\n`;
      });
      texto += `\n`;
    });

    await navigator.clipboard.writeText(texto);
    showNotification("Escala copiada! Agora é só colar no WhatsApp.", "success");
  } catch (error) {
    showNotification("Erro ao copiar: " + error.message, "error");
  }
}

// ====== SISTEMA DE TROCAS ======
async function initTrocas() {
  const formSolicitarTroca = document.getElementById("formSolicitarTroca");
  formSolicitarTroca?.addEventListener("submit", solicitarTroca);
}

async function carregarTrocasSeNecessario() {
  if (!precisaRecarregar("trocas")) return;
  await carregarEscalasParaTroca();
  await carregarMembrosParaTroca();
  await carregarTrocas();
  marcarCarregado("trocas");
}

async function carregarEscalasParaTroca() {
  try {
    const response = await apiCall("/escalas");
    const escalas = response.data || response;
    
    const select = document.getElementById("trocaEscala");
    if (select) {
      select.innerHTML = '<option value="">Selecione uma escala</option>';
      escalas.forEach(escala => {
        select.innerHTML += `<option value="${escala.id}">${getMonthName(escala.mes)} ${escala.ano}</option>`;
      });
    }
  } catch (error) {
    console.error("Erro ao carregar escalas:", error);
  }
}

async function carregarMembrosParaTroca() {
  try {
    const response = await apiCall("/auth/perfil");
    const users = response.data || response;

    const select = document.getElementById("trocaReceptor");
    if (select) {
      select.innerHTML = '<option value="">Selecione um membro</option>';
      users
        .filter((u) => u.id !== currentUser?.id)
        .forEach((u) => {
          select.innerHTML += `<option value="${u.id}">${u.nome}${u.funcao ? " (" + u.funcao + ")" : ""}</option>`;
        });
    }
  } catch (error) {
    console.error("Erro ao carregar membros:", error);
  }
}

async function carregarTrocas() {
  try {
    const response = await apiCall("/trocas");
    const trocas = response.data || response;
    
    renderizarTrocas(trocas);
    
    if (currentUser?.souLideranca) {
      const trocasPendentes = trocas.filter(t => t.status === "aceita_receptor");
      renderizarTrocasPendentes(trocasPendentes);
    }
  } catch (error) {
    console.error("Erro ao carregar trocas:", error);
  }
}

async function solicitarTroca(e) {
  e.preventDefault();
  
  try {
    const escalaId = document.getElementById("trocaEscala").value;
    const data = document.getElementById("trocaData").value;
    const receptorId = document.getElementById("trocaReceptor").value;
    const observacao = document.getElementById("trocaObservacao").value;

    await apiCall(`/escalas/${escalaId}/trocas`, {
      method: "POST",
      body: JSON.stringify({
        receptorId: receptorId,
        data,
        funcao: currentUser.funcao,
        observacao
      })
    });

    e.target.reset();
    await carregarTrocas();
    showNotification("Troca solicitada com sucesso!", "success");
  } catch (error) {
    console.error("Erro ao solicitar troca:", error);
    showNotification("Erro ao solicitar troca: " + (error.message || "Erro desconhecido"), "error");
  }
}

function renderizarTrocas(trocas) {
  const container = document.getElementById("listaTrocas");
  if (!container) return;

  if (trocas.length === 0) {
    container.innerHTML = '<p>Nenhuma troca encontrada.</p>';
    return;
  }

  container.innerHTML = trocas.map(troca => `
    <div class="troca-item ${troca.status}">
      <div class="troca-header">
        <strong>${troca.solicitante?.name} ↔ ${troca.receptor?.name}</strong>
        <span class="troca-status ${troca.status}">${getStatusTroca(troca.status)}</span>
      </div>
      <div class="troca-detalhes">
        <p><strong>${troca.celulaInfo ? "Quando:" : "Data:"}</strong> ${troca.celulaInfo || formatDate(troca.data)} | <strong>Função:</strong> ${troca.funcao || "-"}</p>
        ${troca.observacao ? `<p><strong>Observação:</strong> ${troca.observacao}</p>` : ''}
        <p><strong>Solicitado em:</strong> ${formatDateTime(troca.solicitadoEm)}</p>
      </div>
      <div class="troca-actions">
        ${renderizarAcoesTroca(troca)}
      </div>
    </div>
  `).join('');
}

function renderizarTrocasPendentes(trocas) {
  const container = document.getElementById("listaTrocasPendentes");
  if (!container) return;

  if (trocas.length === 0) {
    document.getElementById("trocasPendentes").style.display = "none";
    return;
  }

  document.getElementById("trocasPendentes").style.display = "block";
  container.innerHTML = trocas.map(troca => `
    <div class="troca-item">
      <div class="troca-header">
        <strong>${troca.solicitante?.name} ↔ ${troca.receptor?.name}</strong>
        <span class="troca-status aceita_receptor">Aguardando Aprovação</span>
      </div>
      <div class="troca-detalhes">
        <p><strong>${troca.celulaInfo ? "Quando:" : "Data:"}</strong> ${troca.celulaInfo || formatDate(troca.data)} | <strong>Função:</strong> ${troca.funcao || "-"}</p>
        ${troca.observacao ? `<p><strong>Observação:</strong> ${troca.observacao}</p>` : ''}
      </div>
      <div class="troca-actions">
        <button class="btn success" onclick="aprovarTroca('${troca.id}', true)">✅ Aprovar</button>
        <button class="btn danger" onclick="aprovarTroca('${troca.id}', false)">❌ Recusar</button>
      </div>
    </div>
  `).join('');
}

function renderizarAcoesTroca(troca) {
  const isReceptor = troca.receptorId === currentUser?.id;
  const isSolicitante = troca.solicitanteId === currentUser?.id;
  
  if (troca.status === "pendente" && isReceptor) {
    return `
      <button class="btn success" onclick="responderTroca('${troca.id}', true)">✅ Aceitar</button>
      <button class="btn danger" onclick="responderTroca('${troca.id}', false)">❌ Recusar</button>
    `;
  }
  
  return '';
}

async function responderTroca(trocaId, aceitar) {
  try {
    await apiCall(`/trocas/${trocaId}/responder`, {
      method: "PUT",
      body: JSON.stringify({ aceitar })
    });

    await carregarTrocas();
    showNotification(aceitar ? "Troca aceita!" : "Troca recusada!", "success");
  } catch (error) {
    console.error("Erro ao responder troca:", error);
    showNotification("Erro ao responder troca: " + (error.message || "Erro desconhecido"), "error");
  }
}

async function aprovarTroca(trocaId, aprovar) {
  try {
    await apiCall(`/trocas/${trocaId}/aprovar`, {
      method: "PUT",
      body: JSON.stringify({ aprovar })
    });

    await carregarTrocas();
    await carregarEscala(); // Recarregar escala para ver mudanças
    showNotification(aprovar ? "Troca aprovada!" : "Troca recusada!", "success");
  } catch (error) {
    console.error("Erro ao aprovar troca:", error);
    showNotification("Erro ao aprovar troca: " + (error.message || "Erro desconhecido"), "error");
  }
}

// ====== SISTEMA DE HISTÓRICO ======
async function carregarHistoricoSeNecessario() {
  if (!precisaRecarregar("historico")) return;
  await carregarHistorico();
  marcarCarregado("historico");
}

async function initHistorico() {
  const btnFiltrarHistorico = document.getElementById("btnFiltrarHistorico");
  btnFiltrarHistorico?.addEventListener("click", () => { cacheAbas.historico = 0; carregarHistoricoSeNecessario(); });

  // Subtítulo e filtro de usuário só fazem sentido pra quem enxerga o histórico de todo mundo (liderança).
  const subtitulo = document.querySelector("#historico .section-title p");
  const filtroUsuario = document.getElementById("filtroUsuario");
  const cardFiltroUsuario = filtroUsuario?.closest(".filtro-card");

  if (currentUser?.souLideranca) {
    if (subtitulo) subtitulo.textContent = "Acompanhe as ações realizadas por toda a equipe.";
    if (cardFiltroUsuario) cardFiltroUsuario.style.display = "flex";
    if (!perfisDaIgreja.length) {
      await carregarPerfisDaIgreja();
    }
    if (filtroUsuario) {
      filtroUsuario.innerHTML = `<option value="">Todos os usuários</option>` +
        perfisDaIgreja.map((p) => `<option value="${p.id}">${p.nome}</option>`).join("");
    }
  } else {
    if (subtitulo) subtitulo.textContent = "Acompanhe suas próprias ações no sistema.";
    if (cardFiltroUsuario) cardFiltroUsuario.style.display = "none";
  }
}

async function carregarHistorico() {
  try {
    const userId = document.getElementById("filtroUsuario").value;
    const acao = document.getElementById("filtroAcao").value;
    const dataInicio = document.getElementById("filtroDataInicio").value;
    const dataFim = document.getElementById("filtroDataFim").value;

    let query = "";
    const params = new URLSearchParams();
    if (userId) params.append("userId", userId);
    if (acao) params.append("acao", acao);
    if (dataInicio) params.append("dataInicio", dataInicio);
    if (dataFim) params.append("dataFim", dataFim);
    
    if (params.toString()) query = "?" + params.toString();

    const response = await apiCall("/historico" + query);
    const historico = response.data || response;
    
    renderizarHistorico(historico);
  } catch (error) {
    console.error("Erro ao carregar histórico:", error);
    showNotification("Erro ao carregar histórico", "error");
  }
}

function renderizarHistorico(historico) {
  const container = document.getElementById("listaHistorico");
  if (!container) return;

  if (historico.length === 0) {
    container.innerHTML = '<p>Nenhum registro encontrado.</p>';
    return;
  }

  container.innerHTML = historico.map(item => `
    <div class="historico-item">
      <div class="historico-header">
        <span class="historico-acao">${getAcaoDescricao(item.acao)}</span>
        <span class="historico-data">${formatDateTime(item.data)}</span>
      </div>
      <div class="historico-usuario">Por: ${item.user?.name || 'Usuário'}</div>
      ${item.detalhes ? `<div class="historico-detalhes">${formatDetalhes(item.detalhes)}</div>` : ''}
    </div>
  `).join('');
}

// ====== FUNÇÕES UTILITÁRIAS ======
function getMonthName(mes) {
  const meses = [
    '', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  return meses[mes] || mes;
}

function getStatusTroca(status) {
  const statusMap = {
    'pendente': 'Pendente',
    'aceita_receptor': 'Aceita pelo Receptor',
    'aprovada': 'Aprovada',
    'recusada': 'Recusada'
  };
  return statusMap[status] || status;
}

function getAcaoDescricao(acao) {
  const acoes = {
    'escala_criada': 'Escala criada',
    'escala_aprovada': 'Escala aprovada',
    'escala_celula_definida': 'Pessoa escalada',
    'escala_celula_removida': 'Vaga removida da escala',
    'troca_solicitada': 'Troca solicitada',
    'troca_aceita_receptor': 'Troca aceita',
    'troca_aprovada': 'Troca aprovada',
    'troca_recusada': 'Troca recusada',
    'musica_adicionada': 'Música adicionada',
    'musica_excluida': 'Música excluída',
    'membro_criado': 'Membro cadastrado',
    'membro_editado': 'Membro editado',
    'membro_excluido': 'Membro excluído',
    'culto_criado': 'Culto/mapa criado',
  };
  return acoes[acao] || acao;
}

function formatDate(dateStr) {
  // Corrige bug de fuso: "2026-08-16" (sem hora) o JS interpreta como UTC meia-noite,
  // que em fusos negativos (Brasil) cai pro dia anterior ao converter pra hora local.
  if (typeof dateStr === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return new Date(dateStr + "T00:00:00").toLocaleDateString("pt-BR");
  }
  return new Date(dateStr).toLocaleDateString('pt-BR');
}

function formatDateTime(dateStr) {
  return new Date(dateStr).toLocaleString('pt-BR');
}

function formatDetalhes(detalhes) {
  if (typeof detalhes === 'string') {
    try {
      detalhes = JSON.parse(detalhes);
    } catch {
      return detalhes;
    }
  }
  
  return Object.entries(detalhes)
    .map(([key, value]) => `${key}: ${value}`)
    .join(' | ');
}

// Função de debug para escala
function debugEscala() {
  console.log("=== DEBUG ESCALA ===");
  console.log("🔑 Auth Token:", authToken);
  console.log("👤 Current User:", currentUser);
  console.log("🌐 API Base:", API_BASE);
  
  const mesEl = document.getElementById("escalaMes");
  const anoEl = document.getElementById("escalaAno");
  
  console.log("📅 Elemento Mês:", mesEl, "Valor:", mesEl?.value);
  console.log("📅 Elemento Ano:", anoEl, "Valor:", anoEl?.value);
  
  // Testar chamada da API diretamente
  if (authToken) {
    console.log("🧪 Testando API de escalas...");
    const testUrl = `${API_BASE}/escalas?mes=11&ano=2025`;
    console.log("🔗 URL de teste:", testUrl);
    
    fetch(testUrl, {
      headers: {
        "Authorization": `Bearer ${authToken}`,
        "Content-Type": "application/json"
      }
    })
    .then(response => {
      console.log("📡 Response status:", response.status);
      return response.json();
    })
    .then(data => {
      console.log("📊 Response data:", data);
      alert(`Debug completo! Verifique o console. Status: ${data.length || 0} escalas encontradas`);
    })
    .catch(error => {
      console.error("❌ Erro na API:", error);
      alert(`Erro na API: ${error.message}`);
    });
  } else {
    alert("❌ Token não encontrado! Faça login primeiro.");
  }
}

// Função de notificação simples
function showNotification(message, type = 'info') {
  // Criar elemento de notificação
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  
  // Estilos inline para a notificação
  Object.assign(notification.style, {
    position: 'fixed',
    top: '20px',
    right: '20px',
    padding: '1rem',
    borderRadius: '8px',
    color: 'white',
    fontWeight: '500',
    zIndex: '9999',
    maxWidth: '400px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    backgroundColor: type === 'success' ? '#27ae60' : type === 'error' ? '#e74c3c' : '#3498db'
  });
  
  document.body.appendChild(notification);
  
  // Remover após 4 segundos
  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
  }, 4000);
}

// Função de inicialização principal
async function init() {
  try {
    console.log("🚀 Iniciando aplicação Harmonia...");

    const { data: { session } } = await supabase.auth.getSession();

    if (session) {
      try {
        const user = await montarCurrentUser();
        saveAuthData(session.access_token, user);
        showMainApp();
        setTimeout(() => {
          if (document.getElementById("escalaMes")) {
            carregarEscala();
          }
        }, 100);
      } catch (e) {
        console.error("Sessão presente mas sem perfil válido:", e);
        clearAuthData();
        showLoginForm();
      }
    } else {
      clearAuthData();
      showLoginForm();
    }

    console.log("✅ Aplicação iniciada com sucesso!");
  } catch (error) {
    console.error("❌ Erro na inicialização:", error);
    showNotification("Erro na inicialização do sistema", "error");
  }
}

// ====== DASHBOARD ======
async function carregarDashboardSeNecessario() {
  if (!precisaRecarregar("dashboard")) return;
  await loadDashboard();
  marcarCarregado("dashboard");
}

async function loadDashboard() {
  const hoje = new Date();
  const hojeStr = hoje.toISOString().slice(0, 10);
  const mes = hoje.getMonth() + 1;
  const ano = hoje.getFullYear();

  // As 3 primeiras consultas são independentes entre si — rodam em paralelo, não em fila
  const [proximoRes, ultimoRes, escalaRes] = await Promise.allSettled([
    supabase.from("cultos").select("nome, data").gte("data", hojeStr).order("data", { ascending: true }).limit(1),
    supabase.from("cultos").select("nome, data").lt("data", hojeStr).order("data", { ascending: false }).limit(1),
    supabase.from("escalas").select("id, aprovada").eq("mes", mes).eq("ano", ano),
  ]);

  const elProximo = document.querySelector("#dashProximoCulto .dash-card-corpo");
  if (proximoRes.status === "fulfilled" && proximoRes.value.data?.length) {
    const c = proximoRes.value.data[0];
    elProximo.innerHTML = `<strong>${c.nome}</strong><br>${new Date(c.data + "T00:00:00").toLocaleDateString("pt-BR")}`;
  } else {
    elProximo.textContent = "Nenhum culto agendado.";
  }

  const elUltimo = document.querySelector("#dashUltimoCulto .dash-card-corpo");
  if (ultimoRes.status === "fulfilled" && ultimoRes.value.data?.length) {
    const c = ultimoRes.value.data[0];
    elUltimo.innerHTML = `<strong>${c.nome}</strong><br>${new Date(c.data + "T00:00:00").toLocaleDateString("pt-BR")}`;
  } else {
    elUltimo.textContent = "Nenhum culto registrado ainda.";
  }

  const elEscala = document.querySelector("#dashEscalaMes .dash-card-corpo");
  const elConf = document.querySelector("#dashConfirmados .dash-card-corpo");
  const elPend = document.querySelector("#dashPendentes .dash-card-corpo");
  const elVagas = document.querySelector("#dashVagas .dash-card-corpo");

  const escalas = escalaRes.status === "fulfilled" ? escalaRes.value.data : null;
  if (!escalas || escalas.length === 0) {
    elEscala.innerHTML = `${getMonthName(mes)}/${ano} — ainda não criada.`;
    elConf.textContent = "—";
    elPend.textContent = "—";
    elVagas.textContent = "—";
    return;
  }

  const escala = escalas[0];
  elEscala.innerHTML = `${getMonthName(mes)}/${ano} — ${escala.aprovada ? "✅ aprovada" : "⏳ pendente de aprovação"}`;

  try {
    const { data: celulas } = await supabase.from("escala_celulas")
      .select("membro_id, nome_livre, status_confirmacao").eq("escala_id", escala.id);
    const preenchidas = (celulas || []).filter((c) => c.membro_id || (c.nome_livre && c.nome_livre.trim()));
    const confirmados = preenchidas.filter((c) => c.status_confirmacao === "confirmado").length;
    const pendentes = preenchidas.filter((c) => c.status_confirmacao !== "confirmado").length;
    const vagas = (celulas || []).length - preenchidas.length;

    elConf.textContent = String(confirmados);
    elPend.textContent = String(pendentes);
    elVagas.textContent = String(Math.max(vagas, 0));
  } catch (e) {
    console.error("Erro ao carregar células da escala no dashboard:", e);
  }
}

function abrirModoPalcoDoDashboard() {
  document.querySelector('.tab-btn[data-tab="modopalco"]')?.click();
}

// ====== MODO PALCO ======
let palcoCultoAtual = null;
let palcoMusicasOrdenadas = [];
let palcoIndiceAtual = 0;
let palcoCronometroInterval = null;
let palcoCronometroSegundos = 0;
let palcoCronometroRodando = false;
let palcoTranspOffset = 0; // semitons transpostos na música atual do Modo Palco (reseta a cada troca de música)

async function popularSelectPalco() {
  const select = document.getElementById("palcoCultoSelect");
  if (!select) return;

  try {
    const { data, error } = await supabase.from("cultos").select("*").order("data", { ascending: false }).limit(20);
    if (error) throw error;

    select.innerHTML = data.map((c) =>
      `<option value="${c.id}">${c.nome} — ${new Date(c.data + "T00:00:00").toLocaleDateString("pt-BR")}</option>`
    ).join("");

    if (data.length) {
      await carregarCultoNoPalco(data[0].id);
    }

    select.onchange = () => carregarCultoNoPalco(select.value);
  } catch (e) {
    console.error("Erro ao popular Modo Palco:", e);
  }
}

async function carregarCultoNoPalco(cultoId) {
  try {
    // O culto pode ter músicas do catálogo da igreja E/OU do Meu Repertório pessoal —
    // garante que as duas listas estejam carregadas antes de montar o mapa do palco.
    if (repertorioPessoal.length === 0) {
      await loadRepertorioPessoal();
    }

    const { data: culto, error } = await supabase.from("cultos")
      .select("*, culto_musicas(musica_id, repertorio_pessoal_id, ordem)").eq("id", cultoId).single();
    if (error) throw error;

    palcoCultoAtual = culto;
    const ordenadas = (culto.culto_musicas || []).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    palcoMusicasOrdenadas = ordenadas
      .map((cm) => {
        if (cm.musica_id) {
          return musicas.find((m) => m.id === cm.musica_id);
        }
        if (cm.repertorio_pessoal_id) {
          const m = repertorioPessoal.find((r) => r.id === cm.repertorio_pessoal_id);
          // normaliza pro mesmo formato de campo usado no catálogo da igreja (tomOriginal)
          return m ? { ...m, tomOriginal: m.tom_original } : null;
        }
        return null;
      })
      .filter(Boolean);
    palcoIndiceAtual = 0;
    renderPalcoMusicaAtual();
  } catch (e) {
    console.error("Erro ao carregar culto no palco:", e);
  }
}

function renderPalcoMusicaAtual() {
  const tituloEl = document.getElementById("palcoTitulo");
  const obsEl = document.getElementById("palcoObs");
  const indiceEl = document.getElementById("palcoIndice");
  const previewEl = document.getElementById("palcoProximaPreview");
  const cifraWrap = document.getElementById("palcoCifraWrap");
  const cifraTexto = document.getElementById("palcoCifraTexto");
  const tomEl = document.getElementById("palcoTom");

  pararAutoScrollPalco();
  palcoTranspOffset = 0; // toda música nova volta a abrir no tom original
  atualizarBotaoResetTranspPalco();

  if (!palcoMusicasOrdenadas.length) {
    tituloEl.textContent = "Nenhuma música no mapa deste culto";
    tomEl.textContent = "";
    obsEl.textContent = "";
    indiceEl.textContent = "— / —";
    previewEl.textContent = "";
    cifraWrap.style.display = "none";
    return;
  }

  const m = palcoMusicasOrdenadas[palcoIndiceAtual];
  indiceEl.textContent = `${palcoIndiceAtual + 1} / ${palcoMusicasOrdenadas.length}`;
  tituloEl.textContent = m.titulo;
  obsEl.textContent = m.observacoes || "";

  renderPalcoTomECifra();
  cifraTexto.scrollTop = 0;

  const proxima = palcoMusicasOrdenadas[palcoIndiceAtual + 1];
  previewEl.textContent = proxima ? `Próxima: ${proxima.titulo}` : "Última música do mapa";
}

// Redesenha só o tom exibido e a cifra, sem mexer no título/scroll/auto-rolagem.
// Usado tanto no carregamento da música quanto ao clicar em transpor (+/-/reset).
function renderPalcoTomECifra() {
  if (!palcoMusicasOrdenadas.length) return;
  const tomEl = document.getElementById("palcoTom");
  const cifraWrap = document.getElementById("palcoCifraWrap");
  const cifraTexto = document.getElementById("palcoCifraTexto");
  const m = palcoMusicasOrdenadas[palcoIndiceAtual];

  const tomExibido = m.tomOriginal
    ? (palcoTranspOffset ? transporNota(m.tomOriginal, palcoTranspOffset) : m.tomOriginal)
    : null;
  tomEl.textContent = [tomExibido ? `Tom: ${tomExibido}` : null, m.bpm ? `${m.bpm} BPM` : null].filter(Boolean).join("  •  ");

  if (m.cifra && m.cifra.trim()) {
    cifraWrap.style.display = "block";
    cifraTexto.textContent = palcoTranspOffset ? transporTextoCifra(m.cifra, palcoTranspOffset) : m.cifra;
  } else {
    cifraWrap.style.display = "none";
  }
}

// +1 ou -1 semitom na música atual do Modo Palco
function transporPalco(delta) {
  if (!palcoMusicasOrdenadas.length) return;
  palcoTranspOffset += delta;
  renderPalcoTomECifra();
  atualizarBotaoResetTranspPalco();
}

function resetarTransposicaoPalco() {
  if (!palcoTranspOffset) return;
  palcoTranspOffset = 0;
  renderPalcoTomECifra();
  atualizarBotaoResetTranspPalco();
}

function atualizarBotaoResetTranspPalco() {
  const resetBtn = document.getElementById("palcoTranspReset");
  if (!resetBtn) return;
  if (!palcoTranspOffset) {
    resetBtn.style.display = "none";
    return;
  }
  resetBtn.style.display = "inline-flex";
  resetBtn.textContent = `↺ ${palcoTranspOffset > 0 ? "+" : ""}${palcoTranspOffset}`;
}

// ====== AUTO-ROLAGEM DA CIFRA NO MODO PALCO ======
let palcoAutoScrollInterval = null;
let palcoAutoScrollAtivo = false;

function pararAutoScrollPalco() {
  clearInterval(palcoAutoScrollInterval);
  palcoAutoScrollAtivo = false;
  const btn = document.getElementById("palcoAutoScrollBtn");
  if (btn) btn.textContent = "▶ Auto-rolagem";
}

function iniciarAutoScrollPalco() {
  const cifraEl = document.getElementById("palcoCifraTexto");
  const velocidadeInput = document.getElementById("palcoScrollVelocidade");
  const velocidade = Number(velocidadeInput.value) || 4;

  clearInterval(palcoAutoScrollInterval);
  palcoAutoScrollInterval = setInterval(() => {
    cifraEl.scrollTop += velocidade * 0.6;
    if (cifraEl.scrollTop + cifraEl.clientHeight >= cifraEl.scrollHeight - 2) {
      pararAutoScrollPalco();
    }
  }, 50);
  palcoAutoScrollAtivo = true;
  document.getElementById("palcoAutoScrollBtn").textContent = "⏸ Pausar rolagem";
}

function alternarAutoScrollPalco() {
  if (palcoAutoScrollAtivo) {
    pararAutoScrollPalco();
  } else {
    iniciarAutoScrollPalco();
  }
}

function formatarCronometro(seg) {
  const m = String(Math.floor(seg / 60)).padStart(2, "0");
  const s = String(seg % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function initModoPalco() {
  document.getElementById("palcoAnterior")?.addEventListener("click", () => {
    if (palcoIndiceAtual > 0) {
      palcoIndiceAtual -= 1;
      renderPalcoMusicaAtual();
    }
  });

  document.getElementById("palcoProxima")?.addEventListener("click", () => {
    if (palcoIndiceAtual < palcoMusicasOrdenadas.length - 1) {
      palcoIndiceAtual += 1;
      renderPalcoMusicaAtual();
    }
  });

  document.getElementById("palcoAutoScrollBtn")?.addEventListener("click", alternarAutoScrollPalco);

  document.getElementById("palcoToggleHeaderBtn")?.addEventListener("click", () => {
    document.body.classList.toggle("palco-header-oculto");
  });

  document.getElementById("palcoTranspMenos")?.addEventListener("click", () => transporPalco(-1));
  document.getElementById("palcoTranspMais")?.addEventListener("click", () => transporPalco(1));
  document.getElementById("palcoTranspReset")?.addEventListener("click", resetarTransposicaoPalco);

  // muda a velocidade em tempo real se a rolagem já estiver rodando
  document.getElementById("palcoScrollVelocidade")?.addEventListener("input", () => {
    if (palcoAutoScrollAtivo) {
      iniciarAutoScrollPalco();
    }
  });

  const btnCrono = document.getElementById("palcoCronometroBtn");
  btnCrono?.addEventListener("click", () => {
    if (palcoCronometroRodando) {
      clearInterval(palcoCronometroInterval);
      palcoCronometroRodando = false;
    } else {
      palcoCronometroInterval = setInterval(() => {
        palcoCronometroSegundos += 1;
        btnCrono.textContent = `⏱ ${formatarCronometro(palcoCronometroSegundos)}`;
      }, 1000);
      palcoCronometroRodando = true;
    }
  });

  btnCrono?.addEventListener("dblclick", () => {
    clearInterval(palcoCronometroInterval);
    palcoCronometroRodando = false;
    palcoCronometroSegundos = 0;
    btnCrono.textContent = "⏱ 00:00";
  });
}

document.addEventListener("DOMContentLoaded", init);

