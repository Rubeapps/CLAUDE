@echo off
chcp 65001 >nul
title FaceSwap Studio
cd /d "%~dp0"
if not exist venv (echo Corre primeiro install.bat & pause & exit /b 1)
call venv\Scripts\activate.bat
python app.py %*
pause
