@echo off
chcp 65001 >nul
title FaceSwap Studio - Instalacao
cd /d "%~dp0"
echo ==============================================
echo   FaceSwap Studio - Instalacao
echo ==============================================
where py >nul 2>nul
if %errorlevel%==0 (set PY=py -3.12) else (set PY=python)
%PY% --version >nul 2>nul
if errorlevel 1 (
  set PY=python
  python --version >nul 2>nul
  if errorlevel 1 (
    echo [ERRO] Python nao encontrado. Instala o Python 3.12 de https://www.python.org/downloads/
    echo        e marca a opcao "Add python.exe to PATH".
    pause & exit /b 1
  )
)
if not exist venv (
  echo A criar ambiente virtual...
  %PY% -m venv venv || (echo [ERRO] Falhou a criar o venv & pause & exit /b 1)
)
call venv\Scripts\activate.bat
python -m pip install --upgrade pip
echo A instalar dependencias (pode demorar varios minutos)...
pip install -r requirements.txt || (echo [ERRO] Falhou a instalacao & pause & exit /b 1)
echo.
echo A descarregar os modelos de IA (~1,5 GB)...
python -c "from faceswap.core import models; [models.download(n) for n in models.MODELS]"
echo.
python -c "import onnxruntime as o; p=o.get_available_providers(); print('Dispositivos:', p); print('GPU NVIDIA OK!' if 'CUDAExecutionProvider' in p else 'AVISO: CUDA nao disponivel - corre install_directml.bat')"
echo.
echo Instalacao concluida! Usa run.bat para abrir a aplicacao.
pause
