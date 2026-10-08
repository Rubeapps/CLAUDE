"""Deteção (SCRFD), alinhamento e identidade (ArcFace) de caras."""
from dataclasses import dataclass, field

import cv2
import numpy as np

from . import models

# Pontos de referência (olho esq., olho dir., nariz, canto boca esq., canto boca dir.)
ARCFACE_112 = np.array([[38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366],
                        [41.5493, 92.3655], [70.7299, 92.2041]], dtype=np.float32)
FFHQ_512 = np.array([[0.37691676, 0.46864664], [0.62285697, 0.46912813], [0.50123859, 0.61331904],
                     [0.39308822, 0.72541100], [0.61150205, 0.72490465]], dtype=np.float32) * 512


@dataclass
class Face:
    bbox: np.ndarray        # x1, y1, x2, y2
    kps: np.ndarray         # (5, 2)
    score: float
    embedding: np.ndarray = field(default=None, repr=False)

    @property
    def size(self):
        return float(max(self.bbox[2] - self.bbox[0], self.bbox[3] - self.bbox[1]))

    @property
    def center_x(self):
        return float((self.bbox[0] + self.bbox[2]) / 2)


def align(img, kps, template, size):
    """Recorta a cara alinhada. Devolve (crop, matriz afim)."""
    M, _ = cv2.estimateAffinePartial2D(kps.astype(np.float32), template, method=cv2.LMEDS)
    if M is None:
        M = cv2.estimateAffinePartial2D(kps.astype(np.float32), template)[0]
    crop = cv2.warpAffine(img, M, (size, size), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    return crop, M


def box_mask(size, blur=0.3, padding=(0, 0, 0, 0)):
    """Máscara retangular com bordas suaves. padding = (cima, direita, baixo, esquerda) em %."""
    border = max(1, int(size * blur * 0.5))
    m = np.zeros((size, size), np.float32)
    t, r, b, l = (int(size * p / 100) for p in padding)
    m[border + t:size - border - b, border + l:size - border - r] = 1.0
    if blur > 0:
        m = cv2.GaussianBlur(m, (0, 0), border * 0.5)
    return m


def paste_back(frame, crop, mask, M):
    """Cola um recorte alinhado de volta no frame, só na região afetada (mais rápido)."""
    h, w = frame.shape[:2]
    size = crop.shape[0]
    inv = cv2.invertAffineTransform(M)
    corners = np.array([[0, 0, 1], [size, 0, 1], [0, size, 1], [size, size, 1]], np.float32) @ inv.T
    x0, y0 = np.floor(corners.min(0)).astype(int)
    x1, y1 = np.ceil(corners.max(0)).astype(int)
    x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, w), min(y1, h)
    if x1 <= x0 or y1 <= y0:
        return frame
    inv[:, 2] -= (x0, y0)
    rw, rh = x1 - x0, y1 - y0
    warped = cv2.warpAffine(crop, inv, (rw, rh), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    wmask = cv2.warpAffine(mask, inv, (rw, rh), flags=cv2.INTER_LINEAR)[..., None]
    region = frame[y0:y1, x0:x1].astype(np.float32)
    frame[y0:y1, x0:x1] = (warped.astype(np.float32) * wmask + region * (1 - wmask)).clip(0, 255).astype(np.uint8)
    return frame


def _nms(dets, thresh):
    x1, y1, x2, y2, scores = dets.T
    areas = (x2 - x1 + 1) * (y2 - y1 + 1)
    order = scores.argsort()[::-1]
    keep = []
    while order.size:
        i = order[0]
        keep.append(i)
        xx1 = np.maximum(x1[i], x1[order[1:]])
        yy1 = np.maximum(y1[i], y1[order[1:]])
        xx2 = np.minimum(x2[i], x2[order[1:]])
        yy2 = np.minimum(y2[i], y2[order[1:]])
        inter = np.maximum(0, xx2 - xx1 + 1) * np.maximum(0, yy2 - yy1 + 1)
        ovr = inter / (areas[i] + areas[order[1:]] - inter)
        order = order[np.where(ovr <= thresh)[0] + 1]
    return keep


class FaceAnalyser:
    INPUT = 640
    STRIDES = (8, 16, 32)

    def __init__(self, progress=None):
        self.det = models.session("detector", progress)
        self.rec = models.session("recognizer", progress)
        self._anchors = {}

    def _anchor_centers(self, stride):
        if stride not in self._anchors:
            n = self.INPUT // stride
            centers = np.stack(np.mgrid[:n, :n][::-1], axis=-1).astype(np.float32).reshape(-1, 2) * stride
            self._anchors[stride] = np.repeat(centers, 2, axis=0)
        return self._anchors[stride]

    def detect(self, img, threshold=0.5, with_embedding=False):
        h, w = img.shape[:2]
        scale = self.INPUT / max(h, w)
        resized = cv2.resize(img, (int(w * scale), int(h * scale)))
        canvas = np.zeros((self.INPUT, self.INPUT, 3), np.uint8)
        canvas[:resized.shape[0], :resized.shape[1]] = resized
        blob = cv2.dnn.blobFromImage(canvas, 1 / 128, (self.INPUT, self.INPUT), (127.5, 127.5, 127.5), swapRB=True)
        outs = self.det.run(None, {self.det.get_inputs()[0].name: blob})

        boxes, kpss, scores = [], [], []
        for i, stride in enumerate(self.STRIDES):
            sc = outs[i].reshape(-1)
            keep = np.where(sc >= threshold)[0]
            if not keep.size:
                continue
            c = self._anchor_centers(stride)[keep]
            d = outs[i + 3][keep] * stride
            k = outs[i + 6][keep] * stride
            boxes.append(np.stack([c[:, 0] - d[:, 0], c[:, 1] - d[:, 1], c[:, 0] + d[:, 2], c[:, 1] + d[:, 3]], -1))
            kpss.append((k.reshape(-1, 5, 2) + c[:, None, :]))
            scores.append(sc[keep])
        if not boxes:
            return []
        boxes = np.concatenate(boxes) / scale
        kpss = np.concatenate(kpss) / scale
        scores = np.concatenate(scores)
        keep = _nms(np.hstack([boxes, scores[:, None]]), 0.4)
        faces = [Face(boxes[i], kpss[i], float(scores[i])) for i in keep]
        if with_embedding:
            for f in faces:
                self.embed(img, f)
        return faces

    def embed(self, img, face):
        crop, _ = align(img, face.kps, ARCFACE_112, 112)
        blob = cv2.dnn.blobFromImage(crop, 1 / 127.5, (112, 112), (127.5, 127.5, 127.5), swapRB=True)
        emb = self.rec.run(None, {self.rec.get_inputs()[0].name: blob})[0][0]
        face.embedding = emb / np.linalg.norm(emb)
        return face.embedding

    def source_embedding(self, images):
        """Identidade média de uma ou mais fotos (mais fotos = resultado mais fiel)."""
        embs = []
        for img in images:
            faces = self.detect(img)
            if not faces:
                continue
            best = max(faces, key=lambda f: f.size)
            embs.append(self.embed(img, best))
        if not embs:
            return None, 0
        e = np.mean(embs, axis=0)
        return e / np.linalg.norm(e), len(embs)


def similarity(a, b):
    return float(np.dot(a, b))
