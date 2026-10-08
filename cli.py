"""Uso por linha de comandos (sem interface).

Exemplo:
    python cli.py --source foto.jpg --target video.mp4 --output resultado.mp4 --enhancer gfpgan --boost 2
"""
import argparse
import os
import sys

import cv2
import numpy as np
from tqdm import tqdm

from faceswap.core import models
from faceswap.core.pipeline import Engine, Settings, plan_upscale, probe

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


def main():
    ap = argparse.ArgumentParser(description="FaceSwap Studio (CLI)")
    ap.add_argument("--source", nargs="+", required=True, help="Foto(s) da cara a colocar")
    ap.add_argument("--target", required=True, help="Vídeo ou imagem de destino")
    ap.add_argument("--output", required=True)
    ap.add_argument("--mode", choices=["largest", "all"], default="largest")
    ap.add_argument("--boost", type=int, choices=[1, 2, 4], default=2)
    ap.add_argument("--enhancer", choices=["none", "gfpgan", "codeformer"], default="gfpgan")
    ap.add_argument("--strength", type=float, default=0.8)
    ap.add_argument("--fidelity", type=float, default=0.7)
    ap.add_argument("--upscale", action="store_true", help="Upscale x2")
    ap.add_argument("--final-height", type=int, default=0, help="Altura final, ex. 1080, 1440, 2160")
    ap.add_argument("--no-occlusion", action="store_true", help="Desliga a máscara de oclusão")
    ap.add_argument("--region", action="store_true", help="Máscara de pele (bordas mais naturais)")
    ap.add_argument("--color-fix", action="store_true", help="Corrige cor/luz da cara")
    ap.add_argument("--no-watermark", action="store_true")
    ap.add_argument("--crf", type=int, default=16)
    ap.add_argument("--device", choices=["auto", "cuda", "directml", "cpu"], default="auto")
    a = ap.parse_args()

    models.set_device(a.device)
    eng = Engine()
    read = lambda p: cv2.imdecode(np.fromfile(p, dtype=np.uint8), cv2.IMREAD_COLOR)
    emb, n = eng.analyser.source_embedding([read(p) for p in a.source])
    if emb is None:
        sys.exit("Nenhuma cara encontrada nas fotos de origem.")
    latent = eng.swapper.latent(emb)
    s = Settings(target_mode=a.mode, swap_boost=a.boost, enhancer=a.enhancer, enhancer_strength=a.strength,
                 codeformer_fidelity=a.fidelity, upscale=a.upscale, watermark=not a.no_watermark, crf=a.crf,
                 occlusion_mask=not a.no_occlusion, region_mask=a.region, color_fix=a.color_fix)
    if a.final_height:
        is_img = os.path.splitext(a.target)[1].lower() in IMAGE_EXT
        h = read(a.target).shape[0] if is_img else probe(a.target)["height"]
        s.upscale, s.upscale_model = plan_upscale(h, a.final_height)
        s.target_height = a.final_height
    print(f"Dispositivo: {models.active_device()} · fotos de origem com cara: {n}")

    if os.path.splitext(a.target)[1].lower() in IMAGE_EXT:
        s.smoothing = False
        out = eng.process_image(read(a.target), latent, s)
        cv2.imencode(os.path.splitext(a.output)[1] or ".png", out)[1].tofile(a.output)
    else:
        bar = tqdm(total=100, unit="%")
        def cb(f, d):
            bar.n = int(f * 100)
            bar.set_postfix_str(d)
            bar.refresh()
        eng.process_video(a.target, a.output, latent, s, progress=cb)
        bar.close()
    print(f"Guardado em {a.output}")


if __name__ == "__main__":
    main()
