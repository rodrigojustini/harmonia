# 🎵 Harmonia - Sistema de Gestão para Ministério de Louvor

# Harmonia - Sistema de Gerenciamento Musical

Sistema completo para gerenciar repertório musical, membros da equipe e organização de cultos com autenticação segura e interface moderna.

## 🚀 Deploy Rápido

### Render.com (Recomendado - Gratuito)

1. **Fork/Clone este repositório**
2. **Conecte ao Render:**
   - Acesse [render.com](https://render.com)
   - Conecte sua conta GitHub
   - Crie novo Web Service
   - Conecte este repositório

3. **Configuração do Backend:**
   ```
   Build Command: cd backend && npm install && npx prisma generate && npx prisma migrate deploy
   Start Command: cd backend && npm start
   Environment: Node
   ```

4. **Variáveis de Ambiente:**
   ```
   NODE_ENV=production
   PORT=4000
   JWT_SECRET=seu-jwt-secret-super-seguro-aqui
   DATABASE_URL=file:./prod.db
   ```

### Railway (Alternativa)

1. **Deploy com Railway:**
   ```bash
   npm install -g @railway/cli
   railway login
   railway init
   railway deploy
   ```

## 📱 URLs de Produção

- **Frontend:** Será definido após deploy
- **Backend:** Será definido após deploy

## 🔐 Login Padrão

- **Email:** admin@harmonia.com
- **Senha:** 123456

## 🚀 **Funcionalidades**

### ✅ **Implementadas**
- ✅ **Sistema de Autenticação** (JWT + bcrypt)
- ✅ **Gestão de Músicas** com transposição automática de acordes
- ✅ **Gestão de Membros** com informações de voz e função
- ✅ **Gestão de Cultos** com criação de mapas/setlists
- ✅ **Validação robusta** de dados (Joi)
- ✅ **Interface responsiva** com tema dark
- ✅ **API REST** protegida
- ✅ **Banco de dados** SQLite com Prisma

### 🎯 **Funcionalidades Avançadas**
- 🎼 **Transposição musical** inteligente
- 🔗 **Links compartilháveis** para cultos
- 📱 **Wake Lock** para manter tela ligada
- 💾 **Fallback local** quando offline

## 🏗️ **Arquitetura**

```
harmonia/
├── backend/           # API Node.js + Express + Prisma
│   ├── src/
│   │   └── server.js  # Servidor principal
│   ├── prisma/        # Schema e migrações do banco
│   └── .env           # Variáveis de ambiente
└── frontend/          # SPA vanilla JS
    ├── index.html     # Interface principal
    ├── css/style.css  # Estilos
    └── js/app.js      # Lógica da aplicação
```

## 🛠️ **Instalação e Configuração**

### **Pré-requisitos**
- Node.js 18+ 
- npm ou yarn

### **1. Backend**
```bash
cd backend
npm install
npx prisma migrate dev
npm run dev
```

### **2. Frontend**
Abra o arquivo `frontend/index.html` em um servidor local:
```bash
# Opção 1: Live Server (VS Code)
# Opção 2: Python
python -m http.server 3000
# Opção 3: Node.js
npx serve frontend
```

### **3. Configuração**
Edite `backend/.env`:
```env
DATABASE_URL="file:./dev.db"
PORT=4000
JWT_SECRET="sua-chave-super-secreta-de-pelo-menos-32-caracteres"
```

## 🔐 **Autenticação**

### **Como usar:**
1. Acesse o frontend
2. Clique em "Criar conta" para registro
3. Faça login com suas credenciais
4. O token JWT é salvo automaticamente

### **Segurança implementada:**
- ✅ Senhas hasheadas com bcrypt
- ✅ JWT com expiração de 7 dias  
- ✅ Middleware de autenticação
- ✅ Validação de entrada com Joi
- ✅ Headers CORS configurados

## 📡 **API Endpoints**

### **Autenticação**
```http
POST /api/auth/register   # Criar conta
POST /api/auth/login      # Fazer login
```

### **Músicas** (requer autenticação)
```http
GET  /api/musicas         # Listar músicas
POST /api/musicas         # Criar música
```

### **Membros** (requer autenticação)
```http
GET  /api/membros         # Listar membros
POST /api/membros         # Criar membro
```

### **Cultos** (requer autenticação)
```http
GET  /api/cultos          # Listar cultos do usuário
POST /api/cultos          # Criar culto
GET  /api/cultos/share/:slug  # Culto público
```

## 🧪 **Testando a API**

Use o arquivo `backend/testes.rest` com a extensão REST Client do VS Code:

1. Execute primeiro o registro e login
2. Copie o token retornado no login
3. Substitua `SEU_TOKEN_AQUI` pelo token real
4. Execute os outros endpoints

## 🎼 **Sistema de Transposição**

### **Acordes suportados:**
- Básicos: `C`, `D`, `E`, `F`, `G`, `A`, `B`
- Sustenidos: `C#`, `D#`, `F#`, `G#`, `A#`
- Bemóis: `Db`, `Eb`, `Gb`, `Ab`, `Bb`
- Extensões: `C7`, `Dm`, `Gsus4`, `Am7`, `F/C`

### **Como usar:**
1. Cadastre cifras no campo "Cifra/acordes"
2. No mapa da música, use os botões `+` e `-`
3. Os acordes são transpostos automaticamente

## 🔧 **Melhorias Implementadas**

### **Segurança**
- JWT_SECRET corrigido e seguro
- Todas as rotas protegidas com middleware
- Validação completa com Joi
- UserID vem do token (não hardcoded)

### **Frontend-Backend**
- Conexão completa entre frontend e API
- Sistema de autenticação funcional
- Fallback para localStorage quando offline
- Tratamento de erros robusto

### **Experiência do Usuário**
- Interface de login/registro integrada
- Feedback visual de carregamento
- Mensagens de erro claras
- Botão de logout visível

## 🚧 **Próximas Melhorias Sugeridas**

### **Prioridade ALTA** 🔴
1. **HTTPS** em produção
2. **Rate limiting** para APIs
3. **Refresh tokens** para sessões longas
4. **Upload de imagens** para músicas

### **Prioridade MÉDIA** 🟡
5. **Busca avançada** de músicas
6. **Categorias/tags** para organização
7. **Exportar setlists** em PDF
8. **Notificações** de aniversários

### **Prioridade BAIXA** 🟢
9. **PWA** completo com offline
10. **Sincronização** multi-dispositivo
11. **Relatórios** de uso
12. **Integração** com YouTube/Spotify

## 📄 **Licença**

Este projeto é desenvolvido para uso em ministérios de louvor. Use livremente! 🎵

---

**Desenvolvido com ❤️ para o Reino de Deus**