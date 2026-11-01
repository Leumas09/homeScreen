"""Références indépendantes pour vérifier @maroubra/sky : Skyfield + éphéméride
JPL DE421, observateur à Maroubra au niveau de la mer, année 2027.

Sortie : packages/sky/test/fixtures/skyfield_2027.json
"""
import json
from pathlib import Path

from skyfield import almanac
from skyfield.api import load, wgs84
from skyfield_data import get_skyfield_data_path

LAT, LON = -33.9496, 151.2577
OUT = Path(__file__).resolve().parents[1] / "packages/sky/test/fixtures/skyfield_2027.json"

loader = load  # temps (delta T, sauts) intégrés à Skyfield
ts = loader.timescale(builtin=True)
eph = load(str(Path(get_skyfield_data_path()) / "de421.bsp"))
earth, sun, moon = eph["earth"], eph["sun"], eph["moon"]
site = wgs84.latlon(LAT, LON)
obs = earth + site

t0, t1 = ts.utc(2027, 1, 1), ts.utc(2028, 1, 1)


def iso(t):
    return t.utc_iso()


def events(target, fn, horizon=None):
    kw = {} if horizon is None else {"horizon_degrees": horizon}
    t, real = fn(obs, target, t0, t1, **kw)
    return [iso(x) for x, r in zip(t, real) if r]


out = {
    "site": {"lat": LAT, "lon": LON, "elevation_m": 0},
    "generator": "skyfield + DE421",
    "sunrise": events(sun, almanac.find_risings),
    "sunset": events(sun, almanac.find_settings),
    "civil_dusk": events(sun, almanac.find_settings, -6.0),
    "astro_dusk": events(sun, almanac.find_settings, -18.0),
    "moonrise": events(moon, almanac.find_risings),
    "moonset": events(moon, almanac.find_settings),
}

# Azimut de la Lune à son lever, et fraction éclairée
rise_t = ts.from_datetimes([ts.utc(2027, 1, 1).utc_datetime().fromisoformat(s.replace("Z", "+00:00")) for s in out["moonrise"]])
alt, az, _ = obs.at(rise_t).observe(moon).apparent().altaz("standard")
out["moonrise_az"] = [round(float(a), 4) for a in az.degrees]
out["moonrise_illum"] = [round(float(f), 4) for f in almanac.fraction_illuminated(eph, "moon", rise_t)]

# Positions des planètes chaque soir à 10:00 UTC (20 h ou 21 h à Sydney)
evenings = ts.utc(2027, 1, range(1, 366), 10)
planets = {}
for name, key in [("Venus", "venus"), ("Mars", "mars"), ("Jupiter", "jupiter barycenter"), ("Saturn", "saturn barycenter")]:
    alt, az, _ = obs.at(evenings).observe(eph[key]).apparent().altaz("standard")
    planets[name] = {"alt": [round(float(x), 4) for x in alt.degrees], "az": [round(float(x), 4) for x in az.degrees]}
out["evening_utc"] = [iso(x) for x in evenings]
out["planets"] = planets

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(out))
print({k: len(v) for k, v in out.items() if isinstance(v, list)})
