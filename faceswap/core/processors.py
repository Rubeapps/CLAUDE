"""Troca de cara (InSwapper), máscaras, restauro de cara (GFPGAN/CodeFormer) e upscale (Real-ESRGAN)."""
import cv2
import numpy as np
import onnx
from onnx import numpy_helper

from . import models
from .face import ARCFACE_112, FFHQ_512, align, box_mask, paste_back

# O InSwapper usa o template ArcFace deslocado 8px para a direita, em 128x128.
SWAP_TEMPLATE_128 = ARCFACE_112 + np.array([8.0, 0.0], np.float32)

# Classes do BiSeNet consideradas "cara": pele, sobrancelhas, olhos, óculos, nariz, boca, lábios
FACE_REGIONS = [1, 2, 3, 4, 5, 6, 10, 11, 12, 13]
IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], np.float32)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], np.float32)


def _soften(mask):
    """Suaviza a máscara sem a encolher demasiado (igual ao FaceFusion)."""
    return (cv2.GaussianBlur(mask.clip(0, 1), (0, 0), 5).clip(0.5, 1) - 0.5) * 2


class FaceMasker:
    """Máscaras que tornam a troca mais realista.

    - oclusão (XSeg): não pinta por cima de mãos, cabelo, microfones, copos...
    - região (BiSeNet): só troca pele/olhos/nariz/boca, mantendo cabelo e fundo originais.
    """

    def __init__(self, progress=None):
        self._progress = progress
        self._occ = None
        self._parser = None

    def occlusion(self, crop):
        if self._occ is None:
            self._occ = models.session("occluder", self._progress)
        size = crop.shape[0]
        x = cv2.resize(crop, (256, 256)).astype(np.float32)[None] / 255.0
        m = self._occ.run(None, {self._occ.get_inputs()[0].name: x})[0][0, :, :, 0]
        return _soften(cv2.resize(m.clip(0, 1), (size, size)))

    def region(self, crop):
        if self._parser is None:
            self._parser = models.session("parser", self._progress)
        size = crop.shape[0]
        x = cv2.resize(crop, (512, 512))[..., ::-1].astype(np.float32) / 255.0
        x = ((x - IMAGENET_MEAN) / IMAGENET_STD).transpose(2, 0, 1)[None]
        seg = self._parser.run(None, {self._parser.get_inputs()[0].name: x})[0][0].argmax(0)
        m = np.isin(seg, FACE_REGIONS).astype(np.float32)
        return _soften(cv2.resize(m, (size, size)))


