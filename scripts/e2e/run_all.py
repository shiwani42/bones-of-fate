"""Run every XR scenario; exit non-zero if any check fails.

Usage (dev server must be up):  npm run test:xr
"""
import subprocess, sys, pathlib
here = pathlib.Path(__file__).parent
bad = 0
for name in ('xr_core.py', 'xr_cheats.py', 'xr_hands.py'):
    print(f'== {name}', flush=True)
    bad |= subprocess.run([sys.executable, str(here / name)]).returncode
sys.exit(bad)
