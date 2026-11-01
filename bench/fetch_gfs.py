"""Extrait des prévisions brutes de modèles globaux (GFS de la NOAA, IFS de l'ECMWF,
archives ouvertes sur AWS) autour d'un site.

Pour chaque fichier, on lit l'index .idx et on ne télécharge que les octets des
messages GRIB2 utiles (requêtes HTTP Range), puis on garde les 4 points de grille
qui encadrent le site. Sortie : un Parquet par variable, une ligne par
(cycle, échéance), sans jamais stocker les champs globaux.
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import json
import datetime as dt
import sys
import time
from pathlib import Path

import eccodes
import numpy as np
import pandas as pd
import requests

NOAA = "https://noaa-gfs-bdp-pds.s3.amazonaws.com"
ECMWF = "https://ecmwf-forecasts.s3.amazonaws.com"
SESSION = requests.Session()
SESSION.mount("https://", requests.adapters.HTTPAdapter(pool_connections=32, pool_maxsize=32))

PRODUCTS = {
    # nom court -> (dépôt, gabarit de chemin, motifs d'index)
    "atmos": (
        NOAA,
        "gfs.{d}/{c:02d}/atmos/gfs.t{c:02d}z.pgrb2.0p25.f{f:03d}",
        {"t2m": ":TMP:2 m above ground:", "u10": ":UGRD:10 m above ground:", "v10": ":VGRD:10 m above ground:"},
    ),
    "wave": (
        NOAA,
        "gfs.{d}/{c:02d}/wave/gridded/gfswave.t{c:02d}z.global.0p25.f{f:03d}.grib2",
        {"hs": ":HTSGW:surface:", "tp": ":PERPW:surface:", "dp": ":DIRPW:surface:"},
    ),
    # Index ECMWF : une ligne JSON par message, avec _offset et _length
    "ifs": (
        ECMWF,
        "{d}/{c:02d}z/ifs/0p25/oper/{d}{c:02d}0000-{f}h-oper-fc.grib2",
        {"t2m": "2t", "u10": "10u", "v10": "10v"},
    ),
}


def get(url: str, headers: dict | None = None, tries: int = 6) -> bytes | None:
    for k in range(tries):
        try:
            r = SESSION.get(url, headers=headers, timeout=60)
            if r.status_code == 404:
                return None
            r.raise_for_status()
            return r.content
        except requests.RequestException:
            time.sleep(2 ** k)
    return None


def byte_ranges(idx_text: str, patterns: dict[str, str]) -> dict[str, tuple[int, int | None]]:
    if idx_text.lstrip().startswith("{"):
        out = {}
        for l in idx_text.splitlines():
            j = json.loads(l)
            for name, param in patterns.items():
                if j.get("param") == param and j.get("levtype") == "sfc":
                    out[name] = (j["_offset"], j["_offset"] + j["_length"] - 1)
        return out
    lines = [l for l in idx_text.splitlines() if l.strip()]
    starts = [int(l.split(":")[1]) for l in lines]
    out = {}
    for name, pat in patterns.items():
        for i, l in enumerate(lines):
            if pat in l:
                end = starts[i + 1] - 1 if i + 1 < len(lines) else None
                out[name] = (starts[i], end)
                break
    return out


def box_values(msg: bytes, lat: float, lon: float) -> tuple[list[float], list[float], list[float]]:
    """Valeurs aux 4 points de grille qui encadrent (lat, lon)."""
    h = eccodes.codes_new_from_message(msg)
    try:
        ni = eccodes.codes_get(h, "Ni")
        nj = eccodes.codes_get(h, "Nj")
        lat0 = eccodes.codes_get(h, "latitudeOfFirstGridPointInDegrees")
        lon0 = eccodes.codes_get(h, "longitudeOfFirstGridPointInDegrees")
        dlat = eccodes.codes_get(h, "jDirectionIncrementInDegrees")
        dlon = eccodes.codes_get(h, "iDirectionIncrementInDegrees")
        vals = eccodes.codes_get_values(h).reshape(nj, ni)
        missing = eccodes.codes_get(h, "missingValue")
    finally:
        eccodes.codes_release(h)
    # latitudes de 90 à -90 ; longitudes depuis 0 (GFS) ou -180 (IFS), d'où le modulo
    j0 = int(np.floor((lat0 - lat) / dlat))
    i0 = int(np.floor(((lon - lon0) % 360) / dlon))
    out, lats, lons = [], [], []
    for dj in (0, 1):
        for di in (0, 1):
            v = float(vals[j0 + dj, i0 + di])
            out.append(np.nan if v == missing else v)
            lats.append(lat0 - (j0 + dj) * dlat)
            lons.append((lon0 + (i0 + di) * dlon + 180) % 360 - 180)
    return out, lats, lons


def one(product: str, day: dt.date, cycle: int, fh: int, lat: float, lon: float):
    bucket, tmpl, patterns = PRODUCTS[product]
    path = tmpl.format(d=day.strftime("%Y%m%d"), c=cycle, f=fh)
    idx_path = path.removesuffix(".grib2") + ".index" if bucket == ECMWF else path + ".idx"
    idx = get(f"{bucket}/{idx_path}")
    if idx is None:
        return None
    ranges = byte_ranges(idx.decode(), patterns)
    row = {"init": pd.Timestamp(day) + pd.Timedelta(hours=cycle), "lead_h": fh}
    for name, (a, b) in ranges.items():
        rng = f"bytes={a}-{'' if b is None else b}"
        msg = get(f"{bucket}/{path}", headers={"Range": rng})
        if msg is None:
            continue
        vals, lats, lons = box_values(msg, lat, lon)
        for k, v in enumerate(vals):
            row[f"{name}_{k}"] = v
        row["box_lats"], row["box_lons"] = lats, lons
    return row


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("product", choices=PRODUCTS)
    ap.add_argument("--start", required=True)
    ap.add_argument("--end", required=True)
    ap.add_argument("--lat", type=float, required=True)
    ap.add_argument("--lon", type=float, required=True)
    ap.add_argument("--cycles", default="0")
    ap.add_argument("--leads", default="6,12,18,24,30,36,42,48")
    ap.add_argument("--out", required=True)
    ap.add_argument("--workers", type=int, default=24)
    a = ap.parse_args()

    days = pd.date_range(a.start, a.end, freq="D").date
    cycles = [int(c) for c in a.cycles.split(",")]
    leads = [int(f) for f in a.leads.split(",")]
    jobs = [(d, c, f) for d in days for c in cycles for f in leads]
    rows, t0 = [], time.time()
    with cf.ThreadPoolExecutor(a.workers) as ex:
        futs = [ex.submit(one, a.product, d, c, f, a.lat, a.lon) for d, c, f in jobs]
        for n, fut in enumerate(cf.as_completed(futs), 1):
            r = fut.result()
            if r:
                rows.append(r)
            if n % 200 == 0:
                print(f"{n}/{len(jobs)} {time.time() - t0:.0f}s", file=sys.stderr, flush=True)
    df = pd.DataFrame(rows).sort_values(["init", "lead_h"])
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(a.out)
    print(f"{len(df)} lignes sur {len(jobs)} demandées, {time.time() - t0:.0f}s -> {a.out}")


if __name__ == "__main__":
    main()
