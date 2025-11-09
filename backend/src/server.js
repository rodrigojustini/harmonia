import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";

dotenv.config();

const app = express();
const prisma = new PrismaClient();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;

// Middleware de autenticação
function auth(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Token ausente" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "supersecret");
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: "Token inválido" });
  }
}

// Função para gerar slug de compartilhamento
function generateSlug() {
  return crypto.randomBytes(6).toString("hex");
}

// ======================== ROTAS BÁSICAS ========================
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Harmonia backend no ar" });
});

// ======================== AUTENTICAÇÃO ========================
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password, funcao } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ error: "Nome, e-mail e senha são obrigatórios" });

    const existe = await prisma.user.findUnique({ where: { email } });
    if (existe) return res.status(400).json({ error: "E-mail já registrado" });

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: { name, email, passwordHash, funcao },
      select: { id: true, name: true, email: true },
    });

    res.status(201).json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao registrar usuário" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: "Usuário não encontrado" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Senha incorreta" });

    const token = jwt.sign(
      { userId: user.id, email: user.email, name: user.name },
      process.env.JWT_SECRET || "supersecret",
      { expiresIn: "7d" }
    );

    res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    res.status(500).json({ error: "Erro ao autenticar" });
  }
});

// ======================== MÚSICAS ========================
app.get("/api/musicas", auth, async (req, res) => {
  const musicas = await prisma.musica.findMany({ orderBy: { titulo: "asc" } });
  res.json(musicas);
});

app.post("/api/musicas", auth, async (req, res) => {
  const { titulo, tomOriginal, link, observacoes } = req.body;
  if (!titulo) return res.status(400).json({ error: "Título obrigatório" });

  const musica = await prisma.musica.create({ data: { titulo, tomOriginal, link, observacoes } });

  await prisma.historico.create({
    data: { userId: req.user.userId, acao: "musica_adicionada", detalhes: titulo },
  });

  res.status(201).json(musica);
});

// ======================== MEMBROS ========================
app.get("/api/membros", auth, async (req, res) => {
  const membros = await prisma.membro.findMany({ orderBy: { nome: "asc" } });
  res.json(membros);
});

app.post("/api/membros", auth, async (req, res) => {
  const { nome, voz, funcao, aniversario } = req.body;
  if (!nome) return res.status(400).json({ error: "Nome obrigatório" });

  const membro = await prisma.membro.create({
    data: { nome, voz, funcao, aniversario: aniversario ? new Date(aniversario) : null },
  });

  res.status(201).json(membro);
});

// ======================== CULTOS ========================
app.get("/api/cultos", auth, async (req, res) => {
  const cultos = await prisma.culto.findMany({
    orderBy: { data: "desc" },
    include: { musicas: { include: { musica: true }, orderBy: { ordem: "asc" } } },
  });
  res.json(cultos);
});

app.post("/api/cultos", auth, async (req, res) => {
  const { data, nome, musicaIds } = req.body;
  if (!data || !nome || !musicaIds?.length)
    return res.status(400).json({ error: "Data, nome e músicas são obrigatórios" });

  const culto = await prisma.culto.create({
    data: {
      data: new Date(data),
      nome,
      shareSlug: generateSlug(),
      userId: req.user.userId,
      musicas: {
        create: musicaIds.map((musicaId, i) => ({
          ordem: i + 1,
          musicaId,
        })),
      },
    },
    include: { musicas: { include: { musica: true } } },
  });

  res.status(201).json({ ...culto, shareUrl: `/culto/${culto.shareSlug}` });
});

// ======================== ESCALAS ========================
app.get("/api/escalas", auth, async (req, res) => {
  const escalas = await prisma.escala.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      membros: { include: { user: true } },
      musicas: true,
    },
  });
  res.json(escalas);
});

app.post("/api/escalas", auth, async (req, res) => {
  const { mes, ano } = req.body;
  if (!mes || !ano) return res.status(400).json({ error: "Mês e ano obrigatórios" });

  const escala = await prisma.escala.create({
    data: { mes, ano, criadaPor: req.user.userId },
  });

  await prisma.historico.create({
    data: { userId: req.user.userId, acao: "escala_criada", detalhes: JSON.stringify({ mes, ano }) },
  });

  res.status(201).json(escala);
});

app.put("/api/escalas/:id/aprovar", auth, async (req, res) => {
  const id = parseInt(req.params.id);
  const escala = await prisma.escala.update({
    where: { id },
    data: { aprovada: true },
  });
  res.json(escala);
});

// ======================== HISTÓRICO ========================
app.get("/api/historico", auth, async (req, res) => {
  const logs = await prisma.historico.findMany({
    where: { userId: req.user.userId },
    orderBy: { data: "desc" },
  });
  res.json(logs);
});

// ======================== SERVIDOR ========================
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Harmonia backend rodando em http://0.0.0.0:${PORT}`);
});
