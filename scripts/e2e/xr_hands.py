"""Hand-tracking guardrails: tracking loss while holding, dwell-to-choose, take-back, wave.

Lessons from Meta's Chess Club / Hand Physics Lab / Table Troopers stories:
never execute what the player didn't mean, and give them a way back.
"""
import sys, pathlib; sys.path.insert(0, str(pathlib.Path(__file__).parent))
from xr_lib import *
m = setup(); A = anchor(m); D = dice_world(m); TABLE = A[1]

def connect(on, dev='hand-right'):
    cli('xr', 'set-connected', j={'device': dev, 'connected': on})

def pick(c):
    hand([{'position': {'x': c[0], 'y': c[1] + 0.005, 'z': c[2]}, 'anchor': 'grasp', 'approach': {'distance': 0.06}, 'pinch': {'value': 1, 'at': 'arrival'}},
          {'position': {'x': c[0], 'y': TABLE + 0.2, 'z': c[2] + 0.15}, 'duration': 0.6},
          {'duration': 0.4}])

# 0. wave at Shakuni (p_ready is a quiet phase)
st = cli('xr', 'get-device-state'); head = st.get('data', {}).get('result', st.get('data', {})).get('headset', {}).get('position', {'x': 0, 'y': 1.0, 'z': -1.25})
hx, hy, hz = head['x'], head['y'], head['z']
steps = [{'position': {'x': hx + 0.1, 'y': hy + 0.05, 'z': hz - 0.35}, 'anchor': 'wrist', 'poseId': 'open', 'duration': 0.4}]
for i in range(6):
    steps.append({'position': {'x': hx + (0.25 if i % 2 == 0 else -0.05), 'y': hy + 0.05, 'z': hz - 0.35}, 'duration': 0.22})
hand(steps, dev='hand-left')
try: wait_for(r' wave$', 4); ok = True
except SystemExit: ok = False
check('waving at Shakuni gets a reply', ok)

# 1. hand vanishes while holding and never comes back → no throw; the dice go back to the table
pick(D[1]); wait_for(r' p_holding turn', 5, fresh=False)
connect(False)
m = wait_for(r'hold lost', 4); check('slow hand lost while holding → dice wait (no throw)', 'dice wait' in m, m[-40:])
m = wait_for(r'hold cancelled|p_flying', 6); check('hand gone 2.5 s → hold cancelled, not thrown', 'cancelled' in m, m[-40:])
check('back to p_ready', bool(wait_for(r' p_ready turn', 3, fresh=False)))
connect(True); time.sleep(0.8); hand([{'pinch': 0, 'duration': 0.1}]); time.sleep(0.4)

# 2. hand vanishes and comes back still pinching → the dice glide back into it, then a normal throw
key('o'); time.sleep(0.3)   # split your pieces so the next throw offers two choices
# (the p_ready line logs the dice before they slide home; they land on the starting spot again)
pick(D[1]); wait_for(r' p_holding turn', 5)
# IWER resets a reconnected hand to open, but a real hand comes back still pinching:
# reconnect, put it back where it was and pinch, in one call (each CLI call is ~1 s; the dice wait 2.5 s)
hs = cli('xr', 'get-hand-state', j={'device': 'hand-right'})['data']['result']
connect(False)
cli('xr', 'set-device-state', j={'state': {'hands': {'right': {'connected': True, 'position': hs['position'], 'pinchValue': 1}}}})
wait_for(r'hold lost', 4)
m = wait_for(r'hold resumed|hold cancelled', 5); check('returning pinching hand resumes the hold', 'resumed' in m, m[-40:])
c = D[1]
hand([{'position': {'x': c[0] + 0.03, 'y': TABLE + 0.14, 'z': c[2] - 0.05}, 'anchor': 'grasp', 'duration': 0.16}, {'pinch': 0, 'duration': 0.06}])
check('then a release throws as usual', bool(wait_for(r' p_reveal turn', 12)))

# 3. choosing: a passing fingertip doesn't commit; a resting one does; then take it back
m = wait_for(r' (p_choose|moving|caught) turn', 15)
if 'p_choose' in m:
    line = wait_for(r'choose at=', 3, fresh=False)
    at = json.loads(line.split('choose at=')[1].split(' to=')[0]); to = json.loads(line.split(' to=')[1])
    p0, p1, t = at[0], at[1], to[1]
    # brush across piece 0 on the way somewhere else
    hand([{'position': {'x': p0[0] - 0.08, 'y': p0[1] + 0.014, 'z': p0[2]}, 'anchor': 'index-tip', 'poseId': 'point', 'duration': 0.4},
          {'position': {'x': p0[0] + 0.08, 'y': p0[1] + 0.014, 'z': p0[2]}, 'duration': 0.15},
          {'position': {'x': p0[0] + 0.08, 'y': p0[1] + 0.08, 'z': p0[2]}, 'duration': 0.2}])
    time.sleep(0.4)
    still = [x for x in logs() if seq(x)[0] == CUR['id'] and seq(x)[1] > CUR['n'] and ' moving turn' in x]
    check('a fingertip brushing past does not choose', not still)
    # rest the fingertip on piece 1
    hand([{'position': {'x': p1[0], 'y': p1[1] + 0.05, 'z': p1[2]}, 'anchor': 'index-tip', 'poseId': 'point', 'duration': 0.4},
          {'position': {'x': p1[0], 'y': p1[1] + 0.013, 'z': p1[2]}, 'duration': 0.15},
          {'duration': 0.5},
          {'position': {'x': p1[0], 'y': p1[1] + 0.12, 'z': p1[2] + 0.1}, 'duration': 0.3},
          # then hover ~9 cm above where it will land: armed (away) but reaching
          {'position': {'x': t[0], 'y': t[1] + 0.09, 'z': t[2]}, 'duration': 0.4}])
    check('a resting fingertip chooses after the dwell', bool(wait_for(r' moving turn', 4)))
    m = wait_for(r' (p_takeback|handoff|gameover) turn', 10)
    check('your choice opens a take-back window', 'p_takeback' in m, m[:60])
    if 'p_takeback' in m:
        # the piece lands on its marker (`to`): touch at once, no extra log round-trip (CLI calls are ~1 s each)
        r = hand([{'position': {'x': t[0], 'y': t[1] + 0.013, 'z': t[2]}, 'anchor': 'index-tip', 'poseId': 'point', 'duration': 0.2},
              {'duration': 0.35},
              {'position': {'x': t[0], 'y': t[1] + 0.12, 'z': t[2] + 0.1}, 'duration': 0.3}])
        if not r.get('ok'): print('touch seq:', json.dumps(r)[:400], flush=True)
        m = wait_for(r'take back| handoff turn', 5); check('touching the moved piece takes it back', 'take back' in m)
        check('…and you choose again', bool(wait_for(r' p_choose turn', 3)))
        key('1'); wait_for(r' moving turn', 4)
        m = wait_for(r' (handoff|gameover) turn', 12); check('take-back window closes on its own', True)
else:
    print('no choice offered this throw; choose/take-back checks skipped', flush=True)

print(json.dumps(results)); sys.exit(0 if all(results.values()) else 1)
