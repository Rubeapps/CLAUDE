"""Processamento de vídeo frame a frame com áudio preservado."""
import os
import queue
import subprocess
import threading
import time
from dataclasses import dataclass, field

import cv2
import imageio_ffmpeg
import numpy as np

from .face import FaceAnalyser, similarity
from .processors import FaceEnhancer, FaceSwapper, Upscaler

MAX_SECONDS = 90
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()


@dataclass
class Settings:
    target_mode: str = "largest"          # largest | all | reference
    reference_embedding: np.ndarray = None
    reference_threshold: float = 0.35     # semelhança mínima à cara de referência
    swap_boost: int = 2                   # 1, 2 ou 4 (128/256/512 px)
    mask_blur: float = 0.3
    mask_padding: tuple = (0, 0, 0, 0)
    enhancer: str = "gfpgan"              # none | gfpgan | codeformer
    enhancer_strength: float = 0.8
    codeformer_fidelity: float = 0.7
    upscale: bool = False
    smoothing: bool = True                # estabiliza os pontos da cara entre frames
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


class Engine:
    """Guarda os modelos carregados para não os recarregar entre vídeos."""

    def __init__(self, progress=None):
        self.analyser = FaceAnalyser(progress)
        self.swapper = FaceSwapper(progress)
        self._enhancers = {}
        self._upscaler = None
        self._progress = progress

    def enhancer(self, kind):
        if kind not in self._enhancers:
            self._enhancers[kind] = FaceEnhancer(kind, self._progress)
        return self._enhancers[kind]

    def upscaler(self):
        if self._upscaler is None:
            self._upscaler = Upscaler(self._progress)
        return self._upscaler

    # ---------- seleção e estabilização das caras ----------
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

    @staticmethod
    def _smooth(faces, prev):
        """Suaviza os pontos quando a cara quase não se mexe (reduz tremor/flicker)."""
        if not prev:
            return
        for f in faces:
            p = min(prev, key=lambda q: np.linalg.norm(q.kps.mean(0) - f.kps.mean(0)))
            move = np.linalg.norm(p.kps - f.kps, axis=1).mean() / max(f.size, 1)
            if move > 0.08:
                continue
            alpha = 0.65 if move < 0.01 else 0.4 if move < 0.03 else 0.15
            f.kps = (alpha * p.kps + (1 - alpha) * f.kps).astype(np.float32)

    # ---------- um frame ----------
    def process_frame(self, frame, latent, s: Settings, prev=None):
        if s.max_height and frame.shape[0] > s.max_height:
            r = s.max_height / frame.shape[0]
            frame = cv2.resize(frame, (int(frame.shape[1] * r) // 2 * 2, s.max_height), interpolation=cv2.INTER_AREA)
        faces = self.select_faces(frame, s)
        if s.smoothing:
            self._smooth(faces, prev)
        out = frame
        for f in faces:
            out = self.swapper.swap(out, f, latent, s.swap_boost, s.mask_blur, s.mask_padding)
        if s.enhancer != "none":
            enh = self.enhancer(s.enhancer)
            for f in faces:
                out = enh.enhance(out, f, s.enhancer_strength, s.codeformer_fidelity)
        if s.upscale:
            out = self.upscaler().upscale(out)
        if s.watermark:
            out = add_watermark(out)
        return out, faces

    def process_image(self, image, latent, s: Settings):
        return self.process_frame(image.copy(), latent, s)[0]

    # ---------- vídeo completo ----------
    def process_video(self, src, dst, latent, s: Settings, progress=None, cancel: threading.Event = None):
        info = probe(src)
        fps = info["fps"]
        start = max(0.0, s.trim_start)
        total = min(info["frames"] - int(start * fps), int(MAX_SECONDS * fps))
        if total <= 0:
            raise ValueError("O vídeo não tem frames depois do ponto de início.")
        duration = total / fps

        cap = cv2.VideoCapture(src)
        if start:
            cap.set(cv2.CAP_PROP_POS_MSEC, start * 1000)
        frames_q = queue.Queue(maxsize=32)

        def reader():
            for _ in range(total):
                ok, fr = cap.read()
                if not ok:
                    break
                frames_q.put(fr)
            frames_q.put(None)

        threading.Thread(target=reader, daemon=True).start()

        writer = None
        prev, done, t0 = None, 0, time.time()
        try:
            while True:
                fr = frames_q.get()
                if fr is None:
                    break
                if cancel is not None and cancel.is_set():
                    raise InterruptedError("Cancelado pelo utilizador.")
                out, prev = self.process_frame(fr, latent, s, prev)
                if writer is None:
                    writer = self._open_writer(dst, src, out.shape[1], out.shape[0], fps, start, duration, s.crf)
                writer.stdin.write(np.ascontiguousarray(out).tobytes())
                done += 1
                if progress:
                    el = time.time() - t0
                    eta = el / done * (total - done)
                    progress(done / total, f"Frame {done}/{total} · {done / el:.1f} fps · faltam ~{eta:.0f}s")
        finally:
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
        cmd = [FFMPEG, "-y", "-loglevel", "error",
               "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{w}x{h}", "-r", f"{fps}", "-i", "-",
               "-ss", f"{start}", "-t", f"{duration}", "-i", src,
               "-map", "0:v:0", "-map", "1:a:0?",
               "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
               "-c:v", "libx264", "-preset", "medium", "-crf", str(crf), "-pix_fmt", "yuv420p",
               "-c:a", "aac", "-b:a", "192k", "-shortest",
               "-metadata", "comment=Conteudo gerado por IA (FaceSwap Studio)",
               "-movflags", "+faststart", dst]
        return subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
