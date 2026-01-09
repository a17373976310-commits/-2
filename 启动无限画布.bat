@echo off
cd /d %~dp0
title 无限画布启动器
echo ==========================================
echo    Gemini 无限画布 (ComfyStyle) 启动中...
echo ==========================================
echo.
echo 正在自动打开浏览器: http://localhost:3000
start http://localhost:3000
echo.
echo 正在运行开发服务器 (Vite)...
npm run dev
if %ERRORLEVEL% neq 0 (
    echo.
    echo [错误] 启动失败！请确保已安装 Node.js 并在该目录下运行过 npm install。
    pause
)
