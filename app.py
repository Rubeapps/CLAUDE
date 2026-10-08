"""FaceSwap Studio - interface local no browser.

Arranque: run.bat (Windows) ou `python app.py`.
"""
import argparse
import os
import shutil
import threading
import time

import cv2
import gradio as gr
import numpy as np

from faceswap import __version__
from faceswap.core import models
from faceswap.core.pipeline import MAX_SECONDS, Engine, Settings, plan_upscale, probe, read_frame

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(ROOT, "outputs")
TMP_DIR = os.path.join(ROOT, "temp")

_engine = None
_engine_lock = threading.Lock()
_cancel = threading.Event()

PRESETS = {
    "Rápido": dict(boost=1, enhancer="Nenhum", upscale=False),
    "Equilibrado": dict(boost=2, enhancer="GFPGAN", upscale=False),
    "Máxima qualidade": dict(boost=4, enhancer="CodeFormer", upscale=False),
}
ENHANCERS = {"Nenhum": "none", "GFPGAN": "gfpgan", "CodeFormer": "codeformer"}
MODES = {"Maior cara do vídeo": "largest", "Todas as caras": "all", "Só uma pessoa (referência)": "reference"}


def engine(progress=None):
    global _engine
    with _engine_lock:
        if _engine is None:
            cb = (lambda f, d: progress(f, desc=d)) if progress else None
            _engine = Engine(cb)
        return _engine


