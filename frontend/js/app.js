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
    role: perfil.role === "admin" ? "leader" : "member",
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
    // ---- MÚSICAS ----
    if (path === "/musicas" && method === "GET") {
      const { data, error } = await supabase.from("musicas").select("*").order("criado_em");
      if (error) throw error;
      return data.map(m => ({ id: m.id, titulo: m.titulo, tomOriginal: m.tom_original, link: m.link, observacoes: m.observacoes }));
    }
    if (path === "/musicas" && method === "POST") {
      const { data, error } = await supabase.from("musicas").insert({
        igreja_id: currentUser.igreja.id, titulo: body.titulo, tom_original: body.tomOriginal,
        link: body.link, observacoes: body.observacoes,
      }).select().single();
      if (error) throw error;
      return { id: data.id, titulo: data.titulo, tomOriginal: data.tom_original, link: data.link, observacoes: data.observacoes };
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
      const { data, error } = await supabase.from("cultos").select("*, culto_musicas(musica_id, ordem)").order("data", { ascending: false });
      if (error) throw error;
      return data.map(c => ({ id: c.id, data: c.data, nome: c.nome, shareSlug: c.share_slug, musicaIds: c.culto_musicas.map(cm => cm.musica_id) }));
    }
    if (path === "/cultos" && method === "POST") {
      const { data: culto, error } = await supabase.from("cultos").insert({
        igreja_id: currentUser.igreja.id, data: body.data, nome: body.nome, criado_por: currentUser.id,
      }).select().single();
      if (error) throw error;
      if (body.musicaIds?.length) {
        const linhas = body.musicaIds.map((mid, i) => ({ igreja_id: currentUser.igreja.id, culto_id: culto.id, musica_id: mid, ordem: i + 1 }));
        const { error: cmErr } = await supabase.from("culto_musicas").insert(linhas);
        if (cmErr) throw cmErr;
      }
      return culto;
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
    let m;
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
        .select("*, solicitante:perfis!trocas_escala_solicitante_id_fkey(id, nome), receptor:perfis!trocas_escala_receptor_id_fkey(id, nome)")
        .order("solicitado_em", { ascending: false });
      if (error) throw error;
      return data.map(t => ({
        id: t.id, status: t.status, data: t.data, funcao: t.funcao, observacao: t.observacao,
        solicitadoEm: t.solicitado_em, solicitanteId: t.solicitante_id, receptorId: t.receptor_id,
        solicitante: t.solicitante ? { name: t.solicitante.nome } : null,
        receptor: t.receptor ? { name: t.receptor.nome } : null,
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
      let q = supabase.from("historico").select("*").order("data", { ascending: false }).limit(200);
      if (params.get("userId")) q = q.eq("user_id", params.get("userId"));
      if (params.get("acao")) q = q.ilike("acao", `%${params.get("acao")}%`);
      if (params.get("dataInicio")) q = q.gte("data", params.get("dataInicio"));
      if (params.get("dataFim")) q = q.lte("data", params.get("dataFim"));
      const { data, error } = await q;
      if (error) throw error;
      return data;
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

// ====== INTERFACE DE LOGIN ======
function showLoginForm() {
  const app = document.querySelector('.app-main');
  const header = document.querySelector('.app-header');
  
  header.style.display = 'none';
  
  app.innerHTML = `
    <div style="max-width: 400px; margin: 2rem auto; padding: 2rem; background: #1a1a1a; border-radius: 1rem;">
      <div style="text-align: center; margin-bottom: 2rem;">
        <div class="logo-circle" style="margin: 0 auto 1rem;">H</div>
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
          <input id="loginPassword" type="password" required>
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
            <input id="registerPassword" type="password" required minlength="6">
          </div>
          <div class="field-group">
            <label style="display:block; margin-bottom:0.5rem;">Sua igreja</label>
            <label style="display:flex; align-items:center; gap:0.5rem; color:#ddd; font-weight:normal; margin-bottom:0.4rem;">
              <input type="radio" name="modoIgreja" value="criar" checked> Cadastrar minha igreja agora (você vira admin)
            </label>
            <label style="display:flex; align-items:center; gap:0.5rem; color:#ddd; font-weight:normal;">
              <input type="radio" name="modoIgreja" value="entrar"> Já tenho um código de convite
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
  
  try {
    messageEl.style.display = 'block';
    messageEl.style.background = '#2563eb';
    messageEl.style.color = '#fff';
    messageEl.textContent = 'Fazendo login...';
    
    await login(email, password);
    showMainApp();
  } catch (error) {
    messageEl.style.background = '#dc2626';
    messageEl.textContent = error.message;
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
  header.style.display = 'flex';
  
  console.log("🚀 Mostrando app principal...");
  console.log("🔑 Token atual:", authToken ? "Presente" : "Ausente");
  console.log("👤 Usuário atual:", currentUser);
  
  // Adicionar informações do usuário
  const existingUserInfo = header.querySelector('.user-info');
  if (!existingUserInfo) {
    const userInfo = document.createElement('div');
    userInfo.className = 'user-info';
    userInfo.style.marginLeft = 'auto';
    userInfo.style.display = 'flex';
    userInfo.style.alignItems = 'center';
    userInfo.style.gap = '1rem';
    
    const userSpan = document.createElement('span');
    const igrejaInfo = currentUser?.igreja ? ` | ${currentUser.igreja.nome}` : '';
    userSpan.textContent = `${currentUser?.name || 'Usuário'}${igrejaInfo} ${currentUser?.role === 'leader' ? '(Líder)' : '(Membro)'}`;
    userSpan.style.fontSize = '0.9rem';
    
    const logoutBtn = document.createElement('button');
    logoutBtn.className = 'btn small secondary';
    logoutBtn.textContent = 'Sair';
    logoutBtn.addEventListener('click', logout);
    
    userInfo.appendChild(userSpan);
    userInfo.appendChild(logoutBtn);
    header.appendChild(userInfo);
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

      if (tab === "aniversarios") {
        renderAniversariantes();
      }
    });
  });
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

function initMusicas() {
  loadMusicas();

  const form = document.getElementById("formMusica");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const titulo = document.getElementById("musicaTitulo").value.trim();
    const tom = document.getElementById("musicaTom").value.trim();
    const link = document.getElementById("musicaLink").value.trim();
    const cifra = document.getElementById("musicaCifra").value;
    const obs = document.getElementById("musicaObs").value.trim();

    if (!titulo) {
      alert("Informe o título da música.");
      return;
    }

    try {
      const novaMusica = await apiCall("/musicas", {
        method: "POST",
        body: JSON.stringify({
          titulo,
          tomOriginal: tom,
          link,
          observacoes: obs,
        }),
      });

      // Adicionar cifra localmente (campo não existe no backend ainda)
      novaMusica.cifra = cifra;
      
      form.reset();
      await loadMusicas();
      
      alert("Música criada com sucesso!");
    } catch (error) {
      alert("Erro ao criar música: " + error.message);
    }
  });
}

function renderMusicas() {
  const listaEl = document.getElementById("listaMusicas");
  listaEl.innerHTML = "";

  if (musicas.length === 0) {
    listaEl.innerHTML =
      "<p style='font-size:0.85rem;color:#bbb;'>Nenhuma música cadastrada ainda.</p>";
    return;
  }

  musicas
    .slice()
    .sort((a, b) => a.titulo.localeCompare(b.titulo))
    .forEach((m) => {
      const item = document.createElement("div");
      item.className = "list-item";

      const main = document.createElement("div");
      main.className = "list-item-main";
      main.innerHTML = `
        <strong>${m.titulo}</strong>
        <span>Tom: ${m.tomOriginal || "-"}</span>
        ${
          m.link
            ? `<a href="${m.link}" target="_blank" style="font-size:0.75rem;color:#2ecc71;">Abrir link</a>`
            : ""
        }
        ${
          m.cifra
            ? `<span style="font-size:0.75rem;color:#aaa;">Cifra cadastrada</span>`
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

function renderMusicasNoSelectCulto() {
  const select = document.getElementById("cultoMusicas");
  if (!select) return;

  select.innerHTML = "";

  if (musicas.length === 0) {
    const opt = document.createElement("option");
    opt.disabled = true;
    opt.textContent = "Cadastre músicas primeiro";
    select.appendChild(opt);
    return;
  }

  musicas
    .slice()
    .sort((a, b) => a.titulo.localeCompare(b.titulo))
    .forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = `${m.titulo} (${m.tomOriginal || "-"})`;
      select.appendChild(opt);
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
        <pre style="background:#101010;padding:0.6rem;border-radius:0.5rem;white-space:pre-wrap;font-size:0.8rem;">${cifraTransposta}</pre>
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

// ====== MEMBROS COM API ======
async function loadMembros() {
  try {
    membros = await apiCall("/membros");
    renderMembros();
  } catch (error) {
    console.error("Erro ao carregar membros:", error);
    // Fallback para dados locais
    membros = loadData(STORAGE_KEYS.MEMBROS);
    renderMembros();
  }
}

function initMembros() {
  loadMembros();

  const form = document.getElementById("formMembro");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const nome = document.getElementById("membroNome").value.trim();
    const voz = document.getElementById("membroVoz").value;
    const funcao = document.getElementById("membroFuncao").value.trim();
    const aniversario = document.getElementById("membroAniversario").value || null;

    if (!nome) {
      alert("Informe o nome do membro.");
      return;
    }

    try {
      await apiCall("/membros", {
        method: "POST",
        body: JSON.stringify({
          nome,
          voz,
          funcao,
          aniversario,
        }),
      });

      form.reset();
      await loadMembros();
      
      alert("Membro cadastrado com sucesso!");
    } catch (error) {
      alert("Erro ao cadastrar membro: " + error.message);
    }
  });
}

function renderMembros() {
  const listaEl = document.getElementById("listaMembros");
  listaEl.innerHTML = "";

  if (membros.length === 0) {
    listaEl.innerHTML =
      "<p style='font-size:0.85rem;color:#bbb;'>Nenhum membro cadastrado ainda.</p>";
    return;
  }

  membros
    .slice()
    .sort((a, b) => a.nome.localeCompare(b.nome))
    .forEach((m) => {
      const item = document.createElement("div");
      item.className = "list-item";

      const main = document.createElement("div");
      main.className = "list-item-main";

      const aniversario = m.aniversario
        ? new Date(m.aniversario).toLocaleDateString("pt-BR")
        : "-";

      main.innerHTML = `
        <strong>${m.nome}</strong>
        <span>Voz/Seção: ${m.voz || "-"}</span>
        <span>Função: ${m.funcao || "-"}</span>
        <span>Aniversário: ${aniversario}</span>
      `;

      item.appendChild(main);
      listaEl.appendChild(item);
    });
}

// ====== ANIVERSÁRIOS ======
function renderAniversariantes() {
  const listaEl = document.getElementById("listaAniversariantes");
  listaEl.innerHTML = "";

  if (membros.length === 0) {
    listaEl.innerHTML =
      "<p style='font-size:0.85rem;color:#bbb;'>Nenhum membro cadastrado.</p>";
    return;
  }

  const mesAtual = new Date().getMonth();
  const aniversariantes = membros.filter((m) => {
    if (!m.aniversario) return false;
    const d = new Date(m.aniversario);
    return d.getMonth() === mesAtual;
  });

  if (aniversariantes.length === 0) {
    listaEl.innerHTML =
      "<p style='font-size:0.85rem;color:#bbb;'>Nenhum aniversariante neste mês.</p>";
    return;
  }

  aniversariantes
    .slice()
    .sort((a, b) => {
      const da = new Date(a.aniversario).getDate();
      const db = new Date(b.aniversario).getDate();
      return da - db;
    })
    .forEach((m) => {
      const item = document.createElement("div");
      item.className = "list-item";

      const d = new Date(m.aniversario);
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

function initCultos() {
  loadCultos();

  const form = document.getElementById("formCulto");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const data = document.getElementById("cultoData").value;
    const nome = document.getElementById("cultoNome").value.trim();
    const select = document.getElementById("cultoMusicas");

    if (!data || !nome) {
      alert("Informe data e nome do culto.");
      return;
    }

    const selecionadas = Array.from(select.selectedOptions).map((opt) =>
      opt.value
    );

    if (selecionadas.length === 0) {
      alert("Selecione pelo menos uma música para o culto.");
      return;
    }

    try {
      await apiCall("/cultos", {
        method: "POST",
        body: JSON.stringify({
          data,
          nome,
          musicaIds: selecionadas,
        }),
      });

      form.reset();
      await loadCultos();
      
      alert("Culto criado com sucesso!");
    } catch (error) {
      alert("Erro ao criar culto: " + error.message);
    }
  });
}

function renderCultos() {
  const listaEl = document.getElementById("listaCultos");
  const detalhesCard = document.getElementById("cultoDetalhesCard");
  const detalhesEl = document.getElementById("cultoDetalhes");

  listaEl.innerHTML = "";
  detalhesCard.style.display = "none";
  detalhesEl.innerHTML = "";

  if (cultos.length === 0) {
    listaEl.innerHTML =
      "<p style='font-size:0.85rem;color:#bbb;'>Nenhum culto cadastrado ainda.</p>";
    return;
  }

  cultos
    .slice()
    .sort((a, b) => new Date(a.data) - new Date(b.data))
    .forEach((c) => {
      const item = document.createElement("div");
      item.className = "list-item";
      item.style.cursor = "pointer";

      const dataFormatada = new Date(c.data).toLocaleDateString("pt-BR");

      const main = document.createElement("div");
      main.className = "list-item-main";
      
      // Verificar se é estrutura do backend (com musicas array) ou local (com musicas.length)
      const qtdMusicas = c.musicas ? (Array.isArray(c.musicas) ? c.musicas.length : 0) : 0;
      
      main.innerHTML = `
        <strong>${c.nome}</strong>
        <span>${dataFormatada}</span>
        <span>Músicas: ${qtdMusicas}</span>
      `;

      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = "Ver mapa";

      item.appendChild(main);
      item.appendChild(tag);

      item.addEventListener("click", () => {
        mostrarDetalhesCulto(c);
      });

      listaEl.appendChild(item);
    });
}

function mostrarDetalhesCulto(culto) {
  const card = document.getElementById("cultoDetalhesCard");
  const el = document.getElementById("cultoDetalhes");
  card.style.display = "block";

  const dataFormatada = new Date(culto.data).toLocaleDateString("pt-BR");

  let html = `
    <p><strong>${culto.nome}</strong> - ${dataFormatada}</p>
    <br/>
    <p><strong>Ordem das músicas:</strong></p>
    <ol style="margin-top:0.4rem;margin-left:1.2rem;">
  `;

  // Verificar estrutura do culto (backend vs local)
  if (culto.musicas && Array.isArray(culto.musicas)) {
    culto.musicas.forEach((mItem) => {
      // Estrutura do backend: mItem.musica
      if (mItem.musica) {
        html += `<li>${mItem.musica.titulo} (${mItem.musica.tomOriginal || "-"})</li>`;
      } else {
        // Estrutura local: buscar música por ID
        const mus = musicas.find((x) => x.id === mItem.musicaId);
        if (mus) {
          html += `<li>${mus.titulo} (${mus.tomOriginal || "-"})</li>`;
        }
      }
    });
  }

  html += "</ol>";

  // Adicionar link de compartilhamento se disponível
  if (culto.shareSlug) {
    html += `
      <div style="margin-top: 1rem; padding: 1rem; background: #2a2a2a; border-radius: 0.5rem;">
        <p><strong>Link de compartilhamento:</strong></p>
        <code style="word-break: break-all;">${window.location.origin}/culto/${culto.shareSlug}</code>
      </div>
    `;
  }

  el.innerHTML = html;
}

// ====== CONFIG: WAKE LOCK + RESET ======
let wakeLock = null;

async function requestWakeLock() {
  try {
    if ("wakeLock" in navigator) {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => {
        console.log("Wake Lock liberado");
      });
      alert("Tentando manter a tela ligada enquanto o app estiver aberto.");
    } else {
      alert("Este navegador/dispositivo não suporta manter a tela ligada.");
    }
  } catch (err) {
    console.error(err);
    alert("Não foi possível ativar o Wake Lock: " + err.message);
  }
}

function initConfig() {
  const btnWakeLock = document.getElementById("btnWakeLock");
  btnWakeLock.addEventListener("click", requestWakeLock);

  document.addEventListener("visibilitychange", () => {
    if (wakeLock !== null && document.visibilityState === "visible") {
      requestWakeLock();
    }
  });

  const btnLimpar = document.getElementById("btnLimparDados");
  btnLimpar.addEventListener("click", () => {
    const ok = confirm(
      "Tem certeza? Isso apagará todas as músicas, membros e cultos deste dispositivo."
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

    alert("Dados locais apagados.");
  });
}

// ====== INIT GERAL ======
function initMainApp() {
  // HTML já está no index.html, apenas inicializar funcionalidades
  initTabs();
  initEscala();
  initTrocas();
  initMusicas();
  initMembros();
  initCultos();
  initHistorico();
  initConfig();
}

// ====== SISTEMA DE ESCALA ======
let escalaAtual = null;
let escalaSelecionada = null;

async function initEscala() {
  console.log("🔧 Inicializando sistema de escala...");
  
  const btnCarregarEscala = document.getElementById("btnCarregarEscala");
  const btnCriarEscala = document.getElementById("btnCriarEscala");
  const btnAprovarEscala = document.getElementById("btnAprovarEscala");
  const formAdicionarMusica = document.getElementById("formAdicionarMusica");
  const escalaMes = document.getElementById("escalaMes");
  const escalaAno = document.getElementById("escalaAno");

  if (!btnCarregarEscala) {
    console.error("❌ Elemento 'btnCarregarEscala' não encontrado!");
    return;
  }

  // Definir mês/ano atual
  const agora = new Date();
  if (escalaMes) escalaMes.value = agora.getMonth() + 1;
  if (escalaAno) escalaAno.value = agora.getFullYear();
  
  console.log("✅ Elementos encontrados, configurando eventos...");

  btnCarregarEscala?.addEventListener("click", carregarEscala);
  btnCriarEscala?.addEventListener("click", criarEscala);
  btnAprovarEscala?.addEventListener("click", aprovarEscala);
  formAdicionarMusica?.addEventListener("submit", adicionarMusicaEscala);
  
  // Debug button
  document.getElementById("btnDebugEscala")?.addEventListener("click", debugEscala);

  // Fechar modal ao clicar no X
  document.querySelector("#modalAdicionarMusica .close")?.addEventListener("click", () => {
    fecharModal("modalAdicionarMusica");
  });

  // NÃO carregar automaticamente - esperar usuário clicar
  console.log("✅ Sistema de escala inicializado");
}

async function carregarEscala() {
  try {
    console.log("🔍 Carregando escala...");
    console.log("🔑 Auth Token no início:", authToken);
    console.log("👤 Current User:", currentUser);
    
    // Mostrar feedback visual
    showNotification("Carregando escala...", "info");
    
    // Verificar se está logado
    if (!authToken) {
      console.error("❌ Usuário não está logado!");
      alert("❌ Você precisa fazer login primeiro!");
      showNotification("Faça login para acessar a escala", "error");
      return;
    }
    
    const mesEl = document.getElementById("escalaMes");
    const anoEl = document.getElementById("escalaAno");
    
    if (!mesEl || !anoEl) {
      console.error("❌ Elementos de mês/ano não encontrados!");
      showNotification("Erro: elementos não encontrados", "error");
      return;
    }
    
    const mes = mesEl.value;
    const ano = anoEl.value;
    
    console.log(`📅 Buscando escala para ${mes}/${ano}`);
    console.log("🔑 Token:", authToken ? "Presente" : "Ausente");
    
    const response = await apiCall(`/escalas?mes=${mes}&ano=${ano}`);
    console.log("📊 Resposta da API:", response);
    const escalas = Array.isArray(response) ? response : (response.data || []);

    if (escalas.length > 0) {
      escalaAtual = escalas[0];
      escalaSelecionada = escalaAtual;
      renderizarCalendario(escalaAtual);
      mostrarBotaoAprovar();
      showNotification(`✅ Escala carregada: ${escalas[0].mes}/${escalas[0].ano}`, "success");
    } else {
      // Escala não existe, perguntar se quer criar
      const mesEl = document.getElementById("escalaMes");
      const anoEl = document.getElementById("escalaAno");
      const mes = mesEl.value;
      const ano = anoEl.value;
      
      const confirmar = confirm(`📅 Nenhuma escala encontrada para ${mes}/${ano}.\n\n✨ Deseja criar uma nova escala?`);
      
      if (confirmar && currentUser?.role === "leader") {
        // Criar escala automaticamente
        await criarEscala();
      } else if (confirmar && currentUser?.role !== "leader") {
        alert("❌ Apenas líderes podem criar escalas.");
        showNotification("Apenas líderes podem criar escalas", "error");
      } else {
        escalaAtual = null;
        renderizarCalendarioVazio();
        mostrarBotaoCriar();
        showNotification("Nenhuma escala encontrada para este mês/ano", "info");
      }
    }
  } catch (error) {
    console.error("❌ ERRO COMPLETO ao carregar escala:", error);
    alert(`❌ ERRO: ${error.message}`);
    showNotification("Erro ao carregar escala: " + error.message, "error");
  }
}

async function criarEscala() {
  try {
    console.log("🔄 Criando escala...");
    
    if (!authToken) {
      showNotification("Faça login para criar uma escala", "error");
      return;
    }
    
    const mesEl = document.getElementById("escalaMes");
    const anoEl = document.getElementById("escalaAno");
    
    if (!mesEl || !anoEl) {
      console.error("❌ Elementos de mês/ano não encontrados!");
      showNotification("Erro: elementos não encontrados", "error");
      return;
    }
    
    const mes = parseInt(mesEl.value);
    const ano = parseInt(anoEl.value);
    
    console.log(`📅 Criando escala para ${mes}/${ano}`);
    
    const response = await apiCall("/escalas", {
      method: "POST",
      body: JSON.stringify({ mes, ano })
    });

    // A resposta já vem como o objeto escala diretamente
    escalaAtual = response;
    escalaSelecionada = escalaAtual;
    
    console.log("✅ Escala criada:", escalaAtual);
    
    renderizarCalendario(escalaAtual);
    mostrarBotaoAprovar();
    showNotification("Escala criada com sucesso!", "success");
    
  } catch (error) {
    console.error("❌ Erro ao criar escala:", error);
    showNotification("Erro ao criar escala: " + (error.message || "Erro desconhecido"), "error");
  }
}

async function aprovarEscala() {
  if (!escalaAtual) return;

  try {
    await apiCall(`/escalas/${escalaAtual.id}/aprovar`, { method: "PUT" });
    escalaAtual.aprovada = true;
    renderizarCalendario(escalaAtual);
    showNotification("Escala aprovada com sucesso!", "success");
  } catch (error) {
    console.error("Erro ao aprovar escala:", error);
    showNotification("Erro ao aprovar escala: " + (error.message || "Erro desconhecido"), "error");
  }
}

function mostrarBotaoCriar() {
  console.log("👑 Usuário atual:", currentUser);
  console.log("🔧 Mostrando botão criar escala");
  
  const btnCriar = document.getElementById("btnCriarEscala");
  const btnAprovar = document.getElementById("btnAprovarEscala");
  
  if (btnCriar) {
    btnCriar.style.display = currentUser?.role === "leader" ? "inline-block" : "none";
    console.log("➕ Botão criar:", btnCriar.style.display);
  }
  
  if (btnAprovar) {
    btnAprovar.style.display = "none";
  }
}

function mostrarBotaoAprovar() {
  document.getElementById("btnCriarEscala").style.display = "none";
  if (currentUser?.role === "leader" && escalaAtual && !escalaAtual.aprovada) {
    document.getElementById("btnAprovarEscala").style.display = "inline-block";
  } else {
    document.getElementById("btnAprovarEscala").style.display = "none";
  }
}

function renderizarCalendario(escala) {
  const container = document.getElementById("escalaCalendario");
  const mes = escala.mes;
  const ano = escala.ano;
  
  // Criar grid do calendário
  const primeiroDia = new Date(ano, mes - 1, 1);
  const ultimoDia = new Date(ano, mes, 0);
  const diasDoMes = ultimoDia.getDate();
  const diaDaSemana = primeiroDia.getDay();
  
  let html = `
    <div class="calendario-grid">
      <div class="calendario-header">Dom</div>
      <div class="calendario-header">Seg</div>
      <div class="calendario-header">Ter</div>
      <div class="calendario-header">Qua</div>
      <div class="calendario-header">Qui</div>
      <div class="calendario-header">Sex</div>
      <div class="calendario-header">Sáb</div>
  `;

  // Dias do mês anterior (para preencher a primeira semana)
  const diasMesAnterior = new Date(ano, mes - 1, 0).getDate();
  for (let i = diaDaSemana - 1; i >= 0; i--) {
    html += `<div class="calendario-dia outro-mes">
      <div class="dia-numero">${diasMesAnterior - i}</div>
    </div>`;
  }

  // Dias do mês atual
  for (let dia = 1; dia <= diasDoMes; dia++) {
    const data = new Date(ano, mes - 1, dia);
    const dataStr = data.toISOString().split('T')[0];
    
    // Filtrar membros e músicas para este dia
    const membrosNoDia = escala.membros?.filter(m => 
      new Date(m.data).toDateString() === data.toDateString()
    ) || [];
    
    const musicasNoDia = escala.musicas?.filter(m => 
      new Date(m.data).toDateString() === data.toDateString()
    ) || [];

    const classeStatus = escala.aprovada ? 'aprovada' : 'pendente';
    
    html += `
      <div class="calendario-dia ${classeStatus}" data-data="${dataStr}">
        <div class="dia-numero">${dia}</div>
        <div class="dia-membros">
          ${membrosNoDia.map(m => `
            <div class="membro-item">
              <span>${m.user?.name || 'Usuário'}</span>
              <span class="membro-funcao">${m.funcao}</span>
            </div>
          `).join('')}
        </div>
        <div class="dia-musicas">
          ${musicasNoDia.map(m => `
            <div class="musica-item">
              <span class="musica-titulo">${m.titulo}</span>
              ${m.tom ? `<span class="musica-tom">${m.tom}</span>` : ''}
              ${podeExcluirMusica(m) ? `<button class="btn-excluir-musica" onclick="excluirMusicaEscala('${m.id}')">🗑️</button>` : ''}
            </div>
          `).join('')}
          ${membrosNoDia.length > 0 ? `<button class="btn-adicionar-musica" onclick="abrirModalMusica('${dataStr}')">+ Música</button>` : ''}
        </div>
      </div>
    `;
  }

  html += `</div>`;
  container.innerHTML = html;
}

function renderizarCalendarioVazio() {
  const container = document.getElementById("escalaCalendario");
  container.innerHTML = `
    <div class="card">
      <h3>Nenhuma escala encontrada</h3>
      <p>Não há escala criada para este mês/ano.</p>
      ${currentUser?.role === "leader" ? `<p><strong>Como líder, você pode criar uma nova escala.</strong></p>` : ''}
    </div>
  `;
}

function podeExcluirMusica(musica) {
  if (currentUser?.role === "leader") return true;
  if (currentUser?.id === musica.adicionadoPor && !escalaAtual?.aprovada) return true;
  return false;
}

function abrirModalMusica(data) {
  document.getElementById("musicaData").value = data;
  document.getElementById("modalAdicionarMusica").style.display = "block";
}

function fecharModal(modalId) {
  document.getElementById(modalId).style.display = "none";
}

async function adicionarMusicaEscala(e) {
  e.preventDefault();
  
  if (!escalaAtual) return;

  try {
    const data = document.getElementById("musicaData").value;
    const titulo = document.getElementById("musicaTituloModal").value;
    const tom = document.getElementById("musicaTomModal").value;
    const link = document.getElementById("musicaLinkModal").value;

    await apiCall(`/escalas/${escalaAtual.id}/musicas`, {
      method: "POST",
      body: JSON.stringify({ data, titulo, tom, link })
    });

    // Recarregar escala
    await carregarEscala();
    fecharModal("modalAdicionarMusica");
    e.target.reset();
    showNotification("Música adicionada com sucesso!", "success");
  } catch (error) {
    console.error("Erro ao adicionar música:", error);
    showNotification("Erro ao adicionar música: " + (error.message || "Erro desconhecido"), "error");
  }
}

async function excluirMusicaEscala(musicaId) {
  if (!confirm("Tem certeza que deseja excluir esta música?")) return;

  try {
    await apiCall(`/escalas/${escalaAtual.id}/musicas/${musicaId}`, {
      method: "DELETE"
    });

    await carregarEscala();
    showNotification("Música excluída com sucesso!", "success");
  } catch (error) {
    console.error("Erro ao excluir música:", error);
    showNotification("Erro ao excluir música: " + (error.message || "Erro desconhecido"), "error");
  }
}

// ====== SISTEMA DE TROCAS ======
async function initTrocas() {
  const formSolicitarTroca = document.getElementById("formSolicitarTroca");
  formSolicitarTroca?.addEventListener("submit", solicitarTroca);

  await carregarEscalasParaTroca();
  await carregarMembrosParaTroca();
  await carregarTrocas();
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
    
    if (currentUser?.role === "leader") {
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
        <p><strong>Data:</strong> ${formatDate(troca.data)} | <strong>Função:</strong> ${troca.funcao}</p>
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
        <p><strong>Data:</strong> ${formatDate(troca.data)} | <strong>Função:</strong> ${troca.funcao}</p>
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
async function initHistorico() {
  const btnFiltrarHistorico = document.getElementById("btnFiltrarHistorico");
  btnFiltrarHistorico?.addEventListener("click", carregarHistorico);

  await carregarHistorico();
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
    'escala_criada': 'Escala Criada',
    'escala_aprovada': 'Escala Aprovada',
    'troca_solicitada': 'Troca Solicitada',
    'troca_aceita': 'Troca Aceita',
    'troca_aprovada': 'Troca Aprovada',
    'troca_recusada': 'Troca Recusada',
    'musica_adicionada': 'Música Adicionada',
    'musica_excluida': 'Música Excluída'
  };
  return acoes[acao] || acao;
}

function formatDate(dateStr) {
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

document.addEventListener("DOMContentLoaded", init);

