"""Hastinapur dice-hall backdrop: wide 360° panorama from FLUX.1-schnell (Apache-2.0), free.
Writes tools/freegen/out/palace_*.png; the best becomes public/textures/palace.jpg."""
import pathlib, shutil, sys
from gradio_client import Client
OUT = pathlib.Path(__file__).resolve().parent / "out"
PROMPT = ("seamless 360 degree equirectangular panorama, interior of an ancient Indian royal assembly hall "
          "(Mahabharata era palace of Hastinapur) at night, rows of carved red sandstone pillars with lotus "
          "capitals, scalloped marble arches, hanging brass oil lamps glowing warm, silk drapes in maroon and "
          "saffron, gold leaf ornament, polished stone floor, deep shadows, cinematic warm lamplight, "
          "highly detailed, photoreal, no people, no text")
c = Client("black-forest-labs/FLUX.1-schnell", verbose=False)
for seed in (sys.argv[1:] or ["11", "23"]):
    img, _ = c.predict(prompt=PROMPT, seed=int(seed), randomize_seed=False, width=2048, height=1024,
                       num_inference_steps=4, api_name="/infer")
    src = img["path"] if isinstance(img, dict) else img
    dst = OUT / f"palace_{seed}.png"
    shutil.copy(src, dst)
    print("saved", dst, flush=True)
