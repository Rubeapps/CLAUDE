# 🎭 FaceSwap Studio

Aplicação **local** para trocar caras em vídeos (até 1 min 30 s) e imagens, com melhoria de qualidade.
Corre no teu PC com placa NVIDIA (testado para a série RTX 50, por ex. RTX 5060). Nada é enviado para a internet.

## Como funciona
1. Carregas **uma ou mais fotos** da cara que queres colocar.
2. Carregas **o teu vídeo**.
3. A app, frame a frame:
   - **deteta** as caras (SCRFD),
   - **identifica** a cara de origem (ArcFace; com várias fotos faz a média → mais fiel),
   - **troca** a cara (InSwapper, com *pixel boost* 2x/4x para mais resolução),
   - **estabiliza** os pontos da cara entre frames (menos tremor),
   - **restaura** a cara (GFPGAN ou CodeFormer),
   - opcionalmente faz **upscale x2** do vídeo inteiro (Real-ESRGAN),
   - volta a juntar o vídeo em H.264 **com o áudio original**.

## Separador "🔍 Melhorar qualidade"
Melhora **qualquer vídeo** sem trocar caras: aumenta a resolução com Real-ESRGAN (x2 ou x4, escolhido
automaticamente para 1080p / 1440p / 4K) e opcionalmente restaura as caras (GFPGAN/CodeFormer).
Tem botão de comparação antes/depois.

## Instalação (Windows)
1. Instala o **Python 3.12** → https://www.python.org/downloads/ (marca *"Add python.exe to PATH"*).
2. Atualiza o **driver NVIDIA** (Game Ready ou Studio, versão recente).
3. Descarrega este repositório (botão verde *Code → Download ZIP*) e extrai-o.
4. Dá duplo clique em **`install.bat`** (instala tudo e descarrega os modelos, ~1,5 GB, só da primeira vez).
5. Dá duplo clique em **`run.bat`** → abre no browser em `http://127.0.0.1:7860`.

> Não precisas de instalar CUDA à parte: as bibliotecas CUDA/cuDNN vêm pelo `pip`.
> Se no fim da instalação aparecer *"CUDA não disponível"*, corre **`install_directml.bat`** (funciona em qualquer placa via DirectX 12, um pouco mais lento).

## Perfis de qualidade
| Perfil | Troca | Melhoria | Máscaras | Tempo estimado (90 s, 1080p, RTX 5060) |
|---|---|---|---|---|
| Rápido | 128 px | — | — | ~1–2 min |
| Equilibrado | 256 px | GFPGAN | oclusão | ~2–4 min |
| Máxima qualidade | 256 px | GFPGAN | oclusão + pele + cor | ~3–6 min |

A opção **Resolução final** (2x / 1080p / 1440p / 4K) faz upscale **ao mesmo tempo** que a troca:
primeiro aumenta a resolução, depois troca e restaura a cara já na resolução final (mais detalhe).

### Velocidade
- **Upscale rápido (Clear Reality x4):** rede compacta ~50x mais rápida que o Real-ESRGAN, resultado natural.
- **Troca a 2x por defeito:** com restauro ligado, 4x não se nota e custa 4x mais.
- A máscara de oclusão é calculada uma vez e reaproveitada pelo restauro.
- No fim de cada vídeo a janela preta mostra os **fps** e o **tempo de cada etapa** (deteção, upscale, troca, restauro).
- Vários frames processados em paralelo (deteção sequencial + troca/restauro/upscale em 4 threads).
- Na GPU usa modelos **FP16** (InSwapper, Real-ESRGAN) – ~2x mais rápidos, mesma qualidade.
- Grava o vídeo com **NVENC** (codificador da placa NVIDIA) quando disponível.
- cuDNN em modo *exhaustive*: o 1.º vídeo demora ~1 min a mais, os seguintes ficam mais rápidos.

### Realismo
- **Máscara de oclusão (XSeg):** mãos, cabelo e objetos à frente da cara ficam por cima.
- **Máscara de pele (BiSeNet):** só troca pele/olhos/nariz/boca – cabelo e orelhas originais intactos.
- **Correção de cor:** iguala tom de pele e luz à cena.
- **Estabilização One-Euro:** sem tremor quando a cara está parada, sem atraso em movimentos rápidos.

## Linha de comandos (opcional)
```bat
venv\Scripts\activate
python cli.py --source foto1.jpg foto2.jpg --target video.mp4 --output resultado.mp4 --boost 2 --enhancer gfpgan
```

## Estrutura
```
app.py                    interface (Gradio, abre no browser)
cli.py                    uso sem interface
faceswap/core/models.py   download dos modelos + GPU/CPU
faceswap/core/face.py     deteção, alinhamento, identidade
faceswap/core/processors.py  troca, restauro, upscale
faceswap/core/pipeline.py processamento de vídeo + áudio
```

## ⚠️ Licenças – importante antes de vender
O **código** desta app é teu. Mas os **modelos de IA** têm licenças próprias:

| Modelo | Licença | Uso comercial |
|---|---|---|
| InSwapper, SCRFD, ArcFace (InsightFace) | Investigação / não comercial | ❌ Não |
| XSeg (DeepFaceLab) | GPL-3.0 | ⚠️ Sim, mas obriga a abrir o código |
| BiSeNet (face parsing) | MIT | ✅ Sim |
| CodeFormer | S-Lab (não comercial) | ❌ Não |
| GFPGAN 1.4 | Apache 2.0 | ✅ Sim |
| Real-ESRGAN | BSD-3 | ✅ Sim |
| Clear Reality x4 (upscale rápido) | CC BY-NC-SA (não comercial) | ❌ Não |

Para **vender** a app é preciso obter licença comercial da InsightFace (insightface.ai) ou trocar esses modelos por alternativas com licença comercial. Para uso pessoal não há problema.

## Uso responsável
Usa apenas caras de pessoas que deram autorização. Deepfakes para enganar, difamar, assediar, burlar ou criar conteúdo íntimo sem consentimento são ilegais (Portugal/UE) e podem ser crime. A app inclui por defeito uma marca de água "Gerado por IA" e metadados a indicar conteúdo gerado.
