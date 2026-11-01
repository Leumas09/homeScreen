#!/usr/bin/env bash
# Télécharge GFS-Wave par tranches de dates : une interruption ne perd qu'une tranche.
set -euo pipefail
cd "$(dirname "$0")"
. ../.venv/bin/activate
for range in 2024-01-10:2024-06-30 2024-07-01:2024-12-31 2025-01-01:2025-06-30 2025-07-01:2025-12-31 2026-01-01:2026-06-30; do
  s=${range%%:*}; e=${range##*:}; out=data/wave_chunks/$s.parquet
  [ -f "$out" ] || python fetch_gfs.py wave --start "$s" --end "$e" --cycles 0,12 --lat -33.77 --lon 151.41 --out "$out" --workers 16
done
python -c "import pandas as pd, glob; pd.concat(pd.read_parquet(f) for f in sorted(glob.glob('data/wave_chunks/*.parquet'))).to_parquet('data/gfs_wave_sydney.parquet'); print('ok')"
