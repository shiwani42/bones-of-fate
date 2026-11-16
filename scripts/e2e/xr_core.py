"""Core loop: place, throw, honest reveal, seen swap → caught, gong catches Shakuni."""
import sys, pathlib; sys.path.insert(0, str(pathlib.Path(__file__).parent))
from xr_lib import *
m = setup(); check('placing → pinch places board → pinch skips intro', True)
A = anchor(m); D = dice_world(m); c = D[1]
TABLE = A[1]

def throw(c, under=False):
    steps = [{'position': {'x': c[0], 'y': c[1] + 0.005, 'z': c[2]}, 'anchor': 'grasp', 'approach': {'distance': 0.06}, 'pinch': {'value': 1, 'at': 'arrival'}},
             {'position': {'x': c[0], 'y': TABLE + 0.2, 'z': c[2] + 0.15}, 'duration': 0.5}]
    if under:
        steps += [{'position': {'x': c[0] + 0.1, 'y': TABLE - 0.12, 'z': c[2] + 0.2}, 'duration': 0.4},
                  {'duration': 0.9},
                  {'position': {'x': c[0], 'y': TABLE + 0.2, 'z': c[2] + 0.15}, 'duration': 0.4}]
    steps += [{'position': {'x': c[0] + 0.03, 'y': TABLE + 0.14, 'z': c[2] - 0.05}, 'duration': 0.16},
              {'pinch': 0, 'duration': 0.06}]
    return hand(steps)

# Turn 1: honest throw by hand
throw(c)
check('hand pinch picks up dice', bool(wait_for(r' p_holding turn', 5, fresh=False)))
m = wait_for(r' p_reveal turn', 12); check('release throws and dice settle', True, m.split('dice=')[1].split(' ')[0])
m = wait_for(r'resolve acts', 10); check('honest throw not caught', 'caught=false' in m, m[-60:])
# choose if offered, else move happens automatically
m = wait_for(r' (p_choose|moving) turn', 10)
if 'p_choose' in m:
    print('choose offered'); 

# Shakuni turn 1 (honest)
m = wait_for(r' s_reveal turn', 30); check('Shakuni throws', True, m.split('dice=')[1].split(' ')[0])
m = wait_for(r' p_ready turn', 30); D = dice_world(m)
check('dice slide back to player', abs(D[1][0] - (A[0] + 0.15)) < 0.03, str(D[1]))

# Turn 2: under-the-table swap (Shakuni may or may not be watching)
throw(D[1], under=True)
m = wait_for(r'resolve acts', 25)
check('under-table swap registers as a cheat', '"swap"' in m and 'loaded=true' in m, m[m.index('acts'):])
caught = 'caught=true' in m
print('caught:', caught)
if caught:
    check('caught → crack sequence', bool(wait_for(r' caught turn', 5, fresh=False)))
else:
    m2 = wait_for(r' (p_choose|moving) turn', 10)
    if 'p_choose' in m2:
        m3 = [x for x in logs() if 'p_choose' in x][-1]
        # pinch the first glowing piece: player pieces start beside the near-right tip
        pp = [A[0] + 2.6 * 0.026, A[1] + 0.02, A[2] + 9.9 * 0.026]
        hand([{'position': {'x': pp[0], 'y': pp[1], 'z': pp[2]}, 'anchor': 'grasp', 'approach': {'distance': 0.05}, 'pinch': {'value': 1, 'at': 'arrival'}}, {'pinch': 0, 'duration': 0.1}])
        check('pinch chooses a piece', bool(wait_for(r' moving turn', 6)))
# Shakuni turn 2 is scripted to cheat: poke the gong when he throws

m = wait_for(r' s_flying turn', 40)
G = [A[0] - 0.15, A[1] + 0.102, A[2] + 0.16 + 0.004]
hand([{'position': {'x': G[0], 'y': G[1], 'z': G[2] + 0.06}, 'anchor': 'index-tip', 'duration': 0.5, 'poseId': 'point'},
      {'position': {'x': G[0], 'y': G[1], 'z': G[2] + 0.01}, 'duration': 0.2},
      {'position': {'x': G[0], 'y': G[1], 'z': G[2] + 0.12}, 'duration': 0.3}], dev='hand-left')
m = wait_for(r'accuse cheated', 8); check('poking the gong accuses', True, m[-40:])
check('scripted 2nd Shakuni throw was a cheat', 'cheated=true' in m)
check('correct accusation → accused/crack', bool(wait_for(r' accused turn', 5, fresh=False)))
m = wait_for(r' p_ready turn', 20); check('play resumes with player turn', True, m.split('pos=')[1].split(' ')[0])
print(json.dumps(results))
sys.exit(0 if all(results.values()) else 1)
