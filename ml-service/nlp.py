"""
NLP module for social-media / citizen reports (Objective 4).

Pipeline
  1. clean_text()         - lower-case, strip URLs / @mentions / emoji, keep hashtag words
  2. TF-IDF + Logistic Regression classifier  -> distress | hazard_report | irrelevant
  3. Keyword lexicon      -> incident categories (trapped, medical, food_water, ...) + urgency cues
  4. urgency score        -> blend of classifier probability and lexicon cues (0..1)
  5. DBSCAN (haversine)   -> geographic clusters of distress posts = emerging hotspots

Training data: the labelled corpus below is generated from phrase templates plus a few Hinglish
phrases. Because templated data makes random train/test splits look unrealistically perfect, the
model is evaluated on a separate HAND-WRITTEN held-out set (`HELD_OUT`) whose wording does not
appear in the templates. Replace `build_corpus()` with a real annotated dataset (e.g. CrisisNLP /
CrisisLexT26) for production use.
"""
from __future__ import annotations

import json
import math
import random
import re
from collections import Counter
from pathlib import Path

import joblib
import numpy as np
from sklearn.cluster import DBSCAN
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, precision_recall_fscore_support
from sklearn.pipeline import make_pipeline

MODEL_DIR = Path(__file__).parent / "models"
NLP_MODEL_PATH = MODEL_DIR / "nlp_model.joblib"
NLP_METRICS_PATH = MODEL_DIR / "nlp_metrics.json"

LABELS = ["distress", "hazard_report", "irrelevant"]

# --------------------------------------------------------------------------------------
# Training corpus (template-generated)
# --------------------------------------------------------------------------------------
PLACES = [
    "Kankarbagh", "Boring Road", "Gandhi Maidan", "Bhagalpur road", "Station chowk", "Ram Nagar colony",
    "Old Market", "Ganga ghat", "Civil Lines", "Sector 9", "Model Town", "Paltan Bazaar", "Ulubari",
    "Chandmari", "Tinsukia road", "Railway colony", "Bypass road", "Sadar bazaar", "Nehru Nagar", "Dam side",
]

DISTRESS_T = [
    "help! water entered our house in {p}, kids are stuck on the first floor",
    "we are trapped on the roof at {p}, water is rising fast, please send a boat",
    "need urgent rescue at {p}, elderly mother cannot move, flood water everywhere",
    "please send ambulance to {p}, someone is injured and the road is submerged",
    "no food or drinking water for two days, stranded at {p}, please help",
    "SOS {p} family stuck in flood, need rescue immediately",
    "bachao! paani ghar mein aa gaya {p}, madad chahiye jaldi",
    "pregnant woman needs hospital, we are cut off by flood at {p}, please help",
    "building collapsed near {p}, people under debris, need help urgently",
    "landslide blocked our village near {p}, injured people need medical help",
    "our neighbourhood {p} is under water, children crying, need boats and food",
    "urgent: old man with heart problem stuck at {p}, water up to the chest, send help",
    "we have been waiting for rescue since morning at {p}, nobody has come, please hurry",
    "flood in {p}, we are stranded with no electricity or food, need help now",
    "koi hamari madad karo {p} mein paani bhar gaya hai, bachche fase hain",
]

HAZARD_T = [
    "river level is rising near the {p} bridge",
    "heavy rain since morning in {p}, roads are waterlogged",
    "waterlogging on the main road at {p}, traffic diverted",
    "power cut in {p} after the storm last night",
    "NDRF team deployed at {p} for flood preparedness",
    "a tree fell on the road near {p}, one lane blocked",
    "mild tremors felt in {p} around 6 am",
    "dam gates opened, water level increasing downstream of {p}",
    "drain overflow near {p}, avoid the area if possible",
    "schools closed in {p} due to heavy rainfall alert",
    "the underpass at {p} is flooded, vehicles are not passing",
    "local authorities announced a flood warning for {p}",
    "baadh ka paani {p} ki taraf badh raha hai",
]

