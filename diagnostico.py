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

if "--trt-check" in sys.argv:
    # Usado pelo install_tensorrt.bat: testa se o TensorRT arranca com o detetor.
    ok = models.tensorrt_available()
    if ok:
        sess = models.session("detector")
        ok = sess.get_providers()[0] == "TensorrtExecutionProvider"
    print("TENSORRT_OK" if ok else "TENSORRT_FALHOU")
    sys.exit(0 if ok else 1)

print(f"TensorRT: {'ATIVO' if models.tensorrt_available() else 'não instalado (opcional: install_tensorrt.bat)'}")
print()

from faceswap.core.processors import FaceSwapper  # noqa: E402

TESTS = {
    "detector": {"input": (1, 3, 640, 640)},
    "gfpgan": {"input": (1, 3, 512, 512)},
    "occluder": {"input": (1, 256, 256, 3)},
    "parser": {"input": (1, 3, 512, 512)},
    "clear_reality_x4": {"input": (1, 3, 256, 256)},
}


def bench(sess, data, n=10):
    sess.run(None, data)  # aquecimento
    t = time.time()
    for _ in range(n):
        sess.run(None, data)
    return (time.time() - t) / n * 1000


for name, feeds in TESTS.items():
    try:
        sess = models.session(name)
        data = {i.name: np.random.rand(*v).astype(np.float32) for i, v in zip(sess.get_inputs(), feeds.values())}
        print(f"  {name:17s} {sess.get_providers()[0]:26s} {bench(sess, data):8.1f} ms")
    except Exception as e:  # noqa: BLE001
        print(f"  {name:17s} ERRO: {e}")
try:
    sw = FaceSwapper()
    src = np.random.rand(1, 512).astype(np.float32)
    for n in (1, 4):
        data = {"target": np.random.rand(n, 3, 128, 128).astype(np.float32), "source": np.repeat(src, n, 0)}
        print(f"  swapper x{n:<9d} {sw.sess.get_providers()[0]:26s} {bench(sw.sess, data):8.1f} ms")
except Exception as e:  # noqa: BLE001
    print(f"  swapper ERRO: {e}")
print()
print(f"Dispositivo final: {models.active_device()}")
print("Referência RTX 5060 (CUDA): swapper x1 ~17 ms, gfpgan ~49 ms, occluder ~27 ms.")
