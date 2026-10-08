@echo off
REM Alternativa se o CUDA nao funcionar: DirectML funciona em qualquer placa (NVIDIA/AMD/Intel) no Windows.
chcp 65001 >nul
cd /d "%~dp0"
call venv\Scripts\activate.bat
pip uninstall -y onnxruntime-gpu onnxruntime
pip install onnxruntime-directml
python -c "import onnxruntime as o; print('Dispositivos:', o.get_available_providers())"
echo Feito. Abre com run.bat
pause
