"""
Historical flood-event dataset builder.

The synopsis calls for training on open government datasets (data.gov.in / IMD rainfall and
flood-damage records). Those files are published in many different layouts, so this module does
two things:

1. `load_historical()` reads `data/historical_floods.csv` if it exists. To use REAL data, prepare a
   CSV with the columns listed in `FEATURES` plus a `severity` column (0-3) and drop it in place.
2. If no CSV is present, `generate_dataset()` builds a physically-motivated synthetic dataset for a
   representative flood-prone region set (Bihar / Assam / UP plains) so the prototype trains and
   runs end-to-end out of the box.

Columns
-------
rain_24h_mm       rainfall in the last 24 h
rain_72h_mm       cumulative rainfall in the last 72 h
river_ratio       river gauge level / official danger level (1.0 == danger mark)
soil_saturation   0..1 estimate of how saturated the ground already is
humidity_pct      relative humidity
wind_kmh          surface wind speed
elevation_m       mean elevation of the district
severity          0 = Low, 1 = Moderate, 2 = High, 3 = Severe
"""
from __future__ import annotations

import os
from pathlib import Path

import numpy as np
import pandas as pd

FEATURES = [
    "rain_24h_mm",
    "rain_72h_mm",
    "river_ratio",
    "soil_saturation",
    "humidity_pct",
    "wind_kmh",
    "elevation_m",
]
TARGET = "severity"
SEVERITY_LABELS = ["Low", "Moderate", "High", "Severe"]

DATA_DIR = Path(__file__).parent / "data"
CSV_PATH = DATA_DIR / "historical_floods.csv"


def generate_dataset(n: int = 6000, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)

    # Monsoon-skewed rainfall: many dry/light days, a heavy tail of extreme events.
    rain_24h = rng.gamma(shape=1.15, scale=22.0, size=n)
    rain_24h = np.clip(rain_24h, 0, 320)
    antecedent = rng.gamma(shape=1.4, scale=30.0, size=n)  # previous two days
    rain_72h = rain_24h + antecedent

    elevation = rng.choice([32, 45, 52, 58, 61, 74, 118, 150, 220], size=n) + rng.normal(0, 6, n)
    elevation = np.clip(elevation, 5, 300)

    soil = np.clip(0.18 + rain_72h / 260.0 + rng.normal(0, 0.09, n), 0, 1)
    river = np.clip(
        0.30 + 0.0042 * rain_72h + 0.0016 * rain_24h - 0.0006 * (elevation - 60) + rng.normal(0, 0.09, n),
        0.08,
        1.7,
    )
    humidity = np.clip(52 + 0.16 * rain_24h + rng.normal(0, 8, n), 30, 100)
    wind = np.clip(rng.gamma(2.0, 7.0, n) + 0.05 * rain_24h, 0, 130)

    # Latent hazard score. The classes are cut from this with fixed thresholds.
    latent = (
        0.011 * rain_24h
        + 0.0045 * rain_72h
        + 2.6 * np.maximum(river - 0.55, 0)
        + 0.9 * soil
        + 0.0035 * wind
        - 0.0032 * elevation
        + rng.normal(0, 0.16, n)
    )
    severity = np.digitize(latent, [1.05, 1.75, 2.55])

    df = pd.DataFrame(
        {
            "rain_24h_mm": rain_24h.round(1),
            "rain_72h_mm": rain_72h.round(1),
            "river_ratio": river.round(3),
            "soil_saturation": soil.round(3),
            "humidity_pct": humidity.round(1),
            "wind_kmh": wind.round(1),
            "elevation_m": elevation.round(1),
            "severity": severity.astype(int),
        }
    )
    return df


def load_historical() -> pd.DataFrame:
    """Load the historical dataset, generating (and saving) the synthetic one if missing."""
    DATA_DIR.mkdir(exist_ok=True)
    if CSV_PATH.exists():
        df = pd.read_csv(CSV_PATH)
        missing = [c for c in FEATURES + [TARGET] if c not in df.columns]
        if missing:
            raise ValueError(f"{CSV_PATH} is missing columns: {missing}")
        return df
    df = generate_dataset()
    df.to_csv(CSV_PATH, index=False)
    return df


if __name__ == "__main__":
    d = load_historical()
    print(d.shape)
    print(d["severity"].value_counts(normalize=True).sort_index().round(3))
