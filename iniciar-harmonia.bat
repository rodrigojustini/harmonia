@echo off
echo ========================================
echo   HARMONIA - Sistema de Gestao de Louvor
echo ========================================
echo.
echo Iniciando servicos...
echo.

cd /d %~dp0

echo [1/2] Iniciando Backend (porta 4000)...
pm2 start backend\src\server.js --name harmonia-backend 2>nul || echo Backend ja esta rodando

echo [2/2] Iniciando Frontend (porta 8080)...
pm2 start frontend\server.js --name harmonia-frontend 2>nul || echo Frontend ja esta rodando

echo.
echo ========================================
echo   STATUS DOS SERVICOS:
echo ========================================
pm2 list

echo.
echo ========================================
echo   ACESSE O SISTEMA:
echo ========================================
echo.
echo   URL: http://localhost:8080
echo.
echo   LOGIN ADMINISTRADOR:
echo   Email: admin@harmonia.com
echo   Senha: 123456
echo.
echo ========================================
echo.
pause
