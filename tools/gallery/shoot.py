"""Gallery stills for Devpost / README, taken in the IWSDK emulator (IWER) in XR.

Needs the dev server with browser automation:
    npx @iwsdk/cli dev restart --ai-mode agent --allow-browser-automation
Then:
    python3 tools/gallery/shoot.py <out-dir> [shot ...]

The managed window is first resized to 1800x1260 (tools/gallery/window.mjs, so the
XR session renders at that size), each frame is captured by tools/gallery/snap.mjs
and cropped to a 3:2 1800x1200 PNG (the top strip holds the emulator's buttons).
"""
import os, sys, time, pathlib, subprocess
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / 'scripts' / 'e2e'))
from xr_lib import *  # noqa: E402
from PIL import Image  # noqa: E402

OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'gallery').resolve()
OUT.mkdir(parents=True, exist_ok=True)
WANT = set(sys.argv[2:])
ROOT = pathlib.Path(__file__).resolve().parents[2]


def snap(name):
    raw = OUT / f'{name}.raw.png'
    env = dict(os.environ, GALLERY_OUT=str(raw))
    subprocess.run(['npx', '@iwsdk/cli', 'browser', 'run', 'tools/gallery/snap.mjs'], cwd=ROOT, env=env,
                   capture_output=True, text=True, timeout=90)
    im = Image.open(raw).convert('RGB')
    im.crop((0, 60, 1800, 1260)).save(OUT / f'{name}.png', optimize=True)
    raw.unlink()
    print('saved', name, flush=True)


def cam(pos, at):
    cli('xr', 'set-transform', j={'device': 'headset', 'position': dict(zip('xyz', pos))})
    cli('xr', 'look-at', j={'device': 'headset', 'target': dict(zip('xyz', at))})


def park_hands():
    cli('xr', 'set-transform', j={'device': 'hand-right', 'position': {'x': 0.6, 'y': 0.1, 'z': -0.7}})
    cli('xr', 'set-transform', j={'device': 'hand-left', 'position': {'x': -0.6, 'y': 0.1, 'z': -0.7}})


def on(name):
    return not WANT or name in WANT


# board anchor in the emulator room: (0, 0.42, -1.89); Shakuni sits at about z = -2.5
SEAT = ([0.0, 0.98, -1.28], [0.0, 0.62, -2.05])  # the player's eyes, looking across the board at him

# size the window before the XR session starts (the session keeps its framebuffer size)
subprocess.run(['npx', '@iwsdk/cli', 'browser', 'run', 'tools/gallery/window.mjs'], cwd=ROOT,
               env=dict(os.environ, GALLERY_W='1800', GALLERY_H='1260'), capture_output=True, timeout=90)

# 1. the title card as the board rises
cli('browser', 'reload'); time.sleep(6)
L = [x for x in logs() if seq(x)[0]]; CUR['id'] = seq(L[-1])[0]; CUR['n'] = 0
cli('xr', 'enter'); time.sleep(2)
cli('xr', 'set-input-mode', j={'mode': 'hand'})
cli('xr', 'set-transform', j={'device': 'headset', 'position': {'x': 0, 'y': 1.0, 'z': -1.25}, 'orientation': {'x': -0.38, 'y': 0, 'z': 0, 'w': 0.925}})
m = wait_for(r' placing turn', 15); time.sleep(1.5)
cam(*SEAT)
cli('xr', 'select', j={'device': 'hand-right'})
if on('title'):
    time.sleep(0.9); snap('01-title')  # title card shows 0.3 to 3.4 s into the intro
park_hands()
m = wait_for(r' p_ready turn', 30); A = anchor(m); D = dice_world(m); TABLE = A[1]

# 2. the board in play, seen from your seat (after the first-turn hint has had its moment)
if on('board'):
    cam(*SEAT); time.sleep(0.5); snap('02-board')

# 3. the ghost hand shows the swap while Shakuni looks away
if on('ghost'):
    c = D[1]
    cam(*SEAT)
    hand([{'position': {'x': c[0], 'y': c[1] + 0.005, 'z': c[2]}, 'anchor': 'grasp', 'approach': {'distance': 0.06}, 'pinch': {'value': 1, 'at': 'arrival'}},
          {'position': {'x': c[0] - 0.02, 'y': TABLE + 0.16, 'z': c[2] + 0.08}, 'duration': 0.5}])
    key('k'); cam([0.0, 1.0, -1.3], [0.08, 0.5, -1.85]); wait_for(r' ghost at wrist', 6)
    snap('03-ghost-swap')
    # throw honestly so the game moves on
    hand([{'position': {'x': c[0] + 0.03, 'y': TABLE + 0.14, 'z': c[2] - 0.05}, 'anchor': 'grasp', 'duration': 0.16}, {'pinch': 0, 'duration': 0.06}])
    park_hands()
    wait_for(r' p_reveal turn', 12)

# 4. the gold on the table, low and close
if on('gold'):
    g = [A[0] + 0.315, A[1], A[2] + 0.0]
    cam([g[0] + 0.2, g[1] + 0.13, g[2] + 0.22], [g[0] - 0.05, g[1] + 0.02, g[2] - 0.04])
    time.sleep(0.4); snap('04-gold')

# 5. Shakuni, face to face
if on('shakuni'):
    cam([0.03, 1.02, -1.9], [0.0, 0.95, -2.5])
    time.sleep(0.4); snap('05-shakuni')

# 6. caught: the crack and the light
if on('crack'):
    cam([0.08, 0.78, -1.45], [0.0, 0.43, -1.8]); key('x'); time.sleep(0.4); snap('06-crack')
    time.sleep(2)

# 7. the legend: his dice rise to be inspected
if on('legend'):
    cam(SEAT[0], [0.1, 0.72, -1.66]); key('7'); time.sleep(4.2); snap('07-legend')
    time.sleep(6)

# 8. victory: petals, and the court melts back into your room
if on('victory'):
    cam(*SEAT); key('v'); time.sleep(2.2); snap('08-victory')

print('done', OUT)
