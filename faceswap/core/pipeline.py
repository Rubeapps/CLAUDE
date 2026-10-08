"""Processamento de vídeo frame a frame com áudio preservado."""
import collections
import os
import queue
import subprocess
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field

import cv2
import imageio_ffmpeg
import numpy as np

from . import models
from .face import Face, FaceAnalyser, FaceTracker, similarity
from .processors import FaceEnhancer, FaceMasker, FaceSwapper, Upscaler

MAX_SECONDS = 90
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()


@dataclass
class Settings:
    target_mode: str = "largest"          # largest | all | reference
    reference_embedding: np.ndarray = None
    reference_threshold: float = 0.35     # semelhança mínima à cara de referência
    swap: bool = True                     # False = só melhorar/upscale, sem trocar caras
    swap_boost: int = 2                   # 1, 2 ou 4 (128/256/512 px)
    mask_blur: float = 0.3
    mask_padding: tuple = (0, 0, 0, 0)
    enhancer: str = "gfpgan"              # none | gfpgan | codeformer
    enhancer_strength: float = 0.8
    codeformer_fidelity: float = 0.7
    upscale: bool = False
    upscale_model: str = "esrgan_x2"      # esrgan_x2 | esrgan_x4
    target_height: int = 0                # altura final depois do upscale (0 = escala do modelo)
    smoothing: bool = True                # estabiliza os pontos da cara entre frames
    smoothing_strength: float = 1.0       # 0.3 = pouco, 1 = normal, 2 = muito
    occlusion_mask: bool = True           # não pinta por cima de mãos/cabelo/objetos
    region_mask: bool = False             # só troca pele/olhos/nariz/boca
    color_fix: bool = False               # iguala cor/luz da cara nova à original
    det_threshold: float = 0.5
    watermark: bool = True
    crf: int = 16                         # qualidade H.264 (menor = melhor)
    max_height: int = 0                   # 0 = resolução original
    trim_start: float = 0.0
    extra: dict = field(default_factory=dict)


def probe(path):
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise ValueError("Não foi possível abrir o vídeo.")
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    w, h = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap.release()
    return {"fps": fps, "frames": frames, "width": w, "height": h, "duration": frames / fps if fps else 0}


def read_frame(path, t):
    cap = cv2.VideoCapture(path)
    cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
    ok, frame = cap.read()
    cap.release()
    return frame if ok else None


def add_watermark(frame, text="Gerado por IA"):
    h, w = frame.shape[:2]
    scale = max(0.5, h / 1080)
    (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, scale, 2)
    x, y = w - tw - int(20 * scale), h - int(20 * scale)
    overlay = frame.copy()
    cv2.putText(overlay, text, (x, y), cv2.FONT_HERSHEY_SIMPLEX, scale, (255, 255, 255), max(1, int(2 * scale)), cv2.LINE_AA)
    return cv2.addWeighted(overlay, 0.6, frame, 0.4, 0)


_ENCODER = None


def video_encoder():
    """Usa o codificador da placa NVIDIA (NVENC) se existir – liberta o processador."""
    global _ENCODER
    if _ENCODER is None:
        try:
            r = subprocess.run([FFMPEG, "-hide_banner", "-loglevel", "error", "-f", "lavfi",
                                "-i", "color=c=black:s=256x256:d=0.1", "-c:v", "h264_nvenc", "-f", "null", "-"],
                               capture_output=True, timeout=30)
            _ENCODER = "h264_nvenc" if r.returncode == 0 else "libx264"
        except Exception:  # noqa: BLE001
            _ENCODER = "libx264"
    return _ENCODER


def _scaled(face, k):
    return Face(face.bbox * k, (face.kps * k).astype(np.float32), face.score)


