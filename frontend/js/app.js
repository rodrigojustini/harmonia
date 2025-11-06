// ====== CONFIGURAÇÃO DA API ======
const API_BASE = window.location.hostname === 'localhost' 
  ? "http://localhost:4000/api" 
  : "http://192.168.0.12:4000/api";

// ====== GESTÃO DE AUTENTICAÇÃO ======
let currentUser = null;
let authToken = null;

function saveAuthData(token, user) {
  authToken = token;
  currentUser = user;
  localStorage.setItem("harmonia_token", token);
  localStorage.setItem("harmonia_user", JSON.stringify(user));
}

function loadAuthData() {
  const token = localStorage.getItem("harmonia_token");
  const userStr = localStorage.getItem("harmonia_user");
  
  if (token && userStr) {
    try {
      authToken = token;
      currentUser = JSON.parse(userStr);
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
  localStorage.removeItem("harmonia_token");
  localStorage.removeItem("harmonia_user");
}

function getAuthHeaders() {
  return authToken ? { "Authorization": `Bearer ${authToken}` } : {};
}

// ====== FUNÇÕES DE API ======
async function apiCall(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const config = {
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
      ...options.headers,
    },
    ...options,
  };

  try {
    const response = await fetch(url, config);
    
    if (response.status === 401) {
      clearAuthData();
      showLoginForm();
      throw new Error("Sessão expirada. Faça login novamente.");
    }

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || `Erro HTTP ${response.status}`);
    }
    
    return data;
  } catch (error) {
    console.error("Erro na API:", error);
    throw error;
  }
}

