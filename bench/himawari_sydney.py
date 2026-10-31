"""Image satellite réelle du ciel de Sydney à partir de Himawari-9 (JMA, archive NOAA sur AWS).

Télécharge seulement les segments du disque complet qui couvrent Sydney, les lit avec
Satpy (lecteur de référence ahi_hsd), puis rééchantillonne sur une zone centrée sur Maroubra.
"""
import bz2
import re
import sys
from pathlib import Path

import requests

BUCKET = "https://noaa-himawari9.s3.amazonaws.com"
OUT = Path(__file__).resolve().parent / "data/raw/himawari"


def list_keys(prefix: str) -> list[str]:
    xml = requests.get(f"{BUCKET}/?list-type=2&prefix={prefix}&max-keys=1000", timeout=60).text
    return re.findall(r"<Key>([^<]+)</Key>", xml)


def fetch(slot: str, bands: list[str], segments: list[str]) -> list[Path]:
    paths = []
    for k in list_keys(f"AHI-L1b-FLDK/{slot}/"):
        name = k.rsplit("/", 1)[1]
        if not any(f"_{b}_" in name for b in bands) or not any(f"_S{s}" in name for s in segments):
            continue
        p = OUT / name.removesuffix(".bz2")
        if not p.exists():
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(bz2.decompress(requests.get(f"{BUCKET}/{k}", timeout=300).content))
        paths.append(p)
    return paths


def main(slot: str, png: str) -> None:
    from pyresample import create_area_def
    from satpy import Scene

    # Sydney tombe vers la ligne 4459 sur 5500 du disque à 2 km (projection geos), segment 9.
    files = fetch(slot, ["B01", "B02", "B03", "B04", "B13"], ["0810", "0910"])
    scn = Scene(reader="ahi_hsd", filenames=[str(f) for f in files])
    # 300 km x 300 km centrés sur Maroubra, 1 km de résolution
    area = create_area_def("maroubra", {"proj": "aeqd", "lat_0": -33.95, "lon_0": 151.26},
                           width=300, height=300, area_extent=[-150000, -150000, 150000, 150000], units="m")
    names = scn.available_composite_names()
    composite = next((c for c in ("true_color_nocorr", "true_color") if c in names), "B13")
    scn.load([composite])
    # Découper avant tout calcul : le disque complet à 500 m ne tient pas en mémoire.
    scn = scn.crop(ll_bbox=(149.5, -35.5, 153.0, -32.4))
    local = scn.resample(area, resampler="nearest")
    local.save_dataset(composite, filename=png)
    print(composite, "->", png)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
