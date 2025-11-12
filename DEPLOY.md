# 🎵 HARMONIA - Deploy em Nuvem com PM2

## 🚀 Deploy Rápido

### 1️⃣ Preparar o Servidor

```bash
# Instalar Node.js (versão 18 ou superior)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Instalar PM2 globalmente
sudo npm install -g pm2

# Configurar PM2 para iniciar no boot
pm2 startup
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $USER --hp /home/$USER
```

### 2️⃣ Clonar e Configurar

```bash
# Clonar repositório
git clone https://github.com/rodrigojustini/harmonia.git
cd harmonia

# Instalar dependências do backend
cd backend
npm install
cd ..

# Configurar banco de dados
cd backend
npx prisma generate
npx prisma migrate deploy
node prisma/seed.js
cd ..
```

### 3️⃣ Iniciar com PM2

```bash
# Método 1: Usar npm scripts
npm run deploy

# Método 2: Usar PM2 diretamente
pm2 start ecosystem.config.js

# Salvar configuração para restart automático
pm2 save

# Ver status
pm2 status

# Ver logs
pm2 logs
```

## 🌐 Acessar o Sistema

- **Frontend:** http://SEU-IP:8080
- **Backend API:** http://SEU-IP:4000

**Credenciais padrão:**
- Email: admin@harmonia.com
- Senha: 123456

## 🔧 Comandos Úteis

```bash
# Ver status dos processos
pm2 status

# Ver logs em tempo real
pm2 logs

# Ver monitoramento
pm2 monit

# Reiniciar serviços
pm2 restart all

# Parar serviços
pm2 stop all

# Remover serviços
pm2 delete all
```

## 🔥 Deploy em VPS (Digital Ocean, AWS, etc)

### Opção 1: Digital Ocean Droplet

1. Criar droplet Ubuntu 22.04
2. Conectar via SSH
3. Seguir passos acima
4. Configurar firewall:
```bash
sudo ufw allow 8080/tcp
sudo ufw allow 4000/tcp
sudo ufw allow ssh
sudo ufw enable
```

### Opção 2: Railway.app

1. Criar conta no Railway.app
2. Conectar GitHub
3. Deploy automático do repositório
4. Configurar variáveis de ambiente:
   - `PORT=8080`
   - `NODE_ENV=production`

### Opção 3: Render.com

1. Criar conta no Render.com
2. Novo Web Service
3. Conectar repositório
4. Build Command: `npm run setup`
5. Start Command: `pm2-runtime start ecosystem.config.js`

## 🔐 Configuração de Produção

### Variáveis de Ambiente (.env)

```env
NODE_ENV=production
PORT=4000
DATABASE_URL="file:./dev.db"
JWT_SECRET="seu-secret-super-seguro-aqui"
```

### NGINX (Opcional - para domínio)

```nginx
server {
    listen 80;
    server_name seudominio.com;

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /api {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 📊 Monitoramento

```bash
# Ver uso de CPU/Memória
pm2 monit

# Logs em tempo real
pm2 logs --lines 100

# Restart automático em caso de crash
pm2 startup
pm2 save
```

## 🆘 Troubleshooting

### Porta já em uso
```bash
# Descobrir processo usando a porta
sudo lsof -i :8080
sudo lsof -i :4000

# Matar processo
kill -9 PID
```

### Banco de dados corrompido
```bash
cd backend
rm dev.db
npx prisma migrate deploy
node prisma/seed.js
```

### Logs não aparecem
```bash
pm2 flush
pm2 logs --lines 50
```

## 🔄 Atualização

```bash
# Puxar últimas mudanças
git pull origin main

# Reinstalar dependências se necessário
cd backend && npm install && cd ..

# Reiniciar serviços
pm2 restart all
```

---

**Sistema pronto para produção! 🎉**
