#!/usr/bin/env python3
"""
平和艇AI — ランダムフォレスト学習スクリプト
1着・2着・3着の3モデルを個別学習し、三連単予測精度を向上させる。

使い方:
  python train_model.py          # 学習 + 精度レポート
  python train_model.py --eval   # 精度評価のみ（モデル保存なし）
"""

import os
import sys
import json
import requests
import numpy as np
import pandas as pd
from pathlib import Path
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import cross_val_score, StratifiedKFold
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
import joblib

# ── 設定 ──────────────────────────────────────────────
SUPABASE_URL  = os.environ.get("SUPABASE_URL", "https://talatqiolwndddxnzdwy.supabase.co")
SUPABASE_KEY  = os.environ.get("SUPABASE_KEY", "sb_publishable_fJslxpwUQy0PVJ-cfPuaJQ_1TLgKgqe")
MODEL_PATH    = Path(__file__).parent / "model.pkl"
MODEL2_PATH   = Path(__file__).parent / "model2.pkl"
MODEL3_PATH   = Path(__file__).parent / "model3.pkl"
FEATURES_PATH = Path(__file__).parent / "model_features.json"

SB_HEADERS = {
    "apikey":        SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
}

# wind_speed / wave_height: scrape.py修正済みで今後は取得できるが
# 既存336レースはほぼ0 → データが積み上がったら追加予定
FEATURE_COLS = [
    "national_win_rate",
    "national_top3_rate",
    "local_win_rate",
    "local_top3_rate",
    "motor_rate",
    "motor_top3_rate",
    "boat_rate",
    "avg_st",
    "exhibition_time",
    "win_odds",
    # レース内相対特徴量
    "exh_time_rank",
    "st_rank",
    "odds_rank",
    "local_rate_rank",
    "national_rate_rank",
    "motor_rate_rank",
]


def sb_get_all(table: str, params: dict) -> list:
    rows, offset, limit = [], 0, 1000
    while True:
        p = {**params, "limit": limit, "offset": offset}
        r = requests.get(f"{SUPABASE_URL}/rest/v1/{table}", headers=SB_HEADERS, params=p)
        r.raise_for_status()
        batch = r.json()
        rows.extend(batch)
        if len(batch) < limit:
            break
        offset += limit
    return rows


def load_data() -> pd.DataFrame:
    print("Supabaseからデータ取得中...")
    races = sb_get_all("races", {
        "select": "id,race_date,race_no,result_1st,result_2nd,result_3rd",
        "result_1st": "not.is.null",
    })
    print(f"  結果あり races: {len(races)}件")
    if not races:
        raise ValueError("学習データが0件です。")

    race_map = {r["id"]: r for r in races}
    racers = sb_get_all("racers", {
        "select": "race_id,boat_no,national_win_rate,national_top3_rate,"
                  "local_win_rate,local_top3_rate,motor_rate,motor_top3_rate,"
                  "boat_rate,avg_st,exhibition_time,win_odds,f_count,l_count",
    })
    print(f"  racers: {len(racers)}件")

    rows = []
    for racer in racers:
        race = race_map.get(racer["race_id"])
        if not race:
            continue
        rows.append({
            "race_id":            racer["race_id"],
            "boat_no":            racer["boat_no"],
            "national_win_rate":  racer["national_win_rate"]  or 0.0,
            "national_top3_rate": racer.get("national_top3_rate") or 0.0,
            "local_win_rate":     racer["local_win_rate"]     or 0.0,
            "local_top3_rate":    racer.get("local_top3_rate")    or 0.0,
            "motor_rate":         racer["motor_rate"]         or 0.0,
            "motor_top3_rate":    racer.get("motor_top3_rate")    or 0.0,
            "boat_rate":          racer["boat_rate"]          or 0.0,
            "avg_st":             racer["avg_st"]             or 0.0,
            "exhibition_time":    racer["exhibition_time"]    or 0.0,
            "win_odds":           racer["win_odds"]           or 0.0,
            "f_count":            racer["f_count"]            or 0,
            "l_count":            racer["l_count"]            or 0,
            "result_1st":         race["result_1st"],
            "result_2nd":         race["result_2nd"],
            "result_3rd":         race["result_3rd"],
        })

    df = pd.DataFrame(rows)
    print(f"  結合後: {len(df)}行 / {df['race_id'].nunique()}レース")
    return df


def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    df["penalty"] = ((df["f_count"] > 0) | (df["l_count"] > 0)).astype(float)

    def safe_rank(col, ascending=True, fill=3.5):
        r = df.groupby("race_id")[col].rank(method="min", ascending=ascending)
        r[df[col] == 0] = fill
        return r

    df["exh_time_rank"]      = safe_rank("exhibition_time", ascending=True)
    df["st_rank"]            = safe_rank("avg_st",          ascending=True)
    df["odds_rank"]          = safe_rank("win_odds",        ascending=True)
    df["local_rate_rank"]    = safe_rank("local_win_rate",  ascending=False)
    df["national_rate_rank"] = safe_rank("national_win_rate", ascending=False)
    df["motor_rate_rank"]    = safe_rank("motor_rate",      ascending=False)

    df["is_1st"] = (df["boat_no"] == df["result_1st"]).astype(int)
    df["is_2nd"] = (df["boat_no"] == df["result_2nd"]).astype(int)
    df["is_3rd"] = (df["boat_no"] == df["result_3rd"]).astype(int)

    return df


def build_model():
    return Pipeline([
        ("scaler", StandardScaler()),
        ("rf", RandomForestClassifier(
            n_estimators=400,
            max_depth=9,
            min_samples_leaf=4,
            class_weight="balanced",
            random_state=42,
            n_jobs=-1,
        )),
    ])


def train_one(df: pd.DataFrame, target: str, label: str):
    X = df[FEATURE_COLS].values
    y = df[target].values
    print(f"\n【{label}】 正例: {y.sum()}件 ({y.mean()*100:.1f}%)")

    model = build_model()
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    scores = cross_val_score(model, X, y, cv=cv, scoring="roc_auc")
    print(f"  ROC-AUC: {scores.mean():.4f} ± {scores.std():.4f}")

    model.fit(X, y)
    return model


def print_importances(model, label: str):
    rf = model.named_steps["rf"]
    print(f"\n特徴量重要度（{label}）:")
    for name, imp in sorted(zip(FEATURE_COLS, rf.feature_importances_), key=lambda x: -x[1]):
        bar = "█" * int(imp * 40)
        print(f"  {name:<22} {imp:.4f}  {bar}")


def train(df: pd.DataFrame, save: bool = True):
    df = engineer_features(df)

    model1 = train_one(df, "is_1st", "1着モデル")
    model2 = train_one(df, "is_2nd", "2着モデル")
    model3 = train_one(df, "is_3rd", "3着モデル")

    if save:
        joblib.dump(model1, MODEL_PATH)
        joblib.dump(model2, MODEL2_PATH)
        joblib.dump(model3, MODEL3_PATH)
        with open(FEATURES_PATH, "w") as f:
            json.dump(FEATURE_COLS, f)
        print(f"\nモデル保存完了: model.pkl / model2.pkl / model3.pkl")
        print_importances(model1, "1着")
        print_importances(model2, "2着")
        print_importances(model3, "3着")

    return model1, model2, model3


def main():
    eval_only = "--eval" in sys.argv
    df = load_data()
    train(df, save=not eval_only)
    if eval_only:
        print("\n（--eval モード: モデルは保存されませんでした）")


if __name__ == "__main__":
    main()
