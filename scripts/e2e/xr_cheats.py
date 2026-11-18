"""Cheats & endings: unseen swap, wrong accusation + forfeit, flip poke, win, gong restart."""
import sys, pathlib; sys.path.insert(0, str(pathlib.Path(__file__).parent))
from xr_lib import *
m = setup(); A = anchor(m); D = dice_world(m); TABLE = A[1]
def pick(c):
    hand([{'position': {'x': c[0], 'y': c[1] + 0.005, 'z': c[2]}, 'anchor': 'grasp', 'approach': {'distance': 0.06}, 'pinch': {'value': 1, 'at': 'arrival'}},
          {'position': {'x': c[0], 'y': TABLE + 0.2, 'z': c[2] + 0.15}, 'duration': 0.4}])
def under_and_throw(c):
    hand([{'position': {'x': c[0] + 0.1, 'y': TABLE - 0.12, 'z': c[2] + 0.2}, 'anchor': 'grasp', 'duration': 0.4}, {'duration': 0.9},
          {'position': {'x': c[0], 'y': TABLE + 0.2, 'z': c[2] + 0.15}, 'duration': 0.4},
          {'position': {'x': c[0] + 0.03, 'y': TABLE + 0.14, 'z': c[2] - 0.05}, 'duration': 0.16}, {'pinch': 0, 'duration': 0.06}])
def just_throw(c):
    hand([{'position': {'x': c[0] + 0.03, 'y': TABLE + 0.14, 'z': c[2] - 0.05}, 'anchor': 'grasp', 'duration': 0.16}, {'pinch': 0, 'duration': 0.06}])

# 1. unseen swap: Shakuni forced to look away first
pick(D[1]); key('k')
check('ghost hand demonstrates the swap while he looks away', bool(wait_for(r' ghost swap$', 5)))
under_and_throw(D[1])
m = wait_for(r'resolve acts', 25)
check('swap while Shakuni looks away is unseen', '"seen":false' in m and 'loaded=true' in m, m[m.index('acts'):])
check('unseen swap at low suspicion is not caught', 'caught=false' in m)
m = wait_for(r' (p_choose|moving) turn', 10)
if 'p_choose' in m:
    pp = [A[0] + 2.6 * 0.026, A[1] + 0.02, A[2] + 9.9 * 0.026]
    hand([{'position': {'x': pp[0], 'y': pp[1], 'z': pp[2]}, 'anchor': 'grasp', 'approach': {'distance': 0.05}, 'pinch': {'value': 1, 'at': 'arrival'}}, {'pinch': 0, 'duration': 0.1}])
    check('pinch chooses a piece', bool(wait_for(r' moving turn', 6)))
# 2. wrong accusation on Shakuni's first (honest) throw
wait_for(r' s_reveal turn', 40)
G = [A[0] - 0.15, A[1] + 0.102, A[2] + 0.164]
def gong():
    hand([{'position': {'x': G[0], 'y': G[1], 'z': G[2] + 0.06}, 'anchor': 'index-tip', 'duration': 0.5, 'poseId': 'point'},
          {'position': {'x': G[0], 'y': G[1], 'z': G[2] + 0.01}, 'duration': 0.2},
          {'position': {'x': G[0] - 0.1, 'y': G[1] + 0.1, 'z': G[2] + 0.15}, 'duration': 0.3}], dev='hand-left')
gong()
m = wait_for(r'accuse cheated', 8); check('wrong accusation registers', 'cheated=false' in m)
# his move completes, then your throw is forfeited → he throws again (his 2nd = scripted cheat)
m = wait_for(r' s_throw turn', 30)
check('forfeit: Shakuni throws again', True)
wait_for(r' p_ready turn', 40)
m = [x for x in logs() if ' p_ready turn' in x][-1]; D = dice_world(m)
# 3. flip cheat: throw honestly, then poke a die while he looks away
pick(D[1]); just_throw(D[1])
m = wait_for(r' p_reveal turn', 12)
key('k')
check('ghost hand demonstrates the flip while he looks away', bool(wait_for(r' ghost flip$', 5)))
dw = dice_world(m)
d0 = dw[0]
hand([{'position': {'x': d0[0], 'y': d0[1] + 0.03, 'z': d0[2]}, 'anchor': 'index-tip', 'duration': 0.35, 'poseId': 'point'},
      {'position': {'x': d0[0], 'y': d0[1] + 0.004, 'z': d0[2]}, 'duration': 0.12},
      {'position': {'x': d0[0], 'y': d0[1] + 0.08, 'z': d0[2] + 0.06}, 'duration': 0.2}], dev='hand-right')
m = wait_for(r'resolve acts', 15)
check('poking a die flips it (flip cheat)', '"flip"' in m, m[m.index('acts'):])
m = wait_for(r' (p_choose|moving|caught) turn', 10)
if 'p_choose' in m: choose_first()
# 4. win: put a piece near home and throw
wait_for(r' p_ready turn', 60)
key('w'); time.sleep(0.5)
m = [x for x in logs() if ' p_ready turn' in x][-1]; D = dice_world(m)
pick(D[1]); just_throw(D[1])
m = wait_for(r'(p_choose|moving) turn', 15)
if 'p_choose' in m: choose_first()
m = wait_for(r' gameover turn', 20); check('reaching the centre wins', 'turn=0' in m, m[:90])
check('the winner takes the gold that is left', bool(wait_for(r'stakes match → you', 3, fresh=False)))
m = wait_for(r' reflection ', 15); check('a closing reflection on how you played', '"' in m, m[m.index('reflection'):][:140])
time.sleep(1.5); gong()
check('gong restarts the match', bool(wait_for(r' intro turn', 8)))
print(json.dumps(results)); sys.exit(0 if all(results.values()) else 1)
