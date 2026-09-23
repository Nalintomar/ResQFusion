"""
ML microservice (Flask). Consumed by the Node.js backend over REST.

  GET  /health
  GET  /metrics            model evaluation reports (risk + NLP)
  POST /predict/risk       {features:{...}}                        -> one prediction
  POST /predict/batch      {items:[{id, features:{...}}]}          -> predictions per id
  POST /nlp/analyze        {posts:[{id,text,lat?,lng?}]}           -> label / urgency / categories
  POST /nlp/process        {posts:[...], eps_km?, min_samples?}    -> analysis + distress hotspots
  POST /train              retrain both models
"""
import os

from flask import Flask, jsonify, request

import nlp
import risk_model

app = Flask(__name__)


def _json():
    return request.get_json(silent=True) or {}


@app.get("/health")
def health():
    return jsonify({"status": "ok", "service": "resqfusion-ml"})


@app.get("/metrics")
def metrics():
    return jsonify({"risk": risk_model.get_metrics(), "nlp": nlp.get_metrics()})


@app.post("/predict/risk")
def predict_risk():
    body = _json()
    feats = body.get("features")
    if not isinstance(feats, dict):
        return jsonify({"error": "features object required"}), 400
    return jsonify(risk_model.predict(feats))


@app.post("/predict/batch")
def predict_batch():
    items = _json().get("items")
    if not isinstance(items, list):
        return jsonify({"error": "items array required"}), 400
    preds = risk_model.predict_many([i.get("features", {}) for i in items])
    return jsonify({"results": [{"id": i.get("id"), **p} for i, p in zip(items, preds)]})


@app.post("/nlp/analyze")
def nlp_analyze():
    posts = _json().get("posts")
    if not isinstance(posts, list):
        return jsonify({"error": "posts array required"}), 400
    return jsonify({"posts": nlp.analyze(posts)})


@app.post("/nlp/process")
def nlp_process():
    body = _json()
    posts = body.get("posts")
    if not isinstance(posts, list):
        return jsonify({"error": "posts array required"}), 400
    result = nlp.process(posts, eps_km=float(body.get("eps_km", 6.0)), min_samples=int(body.get("min_samples", 2)))
    return jsonify(result)


@app.post("/train")
def retrain():
    return jsonify({"risk": risk_model.train(), "nlp": nlp.train()})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5001")))