class Engine:
    """Guarda os modelos carregados para não os recarregar entre vídeos."""

    def __init__(self, progress=None):
        self.analyser = FaceAnalyser(progress)
        self.swapper = FaceSwapper(progress)
        self.masker = FaceMasker(progress)
        self._enhancers = {}
        self._upscalers = {}
        self._progress = progress
        self._lock = threading.Lock()

    def enhancer(self, kind):
        with self._lock:
            if kind not in self._enhancers:
                self._enhancers[kind] = FaceEnhancer(kind, self._progress)
            return self._enhancers[kind]

    def upscaler(self, kind="esrgan_x2"):
        with self._lock:
            if kind not in self._upscalers:
                self._upscalers[kind] = Upscaler(kind, self._progress)
            return self._upscalers[kind]

    def warmup(self, s: "Settings"):
        """Carrega já todos os modelos necessários (evita corridas entre threads)."""
        if s.enhancer != "none":
            self.enhancer(s.enhancer)
        if s.upscale:
            self.upscaler(s.upscale_model)
        dummy = np.zeros((256, 256, 3), np.uint8)
        if s.occlusion_mask:
            self.masker.occlusion(dummy)
        if s.region_mask and s.swap:
            self.masker.region(dummy)

    # ---------- seleção das caras ----------
    def select_faces(self, frame, s: Settings):
        need_emb = s.target_mode == "reference"
        faces = self.analyser.detect(frame, s.det_threshold, with_embedding=need_emb)
        if not faces:
            return []
        if s.target_mode == "all":
            return faces
        if s.target_mode == "reference" and s.reference_embedding is not None:
            scored = [(similarity(f.embedding, s.reference_embedding), f) for f in faces]
            best = max(scored, key=lambda x: x[0])
            return [best[1]] if best[0] >= s.reference_threshold else []
        return [max(faces, key=lambda f: f.size)]

    # ---------- etapa 1 (sequencial, rápida): redimensionar + detetar + estabilizar ----------
    def prepare(self, frame, s: Settings, tracker: FaceTracker = None):
        if s.max_height and frame.shape[0] > s.max_height:
            r = s.max_height / frame.shape[0]
            frame = cv2.resize(frame, (int(frame.shape[1] * r) // 2 * 2, s.max_height), interpolation=cv2.INTER_AREA)
        faces = self.select_faces(frame, s)
        if tracker is not None:
            tracker.update(faces)
        return frame, faces

    # ---------- etapa 2 (em paralelo): upscale + troca + restauro ----------
    def render(self, frame, faces, latent, s: Settings):
        out = frame
        if s.upscale:
            # Upscale primeiro: a troca e o restauro trabalham depois na resolução final (mais detalhe).
            out = self.upscaler(s.upscale_model).upscale(out)
        if s.target_height and out.shape[0] != s.target_height:
            r = s.target_height / out.shape[0]
            interp = cv2.INTER_AREA if r < 1 else cv2.INTER_LANCZOS4
            out = cv2.resize(out, (int(round(out.shape[1] * r / 2)) * 2, s.target_height), interpolation=interp)
        k = out.shape[0] / frame.shape[0]
        if k != 1:
            faces = [_scaled(f, k) for f in faces]
        if s.swap and latent is not None:
            for f in faces:
                out = self.swapper.swap(out, f, latent, s.swap_boost, s.mask_blur, s.mask_padding, self.masker,
                                        s.occlusion_mask, s.region_mask, s.color_fix)
        if s.enhancer != "none":
            enh = self.enhancer(s.enhancer)
            for f in faces:
                out = enh.enhance(out, f, s.enhancer_strength, s.codeformer_fidelity, self.masker, s.occlusion_mask)
        if s.watermark:
            out = add_watermark(out)
        return out

    def process_image(self, image, latent, s: Settings):
        # latent pode ser None quando s.swap=False (só melhorar/upscale)
        self.warmup(s)
        frame, faces = self.prepare(image.copy(), s)
        return self.render(frame, faces, latent, s)

    # ---------- vídeo completo ----------
    def process_video(self, src, dst, latent, s: Settings, progress=None, cancel: threading.Event = None,
                      workers=None):
        info = probe(src)
        fps = info["fps"]
        start = max(0.0, s.trim_start)
        total = min(info["frames"] - int(start * fps), int(MAX_SECONDS * fps))
        if total <= 0:
            raise ValueError("O vídeo não tem frames depois do ponto de início.")
        duration = total / fps
        self.warmup(s)
        if workers is None:
            workers = 4 if models.use_gpu() else 2

        cap = cv2.VideoCapture(src)
        if start:
            cap.set(cv2.CAP_PROP_POS_MSEC, start * 1000)
        frames_q = queue.Queue(maxsize=48)

        def reader():
            for _ in range(total):
                ok, fr = cap.read()
                if not ok:
                    break
                frames_q.put(fr)
            frames_q.put(None)

        threading.Thread(target=reader, daemon=True).start()
        device = models.active_device()
        tracker = FaceTracker(fps, s.smoothing_strength) if s.smoothing else None
        pool = ThreadPoolExecutor(max_workers=workers)
        pending = collections.deque()
        writer = None
        state = {"done": 0, "t0": time.time()}

        def write(out):
            nonlocal writer
            if writer is None:
                writer = self._open_writer(dst, src, out.shape[1], out.shape[0], fps, start, duration, s.crf)
            writer.stdin.write(np.ascontiguousarray(out).tobytes())
            state["done"] += 1
            if progress:
                done = state["done"]
                el = time.time() - state["t0"]
                eta = el / done * (total - done)
                progress(done / total, f"Frame {done}/{total} · {done / el:.1f} fps · faltam ~{eta:.0f}s · {device}")

        try:
            while True:
                fr = frames_q.get()
                if fr is None:
                    break
                if cancel is not None and cancel.is_set():
                    raise InterruptedError("Cancelado pelo utilizador.")
                frame, faces = self.prepare(fr, s, tracker)
                pending.append(pool.submit(self.render, frame, faces, latent, s))
                while len(pending) > workers * 2:
                    write(pending.popleft().result())
            while pending:
                write(pending.popleft().result())
        finally:
            pool.shutdown(wait=True, cancel_futures=True)
            cap.release()
            if writer is not None:
                writer.stdin.close()
                writer.wait()
        if writer is None or writer.returncode != 0:
            raise RuntimeError("Falha ao gravar o vídeo:\n" + (writer.stderr.read().decode(errors="ignore")[-800:] if writer else ""))
        return dst

    @staticmethod
    def _open_writer(dst, src, w, h, fps, start, duration, crf):
        os.makedirs(os.path.dirname(os.path.abspath(dst)), exist_ok=True)
        enc = video_encoder()
        if enc == "h264_nvenc":
            vcodec = ["-c:v", "h264_nvenc", "-preset", "p5", "-tune", "hq", "-rc", "vbr", "-cq", str(crf + 3), "-b:v", "0"]
        else:
            vcodec = ["-c:v", "libx264", "-preset", "fast", "-crf", str(crf)]
        cmd = [FFMPEG, "-y", "-loglevel", "error",
               "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{w}x{h}", "-r", f"{fps}", "-i", "-",
               "-ss", f"{start}", "-t", f"{duration}", "-i", src,
               "-map", "0:v:0", "-map", "1:a:0?",
               "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", *vcodec, "-pix_fmt", "yuv420p",
               "-c:a", "aac", "-b:a", "192k", "-shortest",
               "-metadata", "comment=Conteudo gerado por IA (FaceSwap Studio)",
               "-movflags", "+faststart", dst]
        return subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)


def plan_upscale(src_height, target_height):
    """Escolhe o modelo para chegar à altura pedida. Devolve (upscale?, modelo)."""
    ratio = target_height / max(src_height, 1)
    if ratio <= 1.0:
        return False, "esrgan_x2"
    return True, ("esrgan_x2" if ratio <= 2.0 else "esrgan_x4")
