"""Assemble les résultats du banc en un JSON lu par la page « Track record » de l'app.
Les objectifs viennent de docs/PLAN.md (partie A.4) ; un objectif manqué reste affiché."""
import datetime as dt
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
RES = HERE / "results"
OUT = HERE.parent / "apps/web/src/data/track-record.json"

NAMES = {"raw": "Raw model (GFS)", "ifs": "Raw model (ECMWF IFS)", "blend": "GFS + IFS average",
         "bias": "Bias removed", "mos": "Linear MOS", "decay": "Running bias (NOAA method)", "ml": "Learned correction"}
TITLES = {"Température": ("Temperature at Sydney Airport", "°C"), "Vent": ("Wind at Sydney Airport", "m/s"),
          "Hauteur": ("Wave height at the Sydney buoy", "m")}
TARGET = {"Température": 0.25, "Vent": 0.25, "Hauteur": 0.0}


def verification(r: dict) -> dict:
    key = r["label"].split()[0]
    title, unit = TITLES[key]
    corrected = {k: v for k, v in r["gain_vs_raw"].items() if k not in ("ifs", "blend")}
    best = max(corrected, key=lambda k: corrected[k]["gain"])
    leads = [{"lead": int(l), "raw": v["raw"]["mae"], "best": v[best]["mae"]} for l, v in sorted(r["leads"].items(), key=lambda x: int(x[0]))]
    return {
        "title": title, "unit": unit, "best": NAMES[best].lower(),
        "gain": corrected[best]["gain"], "ci": corrected[best]["ci95"], "target": TARGET[key],
        "test": f"{r['test'][0][:10]} to {r['test'][1][:10]}, {r['test'][2]} forecasts",
        "methods": [{"name": NAMES[k], "mae": v} for k, v in r["overall"].items()],
        "leads": leads,
    }


def main() -> None:
    verifs, checks = [], []
    for name in ["weather", "waves"]:
        p = RES / f"verify_{name}.json"
        if p.exists():
            verifs += [verification(r) for r in json.loads(p.read_text())]
    for v in verifs:
        pass_ = v["gain"] >= v["target"] if v["target"] else v["gain"] > 0
        checks.append({
            "name": v["title"], "judge": "Observations, held-out period",
            "target": f"error −{v['target']*100:.0f}% vs raw" if v["target"] else "error below raw model",
            "result": (f"−{v['gain']*100:.1f}% (95%: {v['ci'][0]*100:.1f} to {v['ci'][1]*100:.1f})" if v["gain"] > 0
                       else "no correction beats the raw model, raw kept"),
            "pass": bool(pass_),
        })
    tide = RES / "tide_vs_ors065.json"
    if tide.exists():
        t = json.loads(tide.read_text())
        floor = t.get("judge_floor", {}).get("time_mae_min")
        checks.append({"name": "High and low tide heights, 2025", "judge": "IMOS ORS065 sensors, year held out",
                       "target": "within 10 cm", "result": f"{t['height_mae_cm']:.1f} cm on average, 90% within {t['height_p90_cm']:.1f} cm",
                       "pass": t["height_mae_cm"] < 10})
        checks.append({"name": "High and low tide times, 2025", "judge": "IMOS ORS065 sensors, year held out",
                       "target": "within 5 min", "result": f"{t['time_mae_min']:.0f} min, but the sensor alone adds {floor:.0f} min" if floor else f"{t['time_mae_min']:.0f} min",
                       "pass": False, "status": "untestable" if floor and floor > 5 else "missed"})
    sky = RES / "sky_vs_skyfield.json"
    if sky.exists():
        s = json.loads(sky.read_text())
        ev = max(s[k]["max"] for k in ["sunrise", "sunset", "civil_dusk", "astro_dusk", "moonrise", "moonset"])
        pl = max(s[k] for k in ["Venus", "Mars", "Jupiter", "Saturn"])
        checks.append({"name": "Sun and Moon rise and set, 2027", "judge": "Skyfield + JPL DE421",
                       "target": "within 30 s", "result": f"worst {ev:.1f} s", "pass": ev < 30})
        checks.append({"name": "Planet positions, 2027 evenings", "judge": "Skyfield + JPL DE421",
                       "target": "within 1′", "result": f"worst {pl:.2f}′", "pass": pl < 1})
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"generated": dt.date.today().isoformat(), "checks": checks, "verifications": verifs}, indent=2))
    print(OUT, len(checks), "checks")


if __name__ == "__main__":
    main()
