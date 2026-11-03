#!/usr/bin/env bash
# Unattended overnight network run on a desktop GPU (Linux; AMD via ROCm or NVIDIA via CUDA).
# Usage: scripts/nmr/desktop_run.sh BUNDLE OUTDIR [HOURS]
#   BUNDLE  nmr-train-bundle.pkl.gz (train_net.py --write-bundle)
#   OUTDIR  where models, logs and progress.json go
#   HOURS   time budget (default 9): a size search first, then as many seeds of the best size as fit.
# Results are scored back in the cloud on the SI test set; this machine only sees training data.
set -u
BUNDLE=$1; OUT=$2; HOURS=${3:-9}
DIR=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$OUT"
END=$(( $(date +%s) + HOURS * 3600 ))
DEV=cpu
if python -c 'import torch,sys; sys.exit(0 if torch.cuda.is_available() else 1)'; then DEV=cuda; fi
echo "device $DEV, budget ${HOURS} h" | tee -a "$OUT/run.log"
run() {  # name hidden layers epochs seed
  local log="$OUT/$1.log"
  python -I "$DIR/train_net.py" /nonexistent --bundle "$BUNDLE" --device "$DEV" --bs 256 \
    --hidden "$2" --layers "$3" --epochs "$4" --seed "$5" --out "$OUT/$1.pt" --report "$OUT/$1.json" > "$log" 2>&1
  local rc=$?
  echo "$(date -Is) $1 exit $rc $(tail -1 "$log" | cut -c1-200)" | tee -a "$OUT/run.log"
}
# 1. size search (one seed each), smallest first so something useful exists early
for cfg in "128 5 60" "192 6 100" "256 6 120" "256 8 120" "384 6 120"; do
  set -- $cfg
  name="sweep-h$1-l$2-e$3"
  [ -f "$OUT/$name.pt" ] && continue
  [ "$(date +%s)" -lt "$END" ] || break
  run "$name" "$1" "$2" "$3" 1
done
# 2. best size by validation score, then more seeds until the budget runs out
BEST=$(python - "$OUT" <<'PY'
import glob, sys, torch
best = min(glob.glob(sys.argv[1] + '/sweep-*.pt'), key=lambda p: torch.load(p, map_location='cpu')['val'])
print(best.split('sweep-')[1][:-3])
PY
)
echo "best size $BEST" | tee -a "$OUT/run.log"
H=$(echo "$BEST" | sed -E 's/h([0-9]+)-l([0-9]+)-e([0-9]+)/\1/'); L=$(echo "$BEST" | sed -E 's/h([0-9]+)-l([0-9]+)-e([0-9]+)/\2/'); E=$(echo "$BEST" | sed -E 's/h([0-9]+)-l([0-9]+)-e([0-9]+)/\3/')
for seed in 2 3 4 5 6 7 8 9 10; do
  [ "$(date +%s)" -lt "$END" ] || break
  [ -f "$OUT/ens-$BEST-s$seed.pt" ] && continue
  run "ens-$BEST-s$seed" "$H" "$L" "$E" "$seed"
done
echo "$(date -Is) done" | tee -a "$OUT/run.log"