def match_color(src, ref, mask):
    """Ajusta a cor/luz da cara nova à da cara original (estatísticas LAB dentro da máscara)."""
    sel = mask > 0.5
    if sel.sum() < 64:
        return src
    s = cv2.cvtColor(src, cv2.COLOR_BGR2LAB).astype(np.float32)
    r = cv2.cvtColor(ref, cv2.COLOR_BGR2LAB).astype(np.float32)
    sm, ss = s[sel].mean(0), s[sel].std(0) + 1e-3
    rm, rs = r[sel].mean(0), r[sel].std(0) + 1e-3
    # Corrige sobretudo a luminosidade média e o tom; o contraste só ligeiramente para não "lavar" a cara
    scale = 1 + (rs / ss - 1) * 0.3
    out = (s - sm) * scale + rm
    return cv2.cvtColor(out.clip(0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR)


class FaceSwapper:
    def __init__(self, progress=None):
        self.sess = models.session("swapper", progress)
        graph = onnx.load(models.model_path(models.resolve("swapper")))
        self.emap = numpy_helper.to_array(graph.graph.initializer[-1]).astype(np.float32)
        del graph

    def latent(self, embedding):
        lat = embedding.reshape(1, -1) @ self.emap
        return (lat / np.linalg.norm(lat)).astype(np.float32)

    def _run(self, crops_rgb01, latent):
        out = []
        for c in crops_rgb01:
            blob = np.ascontiguousarray(c.transpose(2, 0, 1)[None], dtype=np.float32)
            out.append(self.sess.run(None, {"target": blob, "source": latent})[0][0].transpose(1, 2, 0))
        return np.stack(out)

    def swap(self, frame, face, latent, boost=1, mask_blur=0.3, padding=(0, 0, 0, 0),
             masker: FaceMasker = None, occlusion=False, region=False, color_fix=False):
        """boost=1/2/4 -> recorte de 128/256/512 px (mais nitidez, mais lento)."""
        size = 128 * boost
        crop, M = align(frame, face.kps, SWAP_TEMPLATE_128 * boost, size)
        rgb = crop[..., ::-1].astype(np.float32) / 255.0
        # "Pixel boost": divide o recorte grande em boost² sub-imagens de 128 px intercaladas.
        tiles = rgb.reshape(128, boost, 128, boost, 3).transpose(1, 3, 0, 2, 4).reshape(-1, 128, 128, 3)
        res = self._run(tiles, latent)
        res = res.reshape(boost, boost, 128, 128, 3).transpose(2, 0, 3, 1, 4).reshape(size, size, 3)
        swapped = (res[..., ::-1] * 255).clip(0, 255).astype(np.uint8)

        mask = box_mask(size, mask_blur, padding)
        if masker is not None and occlusion:
            occ = masker.occlusion(crop)
            mask = np.minimum(mask, occ)
            face.occ = (occ, M)  # reaproveitado pelo restauro (evita correr o modelo 2x)
        if masker is not None and region:
            mask = np.minimum(mask, masker.region(crop))
        if color_fix:
            swapped = match_color(swapped, crop, mask)
        return paste_back(frame, swapped, mask, M)


class FaceEnhancer:
    """Restaura detalhe da cara depois da troca (o InSwapper trabalha só a 128 px)."""

    def __init__(self, kind="gfpgan", progress=None):
        self.kind = kind
        self.sess = models.session(kind, progress)

    def enhance(self, frame, face, strength=0.8, fidelity=0.7, masker: FaceMasker = None, occlusion=False):
        crop, M = align(frame, face.kps, FFHQ_512, 512)
        blob = ((crop[..., ::-1].astype(np.float32) / 255.0 - 0.5) / 0.5).transpose(2, 0, 1)[None]
        feeds = {"input": np.ascontiguousarray(blob)}
        if self.kind == "codeformer":
            feeds["weight"] = np.array(fidelity, dtype=np.float64)
        out = self.sess.run(None, feeds)[0][0].transpose(1, 2, 0)
        out = ((out.clip(-1, 1) + 1) / 2 * 255)[..., ::-1]
        blended = (out * strength + crop.astype(np.float32) * (1 - strength)).clip(0, 255).astype(np.uint8)
        mask = box_mask(512, 0.3)
        if occlusion and getattr(face, "occ", None) is not None:
            # Converte a máscara de oclusão já calculada na troca para o recorte do restauro
            occ, m_swap = face.occ
            a = np.vstack([M, [0, 0, 1]]) @ np.vstack([cv2.invertAffineTransform(m_swap), [0, 0, 1]])
            occ512 = cv2.warpAffine(occ, a[:2], (512, 512), flags=cv2.INTER_LINEAR, borderValue=1.0)
            mask = np.minimum(mask, occ512)
        elif masker is not None and occlusion:
            mask = np.minimum(mask, masker.occlusion(crop))
        return paste_back(frame, blended, mask, M)


class Upscaler:
    """Upscale em mosaico (para caber na memória da GPU).

    clear_reality_x4 = rede compacta, ~50x mais rápida que o Real-ESRGAN e com resultado natural.
    esrgan_x2/x4     = Real-ESRGAN completo (mais pesado).
    """

    def __init__(self, kind="clear_reality_x4", progress=None, pad=16):
        self.sess = models.session(kind, progress)
        self.input_name = self.sess.get_inputs()[0].name
        self.scale = 4 if kind.endswith("x4") else 2
        gpu = models.use_gpu()
        if kind.startswith("clear_reality"):
            self.tile = 512 if gpu else 384
        else:
            self.tile = (640 if gpu else 384) if self.scale == 2 else (384 if gpu else 256)
        self.pad = pad

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
                blob = np.ascontiguousarray((tile[..., ::-1].astype(np.float32) / 255.0).transpose(2, 0, 1)[None])
                res = self.sess.run(None, {self.input_name: blob})[0][0].transpose(1, 2, 0)
                res = (res.clip(0, 1) * 255)[..., ::-1].astype(np.uint8)
                out[y * k:(y + th) * k, x * k:(x + tw) * k] = res[p * k:p * k + th * k, p * k:p * k + tw * k]
        return out
