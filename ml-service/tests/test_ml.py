import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import nlp
import risk_model
from app import app


def test_risk_orders_by_severity():
    calm = risk_model.predict({"rain_24h_mm": 2, "rain_72h_mm": 8, "river_ratio": 0.3, "soil_saturation": 0.2, "elevation_m": 200})
    wet = risk_model.predict({"rain_24h_mm": 190, "rain_72h_mm": 320, "river_ratio": 1.25, "soil_saturation": 0.95, "elevation_m": 45})
    assert calm["severity"] == 0
    assert wet["severity"] >= 2
    assert wet["risk_score"] > calm["risk_score"]
    assert abs(sum(wet["probabilities"].values()) - 1) < 0.01


def test_missing_features_are_defaulted():
    out = risk_model.predict({"rain_24h_mm": 30})
    assert 0 <= out["risk_score"] <= 1


def test_model_beats_threshold_baseline():
    metrics = risk_model.get_metrics()
    m = metrics["models"]
    assert m[metrics["served_model"]]["f1_macro"] > m["threshold_baseline"]["f1_macro"]


def test_nlp_detects_distress_and_ignores_noise():
    out = nlp.analyze([
        {"id": "a", "text": "Help! trapped on the roof, water rising, send a boat"},
        {"id": "b", "text": "Great cricket match today"},
    ])
    assert out[0]["label"] == "distress" and out[0]["urgency"] > 0.5
    assert out[1]["label"] == "irrelevant"


def test_clustering_groups_nearby_posts():
    posts = [
        {"id": 1, "text": "help trapped on roof flood", "lat": 25.60, "lng": 85.10},
        {"id": 2, "text": "please send boat, stuck in flood water", "lat": 25.61, "lng": 85.11},
        {"id": 3, "text": "urgent rescue needed, family stranded", "lat": 25.62, "lng": 85.10},
        {"id": 4, "text": "help trapped by flood", "lat": 26.9, "lng": 91.0},
    ]
    res = nlp.process(posts)
    assert len(res["clusters"]) == 1
    assert res["clusters"][0]["count"] == 3
    assert 4 in res["noise"]


def test_http_endpoints():
    c = app.test_client()
    assert c.get("/health").json["status"] == "ok"
    r = c.post("/predict/batch", json={"items": [{"id": "x", "features": {"rain_24h_mm": 10}}]})
    assert r.json["results"][0]["id"] == "x"
    assert c.post("/predict/risk", json={}).status_code == 400
    assert "risk" in c.get("/metrics").json