def imread(path):
    # np.fromfile + imdecode funciona com acentos no caminho (Windows).
    img = cv2.imdecode(np.fromfile(path, dtype=np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise gr.Error(f"Não consegui ler a imagem: {os.path.basename(path)}")
    return img


def safe_copy(path):
    """Copia o vídeo para um caminho sem acentos (o OpenCV no Windows não gosta deles)."""
    os.makedirs(TMP_DIR, exist_ok=True)
    dst = os.path.join(TMP_DIR, f"input_{int(time.time() * 1000)}{os.path.splitext(path)[1].lower()}")
    shutil.copyfile(path, dst)
    return dst


def source_latent(files, eng):
    if not files:
        raise gr.Error("Carrega pelo menos uma foto da cara a usar.")
    paths = [f if isinstance(f, str) else f.name for f in files]
    emb, n = eng.analyser.source_embedding([imread(p) for p in paths])
    if emb is None:
        raise gr.Error("Não encontrei nenhuma cara nas fotos carregadas.")
    return eng.swapper.latent(emb), n


def build_settings(mode, ref_time, ref_index, ref_threshold, boost, enhancer, enh_strength, cf_fidelity,
                   upscale, smoothing, mask_blur, pad_top, pad_bottom, det_threshold, watermark, crf,
                   max_height, trim_start, video_path, eng):
    s = Settings(
        target_mode=MODES[mode], reference_threshold=ref_threshold, swap_boost=int(boost.split("x")[0]),
        mask_blur=mask_blur, mask_padding=(pad_top, 0, pad_bottom, 0), enhancer=ENHANCERS[enhancer],
        enhancer_strength=enh_strength, codeformer_fidelity=cf_fidelity, upscale=upscale, smoothing=smoothing,
        det_threshold=det_threshold, watermark=watermark, crf=int(crf),
        max_height={"Original": 0, "1080p": 1080, "720p": 720}[max_height], trim_start=trim_start,
    )
    if s.target_mode == "reference":
        if not video_path:
            raise gr.Error("Escolhe primeiro o vídeo.")
        frame = read_frame(video_path, ref_time)
        faces = sorted(eng.analyser.detect(frame, det_threshold, with_embedding=True), key=lambda f: f.center_x)
        if not faces:
            raise gr.Error("Não há caras no frame de referência. Muda o tempo da referência.")
        idx = min(int(ref_index), len(faces)) - 1
        s.reference_embedding = faces[idx].embedding
    return s


def check_consent(consent):
    if not consent:
        raise gr.Error("Tens de confirmar que tens autorização para usar esta cara.")


# ---------------- callbacks ----------------
def on_video_change(video):
    if not video:
        return gr.update(), gr.update(), "Sem vídeo."
    info = probe(video)
    d = info["duration"]
    warn = f" ⚠️ Só os primeiros {MAX_SECONDS}s serão processados." if d > MAX_SECONDS else ""
    txt = f"{info['width']}x{info['height']} · {info['fps']:.1f} fps · {d:.1f}s{warn}"
    return gr.update(maximum=max(d - 0.1, 0.1), value=0), gr.update(maximum=max(d - 0.1, 0.1), value=0), txt


def analyse_faces(video, t, det_threshold, progress=gr.Progress()):
    if not video:
        raise gr.Error("Escolhe primeiro o vídeo.")
    eng = engine(progress)
    frame = read_frame(video, t)
    if frame is None:
        raise gr.Error("Não consegui ler esse frame.")
    faces = sorted(eng.analyser.detect(frame, det_threshold), key=lambda f: f.center_x)
    for i, f in enumerate(faces, 1):
        x1, y1, x2, y2 = f.bbox.astype(int)
        th = max(2, frame.shape[0] // 300)
        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 220, 120), th)
        cv2.putText(frame, str(i), (x1, max(30, y1 - 10)), cv2.FONT_HERSHEY_SIMPLEX, th * 0.6, (0, 220, 120), th, cv2.LINE_AA)
    return frame[..., ::-1], f"{len(faces)} cara(s) encontradas. Usa o número da pessoa em 'Nº da cara'."


def preview(files, video, t, consent, *opts, progress=gr.Progress()):
    check_consent(consent)
    if not video:
        raise gr.Error("Escolhe primeiro o vídeo.")
    eng = engine(progress)
    latent, n = source_latent(files, eng)
    s = build_settings(*opts, video, eng)
    s.upscale = False  # pré-visualização rápida
    frame = read_frame(video, t)
    out = eng.process_image(frame, latent, s)
    return out[..., ::-1], f"Pré-visualização pronta ({n} foto(s) de origem usada(s)). Dispositivo: {models.active_device()}"


def generate(files, video, consent, *opts, progress=gr.Progress()):
    check_consent(consent)
    if not video:
        raise gr.Error("Escolhe primeiro o vídeo.")
    _cancel.clear()
    eng = engine(progress)
    latent, _ = source_latent(files, eng)
    s = build_settings(*opts, video, eng)
    src = safe_copy(video)
    os.makedirs(OUT_DIR, exist_ok=True)
    dst = os.path.join(OUT_DIR, f"faceswap_{time.strftime('%Y%m%d_%H%M%S')}.mp4")
    t0 = time.time()
    try:
        eng.process_video(src, dst, latent, s, progress=lambda f, d: progress(f, desc=d), cancel=_cancel)
    except InterruptedError:
        raise gr.Error("Processamento cancelado.")
    finally:
        try:
            os.remove(src)
        except OSError:
            pass
    return dst, f"✅ Concluído em {time.time() - t0:.0f}s · guardado em: {dst}"


def cancel():
    _cancel.set()
    return "A cancelar..."


def swap_image(files, target, consent, boost, enhancer, enh_strength, cf_fidelity, upscale, mode, watermark,
               progress=gr.Progress()):
    check_consent(consent)
    if target is None:
        raise gr.Error("Carrega a imagem de destino.")
    eng = engine(progress)
    latent, _ = source_latent(files, eng)
    s = Settings(target_mode="all" if mode == "Todas as caras" else "largest", swap_boost=int(boost.split("x")[0]),
                 enhancer=ENHANCERS[enhancer], enhancer_strength=enh_strength, codeformer_fidelity=cf_fidelity,
                 upscale=upscale, watermark=watermark, smoothing=False)
    out = eng.process_image(imread(target), latent, s)
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, f"faceswap_{time.strftime('%Y%m%d_%H%M%S')}.png")
    cv2.imencode(".png", out)[1].tofile(path)
    return out[..., ::-1], path


BOOST_CHOICES = ["1x (128px · rápido)", "2x (256px · recomendado)", "4x (512px · máximo detalhe)"]


UPSCALE_TARGETS = {"Dobro da resolução (2x)": 0, "1080p (Full HD)": 1080, "1440p (2K)": 1440, "2160p (4K)": 2160}


def upscale_settings(video, target, restore, strength, fidelity, crf):
    if not video:
        raise gr.Error("Escolhe primeiro o vídeo.")
    h = probe(video)["height"]
    th = UPSCALE_TARGETS[target]
    if th == 0:
        up, model = True, "esrgan_x2"
    else:
        up, model = plan_upscale(h, th)
    if not up and ENHANCERS[restore] == "none":
        raise gr.Error(f"O vídeo já tem {h}p. Escolhe uma resolução maior ou liga o restauro de caras.")
    return Settings(swap=False, target_mode="all", enhancer=ENHANCERS[restore], enhancer_strength=strength,
                    codeformer_fidelity=fidelity, upscale=up, upscale_model=model, target_height=th,
                    watermark=False, crf=int(crf))


