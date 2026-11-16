"""
Generate 3D props with Meshy (text-to-3D, preview → PBR refine) and download GLBs.

Key: MESHY_API_KEY in chausar/.env.local (gitignored). Never printed.
Usage:
    python3 tools/meshy/generate.py                 # all props in PROPS not yet downloaded
    python3 tools/meshy/generate.py turban pillar   # selected props
Outputs: tools/meshy/raw/<name>.glb + <name>.json (task metadata, prompt, licence note)
Licence: Meshy free tier → CC BY 4.0 (credit "3D models generated with Meshy"); paid plans → owned.
"""
import json, os, sys, time, urllib.request, urllib.error, pathlib, concurrent.futures as cf

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = pathlib.Path(__file__).resolve().parent / "raw"
OUT.mkdir(exist_ok=True)
API = "https://api.meshy.ai/openapi/v2/text-to-3d"

STYLE = ("photoreal museum-quality game asset, ancient Indian royal court of Hastinapur, "
         "Mahabharata era, hand-crafted, rich materials, clean topology, no text, no logos")

PROPS = {
    # wearables (rigidly attached to Shakuni's head / chest at runtime)
    "turban": dict(
        prompt="ornate royal Indian pagdi turban for a man, tightly wrapped deep plum silk with fine gold zari "
               "stripes, layered folds, jewelled sarpech brooch with a ruby and pearls at the front, "
               "single white heron plume, hollow inside to fit a head, " + STYLE,
        texture="deep plum silk with gold zari threads, polished gold sarpech, ruby, pearls, soft cloth sheen",
        polycount=12000),
    "necklace": dict(
        prompt="royal Indian kundan necklace with three strands of pearls and a large emerald and ruby pendant, "
               "laid flat, " + STYLE,
        texture="pearls, polished gold, emerald and ruby stones", polycount=8000),
    # palace (the dice hall of Hastinapur)
    "pillar": dict(
        prompt="single carved sandstone pillar from an ancient Indian palace hall, lotus capital, bracket corbels, "
               "fluted shaft with carved bands and elephants at the base, 4 metres tall, " + STYLE,
        texture="warm red-gold sandstone, weathered carving, subtle gilding on the capital", polycount=15000),
    "arch": dict(
        prompt="ornate scalloped multifoil archway of an ancient Indian palace, carved sandstone with inlay, "
               "wide and tall, thin depth, " + STYLE,
        texture="cream marble with red sandstone inlay and gold leaf details", polycount=12000),
    "lamp": dict(
        prompt="tall standing brass oil lamp deepam with many tiers of small wick cups and a peacock finial, " + STYLE,
        texture="aged polished brass with soot near the wicks", polycount=8000),
    "hanging_lamp": dict(
        prompt="hanging brass temple oil lamp on chains, bowl with five wicks, ornate, " + STYLE,
        texture="aged brass", polycount=6000),
    "throne_cushion": dict(
        prompt="low royal floor seat with large bolster cushion, embroidered maroon velvet with gold tassels, " + STYLE,
        texture="maroon velvet, gold zari embroidery, gold tassels", polycount=10000),
    "dice_box": dict(
        prompt="small carved ivory and rosewood box with brass corners for holding long dice, lid open, " + STYLE,
        texture="rosewood, ivory inlay, brass", polycount=6000),
}


def key():
    env = ROOT / ".env.local"
    for line in env.read_text().splitlines() if env.exists() else []:
        if line.startswith("MESHY_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"')
    sys.exit("MESHY_API_KEY missing in chausar/.env.local")


def call(method, url, body=None):
    req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body else None,
                                 headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"})
    for attempt in range(8):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code == 429 or e.code >= 500:
                time.sleep(5 * (attempt + 1)); continue
            raise SystemExit(f"{method} {url} → HTTP {e.code}: {e.read()[:300]!r}")
    raise SystemExit("too many retries")


def wait(task_id, label):
    while True:
        t = call("GET", f"{API}/{task_id}")
        if t["status"] == "SUCCEEDED": return t
        if t["status"] in ("FAILED", "CANCELED"): raise SystemExit(f"{label}: {t['status']} {t.get('task_error')}")
        print(f"  {label}: {t['status']} {t.get('progress', 0)}%", flush=True)
        time.sleep(10)


def generate(name):
    spec = PROPS[name]
    glb = OUT / f"{name}.glb"
    if glb.exists(): return f"{name}: cached"
    pre = call("POST", API, {"mode": "preview", "prompt": spec["prompt"][:800], "ai_model": "latest",
                             "should_remesh": True, "topology": "triangle", "target_polycount": spec["polycount"],
                             "target_formats": ["glb"]})["result"]
    wait(pre, f"{name} preview")
    ref = call("POST", API, {"mode": "refine", "preview_task_id": pre, "enable_pbr": True,
                             "texture_prompt": spec["texture"][:800], "texture_resolution": "2k",
                             "target_formats": ["glb"]})["result"]
    t = wait(ref, f"{name} refine")
    urllib.request.urlretrieve(t["model_urls"]["glb"], glb)
    meta = {k: t.get(k) for k in ("id", "prompt", "texture_prompt", "thumbnail_url", "consumed_credits", "finished_at")}
    meta["licence_note"] = "Generated with Meshy (meshy.ai). Free-tier outputs are CC BY 4.0: credit Meshy."
    (OUT / f"{name}.json").write_text(json.dumps(meta, indent=2))
    return f"{name}: {glb.stat().st_size // 1024} KB"


if __name__ == "__main__":
    KEY = key()
    names = sys.argv[1:] or list(PROPS)
    with cf.ThreadPoolExecutor(4) as ex:
        for res in ex.map(generate, names):
            print(res, flush=True)
