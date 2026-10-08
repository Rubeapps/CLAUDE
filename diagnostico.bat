@echo off
chcp 65001 >nul
title FaceSwap Studio - Diagnostico
cd /d "%~dp0"
call venv\Scripts\activate.bat
python diagnostico.py
echo.
echo Tira uma captura desta janela e envia.
pause
