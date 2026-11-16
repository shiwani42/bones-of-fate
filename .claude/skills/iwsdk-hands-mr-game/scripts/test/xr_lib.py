"""Drive an IWSDK app in the IWER emulator from Python (emulated hands, no headset).

Contract with the app (dev builds only, stripped from production):
    console.info(`[${TAG}] #${pageId}.${seq} <event> key=value ...`)
- pageId: random per page load; seq: increments on every line.
- Waits are monotonic on seq and pinned to the newest page load, so a test never
  matches a stale line from an earlier load (the browser log buffer survives reloads).

Configure via env: XR_LOG_TAG (default 'game'), XR_PROJECT_DIR (default: two
levels above this file, i.e. <repo>/scripts/e2e/xr_lib.py).
Requires: `npx @iwsdk/cli dev up --ai-mode agent`.
"""
import json, subprocess, time, re, sys
import os, pathlib
CWD = os.environ.get('XR_PROJECT_DIR') or str(pathlib.Path(__file__).resolve().parents[2])
TAG = os.environ.get('XR_LOG_TAG', 'game')
def cli(*args, j=None, timeout=60):
    cmd = ['npx', '@iwsdk/cli', *args] + (['--input-json', json.dumps(j)] if j is not None else [])
    out = subprocess.run(cmd, cwd=CWD, capture_output=True, text=True, timeout=timeout).stdout
    try: return json.loads(out)
    except Exception: return {'raw': out[:300]}
seen = set()
def logs():
    d = cli('browser', 'logs', j={'count': 200})
    r = d.get('data', {}); r = r.get('result', r)
    L = r if isinstance(r, list) else r.get('logs', [])
    return [str(l.get('message') or l.get('text')) for l in L if f'[{TAG}]' in str(l.get('message') or l.get('text'))]
CUR = {'id': None, 'n': 0}
def seq(m):
    g = re.search(r'#(\w+)\.(\d+)', m)
    return (g.group(1), int(g.group(2))) if g else (None, 0)
def wait_for(pattern, timeout=40, fresh=True):
    """Return the first matching log line newer than the last one consumed."""
    t0 = time.time()
    while time.time() - t0 < timeout:
        for m in logs():
            i, n = seq(m)
            if CUR['id'] is not None and i != CUR['id']: continue
            if fresh and n <= CUR['n']: continue
            if re.search(pattern, m):
                CUR['n'] = max(CUR['n'], n) if fresh else CUR['n']
                return m
        time.sleep(0.6)
    raise SystemExit(f'TIMEOUT waiting for {pattern}')
def mark_all():
    for m in logs():
        i, n = seq(m)
        if CUR['id'] is None or i == CUR['id']: CUR['n'] = max(CUR['n'], n)
def hand(steps, dev='hand-right'):
    r = cli('xr', 'run-sequence', j={'device': dev, 'steps': steps}, timeout=60)
    if not r.get('ok'): print('SEQUENCE ERROR', str(r.get('error', r))[:300], flush=True)
    return r
def json_field(m, name):
    """Parse `name=<json>` from a log line (arrays/objects)."""
    g = re.search(name + r'=(\[.*?\]\]|\[[^\]]*\]|\{[^}]*\})', m)
    return json.loads(g.group(1)) if g else None

def dice_world(m):
    return json.loads(re.search(r'diceWorld=(\[\[.*?\]\])', m).group(1))
def anchor(m):
    return json.loads(re.search(r'anchor=(\[[^\]]*\])', m).group(1))
results = {}
def check(name, ok, info=''):
    results[name] = ok; print(('PASS ' if ok else 'FAIL ') + name, info, flush=True)


def key(k):
    cli('browser', 'interact', j={'steps': [{'action': 'press', 'key': k}]})

def setup_example():
    """Example from Chausar: reload, enter AR, hand mode, seat the headset, pinch to place, pinch to skip intro."""
    cli('browser', 'reload'); time.sleep(6)
    L = [x for x in logs() if seq(x)[0]]
    CUR['id'] = seq(L[-1])[0]; CUR['n'] = 0   # newest page load only
    print('page', CUR['id'], flush=True)
    cli('xr', 'enter'); time.sleep(2)
    cli('xr', 'set-input-mode', j={'mode': 'hand'})
    cli('xr', 'set-transform', j={'device': 'headset', 'position': {'x': 0, 'y': 1.0, 'z': -1.25}, 'orientation': {'x': -0.38, 'y': 0, 'z': 0, 'w': 0.925}})
    m = wait_for(r' placing turn', 15); time.sleep(1.5)
    cli('xr', 'select', j={'device': 'hand-right'})
    wait_for(r' intro turn', 10); time.sleep(3.5)
    cli('xr', 'select', j={'device': 'hand-right'})
    return wait_for(r' p_ready turn', 12)

def choose_first():
    for _ in range(4):
        key('1')
        try:
            wait_for(r' moving turn', 3); return True
        except SystemExit:
            pass
    return False
