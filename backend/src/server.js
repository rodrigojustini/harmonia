import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Joi from "joi";

dotenv.config();

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-trocar-em-producao";

// ====== SCHEMAS DE VALIDAÇÃO ======
const registerSchema = Joi.object({
  name: Joi.string().min(2).max(100).required().messages({
    'string.min': 'Nome deve ter pelo menos 2 caracteres',
    'string.max': 'Nome deve ter no máximo 100 caracteres',
    'any.required': 'Nome é obrigatório'
  }),
  email: Joi.string().email().required().messages({
    'string.email': 'Email deve ter um formato válido',
    'any.required': 'Email é obrigatório'
  }),
  password: Joi.string().min(6).required().messages({
    'string.min': 'Senha deve ter pelo menos 6 caracteres',
    'any.required': 'Senha é obrigatória'
  })
});

const loginSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'Email deve ter um formato válido',
    'any.required': 'Email é obrigatório'
  }),
  password: Joi.string().required().messages({
    'any.required': 'Senha é obrigatória'
  })
});

const musicaSchema = Joi.object({
  titulo: Joi.string().min(1).max(200).required().messages({
    'string.min': 'Título não pode estar vazio',
    'string.max': 'Título deve ter no máximo 200 caracteres',
    'any.required': 'Título é obrigatório'
  }),
  tomOriginal: Joi.string().max(10).allow('').optional(),
  link: Joi.string().uri().allow('').optional(),
  observacoes: Joi.string().max(1000).allow('').optional()
});

const membroSchema = Joi.object({
  nome: Joi.string().min(2).max(100).required().messages({
    'string.min': 'Nome deve ter pelo menos 2 caracteres',
    'string.max': 'Nome deve ter no máximo 100 caracteres',
    'any.required': 'Nome é obrigatório'
  }),
  voz: Joi.string().max(50).allow('').optional(),
  funcao: Joi.string().max(100).allow('').optional(),
  aniversario: Joi.date().iso().allow(null).optional()
});

const cultoSchema = Joi.object({
  data: Joi.date().iso().required().messages({
    'date.base': 'Data deve ser uma data válida',
    'any.required': 'Data é obrigatória'
  }),
  nome: Joi.string().min(1).max(100).required().messages({
    'string.min': 'Nome não pode estar vazio',
    'string.max': 'Nome deve ter no máximo 100 caracteres',
    'any.required': 'Nome é obrigatório'
  }),
  musicaIds: Joi.array().items(Joi.number().integer().positive()).min(1).required().messages({
    'array.min': 'Pelo menos uma música é obrigatória',
    'any.required': 'Lista de músicas é obrigatória'
  })
});

// Util para gerar slug compartilhável
function generateShareSlug() {
  return crypto.randomBytes(6).toString("hex"); // ex: "a3f9b2ff12aa"
}

// ====== AUTENTICAÇÃO ======

// registrar usuário (líder ou membro)
app.post("/api/auth/register", async (req, res) => {
  try {
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ 
        error: error.details[0].message 
      });
    }

    const { name, email, password } = value;

    const existe = await prisma.user.findUnique({ where: { email } });
    if (existe) {
      return res
        .status(400)
        .json({ error: "Já existe usuário com esse e-mail" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: { name, email, passwordHash },
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
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ 
        error: error.details[0].message 
      });
    }

    const { email, password } = value;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: "Credenciais inválidas" });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: "Credenciais inválidas" });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao fazer login" });
  }
});

// (Opcional) middleware para rotas protegidas no futuro
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: "Token não fornecido" });
  }
  const [, token] = authHeader.split(" ");
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token inválido" });
  }
}

// ====== ROTAS MUSICAS ======
app.get("/api/musicas", authMiddleware, async (req, res) => {
  try {
    const musicas = await prisma.musica.findMany({
      orderBy: { titulo: "asc" },
    });
    res.json(musicas);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao listar músicas" });
  }
});

app.post("/api/musicas", authMiddleware, async (req, res) => {
  try {
    const { error, value } = musicaSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ 
        error: error.details[0].message 
      });
    }

    const { titulo, tomOriginal, link, observacoes } = value;

    const musica = await prisma.musica.create({
      data: { titulo, tomOriginal, link, observacoes },
    });

    res.status(201).json(musica);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao criar música" });
  }
});

// ====== ROTAS MEMBROS ======
app.get("/api/membros", authMiddleware, async (req, res) => {
  try {
    const membros = await prisma.membro.findMany({
      orderBy: { nome: "asc" },
    });
    res.json(membros);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao listar membros" });
  }
});

app.post("/api/membros", authMiddleware, async (req, res) => {
  try {
    const { error, value } = membroSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ 
        error: error.details[0].message 
      });
    }

    const { nome, voz, funcao, aniversario } = value;

    const membro = await prisma.membro.create({
      data: {
        nome,
        voz,
        funcao,
        aniversario: aniversario ? new Date(aniversario) : null,
      },
    });

    res.status(201).json(membro);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao criar membro" });
  }
});

// ====== ROTAS CULTOS ======
app.get("/api/cultos", authMiddleware, async (req, res) => {
  try {
    const cultos = await prisma.culto.findMany({
      where: { userId: req.user.userId },
      orderBy: { data: "asc" },
      include: {
        musicas: {
          include: {
            musica: true,
          },
          orderBy: { ordem: "asc" },
        },
      },
    });

    res.json(cultos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao listar cultos" });
  }
});

app.post("/api/cultos", authMiddleware, async (req, res) => {
  try {
    const { error, value } = cultoSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ 
        error: error.details[0].message 
      });
    }

    const { data, nome, musicaIds } = value;

    const slug = generateShareSlug();

    const culto = await prisma.culto.create({
      data: {
        data: new Date(data),
        nome,
        shareSlug: slug,
        userId: req.user.userId, // agora vem do token JWT
        musicas: {
          create: musicaIds.map((musicaId, index) => ({
            ordem: index + 1,
            musicaId,
          })),
        },
      },
      include: {
        musicas: {
          include: { musica: true },
        },
      },
    });

    // URL que você pode mostrar no frontend
    const shareUrl = `https://seu-dominio-ou-localhost/culto/${culto.shareSlug}`;

    res.status(201).json({ ...culto, shareUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao criar culto" });
  }
});

// CULTO COMPARTILHÁVEL POR SLUG
app.get("/api/cultos/share/:slug", async (req, res) => {
  try {
    const { slug } = req.params;

    const culto = await prisma.culto.findUnique({
      where: { shareSlug: slug },
      include: {
        musicas: {
          include: { musica: true },
          orderBy: { ordem: "asc" },
        },
        user: {
          select: { name: true, email: true },
        },
      },
    });

    if (!culto) {
      return res.status(404).json({ error: "Culto não encontrado" });
    }

    res.json(culto);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao buscar culto" });
  }
});

// ====== ROTA RAIZ PARA TESTE RÁPIDO ======
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Harmonia backend no ar" });
});

// ====== INICIAR SERVIDOR ======
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Harmonia backend rodando em:`);
  console.log(`- Local: http://localhost:${PORT}`);
  console.log(`- Rede: http://192.168.0.12:${PORT}`);
});
