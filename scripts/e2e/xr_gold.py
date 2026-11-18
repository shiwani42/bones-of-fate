"""Gold ending: a player with no gold left loses the match, even mid-race (19 Nov match-length fix)."""
import sys, pathlib; sys.path.insert(0, str(pathlib.Path(__file__).parent))
from xr_lib import *
m = setup(); A = anchor(m); D = dice_world(m); TABLE = A[1]
# dev key 5 sends one stack to Shakuni: 4 presses leave you with none
for i in range(4):
    key('5')
    s = wait_for(r'stakes dev', 5)
check('dev key 5 empties your side of the table', 'you=0 shakuni=8' in s, s[s.index('stakes'):])
# play one ordinary turn; the match should end when it is handed over
c = D[1]
hand([{'position': {'x': c[0], 'y': c[1] + 0.005, 'z': c[2]}, 'anchor': 'grasp', 'approach': {'distance': 0.06}, 'pinch': {'value': 1, 'at': 'arrival'}},
      {'position': {'x': c[0], 'y': TABLE + 0.2, 'z': c[2] + 0.15}, 'duration': 0.4}])
hand([{'position': {'x': c[0] + 0.03, 'y': TABLE + 0.14, 'z': c[2] - 0.05}, 'anchor': 'grasp', 'duration': 0.16}, {'pinch': 0, 'duration': 0.06}])
m = wait_for(r' (p_choose|moving|caught) turn', 20)
if 'p_choose' in m: choose_first()
m = wait_for(r'match over', 30)
check('no gold left ends the match: Shakuni wins by gold', 'winner=1 by gold' in m, m[m.index('match'):])
m = wait_for(r' gameover turn', 3, fresh=False)
check('the race is not over when the gold runs out', 'pos=[[' in m, m[m.index('pos'):][:40])
m = wait_for(r' reflection ', 20); check('a gold ending still closes with a reflection', '"' in m, m[m.index('reflection'):][:120])
# the gong restart deals the gold back out, 4 stacks each
time.sleep(1.5)
G = [A[0] - 0.15, A[1] + 0.102, A[2] + 0.164]
hand([{'position': {'x': G[0], 'y': G[1], 'z': G[2] + 0.06}, 'anchor': 'index-tip', 'duration': 0.5, 'poseId': 'point'},
      {'position': {'x': G[0], 'y': G[1], 'z': G[2] + 0.01}, 'duration': 0.2},
      {'position': {'x': G[0] - 0.1, 'y': G[1] + 0.1, 'z': G[2] + 0.15}, 'duration': 0.3}], dev='hand-left')
check('gong restarts after a gold ending', bool(wait_for(r' intro turn', 8)))
key('6'); s = wait_for(r'stakes dev', 5)
check('restart deals the gold back out 4/4', 'you=5 shakuni=3' in s, s[s.index('stakes'):])
print(json.dumps(results)); sys.exit(0 if all(results.values()) else 1)