IRRELEVANT_T = [
    "great cricket match today, loved that last over",
    "new phone launch tomorrow, cannot wait to see the camera",
    "lunch at {p} was amazing, best paneer tikka in town",
    "traffic is completely normal at {p} this evening",
    "lovely sunny weather, going for a walk near {p}",
    "everyone at {p} is safe and back home now, thank you all for the support",
    "anyone have a good movie recommendation for tonight?",
    "exam results are out and I passed, so happy",
    "new cafe opened at {p}, coffee is really good",
    "wedding season is here, so many invitations this month",
    "watching the match with friends at {p}",
    "our office team outing to {p} was so much fun",
    "diwali sale going on, big discounts on shoes",
    "just finished a great workout, feeling strong",
]

PREFIX = ["", "", "", "#flood ", "URGENT ", "update: ", "pls ", "breaking: "]
SUFFIX = ["", "", "", " #help", " !!", " http://t.co/abc123", " @NDRFHQ", " pls rt"]


def build_corpus(n_per_class: int = 420, seed: int = 11):
    rng = random.Random(seed)
    texts, labels = [], []
    for label, templates in (("distress", DISTRESS_T), ("hazard_report", HAZARD_T), ("irrelevant", IRRELEVANT_T)):
        for _ in range(n_per_class):
            t = rng.choice(templates).format(p=rng.choice(PLACES))
            if label != "irrelevant" and rng.random() < 0.5:
                t = rng.choice(PREFIX) + t
            t += rng.choice(SUFFIX)
            texts.append(t)
            labels.append(label)
    return texts, labels


# Hand-written, held-out evaluation posts (deliberately different wording from the templates).
HELD_OUT = [
    ("Water has reached the second floor and my grandfather is on oxygen, someone please come", "distress"),
    ("Stuck on a terrace with 6 people since last night, boat needed ASAP", "distress"),
    ("Our village is cut off, a woman is in labour and we cannot reach any hospital", "distress"),
    ("No one has reached us yet. Two children have fever and we have no medicines", "distress"),
    ("Rescue needed!! car swept away, we are holding on to a tree", "distress"),
    ("Please help, the wall fell and my brother is bleeding, road is under water", "distress"),
    ("madad karo, hum chhat par fase hain aur paani badh raha hai", "distress"),
    ("Entire lane submerged, families requesting food packets and boats immediately", "distress"),
    ("Injured people lying near the collapsed shed, ambulance cannot enter, help", "distress"),
    ("We ran out of drinking water and the baby is sick, please send relief", "distress"),
    ("The river gauge crossed the danger mark this morning", "hazard_report"),
    ("Heavy downpour continues, several streets are knee deep in water", "hazard_report"),
    ("Bridge on the highway closed for traffic because of high water", "hazard_report"),
    ("Municipality pumping out water from the low-lying colony", "hazard_report"),
    ("IMD has issued an orange alert for the district tomorrow", "hazard_report"),
    ("Electric poles down on the market road after strong winds", "hazard_report"),
    ("Small landslide on the hill road, work is on to clear it", "hazard_report"),
    ("Trains delayed as tracks are waterlogged near the junction", "hazard_report"),
    ("Canal is overflowing near the farms, keep cattle away", "hazard_report"),
    ("Felt a short earthquake tremor while at work today", "hazard_report"),
    ("Just had the best biryani of my life", "irrelevant"),
    ("Can't decide which laptop to buy for college", "irrelevant"),
    ("Happy birthday bro, party tonight at my place", "irrelevant"),
    ("India won by five wickets, what a chase", "irrelevant"),
    ("Morning yoga session was so relaxing", "irrelevant"),
    ("Traffic on the expressway is smooth today", "irrelevant"),
    ("Water levels are back to normal and our street is safe again, thanks everyone", "irrelevant"),
    ("Movie was okay but the songs were great", "irrelevant"),
    ("Anyone selling a second hand bicycle?", "irrelevant"),
    ("Power back and everything is fine at home now", "irrelevant"),
]

# --------------------------------------------------------------------------------------
# Cleaning + lexicons
# --------------------------------------------------------------------------------------
_URL = re.compile(r"https?://\S+|www\.\S+")
_MENTION = re.compile(r"@\w+")
_NON_TEXT = re.compile(r"[^a-z0-9\s]")
_SPACES = re.compile(r"\s+")


def clean_text(text: str) -> str:
    t = (text or "").lower()
    t = _URL.sub(" ", t)
    t = _MENTION.sub(" ", t)
    t = t.replace("#", " ")
    t = _NON_TEXT.sub(" ", t)
    return _SPACES.sub(" ", t).strip()


