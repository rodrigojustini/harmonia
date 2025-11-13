#!/bin/bash
cd ~/harmonia
git pull origin main
cd backend
npx prisma db push --accept-data-loss
node seed.js
pm2 restart all
echo "✅ Servidor atualizado com sucesso!"
