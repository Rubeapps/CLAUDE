"""Troca de cara (InSwapper), restauro de cara (GFPGAN/CodeFormer) e upscale (Real-ESRGAN)."""
import cv2
import numpy as np
import onnx
from onnx import numpy_helper

from . import models
from .face import ARCFACE_112, FFHQ_512, align, box_mask, paste_back

# O InSwapper usa o template ArcFace deslocado 8px para a direita, em 128x128.
SWAP_TEMPLATE_128 = ARCFACE_112 + np.array([8.0, 0.0], np.float32)


class FaceSwapper:
    def __init__(self, progress=None):
        self.sess = models.session("swapper", progress)
        graph = onnx.load(models.model_path("swapper"))
        self.emap = numpy_helper.to_array(graph.graph.initializer[-1])
        del graph

    def latent(self, embedding):
        lat = embedding.reshape(1, -1) @ self.emap
        return (lat / np.linalg.norm(lat)).astype(np.float32)

    def _run(self, crops_rgb01, latent):
        out = []
        for c in crops_rgb01:
            blob = c.transpose(2, 0, 1)[None].astype(np.float32)
            out.append(self.sess.run(None, {"target": blob, "source": latent})[0][0].transpose(1, 2, 0))
        return np.stack(out)

    def swap(self, frame, face, latent, boost=1, mask_blur=0.3, padding=(0, 0, 0, 0)):
        """boost=1/2/4 -> recorte de 128/256/512 px (mais nitidez, mais lento)."""
        size = 128 * boost
        crop, M = align(frame, face.kps, SWAP_TEMPLATE_128 * boost, size)
        rgb = crop[..., ::-1].astype(np.float32) / 255.0
        # "Pixel boost": divide o recorte grande em boost² sub-imagens de 128 px intercaladas.
        tiles = rgb.reshape(128, boost, 128, boost, 3).transpose(1, 3, 0, 2, 4).reshape(-1, 128, 128, 3)
        res = self._run(tiles, latent)
        res = res.reshape(boost, boost, 128, 128, 3).transpose(2, 0, 3, 1, 4).reshape(size, size, 3)
        swapped = (res[..., ::-1] * 255).clip(0, 255).astype(np.uint8)
        return paste_back(frame, swapped, box_mask(size, mask_blur, padding), M)


class FaceEnhancer:
    """Restaura detalhe da cara depois da troca (o InSwapper trabalha só a 128 px)."""

    def __init__(self, kind="gfpgan", progress=None):
        self.kind = kind
        self.sess = models.session(kind, progress)

    def enhance(self, frame, face, strength=0.8, fidelity=0.7):
        crop, M = align(frame, face.kps, FFHQ_512, 512)
        blob = ((crop[..., ::-1].astype(np.float32) / 255.0 - 0.5) / 0.5).transpose(2, 0, 1)[None]
        feeds = {"input": blob}
        if self.kind == "codeformer":
            feeds["weight"] = np.array(fidelity, dtype=np.float64)
        out = self.sess.run(None, feeds)[0][0].transpose(1, 2, 0)
        out = ((out.clip(-1, 1) + 1) / 2 * 255)[..., ::-1]
        blended = (out * strength + crop.astype(np.float32) * (1 - strength)).clip(0, 255).astype(np.uint8)
        return paste_back(frame, blended, box_mask(512, 0.3), M)


class Upscaler:
    """Real-ESRGAN x2/x4 em mosaico (para caber na memória da GPU)."""

    def __init__(self, kind="esrgan_x2", progress=None, tile=384, pad=16):
        self.sess = models.session(kind, progress)
        self.scale = 4 if kind.endswith("x4") else 2
        self.tile, self.pad = (tile if self.scale == 2 else 256), pad

    def upscale(self, frame):
        h, w = frame.shape[:2]
        k = self.scale
        out = np.zeros((h * k, w * k, 3), np.uint8)
        t, p = self.tile, self.pad
        padded = cv2.copyMakeBorder(frame, p, p, p, p, cv2.BORDER_REFLECT)
        for y in range(0, h, t):
            for x in range(0, w, t):
                th, tw = min(t, h - y), min(t, w - x)
                tile = padded[y:y + th + 2 * p, x:x + tw + 2 * p]
                blob = (tile[..., ::-1].astype(np.float32) / 255.0).transpose(2, 0, 1)[None]
                res = self.sess.run(None, {"input": blob})[0][0].transpose(1, 2, 0)
                res = (res.clip(0, 1) * 255)[..., ::-1].astype(np.uint8)
                out[y * k:(y + th) * k, x * k:(x + tw) * k] = res[p * k:p * k + th * k, p * k:p * k + tw * k]
        return out
