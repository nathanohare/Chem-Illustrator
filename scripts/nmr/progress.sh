#!/bin/bash
# Live view of the NMR training run. Stop with Ctrl+C.
cd ~/nmr-train/out || exit 1
shopt -s nullglob
while true; do
  clear; date; echo; tail -n 8 run.log; echo
  python3 - sweep-*.log ens-*.log <<'PY'
import json, sys, os
for f in sorted(sys.argv[1:], key=os.path.getmtime):
    rows = [json.loads(l) for l in open(f) if l.startswith('{"epoch')]
    if not rows: continue
    r = rows[-1]; v = r["val"]
    b = min(rows, key=lambda x: x["val"]["13C"]["MAE"] / 2 + x["val"]["1H"]["MAE"] / 0.2)["val"]
    print("%-26s epoch %3d   now 13C %.2f  1H %.3f   best 13C %.2f  1H %.3f   %ss/epoch" % (
        f[:-4], r["epoch"] + 1, v["13C"]["MAE"], v["1H"]["MAE"], b["13C"]["MAE"], b["1H"]["MAE"], r["sec"]))
PY
  echo "Average error in ppm on held-out compounds; lower is better. The first sweep model (h128-l5) is the same size as the networks in the app now."
  sleep 20
done
