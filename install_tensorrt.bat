@echo off
REM Opcional: instala o TensorRT da NVIDIA (acelera 2-3x a troca, o restauro e as mascaras).
chcp 65001 >nul
title FaceSwap Studio - TensorRT
cd /d "%~dp0"
call venv\Scripts\activate.bat
echo A instalar TensorRT 10 (~1-2 GB, pode demorar)...
pip install "tensorrt-cu13>=10.13,<11"
python diagnostico.py --trt-check
if errorlevel 1 (
  echo TensorRT 10 nao funcionou com esta versao do onnxruntime. A tentar TensorRT 11...
  pip uninstall -y tensorrt-cu13 tensorrt-cu13-libs tensorrt-cu13-bindings
  pip install "tensorrt-cu13>=11,<12"
  python diagnostico.py --trt-check
  if errorlevel 1 (
    echo.
    echo [AVISO] O TensorRT nao arrancou. A app continua a funcionar normalmente com CUDA.
    echo Para remover: pip uninstall -y tensorrt-cu13 tensorrt-cu13-libs tensorrt-cu13-bindings
    pause & exit /b 1
  )
)
echo.
echo TensorRT ativo! Na 1.a utilizacao cada modelo e otimizado para a tua placa (1-3 min cada, so uma vez).
pause
