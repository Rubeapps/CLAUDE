"""Download e carregamento dos modelos ONNX."""
import os
import sys
import threading
import urllib.request

import onnxruntime as ort

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MODELS_DIR = os.path.join(ROOT, "models")
BASE_URL = "https://github.com/facefusion/facefusion-assets/releases/download/models-3.0.0/"

# nome -> (ficheiro, tamanho aproximado em MB, descrição)
MODELS = {
    "detector": ("scrfd_2.5g.onnx", 3, "Deteção de caras (SCRFD)"),
    "recognizer": ("arcface_w600k_r50.onnx", 166, "Identidade da cara (ArcFace)"),
    "swapper": ("inswapper_128.onnx", 530, "Troca de cara (InSwapper)"),
    "gfpgan": ("gfpgan_1.4.onnx", 325, "Restauro de cara (GFPGAN 1.4)"),
    "codeformer": ("codeformer.onnx", 360, "Restauro de cara (CodeFormer)"),
    "esrgan_x2": ("real_esrgan_x2.onnx", 66, "Aumento de resolução (Real-ESRGAN x2)"),
}

_sessions = {}
_lock = threading.Lock()


def model_path(name):
    return os.path.join(MODELS_DIR, MODELS[name][0])


def download(name, progress=None):
    """Descarrega o modelo se ainda não existir. progress(fração, texto) opcional."""
    path = model_path(name)
    if os.path.isfile(path) and os.path.getsize(path) > 0:
        return path
    os.makedirs(MODELS_DIR, exist_ok=True)
    filename, size_mb, desc = MODELS[name]
    tmp = path + ".part"
    print(f"[modelos] A descarregar {filename} (~{size_mb} MB)...")
    with urllib.request.urlopen(BASE_URL + filename) as resp, open(tmp, "wb") as out:
        total = int(resp.headers.get("Content-Length", 0)) or size_mb * 1024 * 1024
        done = 0
        while True:
            chunk = resp.read(1 << 20)
            if not chunk:
                break
            out.write(chunk)
            done += len(chunk)
            if progress:
                progress(min(done / total, 1.0), f"A descarregar {desc}...")
    os.replace(tmp, path)
    return path


def available_providers():
    return ort.get_available_providers()


def _preload_cuda():
    # Com onnxruntime-gpu[cuda,cudnn] as DLLs do CUDA/cuDNN vêm do pip e têm de ser pré-carregadas.
    if hasattr(ort, "preload_dlls"):
        try:
            ort.preload_dlls()
        except Exception as e:  # noqa: BLE001
            print(f"[modelos] Aviso ao carregar DLLs CUDA: {e}")


_preferred = None


def set_device(device):
    """device: 'auto', 'cuda', 'directml' ou 'cpu'. Limpa as sessões em cache."""
    global _preferred
    _preferred = device
    with _lock:
        _sessions.clear()


def _providers():
    avail = available_providers()
    want = _preferred or "auto"
    order = []
    if want in ("auto", "cuda") and "CUDAExecutionProvider" in avail:
        order.append(("CUDAExecutionProvider", {"cudnn_conv_algo_search": "DEFAULT"}))
    if want in ("auto", "directml") and "DmlExecutionProvider" in avail:
        order.append("DmlExecutionProvider")
    order.append("CPUExecutionProvider")
    return order


_cuda_ready = False


def session(name, progress=None):
    global _cuda_ready
    with _lock:
        if name in _sessions:
            return _sessions[name]
    path = download(name, progress)
    if not _cuda_ready and "CUDAExecutionProvider" in available_providers():
        _preload_cuda()
        _cuda_ready = True
    opts = ort.SessionOptions()
    opts.log_severity_level = 3
    try:
        sess = ort.InferenceSession(path, sess_options=opts, providers=_providers())
    except Exception as e:  # noqa: BLE001
        print(f"[modelos] GPU falhou para {name} ({e}); a usar CPU.", file=sys.stderr)
        sess = ort.InferenceSession(path, sess_options=opts, providers=["CPUExecutionProvider"])
    with _lock:
        _sessions[name] = sess
    return sess


def active_device():
    sess = next(iter(_sessions.values()), None)
    provs = sess.get_providers() if sess else [p if isinstance(p, str) else p[0] for p in _providers()]
    first = provs[0]
    return {"CUDAExecutionProvider": "GPU NVIDIA (CUDA)",
            "DmlExecutionProvider": "GPU (DirectML)"}.get(first, "CPU (lento)")
