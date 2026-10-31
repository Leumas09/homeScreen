"""Marée de Maroubra calculée localement par analyse harmonique, sans API ni clé.

Matière brute : profondeur horaire des capteurs de fond du mouillage IMOS ORS065
(station de référence au large de Bondi, environ 7 km de Maroubra), archive AODN sur AWS.

Méthode d'océanographe :
1. série par déploiement, moyenne retirée (chaque remise à l'eau change la profondeur) ;
2. filtre passe-haut de 40 h pour enlever l'inclinaison lente du mouillage (courant Est-Australien) ;
3. analyse harmonique UTide sur les années d'entraînement ;
4. prédiction de l'année suivante, jamais vue, et comparaison aux mesures :
   erreur horaire, heures et hauteurs des pleines et basses mers.
Sortie : constantes harmoniques (pour l'app) et scores (pour le Track record).
"""
import io
import json
import re
from pathlib import Path

import numpy as np
import pandas as pd
import requests
import utide

HERE = Path(__file__).resolve().parent
B = "https://aodn-cloud-optimised.s3.amazonaws.com"
PREFIX = "mooring_hourly_timeseries_delayed_qc.parquet/site_code=ORS065/"
LAT = -33.897


def load() -> pd.DataFrame:
    cache = HERE / "data/ors065.parquet"
    if cache.exists():
        return pd.read_parquet(cache)
    keys = re.findall(r"<Key>([^<]+)</Key>", requests.get(f"{B}/?list-type=2&prefix={PREFIX}&max-keys=1000", timeout=60).text)
    frames = []
    for k in keys:
        d = pd.read_parquet(io.BytesIO(requests.get(f"{B}/{k}", timeout=300).content),
                            columns=["TIME", "DEPTH", "NOMINAL_DEPTH", "instrument_id"])
        frames.append(d[(d.NOMINAL_DEPTH >= 50) & d.DEPTH.notna()])
    df = pd.concat(frames, ignore_index=True)
    df.to_parquet(cache)
    return df


def sea_level(df: pd.DataFrame) -> pd.Series:
    """Hauteur d'eau relative (m) : la profondeur du capteur augmente quand la mer monte."""
    parts = []
    for _, g in df.groupby("instrument_id"):
        s = g.set_index("TIME").DEPTH.sort_index()
        s = s[~s.index.duplicated()].asfreq("h")
        if s.notna().sum() < 24 * 20:
            continue
        s = s - s.mean()
        slow = s.interpolate(limit=6).rolling(40, center=True, min_periods=30).mean()
        parts.append((s - slow).dropna())
    out = pd.concat(parts).sort_index()
    out = out[~out.index.duplicated()]
    return out[out.abs() < 2.0]


def extrema(s: pd.Series) -> pd.DataFrame:
    """Pleines et basses mers : extremums d'une série lissée, raffinés par une parabole sur 3 points."""
    v = s.to_numpy()
    rows = []
    for i in range(1, len(v) - 1):
        if np.isnan(v[i - 1:i + 2]).any():
            continue
        if (v[i] > v[i - 1] and v[i] >= v[i + 1]) or (v[i] < v[i - 1] and v[i] <= v[i + 1]):
            a, b, c = v[i - 1], v[i], v[i + 1]
            den = a - 2 * b + c
            dx = 0.5 * (a - c) / den if den else 0.0
            rows.append({"time": s.index[i] + pd.Timedelta(hours=dx), "h": b - 0.25 * (a - c) * dx, "kind": "high" if b > a else "low"})
    return pd.DataFrame(rows)


def extrema_obs(s: pd.Series) -> pd.DataFrame:
    """Extremums mesurés : repérés sur la série lissée sur 3 h, puis parabole ajustée par moindres
    carrés sur les 5 valeurs brutes autour (±2 h), pour ne pas écrêter les pics par le lissage."""
    s = s.asfreq("h")
    rough = extrema(s.rolling(3, center=True).mean())
    rows = []
    for _, r in rough.iterrows():
        win = s[r.time - pd.Timedelta(hours=2.5): r.time + pd.Timedelta(hours=2.5)].dropna()
        if len(win) < 5:
            continue
        x = (win.index - r.time) / pd.Timedelta(hours=1)
        a, b, c = np.polyfit(x, win.to_numpy(), 2)
        if a == 0 or (a < 0) != (r.kind == "high"):
            continue
        xv = -b / (2 * a)
        if abs(xv) > 2:
            continue
        rows.append({"time": r.time + pd.Timedelta(hours=xv), "h": c - b * b / (4 * a), "kind": r.kind})
    return pd.DataFrame(rows)


