"""Diagnóstico: mostra em que dispositivo corre cada modelo e quanto tempo demora."""
import os
import platform
import subprocess
import sys
import time

import numpy as np
import onnxruntime as ort

from faceswap.core import models

print("=" * 60)
print("FaceSwap Studio - Diagnóstico")
print("=" * 60)
print(f"Python {sys.version.split()[0]} · {platform.platform()}")
print(f"onnxruntime {ort.__version__} · disponíveis: {ort.get_available_providers()}")
try:
    out = subprocess.run(["nvidia-smi", "--query-gpu=name,driver_version,memory.total", "--format=csv,noheader"],
                         capture_output=True, text=True, timeout=15).stdout.strip()
    print(f"Placa: {out or 'nvidia-smi sem resposta'}")
except Exception as e:  # noqa: BLE001
    print(f"Placa: nvidia-smi indisponível ({e})")
print()

ort.set_default_logger_severity(2)  # mostra avisos e erros do CUDA, se houver
if hasattr(ort, "preload_dlls"):
    try:
        ort.preload_dlls()
        print("DLLs CUDA/cuDNN: carregadas")
    except Exception as e:  # noqa: BLE001
        print(f"DLLs CUDA/cuDNN: ERRO -> {e}")
try:
    import onnxruntime.capi._pybind_state as _c
    print(f"Versão CUDA do onnxruntime: {getattr(_c, 'get_build_info', lambda: '?')()}")
except Exception:  # noqa: BLE001
    pass
print()

TESTS = {
    "detector": {"input": (1, 3, 640, 640)},
    "swapper": {"target": (1, 3, 128, 128), "source": (1, 512)},
    "gfpgan": {"input": (1, 3, 512, 512)},
    "occluder": {"input": (1, 256, 256, 3)},
    "parser": {"input": (1, 3, 512, 512)},
    "esrgan_x2": {"input": (1, 3, 256, 256)},
}
for name, feeds in TESTS.items():
    try:
        sess = models.session(name)
        data = {k: np.random.rand(*v).astype(np.float32) for k, v in feeds.items()}
        sess.run(None, data)  # aquecimento
        t = time.time()
        n = 10
        for _ in range(n):
            sess.run(None, data)
        ms = (time.time() - t) / n * 1000
        print(f"  {name:10s} {sess.get_providers()[0]:26s} {ms:8.1f} ms")
    except Exception as e:  # noqa: BLE001
        print(f"  {name:10s} ERRO: {e}")
print()
print(f"Dispositivo final: {models.active_device()}")
print("Na RTX 5060 o 'swapper' deve dar < 10 ms e o 'gfpgan' < 40 ms.")
