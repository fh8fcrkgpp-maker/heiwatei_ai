#!/usr/bin/env python3
"""
平和艇AI — ランダムフォレスト学習スクリプト

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
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://talatqiolwndddxnzdwy.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "sb_publishable_fJslxpwUQy0PVJ-cfPuaJQ_1TLgKgqe")
MODEL_PATH   = Path(__file__).parent / "model.pkl"
FEATURES_PATH = Path(__file__).parent / "model_features.json"

SB_HEADERS = {
    "apikey":        SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
}

FEATURE_COLS = [
    "boat_no",
    "national_win_rate",
    "local_win_rate",
    "motor_rate",
    "boat_rate",
    "avg_st",
    "exhibition_time",
    "win_odds",
    # レース内相対特徴量（下で計算）
    "exh_time_rank",      # 展示タイム順位（1=最速）
    "st_rank",            # ST順位（1=最も早い）
    "odds_rank",          # オッズ順位（1=最人気）
    "local_rate_rank",    # 当地勝率順位
    # 天候
    "wind_speed",
    "wave_height",
]


def sb_get_all(table: str, params: dict) -> list:
    """Supabaseから全件取得（1000件上限をページングで回避）"""
    rows = []
    offset = 0
    limit = 1000
    while True:
        p = {**params, "limit": limit, "offset": offset}
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/{table}",
            headers=SB_HEADERS,
            params=p,
        )
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
        "select": "id,race_date,race_no,wind_speed,wave_height,result_1st",
        "result_1st": "not.is.null",
    })
    print(f"  結果あり races: {len(races)}件")
    if not races:
        raise ValueError("学習データが0件です。結果付きのレースがありません。")

    race_ids = [r["id"] for r in races]
    race_map  = {r["id"]: r for r in races}

    # racers を race_id ごとに取得
    racers = sb_get_all("racers", {
        "select": "race_id,boat_no,national_win_rate,local_win_rate,motor_rate,"
                  "boat_rate,avg_st,exhibition_time,win_odds,f_count,l_count",
    })
    print(f"  racers: {len(racers)}件")

    rows = []
    for racer in racers:
        race = race_map.get(racer["race_id"])
        if not race:
            continue
        rows.append({
            "race_id":           racer["race_id"],
            "boat_no":           racer["boat_no"],
            "national_win_rate": racer["national_win_rate"] or 0.0,
            "local_win_rate":    racer["local_win_rate"]    or 0.0,
            "motor_rate":        racer["motor_rate"]        or 0.0,
            "boat_rate":         racer["boat_rate"]         or 0.0,
            "avg_st":            racer["avg_st"]            or 0.0,
            "exhibition_time":   racer["exhibition_time"]   or 0.0,
            "win_odds":          racer["win_odds"]          or 0.0,
            "f_count":           racer["f_count"]           or 0,
            "l_count":           racer["l_count"]           or 0,
            "wind_speed":        race["wind_speed"]         or 0.0,
            "wave_height":       race["wave_height"]        or 0.0,
            "result_1st":        race["result_1st"],
        })

    df = pd.DataFrame(rows)
    print(f"  結合後: {len(df)}行 / {df['race_id'].nunique()}レース")
    return df


def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """レース内相対ランク特徴量を追加"""
    df = df.copy()

    # フライング・遅延ペナルティ
    df["penalty"] = ((df["f_count"] > 0) | (df["l_count"] > 0)).astype(float)

    # 展示タイム順位（小さいほど速い → rank=1が最速）
    df["exh_time_rank"] = df.groupby("race_id")["exhibition_time"].rank(method="min", ascending=True)
    # 展示が0（未取得）のものは中間値にする
    df.loc[df["exhibition_time"] == 0, "exh_time_rank"] = 3.5

    # ST順位（小さいほど早い）
    df["st_rank"] = df.groupby("race_id")["avg_st"].rank(method="min", ascending=True)
    df.loc[df["avg_st"] == 0, "st_rank"] = 3.5

    # オッズ順位（小さいオッズ=人気 → rank=1が最人気）
    df["odds_rank"] = df.groupby("race_id")["win_odds"].rank(method="min", ascending=True)
    df.loc[df["win_odds"] == 0, "odds_rank"] = 3.5

    # 当地勝率順位
    df["local_rate_rank"] = df.groupby("race_id")["local_win_rate"].rank(method="min", ascending=False)

    # ターゲット: このボートが1着か
    df["is_winner"] = (df["boat_no"] == df["result_1st"]).astype(int)

    return df


def build_xy(df: pd.DataFrame):
    X = df[FEATURE_COLS].values
    y = df["is_winner"].values
    return X, y


def train(df: pd.DataFrame, save: bool = True):
    df = engineer_features(df)
    X, y = build_xy(df)

    print(f"\n学習データ: {len(X)}行（1着={y.sum()}件 / {y.mean()*100:.1f}%）")

    model = Pipeline([
        ("scaler", StandardScaler()),
        ("rf", RandomForestClassifier(
            n_estimators=300,
            max_depth=8,
            min_samples_leaf=5,
            class_weight="balanced",
            random_state=42,
            n_jobs=-1,
        )),
    ])

    # 交差検証で精度評価
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    scores = cross_val_score(model, X, y, cv=cv, scoring="roc_auc")
    print(f"\n交差検証 ROC-AUC: {scores.mean():.4f} ± {scores.std():.4f}")
    print(f"  各fold: {[f'{s:.4f}' for s in scores]}")

    if save:
        model.fit(X, y)
        joblib.dump(model, MODEL_PATH)
        with open(FEATURES_PATH, "w") as f:
            json.dump(FEATURE_COLS, f)
        print(f"\nモデル保存: {MODEL_PATH}")

        # 特徴量重要度
        rf = model.named_steps["rf"]
        importances = rf.feature_importances_
        print("\n特徴量重要度:")
        for name, imp in sorted(zip(FEATURE_COLS, importances), key=lambda x: -x[1]):
            bar = "█" * int(imp * 50)
            print(f"  {name:<22} {imp:.4f}  {bar}")

    return model


def main():
    eval_only = "--eval" in sys.argv
    df = load_data()
    train(df, save=not eval_only)
    if eval_only:
        print("\n（--eval モード: モデルは保存されませんでした）")


if __name__ == "__main__":
    main()
