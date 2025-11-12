#!/bin/bash
# Script de deploy automático para Hetzner
# Execute este script NO SERVIDOR: bash deploy-hetzner.sh

set -e  # Para em caso de erro

echo "🚀 Iniciando deploy do Harmonia no Hetzner..."
echo "================================================"

# Cores para output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 1. Instalar Node.js se não existir
echo -e "${BLUE}📦 Verificando Node.js...${NC}"
if ! command -v node &> /dev/null; then
    echo "Instalando Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi
echo -e "${GREEN}✅ Node.js $(node -v) instalado${NC}"

# 2. Instalar PM2 globalmente
echo -e "${BLUE}📦 Verificando PM2...${NC}"
if ! command -v pm2 &> /dev/null; then
    echo "Instalando PM2..."
    sudo npm install -g pm2
fi
echo -e "${GREEN}✅ PM2 instalado${NC}"

# 3. Clonar ou atualizar repositório
echo -e "${BLUE}📥 Clonando/atualizando repositório...${NC}"
if [ -d "harmonia" ]; then
    echo "Diretório existe, atualizando..."
    cd harmonia
    git pull origin main
else
    echo "Clonando repositório..."
    git clone https://github.com/rodrigojustini/harmonia.git
    cd harmonia
fi
echo -e "${GREEN}✅ Repositório atualizado${NC}"

# 4. Instalar dependências do backend
echo -e "${BLUE}📦 Instalando dependências do backend...${NC}"
cd backend
npm install
npx prisma generate
npx prisma migrate deploy
cd ..
echo -e "${GREEN}✅ Backend configurado${NC}"

# 5. Instalar dependências do frontend
echo -e "${BLUE}📦 Instalando dependências do frontend...${NC}"
cd frontend
npm install
cd ..
echo -e "${GREEN}✅ Frontend configurado${NC}"

# 6. Parar processos anteriores (se existirem)
echo -e "${BLUE}🔄 Parando processos anteriores...${NC}"
pm2 delete all || true

# 7. Iniciar com PM2
echo -e "${BLUE}🚀 Iniciando aplicação com PM2...${NC}"
pm2 start ecosystem.config.js

# 8. Salvar configuração PM2
echo -e "${BLUE}💾 Salvando configuração PM2...${NC}"
pm2 save

# 9. Configurar PM2 para iniciar no boot
echo -e "${BLUE}⚙️  Configurando PM2 para iniciar no boot...${NC}"
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $USER --hp $HOME || true

# 10. Configurar firewall
echo -e "${BLUE}🔥 Configurando firewall...${NC}"
sudo ufw allow 8080/tcp comment 'Harmonia Frontend'
sudo ufw allow 4000/tcp comment 'Harmonia Backend'
sudo ufw --force enable
echo -e "${GREEN}✅ Firewall configurado${NC}"

# 11. Mostrar status
echo ""
echo "================================================"
echo -e "${GREEN}✅ DEPLOY CONCLUÍDO COM SUCESSO!${NC}"
echo "================================================"
echo ""
pm2 status
echo ""
echo -e "${GREEN}🌐 Acesse o Harmonia em:${NC}"
echo -e "${BLUE}   http://5.78.130.43:8080${NC}"
echo ""
echo -e "${GREEN}📊 Para ver logs:${NC}"
echo "   pm2 logs"
echo ""
echo -e "${GREEN}🔄 Para reiniciar:${NC}"
echo "   pm2 restart all"
echo ""