// ====== AUTENTICAÇÃO ======
async function login(email, password) {
  try {
    const data = await apiCall("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    
    saveAuthData(data.token, data.user);
    return data;
  } catch (error) {
    throw error;
  }
}

async function register(name, email, password) {
  try {
    const data = await apiCall("/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    });
    
    return data;
  } catch (error) {
    throw error;
  }
}

function logout() {
  clearAuthData();
  showLoginForm();
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
  const messageEl = document.getElementById('authMessage');
  
  try {
    messageEl.style.display = 'block';
    messageEl.style.background = '#2563eb';
    messageEl.style.color = '#fff';
    messageEl.textContent = 'Criando conta...';
    
    await register(name, email, password);
    
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
  
  // Adicionar botão de logout
  const existingLogout = header.querySelector('.logout-btn');
  if (!existingLogout) {
    const logoutBtn = document.createElement('button');
    logoutBtn.className = 'btn small logout-btn';
    logoutBtn.textContent = 'Sair';
    logoutBtn.style.marginLeft = 'auto';
    logoutBtn.addEventListener('click', logout);
    header.appendChild(logoutBtn);
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
      Number(opt.value)
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
  // Restaurar o HTML original da main
  const main = document.querySelector('.app-main');
  main.innerHTML = `
    <!-- MÚSICAS -->
    <section id="musicas" class="section active">
      <div class="section-title">
        <h2>Músicas</h2>
        <p>Cadastre e gerencie o repertório do ministério.</p>
      </div>

      <div class="grid-2">
        <div class="card">
          <h3>Nova música</h3>
          <form id="formMusica">
            <div class="field-group">
              <label for="musicaTitulo">Título</label>
              <input id="musicaTitulo" type="text" required />
            </div>
            <div class="field-group">
              <label for="musicaTom">Tom original</label>
              <input id="musicaTom" type="text" placeholder="Ex: G, A, F#..." />
            </div>
            <div class="field-group">
              <label for="musicaLink">Link (YouTube / Cifra)</label>
              <input id="musicaLink" type="url" placeholder="https://..." />
            </div>
            <div class="field-group">
              <label for="musicaCifra">Cifra / acordes (opcional)</label>
              <textarea id="musicaCifra" rows="4" placeholder="Ex: G  D  Em  C&#10;C  D  G  Em"></textarea>
              <small>Use uma linha por compasso ou parte da música. Os acordes serão transpostos automaticamente.</small>
            </div>
            <div class="field-group">
              <label for="musicaObs">Observações</label>
              <textarea id="musicaObs" rows="2" placeholder="Intro, dinâmicas, quem entra em cada parte..."></textarea>
            </div>
            <button class="btn primary" type="submit">Salvar música</button>
          </form>
        </div>

        <div class="card">
          <h3>Lista de músicas</h3>
          <div id="listaMusicas" class="list"></div>
        </div>
      </div>

      <div class="card" id="musicaDetalhesCard" style="display:none;">
        <h3>Mapa / detalhes da música</h3>
        <div id="musicaDetalhes"></div>
      </div>
    </section>

    <!-- CULTOS / MAPAS -->
    <section id="cultos" class="section">
      <div class="section-title">
        <h2>Cultos / Mapas</h2>
        <p>Monte o mapa do culto com músicas em ordem.</p>
      </div>

      <div class="grid-2">
        <div class="card">
          <h3>Novo culto</h3>
          <form id="formCulto">
            <div class="field-group">
              <label for="cultoData">Data</label>
              <input id="cultoData" type="date" required />
            </div>
            <div class="field-group">
              <label for="cultoNome">Nome do culto</label>
              <input id="cultoNome" type="text" placeholder="Domingo Noite, Quinta, etc." required />
            </div>
            <div class="field-group">
              <label for="cultoMusicas">Músicas (ordem do culto)</label>
              <select id="cultoMusicas" multiple size="6"></select>
              <small>Segure Ctrl (ou toque) para selecionar várias músicas.</small>
            </div>
            <button class="btn primary" type="submit">Criar culto / mapa</button>
          </form>
        </div>

        <div class="card">
          <h3>Cultos criados</h3>
          <div id="listaCultos" class="list"></div>
        </div>
      </div>

      <div class="card" id="cultoDetalhesCard" style="display:none;">
        <h3>Detalhes do culto</h3>
        <div id="cultoDetalhes"></div>
      </div>
    </section>

    <!-- MEMBROS -->
    <section id="membros" class="section">
      <div class="section-title">
        <h2>Membros</h2>
        <p>Cadastre quem faz parte do ministério.</p>
      </div>

      <div class="grid-2">
        <div class="card">
          <h3>Novo membro</h3>
          <form id="formMembro">
            <div class="field-group">
              <label for="membroNome">Nome</label>
              <input id="membroNome" type="text" required />
            </div>
            <div class="field-group">
              <label for="membroVoz">Voz / Seção</label>
              <select id="membroVoz">
                <option value="">Selecione</option>
                <option value="Soprano">Soprano</option>
                <option value="Contralto">Contralto</option>
                <option value="Tenor">Tenor</option>
                <option value="Baixo">Baixo</option>
                <option value="Instrumentista">Instrumentista</option>
                <option value="Técnico">Técnico</option>
              </select>
            </div>
            <div class="field-group">
              <label for="membroFuncao">Função</label>
              <input id="membroFuncao" type="text" placeholder="Ex: Voz líder, teclado..." />
            </div>
            <div class="field-group">
              <label for="membroAniversario">Aniversário</label>
              <input id="membroAniversario" type="date" />
            </div>
            <button class="btn primary" type="submit">Salvar membro</button>
          </form>
        </div>

        <div class="card">
          <h3>Lista de membros</h3>
          <div id="listaMembros" class="list"></div>
        </div>
      </div>
    </section>

    <!-- ANIVERSÁRIOS -->
    <section id="aniversarios" class="section">
      <div class="section-title">
        <h2>Aniversários do mês</h2>
        <p>Veja quem faz aniversário neste mês.</p>
      </div>
      <div class="card">
        <div id="listaAniversariantes" class="list"></div>
      </div>
    </section>

    <!-- CONFIG -->
    <section id="config" class="section">
      <div class="section-title">
        <h2>Configurações</h2>
        <p>Opções gerais do app.</p>
      </div>

      <div class="card">
        <h3>Usuário</h3>
        <p>Logado como: <strong>${currentUser?.name}</strong> (${currentUser?.email})</p>
        <button class="btn danger" onclick="logout()">Sair da conta</button>
      </div>

      <div class="card">
        <h3>Tela ligada</h3>
        <p>
          Ative para tentar manter a tela do dispositivo ligada durante o culto.<br />
          <small>Nem todos os aparelhos/navegadores suportam esse recurso.</small>
        </p>
        <button class="btn primary" id="btnWakeLock">Ativar Manter Tela Ligada</button>
      </div>

      <div class="card">
        <h3>Dados</h3>
        <button class="btn danger" id="btnLimparDados">Apagar todos os dados (local)</button>
        <p><small>Use com cuidado – isso apaga músicas, membros e cultos salvos neste dispositivo.</small></p>
      </div>
    </section>
  `;
  
  initTabs();
  initMusicas();
  initMembros();
  initCultos();
  initConfig();
}

document.addEventListener("DOMContentLoaded", () => {
  // Verificar se há dados de autenticação salvos
  if (loadAuthData()) {
    showMainApp();
  } else {
    showLoginForm();
  }
});
