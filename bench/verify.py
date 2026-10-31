"""Banc de vérification : le modèle brut contre ses corrections locales.

Juge : des observations indépendantes, sur une période jamais vue à l'entraînement.
- Météo : GFS 0,25° contre les observations horaires de l'aéroport de Sydney (YSSY, NOAA ISD).
- Houle : GFS-Wave 0,25° contre la bouée Waverider de Sydney (MHL, via AODN).

Méthodes comparées, par échéance :
- raw    : interpolation bilinéaire du modèle au site ;
- bias   : raw moins le biais moyen appris (par échéance et par heure de validité) ;
- mos    : régression ridge sur les 4 points de grille, la saison et le vent du modèle ;
- decay  : correction de biais à moyenne décroissante, mise à jour en continu
           (méthode opérationnelle de la NOAA), seulement avec les observations
           disponibles au moment de la prévision.
Intervalles de confiance à 95 % par bootstrap par blocs de jours.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import RidgeCV

HERE = Path(__file__).resolve().parent
DATA, RESULTS = HERE / "data", HERE / "results"
RNG = np.random.default_rng(42)


# ---------- observations ----------

def isd_obs(paths: list[Path]) -> pd.DataFrame:
    df = pd.concat(pd.read_csv(p, usecols=["DATE", "REPORT_TYPE", "TMP", "WND"], dtype=str) for p in paths)
    df["time"] = pd.to_datetime(df.DATE)
    t = df.TMP.str.split(",", expand=True)
    df["t2m"] = pd.to_numeric(t[0], errors="coerce").where(lambda v: v.abs() < 900) / 10
    df.loc[~t[1].isin(["0", "1", "4", "5", "9", "A", "C"]), "t2m"] = np.nan
    w = df.WND.str.split(",", expand=True)
    spd = pd.to_numeric(w[3], errors="coerce")
    df["ws10"] = (spd.where(spd < 9000) / 10).where(w[4].isin(["0", "1", "4", "5", "9"]))
    # METAR (FM-15) en priorité, puis SYNOP (FM-12), seulement à l'heure pile
    df = df[df.time.dt.minute == 0]
    df["prio"] = df.REPORT_TYPE.str.strip().map({"FM-15": 0, "FM-12": 1}).fillna(2)
    df = df.sort_values(["time", "prio"]).drop_duplicates("time")
    return df.set_index("time")[["t2m", "ws10"]]


def buoy_obs(path: Path) -> pd.DataFrame:
    d = pd.read_parquet(path)
    d["time"] = pd.to_datetime(d.TIME)
    hs = d.WSSH.where(d.WSSH.notna(), d.WHTH)
    d = pd.DataFrame({"time": d.time, "hs": hs, "tp": d.WPPE}).dropna(subset=["hs"])
    d = d[(d.hs > 0) & (d.hs < 15)]
    # moyenne horaire centrée sur l'heure pile
    d["hour"] = d.time.dt.round("h")
    return d.groupby("hour")[["hs", "tp"]].mean()


# ---------- modèle au site ----------

def bilinear_weights(lats, lons, lat, lon) -> np.ndarray:
    lats, lons = np.asarray(lats), np.asarray(lons)
    fy = (lats.max() - lat) / (lats.max() - lats.min())
    fx = (lon - lons.min()) / (lons.max() - lons.min())
    # ordre des points : (nord-ouest, nord-est, sud-ouest, sud-est)
    return np.array([(1 - fy) * (1 - fx), (1 - fy) * fx, fy * (1 - fx), fy * fx])


def at_site(df: pd.DataFrame, var: str, lat: float, lon: float) -> pd.Series:
    w = bilinear_weights(df.box_lats.iloc[0], df.box_lons.iloc[0], lat, lon)
    vals = df[[f"{var}_{k}" for k in range(4)]].to_numpy()
    ww = np.where(np.isnan(vals), 0, w)  # points terre du modèle de vagues : poids nul
    return pd.Series((np.nan_to_num(vals) * ww).sum(1) / ww.sum(1), index=df.index)


# ---------- méthodes ----------

def season(t: pd.Series) -> np.ndarray:
    doy = t.dt.day_of_year.to_numpy()
    return np.c_[np.sin(2 * np.pi * doy / 365.25), np.cos(2 * np.pi * doy / 365.25)]


def decaying_bias(frame: pd.DataFrame, alpha: float = 0.05) -> np.ndarray:
    """Biais par heure de validité, mis à jour quand l'observation devient disponible
    (à l'heure de validité), donc seulement à partir des prévisions déjà vérifiées."""
    out = np.full(len(frame), np.nan)
    bias: dict[int, float] = {}
    pending: list[tuple[pd.Timestamp, int, float]] = []
    order = frame.sort_values("init").index
    for i in order:
        r = frame.loc[i]
        while pending and pending[0][0] <= r.init:
            _, hh, err = pending.pop(0)
            bias[hh] = (1 - alpha) * bias.get(hh, err) + alpha * err
        hh = r.valid.hour
        out[frame.index.get_loc(i)] = r.raw - bias.get(hh, 0.0)
        if not np.isnan(r.obs):
            pending.append((r.valid, hh, r.raw - r.obs))
            pending.sort(key=lambda x: x[0])
    return out


def block_bootstrap_gain(err_ref: np.ndarray, err_new: np.ndarray, days: np.ndarray, n: int = 2000):
    """Gain relatif de MAE (1 - MAE_new / MAE_ref), IC 95 % par rééchantillonnage de jours."""
    uniq = np.unique(days)
    idx = {d: np.flatnonzero(days == d) for d in uniq}
    gains = []
    for _ in range(n):
        pick = np.concatenate([idx[d] for d in RNG.choice(uniq, len(uniq))])
        gains.append(1 - np.abs(err_new[pick]).mean() / np.abs(err_ref[pick]).mean())
    return float(np.percentile(gains, 2.5)), float(np.percentile(gains, 97.5))


def pooled_gbm(frame: pd.DataFrame, feats: list[str], split: str) -> pd.Series:
    """Post-traitement non linéaire, un seul modèle pour toutes les échéances.
    Seules les variables connues à l'émission de la prévision sont utilisées.
    Hyperparamètres fixés a priori ; arrêt précoce sur la fin de la période d'entraînement."""
    from sklearn.ensemble import HistGradientBoostingRegressor

    f = frame.dropna(subset=["raw"])  # les variables manquantes sont gérées par le modèle
    X = np.c_[f[feats].to_numpy(), season(f.valid), np.sin(2 * np.pi * f.valid.dt.hour / 24),
              np.cos(2 * np.pi * f.valid.dt.hour / 24), f.lead_h]
    tr = (f.valid < split).to_numpy()
    m = HistGradientBoostingRegressor(loss="absolute_error", learning_rate=0.05, max_iter=600,
                                      max_leaf_nodes=31, min_samples_leaf=40, l2_regularization=1.0,
                                      early_stopping=True, validation_fraction=0.15, random_state=0)
    # prédire l'écart à la prévision brute, plus stable que la valeur elle-même
    y = (f.obs - f.raw).to_numpy()
    fit = tr & ~np.isnan(y)
    m.fit(X[fit], y[fit])
    return pd.Series(f.raw.to_numpy() + m.predict(X), index=f.index)


def evaluate(frame: pd.DataFrame, feats: list[str], split: str, label: str, ml_feats: list[str] | None = None,
             extra: list[str] | None = None) -> dict:
    frame = frame.dropna(subset=["obs", "raw"] + feats).copy()
    frame["valid_hour"] = frame.valid.dt.hour
    methods = ["raw", "bias", "mos", "decay"] + (extra or [])
    if ml_feats:
        frame["ml"] = pooled_gbm(frame, ml_feats, split)
        methods.append("ml")
    train, test = frame[frame.valid < split].copy(), frame[frame.valid >= split].copy()
    res = {"label": label, "train": [str(train.valid.min()), str(train.valid.max()), len(train)],
           "test": [str(test.valid.min()), str(test.valid.max()), len(test)], "leads": {}}
    frame["decay"] = decaying_bias(frame)
    test["decay"] = frame.loc[test.index, "decay"]
    all_err = {m: [] for m in methods}
    all_days = []
    for lead, tr in train.groupby("lead_h"):
        te = test[test.lead_h == lead].copy()
        if len(te) < 30:
            continue
        b = (tr.raw - tr.obs).groupby(tr.valid_hour).mean()
        te["bias"] = te.raw - te.valid_hour.map(b).fillna(0)
        X = lambda d: np.c_[d[feats].to_numpy(), season(d.valid)]
        m = RidgeCV(alphas=np.logspace(-3, 3, 13)).fit(X(tr), tr.obs)
        te["mos"] = m.predict(X(te))
        row = {}
        for k in all_err:
            e = (te[k] - te.obs).to_numpy()
            all_err[k].append(e)
            row[k] = {"mae": float(np.abs(e).mean()), "bias": float(e.mean())}
        all_days.append(te.valid.dt.floor("D").to_numpy())
        row["n"] = len(te)
        res["leads"][int(lead)] = row
    days = np.concatenate(all_days)
    err = {k: np.concatenate(v) for k, v in all_err.items()}
    res["overall"] = {k: float(np.abs(v).mean()) for k, v in err.items()}
    res["gain_vs_raw"] = {}
    for k in [m for m in all_err if m != "raw"]:
        lo, hi = block_bootstrap_gain(err["raw"], err[k], days)
        res["gain_vs_raw"][k] = {"gain": 1 - res["overall"][k] / res["overall"]["raw"], "ci95": [lo, hi]}
    return res


def weather() -> list[dict]:
    obs = isd_obs([DATA / "raw/yssy_2024.csv", DATA / "raw/yssy_2025.csv"])
    g = pd.read_parquet(DATA / "gfs_atmos_yssy.parquet")
    lat, lon = -33.946, 151.177
    g["valid"] = g.init + pd.to_timedelta(g.lead_h, unit="h")
    g["t_raw"] = at_site(g, "t2m", lat, lon) - 273.15
    for k in range(4):
        g[f"t2m_{k}"] -= 273.15
        g[f"ws_{k}"] = np.hypot(g[f"u10_{k}"], g[f"v10_{k}"])
    g["u_raw"], g["v_raw"] = at_site(g, "u10", lat, lon), at_site(g, "v10", lat, lon)
    g["ws_raw"] = np.hypot(g.u_raw, g.v_raw)
    ifs_path = DATA / "ifs_atmos_yssy.parquet"
    if ifs_path.exists():
        e = pd.read_parquet(ifs_path)
        e["e_t"] = at_site(e, "t2m", lat, lon) - 273.15
        e["e_u"], e["e_v"] = at_site(e, "u10", lat, lon), at_site(e, "v10", lat, lon)
        e["e_ws"] = np.hypot(e.e_u, e.e_v)
        for k in range(4):
            e[f"e_t2m_{k}"] = e[f"t2m_{k}"] - 273.15
            e[f"e_ws_{k}"] = np.hypot(e[f"u10_{k}"], e[f"v10_{k}"])
        keep = ["e_t", "e_u", "e_v", "e_ws"] + [f"e_t2m_{k}" for k in range(4)] + [f"e_ws_{k}" for k in range(4)]
        g = g.merge(e[["init", "lead_h"] + keep], on=["init", "lead_h"], how="left")
    g = g.join(obs, on="valid")
    # Dernières observations connues à l'émission (heure d'initialisation du modèle)
    g = g.join(obs.rename(columns={"t2m": "t_obs_init", "ws10": "ws_obs_init"}), on="init")
    split = "2025-02-01"
    common = ["t_raw", "ws_raw", "u_raw", "v_raw", "t_obs_init", "ws_obs_init"]
    out = []
    multi = "e_t" in g
    ifs_feats = (["e_t", "e_ws", "e_u", "e_v"] + [f"e_t2m_{k}" for k in range(4)] + [f"e_ws_{k}" for k in range(4)]) if multi else []
    t = g.assign(raw=g.t_raw, obs=g.t2m)
    if multi:
        t = t.assign(ifs=g.e_t, blend=(g.t_raw + g.e_t) / 2)
    out.append(evaluate(t, [f"t2m_{k}" for k in range(4)] + ["u_raw", "v_raw"], split, "Température 2 m (°C), YSSY",
                        ml_feats=[f"t2m_{k}" for k in range(4)] + common + ifs_feats,
                        extra=["ifs", "blend"] if multi else None))
    w = g.assign(raw=g.ws_raw, obs=g.ws10)
    if multi:
        w = w.assign(ifs=g.e_ws, blend=(g.ws_raw + g.e_ws) / 2)
    out.append(evaluate(w, [f"ws_{k}" for k in range(4)] + ["u_raw", "v_raw"], split, "Vent 10 m (m/s), YSSY",
                        ml_feats=[f"ws_{k}" for k in range(4)] + [f"t2m_{k}" for k in range(4)] + common + ifs_feats,  # contraste terre-mer : brise de mer
                        extra=["ifs", "blend"] if multi else None))
    return out


def waves() -> list[dict]:
    obs = buoy_obs(DATA / "buoy_sydney.parquet")
    g = pd.read_parquet(DATA / "gfs_wave_sydney.parquet")
    lat, lon = -33.77, 151.41
    g["valid"] = g.init + pd.to_timedelta(g.lead_h, unit="h")
    g["raw"] = at_site(g, "hs", lat, lon)
    g["tp_raw"] = at_site(g, "tp", lat, lon)
    rad = np.deg2rad(at_site(g, "dp", lat, lon))
    g["dp_s"], g["dp_c"] = np.sin(rad), np.cos(rad)
    g = g.join(obs.rename(columns={"hs": "obs", "tp": "tp_obs"}), on="valid")
    for k in range(4):
        g[f"hs_{k}"] = g[f"hs_{k}"].fillna(g.raw)
    return [evaluate(g, [f"hs_{k}" for k in range(4)] + ["tp_raw", "dp_s", "dp_c"], "2025-07-01",
                     "Hauteur significative (m), bouée de Sydney")]


if __name__ == "__main__":
    RESULTS.mkdir(exist_ok=True)
    which = sys.argv[1:] or ["weather", "waves"]
    for name in which:
        res = {"weather": weather, "waves": waves}[name]()
        (RESULTS / f"verify_{name}.json").write_text(json.dumps(res, indent=2, default=str))
        for r in res:
            print(r["label"], "| test", r["test"])
            print("  MAE", {k: round(v, 3) for k, v in r["overall"].items()})
            for k, v in r["gain_vs_raw"].items():
                print(f"  gain {k:5s} {v['gain']*100:5.1f} %  IC95 [{v['ci95'][0]*100:.1f} ; {v['ci95'][1]*100:.1f}]")
