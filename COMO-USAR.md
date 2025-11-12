# 🎵 HARMONIA - Sistema de Gestão de Ministério de Louvor

## 🚀 Como Iniciar o Sistema

### Método 1: Arquivo BAT (Mais Fácil)
1. **Clique duas vezes** no arquivo `iniciar-harmonia.bat`
2. Aguarde os serviços iniciarem
3. Acesse: `http://localhost:8080`

### Método 2: Comandos Manuais
```bash
# Iniciar Backend
pm2 start backend/src/server.js --name harmonia-backend

# Iniciar Frontend  
pm2 start frontend/server.js --name harmonia-frontend

# Ver status
pm2 status

# Ver logs
pm2 logs
```

## 🌐 Acesso ao Sistema

**URL:** http://localhost:8080

### 👑 Administrador (Líder)
- **Email:** admin@harmonia.com
- **Senha:** 123456

### 👤 Membro
- **Email:** membro@harmonia.com
- **Senha:** 123456

## 📋 Funcionalidades

- ✅ **Escala Mensal** - Criar e gerenciar escalas
- ✅ **Trocas** - Solicitar e aprovar trocas de escala
- ✅ **Músicas** - Cadastrar repertório com cifras
- ✅ **Cultos** - Planejar cultos e ordem de músicas
- ✅ **Membros** - Gerenciar equipe
- ✅ **Histórico** - Ver todas as ações do sistema
- ✅ **Aniversários** - Lista de aniversariantes

## 🔧 Comandos Úteis do PM2

```bash
# Parar serviços
pm2 stop all

# Reiniciar serviços
pm2 restart all

# Ver logs em tempo real
pm2 logs

# Remover todos os processos
pm2 delete all

# Salvar configuração atual
pm2 save
```

## 🐛 Resolução de Problemas

### Botão "Carregar Escala" não funciona

1. **Verifique se está logado:**
   - Faça logout e login novamente
   - Use: admin@harmonia.com / 123456

2. **Use o botão Debug:**
   - Clique no botão "🔧 Debug Escala"
   - Verifique o console do navegador (F12)

3. **Verifique os logs do backend:**
   ```bash
   pm2 logs harmonia-backend
   ```

4. **Reinicie os serviços:**
   ```bash
   pm2 restart all
   ```

### Erro 404 ou página não carrega

1. **Verifique se os serviços estão rodando:**
   ```bash
   pm2 status
   ```

2. **Verifique a porta correta:**
   - Frontend: http://localhost:8080
   - Backend: http://localhost:4000

3. **Reinicie tudo:**
   ```bash
   pm2 delete all
   pm2 start backend/src/server.js --name harmonia-backend
   pm2 start frontend/server.js --name harmonia-frontend
   ```

## 🏗️ Estrutura do Projeto

```
harmonia/
├── backend/
│   ├── src/
│   │   └── server.js          # API REST
│   ├── prisma/
│   │   ├── schema.prisma      # Schema do banco
│   │   └── seed.js            # Dados iniciais
│   └── package.json
├── frontend/
│   ├── index.html             # Interface principal
│   ├── server.js              # Servidor web
│   ├── js/
│   │   └── app.js             # Lógica do frontend
│   └── css/
│       └── style.css          # Estilos
└── iniciar-harmonia.bat       # Script de inicialização
```

## 📊 Tecnologias Utilizadas

- **Backend:** Node.js + Express + Prisma + SQLite
- **Frontend:** HTML + CSS + JavaScript (Vanilla)
- **Autenticação:** JWT + bcrypt
- **Process Manager:** PM2

## 🔐 Segurança

- Senhas hasheadas com bcrypt
- Autenticação via JWT
- CORS habilitado
- Validações no backend

## 📝 Notas Importantes

1. **Porta do Frontend mudou:** De 3000 para **8080**
2. **Banco de dados:** SQLite (arquivo local)
3. **PM2 configurado:** Serviços iniciam automaticamente
4. **Logs disponíveis:** `pm2 logs` para debug

## 🆘 Suporte

Se os problemas persistirem:

1. Verifique se Node.js está instalado: `node --version`
2. Verifique se PM2 está instalado: `pm2 --version`
3. Limpe e reinicie: `pm2 delete all && pm2 flush`
4. Execute o `iniciar-harmonia.bat` novamente

---

**Desenvolvido com ❤️ para o Ministério de Louvor**
