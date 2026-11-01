"""Télécharge les mesures de la bouée Waverider de Sydney (MHL) depuis l'archive
AODN « cloud optimised » sur AWS, et les assemble en un seul Parquet."""
import re
import sys
from pathlib import Path

import pandas as pd
import requests

BUCKET = "https://aodn-cloud-optimised.s3.amazonaws.com"
PREFIX = "wave_buoy_realtime_nonqc.parquet/site_name=Sydney/"


def keys() -> list[str]:
    out, token = [], None
    while True:
        url = f"{BUCKET}/?list-type=2&prefix={PREFIX}&max-keys=1000"
        if token:
            url += f"&continuation-token={requests.utils.quote(token)}"
        xml = requests.get(url, timeout=60).text
        out += re.findall(r"<Key>([^<]+\.parquet)</Key>", xml)
        m = re.search(r"<NextContinuationToken>([^<]+)</NextContinuationToken>", xml)
        if not m:
            return out
        token = m.group(1)


def main(out: str) -> None:
    frames = []
    for k in keys():
        p = Path("data/raw/buoy") / Path(k).name
        p.parent.mkdir(parents=True, exist_ok=True)
        if not p.exists():
            p.write_bytes(requests.get(f"{BUCKET}/{k}", timeout=120).content)
        frames.append(pd.read_parquet(p))
    df = pd.concat(frames, ignore_index=True)
    df.to_parquet(out)
    print(len(df), "mesures", df.columns.tolist())


if __name__ == "__main__":
    main(sys.argv[1])
