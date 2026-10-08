"""Download e carregamento dos modelos ONNX."""
import os
import sys
import threading
import urllib.request

import onnxruntime as ort

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MODELS_DIR = os.path.join(ROOT, "models")
BASE_URL = "https://github.com/facefusion/facefusion-assets/releases/download/"

# nome -> (ficheiro, release, tamanho aproximado em MB, descrição)
MODELS = {
    "detector": ("scrfd_2.5g.onnx", "models-3.0.0", 3, "Deteção de caras (SCRFD)"),
    "recognizer": ("arcface_w600k_r50.onnx", "models-3.0.0", 166, "Identidade da cara (ArcFace)"),
    "swapper": ("inswapper_128.onnx", "models-3.0.0", 530, "Troca de cara (InSwapper)"),
    "swapper_fp16": ("inswapper_128_fp16.onnx", "models-3.0.0", 265, "Troca de cara (InSwapper FP16)"),
    "gfpgan": ("gfpgan_1.4.onnx", "models-3.0.0", 325, "Restauro de cara (GFPGAN 1.4)"),
    "codeformer": ("codeformer.onnx", "models-3.0.0", 360, "Restauro de cara (CodeFormer)"),
    "occluder": ("xseg_1.onnx", "models-3.1.0", 67, "Máscara de oclusão (XSeg)"),
    "parser": ("bisenet_resnet_34.onnx", "models-3.0.0", 90, "Máscara de pele (BiSeNet)"),
    "esrgan_x2": ("real_esrgan_x2.onnx", "models-3.0.0", 66, "Aumento de resolução (Real-ESRGAN x2)"),
    "esrgan_x2_fp16": ("real_esrgan_x2_fp16.onnx", "models-3.0.0", 35, "Aumento de resolução (Real-ESRGAN x2 FP16)"),
    "esrgan_x4": ("real_esrgan_x4.onnx", "models-3.0.0", 66, "Aumento de resolução (Real-ESRGAN x4)"),
    "esrgan_x4_fp16": ("real_esrgan_x4_fp16.onnx", "models-3.0.0", 35, "Aumento de resolução (Real-ESRGAN x4 FP16)"),
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
    filename, release, size_mb, desc = MODELS[name]
    tmp = path + ".part"
    print(f"[modelos] A descarregar {filename} (~{size_mb} MB)...")
    with urllib.request.urlopen(f"{BASE_URL}{release}/{filename}") as resp, open(tmp, "wb") as out:
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
        # HEURISTIC: escolhe logo um algoritmo bom, sem testes longos no arranque
        order.append(("CUDAExecutionProvider", {"cudnn_conv_algo_search": "HEURISTIC"}))
    if want in ("auto", "directml") and "DmlExecutionProvider" in avail:
        order.append("DmlExecutionProvider")
    order.append("CPUExecutionProvider")
    return order


_cuda_ready = False


def use_gpu():
    want = _preferred or "auto"
    avail = available_providers()
    return (want in ("auto", "cuda") and "CUDAExecutionProvider" in avail) or \
           (want in ("auto", "directml") and "DmlExecutionProvider" in avail)


def resolve(name):
    """Na GPU usa a versão FP16 (≈2x mais rápida, mesma qualidade visual) quando existe."""
    fp16 = name + "_fp16"
    return fp16 if fp16 in MODELS and use_gpu() else name


def needed_models():
    base = ["detector", "recognizer", "swapper", "gfpgan", "codeformer", "occluder", "parser", "esrgan_x2", "esrgan_x4"]
    return [resolve(n) for n in base]


def session(name, progress=None):
    global _cuda_ready
    name = resolve(name)
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
    used = sess.get_providers()[0]
    print(f"[modelos] {name} -> {used}")
    if use_gpu() and used == "CPUExecutionProvider":
        print(f"[modelos] ATENÇÃO: {name} está a correr no PROCESSADOR (lento). Corre diagnostico.bat.",
              file=sys.stderr)
    with _lock:
        _sessions[name] = sess
    return sess


def active_device():
    sess = next(iter(_sessions.values()), None)
    provs = sess.get_providers() if sess else [p if isinstance(p, str) else p[0] for p in _providers()]
    first = provs[0]
    return {"CUDAExecutionProvider": "GPU NVIDIA (CUDA)",
            "DmlExecutionProvider": "GPU (DirectML)"}.get(first, "CPU (lento)")
