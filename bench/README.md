# Banc de vérification

Le banc répond à une seule question : **les prévisions de l'écran sont-elles plus justes que le modèle brut ?**
Le juge est toujours une observation indépendante, sur une période que les corrections n'ont jamais vue.

| Script | Rôle |
|---|---|
| `fetch_gfs.py` | Prévisions brutes GFS (NOAA) et IFS (ECMWF), archives ouvertes sur AWS, téléchargement partiel par index |
| `fetch_wave_chunks.sh` | GFS-Wave par tranches de dates (reprise possible) |
| `fetch_buoy.py` | Bouée Waverider de Sydney (MHL), archive AODN sur AWS |
| `verify.py` | Appariement prévision et observation, corrections, scores sur la période test, IC 95 % par bootstrap par blocs de jours |
| `sky_reference.py` | Références Skyfield + JPL DE421 pour vérifier `packages/sky` |
| `himawari_sydney.py` | Image Himawari-9 de Sydney (segments utiles du disque complet seulement) |
| `export_trackrecord.py` | Résultats vers `apps/web/src/data/track-record.json` |

Reproduire :

```bash
python3 -m venv .venv && . .venv/bin/activate && pip install -r bench/requirements.txt
mkdir -p bench/data/raw && for y in 2024 2025; do curl -sS -o bench/data/raw/yssy_$y.csv "https://noaa-global-hourly-pds.s3.amazonaws.com/$y/94767099999.csv"; done
cd bench
python fetch_gfs.py atmos --start 2024-01-10 --end 2025-08-24 --cycles 0,12 --lat -33.946 --lon 151.177 --out data/gfs_atmos_yssy.parquet
python fetch_gfs.py ifs   --start 2024-01-10 --end 2025-08-24 --cycles 0,12 --lat -33.946 --lon 151.177 --out data/ifs_atmos_yssy.parquet --workers 8
./fetch_wave_chunks.sh && python fetch_buoy.py data/buoy_sydney.parquet
python verify.py && python sky_reference.py && python export_trackrecord.py
```

Sources, toutes sans clé : `noaa-gfs-bdp-pds`, `ecmwf-forecasts`, `noaa-global-hourly-pds`, `aodn-cloud-optimised`, `noaa-himawari9` (AWS Open Data).
