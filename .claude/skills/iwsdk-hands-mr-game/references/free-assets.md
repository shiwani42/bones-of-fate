# Assets with zero budget: sources, generation, cleanup, placement

Ask early whether the user will spend money or create accounts. With "free only" and no local GPU, this is the order that worked.

## 1. Source decision tree

| Need | First choice | Notes |
|---|---|---|
| Real-world props (brass, furniture, vases) | **Poly Haven API** (CC0, no account): `https://api.polyhaven.com/assets?t=models`, then `/files/<id>` → glTF 1k URLs | Mostly European interiors; no Indian or palace architecture. The best for brass, wood and ceramics. |
| 360° environment backdrop | **FLUX.1-schnell** HF Space (`black-forest-labs/FLUX.1-schnell`, Apache-2.0) at 2048×1024 with *"seamless 360 degree equirectangular panorama, interior of …"* | Works anonymously. Generate 2–3 seeds and pick one. `scripts/assets/flux_panorama.py` |
| Hero 3D props (architecture, lamps, headwear) | FLUX concept image → **TRELLIS** (`trellis-community/TRELLIS`) or **TRELLIS.2** (`microsoft/TRELLIS.2`, MIT), with a **free HF token** | `scripts/assets/flux_trellis.py`, `flux_trellis2.py` |
| Same, if TRELLIS is down | `tencent/Hunyuan3D-2` / `-2.1`, `VAST-AI/TripoSG`, `Stable-X/Hi3DGen`, `stabilityai/stable-fast-3d` | All on HF ZeroGPU: they share one per-user daily quota |
| Curated human-made models | **Sketchfab** filtered by Downloadable + CC0/CC-BY, done by the **user** (needs an account; give exact search terms, a triangle budget, filenames and a CREDITS line format) | Avoid NC/ND licences |
| Characters | MakeHuman/MPFB (see `character-pipeline.md`) | AI meshes have no face rig |
| Meta's 3D library | `metavr asset search` | Returned server errors in Nov 2026 even when logged in. Try it, but don't depend on it. |
| Paid (only if the user agrees) | Meshy API (Pro tier needed for the API; free outputs are CC BY with limited downloads) | Don't build this path before asking |

**No local GPU:** Modly, MyMeshy, ComfyUI and 3D Gen Studio are out (they need NVIDIA). Google Colab (free T4) is the backup when the HF quota is gone; the user runs the notebook under their own Google login. CPU TripoSR/Shap-E is below a production bar.

## 2. HF quota realities
- Anonymous ZeroGPU runs out after ~1 model. A **free account token** gives a few GPU-minutes a day, roughly **3 TRELLIS models**. The quota is shared across *all* ZeroGPU spaces, *including FLUX* (concept images count too).
- So generate **hero assets first**, one at a time, and reuse concept images. Keep a procedural fallback for each asset, so a missing file is skipped, not broken.
- Token handling: the user writes `HF_TOKEN=…` into the gitignored `.env.local` **from their own terminal** (never paste it into chat). Scripts read it from there and never print it. Give direct links: sign up at `https://huggingface.co/join`, token at `https://huggingface.co/settings/tokens/new?tokenType=read`.
- `gradio_client` ≥ 2: `Client(space, token=…, httpx_kwargs={"timeout": 600})`. Wrap **connection and every predict** in retries; free spaces take minutes to wake. Error text with "exceeded your free ZeroGPU quota" means stop and wait for the reset.

## 3. Prompts that produce usable meshes
Concept image: `"<object, materials, colours>, isolated single object centred on a plain pure white background, three-quarter view, soft even studio lighting, product photograph, photoreal, highly detailed"`. Add **"compact shape, nothing hanging below"** for anything with chains or pendants. Dangling parts confuse image-to-3D (the first turban came out black and lumpy). One object per image.

## 4. Cleanup (always preview first: `scripts/assets/blender_preview.py`)
- **Floating fragments:** `clean_fragments.py`. Size-based removal (islands smaller than 2 % of the main body) is safe for blobs. For **thin parts** (rings on a lamp stem), use **horizontal distance from the main body's axis** instead. Size-based deletion removed real rings, and full 3D distance removed the top and bottom rings.
- **Ground slab** baked in from the white background: `remove_ground_slab.py` deletes bottom faces outside the object's feet footprint.
- **Reject** results that are wrong in silhouette or colour. Don't "fix" a bad generation with materials; regenerate with a better concept.
- Optimise: `gltf-transform optimize in.glb out.glb --compress false --texture-compress webp --texture-size 1024` (2048 for hero pieces). Props drop to ~0.4–2 MB.
- Log every asset in `public/models/props/CREDITS.md`: source, licence, the generator's licence (FLUX Apache-2.0, TRELLIS MIT), and the scripts used.

## 5. Placement rules
- Normalise each prop at load: scale to a target height, base at y=0, centred in x/z (`reference/runtime/props.ts`). **Clone per placement**, because `AssetManager.loadGLTF` caches by URL and a second placement steals the first.
- Real-world scale: chairs 0.9 m, standing lamps 1.1–1.2 m, pillars 2.6–2.9 m, arches about 2.7 m. Props on a table shouldn't dominate it (goblets ~0.1 m).
- Composition: a **frame behind the character** (arch), symmetric verticals either side (pillars, lamps), nothing between the player and the play area. Put the floor at −tableHeight in board space.
- One consistent style: warm, ornate, realistic. A single cartoon or low-poly piece makes the set look like a yard sale.