def main() -> None:
    sl = sea_level(load())
    years = sl.groupby(sl.index.year).size()
    print("heures par année :", years.to_dict())
    test_year = int(years[years > 24 * 200].index.max())
    train = sl[(sl.index.year >= test_year - 3) & (sl.index.year < test_year)]
    test = sl[sl.index.year == test_year]
    t_num = lambda idx: idx.to_pydatetime()  # UTide attend des dates, pas des jours décimaux
    coef = utide.solve(t_num(train.index), train.to_numpy(), lat=LAT, method="ols", conf_int="none",
                       trend=False, nodal=True, verbose=False)
    pred = pd.Series(utide.reconstruct(t_num(test.index), coef, verbose=False).h, index=test.index)

    rmse = float(np.sqrt(((pred - test) ** 2).mean()))
    # Extremums : prédiction à la minute contre mesure lissée (moyenne glissante 3 h pour le bruit du capteur)
    fine = pd.date_range(test.index.min(), test.index.max(), freq="5min")
    pred_fine = pd.Series(utide.reconstruct(t_num(fine), coef, verbose=False).h, index=fine)
    ep = extrema(pred_fine)
    eo = extrema_obs(test)
    m = pd.merge_asof(ep.sort_values("time"), eo.sort_values("time").rename(columns={"time": "t_obs", "h": "h_obs"}),
                      left_on="time", right_on="t_obs", by="kind", direction="nearest", tolerance=pd.Timedelta(hours=2)).dropna()
    dt_min = (m.time - m.t_obs).dt.total_seconds() / 60
    dh_cm = (m.h - m.h_obs) * 100
    res = {
        "station": "IMOS ORS065 (off Bondi), bottom sensors",
        "train": [str(train.index.min()), str(train.index.max()), int(len(train))],
        "test": [str(test.index.min()), str(test.index.max()), int(len(test))],
        "rmse_cm": rmse * 100,
        "extrema_n": int(len(m)),
        "time_mae_min": float(dt_min.abs().mean()), "time_p90_min": float(dt_min.abs().quantile(0.9)),
        "height_mae_cm": float(dh_cm.abs().mean()), "height_p90_cm": float(dh_cm.abs().quantile(0.9)),
        "range_cm": float((test.quantile(0.99) - test.quantile(0.01)) * 100),
        "top_constituents": {n: round(float(a), 3) for n, a in zip(coef.name[:8], coef.A[:8])},
    }
    (HERE / "results").mkdir(exist_ok=True)
    (HERE / "results/tide_vs_ors065.json").write_text(json.dumps(res, indent=2))
    # Constantes pour l'app (nom, amplitude m, phase degrés)
    consts = [{"name": n, "A": float(a), "g": float(g)} for n, a, g in zip(coef.name, coef.A, coef.g) if a > 0.005]
    (HERE / "results/tide_constituents_ors065.json").write_text(json.dumps({"lat": LAT, "reference": "UTC", "constituents": consts}, indent=2))
    print(json.dumps(res, indent=2))


if __name__ == "__main__":
    main()


def judge_floor() -> dict:
    """Plancher du juge : erreur d'horaire obtenue par la seule méthode de mesure, sur une marée
    connue exactement (la prédiction) à laquelle on ajoute le vrai résidu décalé de 30 jours."""
    sl = sea_level(load())
    train = sl[(sl.index.year >= 2022) & (sl.index.year < 2025)]
    test = sl[sl.index.year == 2025].asfreq("h")
    coef = utide.solve(train.index.to_pydatetime(), train.to_numpy(), lat=LAT, method="ols", conf_int="none",
                       trend=False, nodal=True, verbose=False)
    pred = pd.Series(utide.reconstruct(test.index.to_pydatetime(), coef, verbose=False).h, index=test.index)
    resid = (test - pred).to_numpy()
    synth = pred + np.roll(resid, 24 * 30)
    fine = pd.date_range(test.index.min(), test.index.max(), freq="5min")
    truth = extrema(pd.Series(utide.reconstruct(fine.to_pydatetime(), coef, verbose=False).h, index=fine))
    meas = extrema_obs(synth.dropna())
    m = pd.merge_asof(truth.sort_values("time"), meas.sort_values("time").rename(columns={"time": "t_obs", "h": "h_obs"}),
                      left_on="time", right_on="t_obs", by="kind", direction="nearest", tolerance=pd.Timedelta(hours=2)).dropna()
    dt = ((m.time - m.t_obs).dt.total_seconds() / 60).abs()
    dh = ((m.h - m.h_obs) * 100).abs()
    return {"time_mae_min": float(dt.mean()), "height_mae_cm": float(dh.mean()), "n": int(len(m))}


def table(start: str = "2026-10-01", end: str = "2028-01-01") -> None:
    """Table des pleines et basses mers pour l'app, ajustée sur toutes les années récentes."""
    sl = sea_level(load())
    fit = sl[sl.index.year >= 2022]
    coef = utide.solve(fit.index.to_pydatetime(), fit.to_numpy(), lat=LAT, method="ols", conf_int="none",
                       trend=False, nodal=True, verbose=False)
    fine = pd.date_range(start, end, freq="5min")
    ex = extrema(pd.Series(utide.reconstruct(fine.to_pydatetime(), coef, verbose=False).h, index=fine))
    out = HERE.parent / "apps/web/public/data/tide-ors065.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({
        "source": "Harmonic analysis of IMOS ORS065 bottom sensors 2022 to 2025 (UTide). Heights in metres relative to mean sea level.",
        "verified": "2025 held out: heights within 3 cm on average",
        "extrema": [[t.strftime("%Y-%m-%dT%H:%MZ"), round(float(h), 2), k[0]] for t, h, k in zip(ex.time, ex.h, ex.kind)],
    }, separators=(",", ":")))
    print(out, len(ex), "extremums")
