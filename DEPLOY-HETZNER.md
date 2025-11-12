# 🚀 Deploy Harmonia no Hetzner

## IP do Servidor: 5.78.130.43

## 📋 Instruções de Deploy

### 1️⃣ Conectar no servidor via SSH:

```bash
ssh root@5.78.130.43
# ou
ssh seu-usuario@5.78.130.43
```

### 2️⃣ Executar deploy automático:

```bash
# Baixar o script de deploy
curl -o deploy-hetzner.sh https://raw.githubusercontent.com/rodrigojustini/harmonia/main/deploy-hetzner.sh

# Dar permissão de execução
chmod +x deploy-hetzner.sh

# Executar o deploy
bash deploy-hetzner.sh
```

### ✅ Pronto! O sistema estará rodando em:

**Frontend:** http://5.78.130.43:8080
**Backend API:** http://5.78.130.43:4000

---

## 🔐 Login padrão:

- **Admin:** `admin@harmonia.com` / senha: `admin123`
- **Líder:** `lider@harmonia.com` / senha: `lider123`

---

## 📊 Comandos úteis no servidor:

```bash
# Ver status dos serviços
pm2 status

# Ver logs em tempo real
pm2 logs

# Reiniciar serviços
pm2 restart all

# Parar serviços
pm2 stop all

# Atualizar código (após git push)
cd harmonia
git pull origin main
pm2 restart all
```

---

## 🔒 Segurança adicional (opcional):

```bash
# Instalar certificado SSL com Let's Encrypt
sudo apt install certbot
sudo certbot certonly --standalone -d seu-dominio.com

# Configurar nginx como reverse proxy
sudo apt install nginx
```

---

## 🆘 Troubleshooting:

Se as portas não estiverem acessíveis:

```bash
# Verificar firewall
sudo ufw status

# Liberar portas manualmente
sudo ufw allow 8080
sudo ufw allow 4000
```

Se precisar reconfigurar tudo:

```bash
# Limpar e reinstalar
pm2 delete all
cd harmonia
git pull origin main
bash ../deploy-hetzner.sh
```