CATEGORY_LEXICON = {
    "trapped": ["trapped", "stuck", "stranded", "roof", "terrace", "rescue", "boat", "bachao", "fase", "fasa", "cut off", "swept"],
    "medical": ["injured", "ambulance", "patient", "pregnant", "labour", "bleeding", "medicine", "medicines", "doctor", "hospital", "heart", "oxygen", "fever", "sick"],
    "food_water": ["food", "drinking water", "hungry", "ration", "khana", "packets", "relief"],
    "flooding": ["flood", "water", "submerged", "waterlogged", "waterlogging", "paani", "baadh", "rising", "overflow", "overflowing", "downpour"],
    "structural": ["collapsed", "collapse", "debris", "wall fell", "building", "landslide"],
    "infrastructure": ["road", "bridge", "power cut", "electricity", "poles", "tracks", "underpass", "blocked"],
    "quake": ["earthquake", "tremor", "tremors", "quake"],
}

URGENT_CUES = {
    "help": 0.30, "please": 0.10, "urgent": 0.30, "urgently": 0.30, "sos": 0.40, "immediately": 0.25, "asap": 0.25,
    "trapped": 0.35, "stuck": 0.25, "stranded": 0.25, "bachao": 0.40, "madad": 0.30, "rescue": 0.30,
    "injured": 0.35, "bleeding": 0.40, "pregnant": 0.30, "labour": 0.30, "oxygen": 0.30, "children": 0.15, "kids": 0.15,
    "baby": 0.20, "elderly": 0.20, "old man": 0.20, "no food": 0.25, "boat": 0.20, "roof": 0.20, "terrace": 0.20,
    "collapsed": 0.30, "debris": 0.30, "swept": 0.30,
}
CALM_CUES = ["safe", "thank", "thanks", "back to normal", "fine", "relief now", "everything is fine"]


def categories_for(cleaned: str) -> list[str]:
    found = []
    for cat, words in CATEGORY_LEXICON.items():
        if any((" " + w + " ") in (" " + cleaned + " ") for w in words):
            found.append(cat)
    return found


def lexicon_urgency(cleaned: str) -> float:
    padded = " " + cleaned + " "
    score = sum(w for cue, w in URGENT_CUES.items() if (" " + cue + " ") in padded)
    if any((" " + c + " ") in padded for c in CALM_CUES):
        score *= 0.3
    return float(min(1.0, score))


def sentiment_for(cleaned: str, urgency: float) -> float:
    """Crude crisis-sentiment in [-1, 1]: negative == distress, positive == reassurance."""
    padded = " " + cleaned + " "
    positive = sum(1 for c in CALM_CUES if (" " + c + " ") in padded)
    return round(float(max(-1.0, min(1.0, 0.4 * positive - urgency))), 3)


# --------------------------------------------------------------------------------------
# Model
# --------------------------------------------------------------------------------------
def _build_pipeline():
    return make_pipeline(
        TfidfVectorizer(preprocessor=clean_text, ngram_range=(1, 2), min_df=2, sublinear_tf=True),
        LogisticRegression(max_iter=3000, C=4.0, class_weight="balanced"),
    )


def train() -> dict:
    MODEL_DIR.mkdir(exist_ok=True)
    texts, labels = build_corpus()
    model = _build_pipeline().fit(texts, labels)

    ho_texts = [t for t, _ in HELD_OUT]
    ho_true = [l for _, l in HELD_OUT]
    ho_pred = model.predict(ho_texts)
    p, r, f, _ = precision_recall_fscore_support(ho_true, ho_pred, labels=LABELS, average="macro", zero_division=0)
    per_class = precision_recall_fscore_support(ho_true, ho_pred, labels=LABELS, zero_division=0)
    metrics = {
        "training_examples": len(texts),
        "held_out_examples": len(HELD_OUT),
        "held_out_accuracy": round(float(accuracy_score(ho_true, ho_pred)), 4),
        "held_out_precision_macro": round(float(p), 4),
        "held_out_recall_macro": round(float(r), 4),
        "held_out_f1_macro": round(float(f), 4),
        "per_class": {
            lab: {"precision": round(float(per_class[0][i]), 3), "recall": round(float(per_class[1][i]), 3)}
            for i, lab in enumerate(LABELS)
        },
        "note": "Evaluated on hand-written posts whose wording is not in the training templates.",
    }
    joblib.dump(model, NLP_MODEL_PATH)
    NLP_METRICS_PATH.write_text(json.dumps(metrics, indent=2))
    return metrics