def upscale_preview(video, t, target, restore, strength, fidelity, crf, progress=gr.Progress()):
    s = upscale_settings(video, target, restore, strength, fidelity, crf)
    eng = engine(progress)
    frame = read_frame(video, t)
    out = eng.process_image(frame, None, s)
    before = cv2.resize(frame, (out.shape[1], out.shape[0]), interpolation=cv2.INTER_LINEAR)
    # Metade esquerda = original ampliado, metade direita = melhorado
    mid = out.shape[1] // 2
    comp = np.concatenate([before[:, :mid], out[:, mid:]], axis=1)
    cv2.line(comp, (mid, 0), (mid, comp.shape[0]), (255, 255, 255), max(2, comp.shape[0] // 400))
    return comp[..., ::-1], f"Esquerda: original · Direita: melhorado ({frame.shape[0]}p → {out.shape[0]}p)"


def upscale_video(video, target, restore, strength, fidelity, crf, progress=gr.Progress()):
    s = upscale_settings(video, target, restore, strength, fidelity, crf)
    _cancel.clear()
    eng = engine(progress)
    src = safe_copy(video)
    os.makedirs(OUT_DIR, exist_ok=True)
    dst = os.path.join(OUT_DIR, f"upscale_{time.strftime('%Y%m%d_%H%M%S')}.mp4")
    t0 = time.time()
    try:
        eng.process_video(src, dst, None, s, progress=lambda f, d: progress(f, desc=d), cancel=_cancel)
    except InterruptedError:
        raise gr.Error("Processamento cancelado.")
    finally:
        try:
            os.remove(src)
        except OSError:
            pass
    return dst, f"✅ Concluído em {time.time() - t0:.0f}s · guardado em: {dst}"


def apply_preset(name):
    p = PRESETS[name]
    return BOOST_CHOICES[{1: 0, 2: 1, 4: 2}[p["boost"]]], p["enhancer"], p["upscale"]


# ---------------- interface ----------------
CSS = """
#title {text-align:center; margin-bottom:0}
#subtitle {text-align:center; opacity:.75; margin-top:0}
.gen-btn {min-height:52px; font-size:1.1em}
"""


def ui():
    boost_choices = BOOST_CHOICES
    with gr.Blocks(title="FaceSwap Studio") as demo:
        gr.HTML(f"<style>{CSS}</style>")
        gr.Markdown("# 🎭 FaceSwap Studio", elem_id="title")
        gr.Markdown(f"v{__version__} · processamento 100% local · dispositivo: **{models.active_device()}**",
                    elem_id="subtitle")

        with gr.Tabs():
            # ===== VÍDEO =====
            with gr.Tab("🎬 Vídeo"):
                with gr.Row():
                    with gr.Column(scale=1):
                        src_files = gr.File(label="1. Foto(s) da cara a colocar (várias fotos = mais fiel)",
                                            file_count="multiple", file_types=["image"], type="filepath")
                        video = gr.Video(label=f"2. O teu vídeo (até {MAX_SECONDS}s)", sources=["upload"])
                        video_info = gr.Markdown("Sem vídeo.")
                        preset = gr.Radio(list(PRESETS), value="Equilibrado", label="Perfil de qualidade")
                        consent = gr.Checkbox(label="Confirmo que tenho autorização da pessoa cuja cara vou usar "
                                                    "e que não vou usar o resultado para enganar ou prejudicar ninguém.")
                        with gr.Row():
                            btn_preview = gr.Button("👁️ Pré-visualizar frame")
                            btn_go = gr.Button("🚀 Gerar vídeo", variant="primary", elem_classes="gen-btn")
                        btn_cancel = gr.Button("⏹ Cancelar", variant="stop", size="sm")

                    with gr.Column(scale=1):
                        preview_t = gr.Slider(0, 1, value=0, step=0.1, label="Momento do vídeo para pré-visualizar (s)")
                        preview_img = gr.Image(label="Pré-visualização", interactive=False)
                        result = gr.Video(label="Resultado")
                        status = gr.Markdown()

                with gr.Accordion("🎯 Quem trocar", open=False):
                    mode = gr.Radio(list(MODES), value="Maior cara do vídeo", label="Caras a substituir")
                    with gr.Row():
                        ref_time = gr.Slider(0, 1, value=0, step=0.1, label="Frame de referência (s)")
                        ref_index = gr.Number(value=1, precision=0, minimum=1, label="Nº da cara (esq. → dir.)")
                        ref_threshold = gr.Slider(0.1, 0.8, value=0.35, step=0.05, label="Semelhança mínima")
                    btn_analyse = gr.Button("🔍 Mostrar caras neste frame")

                with gr.Accordion("✨ Qualidade", open=True):
                    with gr.Row():
                        boost = gr.Dropdown(boost_choices, value=boost_choices[1], label="Resolução da troca")
                        enhancer = gr.Dropdown(list(ENHANCERS), value="GFPGAN", label="Melhoria da cara")
                        upscale = gr.Checkbox(value=False, label="Upscale do vídeo x2 (Real-ESRGAN · lento)")
                    with gr.Row():
                        enh_strength = gr.Slider(0, 1, value=0.8, step=0.05, label="Força da melhoria")
                        cf_fidelity = gr.Slider(0, 1, value=0.7, step=0.05,
                                                label="CodeFormer: fidelidade (alto = mais parecido, baixo = mais nítido)")

                with gr.Accordion("⚙️ Avançado", open=False):
                    with gr.Row():
                        smoothing = gr.Checkbox(value=True, label="Estabilização anti-tremor")
                        watermark = gr.Checkbox(value=True, label="Marca de água 'Gerado por IA'")
                        max_height = gr.Dropdown(["Original", "1080p", "720p"], value="Original", label="Resolução máxima")
                    with gr.Row():
                        mask_blur = gr.Slider(0.05, 0.8, value=0.3, step=0.05, label="Suavidade da borda")
                        pad_top = gr.Slider(0, 30, value=0, step=1, label="Recuo da máscara em cima (%)")
                        pad_bottom = gr.Slider(0, 30, value=0, step=1, label="Recuo da máscara em baixo (%)")
                    with gr.Row():
                        det_threshold = gr.Slider(0.2, 0.9, value=0.5, step=0.05, label="Sensibilidade de deteção")
                        crf = gr.Slider(10, 28, value=16, step=1, label="Compressão (menor = melhor qualidade)")
                        trim_start = gr.Number(value=0, minimum=0, label="Começar no segundo")

                opts = [mode, ref_time, ref_index, ref_threshold, boost, enhancer, enh_strength, cf_fidelity, upscale,
                        smoothing, mask_blur, pad_top, pad_bottom, det_threshold, watermark, crf, max_height, trim_start]

                preset.change(apply_preset, preset, [boost, enhancer, upscale])
                video.change(on_video_change, video, [preview_t, ref_time, video_info])
                btn_analyse.click(analyse_faces, [video, ref_time, det_threshold], [preview_img, status])
                btn_preview.click(preview, [src_files, video, preview_t, consent] + opts, [preview_img, status])
                btn_go.click(generate, [src_files, video, consent] + opts, [result, status])
                btn_cancel.click(cancel, None, status)

            # ===== IMAGEM =====
            with gr.Tab("🖼️ Imagem"):
                with gr.Row():
                    with gr.Column():
                        i_src = gr.File(label="Foto(s) da cara a colocar", file_count="multiple",
                                        file_types=["image"], type="filepath")
                        i_tgt = gr.Image(label="Imagem de destino", type="filepath")
                        i_mode = gr.Radio(["Maior cara", "Todas as caras"], value="Maior cara", label="Caras a substituir")
                        with gr.Row():
                            i_boost = gr.Dropdown(boost_choices, value=boost_choices[2], label="Resolução da troca")
                            i_enh = gr.Dropdown(list(ENHANCERS), value="CodeFormer", label="Melhoria da cara")
                        with gr.Row():
                            i_str = gr.Slider(0, 1, value=0.8, step=0.05, label="Força da melhoria")
                            i_fid = gr.Slider(0, 1, value=0.7, step=0.05, label="CodeFormer: fidelidade")
                        with gr.Row():
                            i_up = gr.Checkbox(value=False, label="Upscale x2")
                            i_wm = gr.Checkbox(value=True, label="Marca de água")
                        i_consent = gr.Checkbox(label="Confirmo que tenho autorização da pessoa cuja cara vou usar.")
                        i_go = gr.Button("🚀 Trocar cara", variant="primary")
                    with gr.Column():
                        i_out = gr.Image(label="Resultado", interactive=False)
                        i_file = gr.File(label="Download (PNG)")
                i_go.click(swap_image, [i_src, i_tgt, i_consent, i_boost, i_enh, i_str, i_fid, i_up, i_mode, i_wm],
                           [i_out, i_file])

            # ===== MELHORAR QUALIDADE =====
            with gr.Tab("🔍 Melhorar qualidade"):
                gr.Markdown("Aumenta a resolução e a nitidez de **qualquer vídeo** (Real-ESRGAN) e, se quiseres, "
                            "restaura as caras (GFPGAN/CodeFormer). Não troca caras.")
                with gr.Row():
                    with gr.Column():
                        u_video = gr.Video(label=f"Vídeo (até {MAX_SECONDS}s)", sources=["upload"])
                        u_info = gr.Markdown("Sem vídeo.")
                        u_target = gr.Radio(list(UPSCALE_TARGETS), value="Dobro da resolução (2x)",
                                            label="Resolução final")
                        with gr.Row():
                            u_restore = gr.Dropdown(list(ENHANCERS), value="GFPGAN", label="Restaurar caras")
                            u_crf = gr.Slider(10, 28, value=16, step=1, label="Compressão (menor = melhor)")
                        with gr.Row():
                            u_str = gr.Slider(0, 1, value=0.7, step=0.05, label="Força do restauro")
                            u_fid = gr.Slider(0, 1, value=0.7, step=0.05, label="CodeFormer: fidelidade")
                        with gr.Row():
                            u_prev_btn = gr.Button("👁️ Comparar antes/depois")
                            u_go = gr.Button("🚀 Melhorar vídeo", variant="primary", elem_classes="gen-btn")
                        u_cancel = gr.Button("⏹ Cancelar", variant="stop", size="sm")
                    with gr.Column():
                        u_t = gr.Slider(0, 1, value=0, step=0.1, label="Momento para comparar (s)")
                        u_prev = gr.Image(label="Antes | Depois", interactive=False)
                        u_result = gr.Video(label="Resultado")
                        u_status = gr.Markdown()
                u_opts = [u_target, u_restore, u_str, u_fid, u_crf]
                u_video.change(lambda v: on_video_change(v)[::2], u_video, [u_t, u_info])
                u_prev_btn.click(upscale_preview, [u_video, u_t] + u_opts, [u_prev, u_status])
                u_go.click(upscale_video, [u_video] + u_opts, [u_result, u_status])
                u_cancel.click(cancel, None, u_status)

            # ===== AJUDA =====
            with gr.Tab("❓ Ajuda"):
                gr.Markdown(HELP)
    return demo


HELP = """
### Dicas para o melhor resultado
- **Foto de origem:** cara de frente, bem iluminada, nítida, sem óculos escuros nem mãos à frente. 3–5 fotos da mesma pessoa dão um resultado mais fiel.
- **Vídeo:** cara visível e não demasiado pequena; luz parecida com a da foto ajuda.
- **Testa primeiro** com *Pré-visualizar frame* antes de gerar o vídeo todo.
- **Resolução da troca 2x** é o melhor equilíbrio; **4x** dá mais detalhe mas demora ~4x mais na troca.
- **GFPGAN** = mais rápido e natural. **CodeFormer** = mais nítido; baixa a *fidelidade* se a cara ficar desfocada, sobe se deixar de parecer a pessoa.
- Se aparecer o queixo/testa original nas bordas, aumenta a *Suavidade da borda* ou ajusta os *recuos*.
- **Upscale x2** duplica a resolução do vídeo todo – usa só em vídeos 720p ou menores (é lento).
- **Separador "Melhorar qualidade"**: melhora qualquer vídeo sem trocar caras. Ideal para vídeos 480p/720p → 1080p/1440p.
  Para 4K a partir de 1080p conta com ~15–30 min para 90s.

### Tempos aproximados (RTX 5060, vídeo 1080p de 90s a 30fps)
| Perfil | Tempo |
|---|---|
| Rápido | ~2–5 min |
| Equilibrado | ~5–10 min |
| Máxima qualidade | ~12–25 min |

*Estimativas – o primeiro arranque demora mais porque descarrega os modelos (~1,5 GB).*

### Uso responsável
Usa apenas caras de pessoas que deram autorização. Criar deepfakes para enganar, difamar, assediar ou criar conteúdo íntimo sem consentimento é ilegal em Portugal/UE e pode ser crime.
"""


def main():
    ap = argparse.ArgumentParser(description="FaceSwap Studio")
    ap.add_argument("--port", type=int, default=7860)
    ap.add_argument("--device", choices=["auto", "cuda", "directml", "cpu"], default="auto")
    ap.add_argument("--no-browser", action="store_true")
    a = ap.parse_args()
    models.set_device(a.device)
    print(f"FaceSwap Studio v{__version__} · dispositivos disponíveis: {models.available_providers()}")
    ui().queue(default_concurrency_limit=1).launch(server_name="127.0.0.1", server_port=a.port,
                                                   inbrowser=not a.no_browser)


if __name__ == "__main__":
    main()
