"""Juge des passages de l'ISS : Skyfield (SGP4, éphéméride JPL DE421, test d'éclairement)
sur le TLE réel du 3 juillet 2018 tiré de la suite de tests de Skyfield."""
import json
from pathlib import Path

from skyfield.api import EarthSatellite, load, wgs84
from skyfield_data import get_skyfield_data_path

L1 = "1 25544U 98067A   18184.80969102  .00001614  00000-0  31745-4 0  9993"
L2 = "2 25544  51.6414 295.8524 0003435 262.6267 204.2868 15.54005638121106"
ts = load.timescale(builtin=True)
eph = load(str(Path(get_skyfield_data_path()) / "de421.bsp"))
sat = EarthSatellite(L1, L2, "ISS", ts)
site = wgs84.latlon(-33.9496, 151.2577, elevation_m=10)
t0, t1 = ts.utc(2018, 6, 26, 12), ts.utc(2018, 7, 11, 12)  # ±8 jours autour de l époque du TLE
out = []
# Échantillonnage à 10 s, mêmes critères que l'app : hauteur ≥ 10°, ISS éclairée, Soleil sous -6°.
import numpy as np
times = ts.tt_jd(np.arange(t0.tt, t1.tt, 10 / 86400))
alt = (sat - site).at(times).altaz()[0].degrees
lit = sat.at(times).is_sunlit(eph)
sun_alt = (eph["earth"] + site).at(times).observe(eph["sun"]).apparent().altaz()[0].degrees
vis = (alt >= 10) & lit & (sun_alt < -6)
cur = None
for i, v in enumerate(vis):
    if v and cur is None:
        cur = [i, i, i]
    if v:
        cur[2] = i
        if alt[i] > alt[cur[1]]:
            cur[1] = i
    if not v and cur is not None:
        if (cur[2] - cur[0]) * 10 >= 60:
            out.append({"start": times[cur[0]].utc_iso(), "max": times[cur[1]].utc_iso(), "end": times[cur[2]].utc_iso(), "maxAlt": round(float(alt[cur[1]]), 1)})
        cur = None
dest = Path(__file__).resolve().parents[1] / "apps/hub/test/fixtures/iss-passes-skyfield-2018-07.json"
dest.write_text(json.dumps({"tle": [L1, L2], "passes": out}, indent=1))
print(json.dumps(out, indent=1))