_model = None


def _load():
    global _model
    if _model is None:
        if not NLP_MODEL_PATH.exists():
            train()
        _model = joblib.load(NLP_MODEL_PATH)
    return _model


def get_metrics() -> dict:
    if not NLP_METRICS_PATH.exists():
        train()
    return json.loads(NLP_METRICS_PATH.read_text())


def analyze(posts: list[dict]) -> list[dict]:
    """posts: [{id, text, lat?, lng?}] -> same dicts enriched with label / urgency / categories."""
    if not posts:
        return []
    model = _load()
    texts = [p.get("text", "") for p in posts]
    proba = model.predict_proba(texts)
    classes = list(model.classes_)
    out = []
    for post, row in zip(posts, proba):
        cleaned = clean_text(post.get("text", ""))
        label = classes[int(np.argmax(row))]
        p_distress = float(row[classes.index("distress")])
        lex = lexicon_urgency(cleaned)
        urgency = round(0.55 * p_distress + 0.45 * lex, 3) if label != "irrelevant" else round(0.2 * lex, 3)
        out.append(
            {
                **post,
                "label": label,
                "confidence": round(float(np.max(row)), 3),
                "p_distress": round(p_distress, 3),
                "urgency": urgency,
                "sentiment": sentiment_for(cleaned, urgency),
                "categories": categories_for(cleaned) if label != "irrelevant" else [],
                "clean_text": cleaned,
            }
        )
    return out


def _haversine_km(lat1, lng1, lat2, lng2) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = p2 - p1
    dl = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def cluster(analyzed: list[dict], eps_km: float = 6.0, min_samples: int = 2, min_urgency: float = 0.35) -> dict:
    """Cluster geo-tagged distress posts into hotspots using DBSCAN with the haversine metric."""
    pts = [
        p for p in analyzed
        if p.get("label") == "distress" and p.get("urgency", 0) >= min_urgency
        and p.get("lat") is not None and p.get("lng") is not None
    ]
    if len(pts) < min_samples:
        return {"clusters": [], "noise": [p.get("id") for p in pts], "considered": len(pts)}

    coords = np.radians(np.array([[p["lat"], p["lng"]] for p in pts]))
    labels = DBSCAN(eps=eps_km / 6371.0, min_samples=min_samples, metric="haversine").fit_predict(coords)

    clusters, noise = [], []
    for cid in sorted(set(labels)):
        members = [p for p, l in zip(pts, labels) if l == cid]
        if cid == -1:
            noise = [m.get("id") for m in members]
            continue
        lat = float(np.mean([m["lat"] for m in members]))
        lng = float(np.mean([m["lng"] for m in members]))
        radius = max(_haversine_km(lat, lng, m["lat"], m["lng"]) for m in members)
        mean_urg = float(np.mean([m["urgency"] for m in members]))
        cats = Counter(c for m in members for c in m.get("categories", []))
        clusters.append(
            {
                "id": f"H{cid + 1}",
                "lat": round(lat, 5),
                "lng": round(lng, 5),
                "radius_km": round(max(radius, 0.5), 2),
                "count": len(members),
                "mean_urgency": round(mean_urg, 3),
                "hotspot_score": round(min(1.0, mean_urg * min(1.0, 0.35 + len(members) / 8.0)), 3),
                "top_categories": [c for c, _ in cats.most_common(3)],
                "post_ids": [m.get("id") for m in members],
                "sample": members[0].get("text", "")[:140],
            }
        )
    clusters.sort(key=lambda c: -c["hotspot_score"])
    return {"clusters": clusters, "noise": noise, "considered": len(pts)}


def process(posts: list[dict], eps_km: float = 6.0, min_samples: int = 2) -> dict:
    analyzed = analyze(posts)
    return {"posts": analyzed, **cluster(analyzed, eps_km=eps_km, min_samples=min_samples)}


if __name__ == "__main__":
    # Import under the real module name so the pickled pipeline references `nlp.clean_text`,
    # not `__main__.clean_text` (which would fail to load inside the Flask app).
    import nlp as _nlp

    print(json.dumps(_nlp.train(), indent=2))
