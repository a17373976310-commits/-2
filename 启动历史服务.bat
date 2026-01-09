@echo off
chcp 65001 >nul
echo ============================================
echo 启动历史记录服务
echo ============================================
echo.

cd /d "%~dp0"
python history_server.py

pause
