# 🎯 Resumo das Mudanças - Sistema Multi-Tenant

## ✅ O que foi feito:

### 1. **Modelo de Dados (schema.prisma)**
- ✅ Criado modelo `Igreja` com: nome, slug, ativa, logo, etc
- ✅ Adicionado `igrejaId` em todos os modelos principais
- ✅ Isolamento completo de dados por igreja

### 2. **Backend (server.js)**
- ✅ Middleware `getIgrejaId` para identificar igreja do usuário
- ✅ Todas as rotas agora filtram por `igrejaId`
- ✅ Login retorna dados da igreja
- ✅ Token JWT inclui informações da igreja

### 3. **Seed (seed.js)**
- ✅ Criação automática de 3 igrejas:
  - Igreja Verbo da Vida
  - Igreja Batista Central
  - Assembleia de Deus
- ✅ Admin para cada igreja

### 4. **Frontend (app.js)**
- ✅ Exibição do nome da igreja no header
- ✅ Isolamento automático de dados

---

## 🚀 Como Deployar no Hetzner:

### **PASSO 1: Fazer backup do banco atual**
```bash
cd ~/harmonia/backend/prisma
cp dev.db dev.db.backup
```

### **PASSO 2: Atualizar código do GitHub**
```bash
cd ~/harmonia
git pull origin main
```

### **PASSO 3: Instalar dependências (se necessário)**
```bash
cd backend
npm install
```

### **PASSO 4: Resetar banco e aplicar novo schema**
```bash
cd ~/harmonia/backend
rm -f prisma/dev.db
npx prisma generate
npx prisma migrate dev --name multi-tenant
```

### **PASSO 5: Popular banco com igrejas e admins**
```bash
npm run seed
```

### **PASSO 6: Reiniciar PM2**
```bash
pm2 restart all
pm2 save
```

### **PASSO 7: Verificar logs**
```bash
pm2 logs --lines 50
```

---

## 🔐 Credenciais de Acesso:

Após executar o seed, você terá:

| Igreja | Email | Senha | Slug |
|--------|-------|-------|------|
| Verbo da Vida | admin@verbo.com | admin123 | verbo |
| Batista Central | admin@batista.com | admin123 | batista |
| Assembleia de Deus | admin@assembleia.com | admin123 | assembleia |

---

## 📝 Funcionalidades Multi-Tenant:

### ✅ **Isolamento Completo**
- Cada igreja vê apenas seus próprios dados
- Músicas, membros, cultos e escalas isolados por igreja
- Não há cruzamento de informações

### ✅ **Acesso Simples**
- Login com email da igreja
- Sistema identifica automaticamente a igreja do usuário
- Todas as operações filtradas automaticamente

### ✅ **Escalabilidade**
- Adicionar novas igrejas facilmente
- Cada igreja pode ter múltiplos usuários
- Suporta hierarquia: leader (líder) e member (membro)

---

## 🔧 Comandos Úteis:

### Ver igrejas cadastradas:
```bash
cd ~/harmonia/backend
npx prisma studio
# Acesse http://5.78.130.43:5555
```

### Adicionar nova igreja manualmente:
```javascript
// No seed.js ou via Prisma Studio
{
  nome: "Nome da Igreja",
  slug: "slug-unico",
  ativa: true,
  email: "contato@igreja.com"
}
```

### Ver todos os usuários:
```bash
pm2 logs harmonia-backend --lines 100
```

---

## 🎯 Próximos Passos (Opcional):

1. **Subdomínios por Igreja**
   - verbo.harmonia.com.br
   - batista.harmonia.com.br
   
2. **Customização Visual**
   - Logo personalizada por igreja
   - Cores do tema

3. **Relatórios por Igreja**
   - Estatísticas isoladas
   - Exportação de dados

4. **Convite de Membros**
   - Link de convite único por igreja
   - Auto-associação à igreja

---

## ⚠️ IMPORTANTE:

Este update **RESETA O BANCO DE DADOS**!

Todos os dados antigos serão perdidos. Se precisar manter algo:
1. Faça backup antes: `cp prisma/dev.db prisma/dev.db.backup`
2. Ou migre dados manualmente após o seed

---

## 📞 Em caso de erro:

1. Verificar logs: `pm2 logs`
2. Verificar se migration rodou: `ls -la prisma/migrations`
3. Verificar conexão do banco: `cat prisma/dev.db`
4. Regenerar Prisma Client: `npx prisma generate`

---

**Criado em:** 14/12/2025
**Status:** ✅ Pronto para Deploy
