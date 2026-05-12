"""
平和島ボートレース 結果分析
  1. 荒れ条件分析 — 1号艇が負けるレースに共通する要因
  2. AI外れ分析  — 予想と結果が乖離したレースの特徴
"""

import os
import requests
import pandas as pd
from collections import defaultdict

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://talatqiolwndddxnzdwy.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "sb_publishable_fJslxpwUQy0PVJ-cfPuaJQ_1TLgKgqe")
HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
}

def sb_get(table, params=None):
    rows = []
    offset = 0
    limit = 1000
    while True:
        p = dict(params or {})
        p["limit"] = limit
        p["offset"] = offset
        r = requests.get(f"{SUPABASE_URL}/rest/v1/{table}", headers=HEADERS, params=p)
        r.raise_for_status()
        batch = r.json()
        rows.extend(batch)
        if len(batch) < limit:
            break
        offset += limit
    return rows

print("=== データ取得中... ===")

races_raw  = sb_get("races",  {"result_1st": "not.is.null", "select": "*"})
racers_raw = sb_get("racers", {"select": "*"})

races = pd.DataFrame(races_raw)
racers = pd.DataFrame(racers_raw)
print(f"レース数: {len(races)}  選手行数: {len(racers)}")

# ──────────────────────────────────────
# 前処理
# ──────────────────────────────────────
races["wind_speed"]   = pd.to_numeric(races["wind_speed"],   errors="coerce").fillna(0)
races["wave_height"]  = pd.to_numeric(races["wave_height"],  errors="coerce").fillna(0)
races["result_1st"]   = pd.to_numeric(races["result_1st"],   errors="coerce")
races["result_2nd"]   = pd.to_numeric(races["result_2nd"],   errors="coerce")
races["result_3rd"]   = pd.to_numeric(races["result_3rd"],   errors="coerce")

# AI予想（各レースで prediction_score 最大の boat_no）
ai_pred = (
    racers.sort_values("prediction_score", ascending=False)
    .groupby("race_id")
    .first()
    .reset_index()[["race_id", "boat_no", "prediction_score"]]
    .rename(columns={"boat_no": "ai_pred_boat", "prediction_score": "ai_top_score"})
)

# 1位実際の選手データ
winner_data = racers.rename(columns={
    "boat_no": "winner_boat",
    "avg_st": "winner_st",
    "exhibition_time": "winner_exh",
    "national_win_rate": "winner_nrate",
    "win_odds": "winner_odds",
    "prediction_score": "winner_score",
})

df = races.merge(ai_pred, left_on="id", right_on="race_id", how="left")
df = df.merge(
    winner_data[["race_id", "winner_boat", "winner_st", "winner_exh",
                 "winner_nrate", "winner_odds", "winner_score"]],
    left_on=["id", "result_1st"],
    right_on=["race_id", "winner_boat"],
    how="left"
)

df["is_upset"]   = df["result_1st"] != 1          # 1号艇が負けた
df["ai_correct"] = df["ai_pred_boat"] == df["result_1st"]  # AI的中

print(f"\n全{len(df)}レース / 1号艇勝率: {(~df['is_upset']).mean()*100:.1f}%  AI的中率: {df['ai_correct'].mean()*100:.1f}%\n")

# ══════════════════════════════════════
#  1. 荒れ条件分析
# ══════════════════════════════════════
print("=" * 55)
print("【1. 荒れ条件分析 — 1号艇が負けたレースの特徴】")
print("=" * 55)

normal = df[~df["is_upset"]]
upset  = df[df["is_upset"]]

# 風速・波高の比較
print("\n■ 気象条件（平均）")
print(f"{'':15s}  {'1号艇勝ち':>10s}  {'1号艇負け（荒れ）':>16s}")
print(f"{'風速 (m)':15s}  {normal['wind_speed'].mean():>10.2f}  {upset['wind_speed'].mean():>16.2f}")
print(f"{'波高 (cm)':15s}  {normal['wave_height'].mean():>10.2f}  {upset['wave_height'].mean():>16.2f}")
print(f"{'レース数':15s}  {len(normal):>10d}  {len(upset):>16d}")

# 風速帯別 荒れ率
print("\n■ 風速帯別 荒れ率（1号艇敗率）")
bins = [-1, 2, 4, 6, 99]
labels = ["0-2m", "3-4m", "5-6m", "7m以上"]
df["wind_band"] = pd.cut(df["wind_speed"], bins=bins, labels=labels)
wb = df.groupby("wind_band", observed=True)["is_upset"].agg(["mean", "count"])
wb.columns = ["荒れ率", "レース数"]
for band, row in wb.iterrows():
    bar = "█" * int(row["荒れ率"] * 20)
    print(f"  {band:6s}  {row['荒れ率']*100:5.1f}%  {bar}  ({int(row['レース数'])}R)")

# 天候別
print("\n■ 天候別 荒れ率")
wc = df.groupby("weather")["is_upset"].agg(["mean", "count"]).sort_values("mean", ascending=False)
wc.columns = ["荒れ率", "レース数"]
for w, row in wc.iterrows():
    if pd.isna(w): continue
    print(f"  {str(w):4s}  {row['荒れ率']*100:5.1f}%  ({int(row['レース数'])}R)")

# レースNo.別
print("\n■ レースNo.別 荒れ率")
rn = df.groupby("race_no")["is_upset"].agg(["mean", "count"]).sort_values("race_no")
rn.columns = ["荒れ率", "レース数"]
for rno, row in rn.iterrows():
    bar = "█" * int(row["荒れ率"] * 20)
    print(f"  {rno:2d}R  {row['荒れ率']*100:5.1f}%  {bar}  ({int(row['レース数'])}R)")

# 荒れ時の勝者コース分布
print("\n■ 荒れ時の勝者コース（result_1st）")
uw = upset["result_1st"].value_counts().sort_index()
for bn, cnt in uw.items():
    print(f"  {int(bn)}号艇  {cnt}勝  ({cnt/len(upset)*100:.1f}%)")

# ══════════════════════════════════════
#  2. AI外れ分析
# ══════════════════════════════════════
print("\n" + "=" * 55)
print("【2. AI外れ分析 — 予想と結果の乖離パターン】")
print("=" * 55)

hit   = df[df["ai_correct"]]
miss  = df[~df["ai_correct"]]

print(f"\n的中: {len(hit)}R / 外れ: {len(miss)}R")

# 外れ時の気象
print("\n■ 気象条件（平均）")
print(f"{'':15s}  {'的中':>10s}  {'外れ':>10s}")
print(f"{'風速 (m)':15s}  {hit['wind_speed'].mean():>10.2f}  {miss['wind_speed'].mean():>10.2f}")
print(f"{'波高 (cm)':15s}  {hit['wave_height'].mean():>10.2f}  {miss['wave_height'].mean():>10.2f}")

# AI外れ時に実際に勝ったコース
print("\n■ 外れ時 — 実際の勝者コース（AI予想以外が勝ったコース）")
mc = miss["result_1st"].value_counts().sort_index()
for bn, cnt in mc.items():
    print(f"  {int(bn)}号艇  {cnt}回  ({cnt/len(miss)*100:.1f}%)")

# AI予想だったコース（外れ時）
print("\n■ 外れ時 — AIが予想したコース（実際は負けたコース）")
ap = miss["ai_pred_boat"].value_counts().sort_index()
for bn, cnt in ap.items():
    print(f"  {int(bn)}号艇  {cnt}回  ({cnt/len(miss)*100:.1f}%)")

# スコア差（AI1位 vs 実際の1位）
miss2 = miss.copy()
# 実際の1位の prediction_score
actual_winner_scores = racers.copy()
actual_winner_scores = actual_winner_scores.rename(columns={"boat_no": "res_boat", "prediction_score": "actual_1st_score"})
miss2 = miss2.merge(
    actual_winner_scores[["race_id", "res_boat", "actual_1st_score"]],
    left_on=["id", "result_1st"],
    right_on=["race_id", "res_boat"],
    how="left"
)
miss2["score_gap"] = miss2["ai_top_score"] - miss2["actual_1st_score"]

print(f"\n■ AIスコア差（AI1位 - 実際の1位）")
print(f"  平均ギャップ: {miss2['score_gap'].mean():.2f}")
print(f"  中央値:       {miss2['score_gap'].median():.2f}")
print(f"  最大ギャップ: {miss2['score_gap'].max():.2f}（AI圧倒的1位だったのに負けたケース）")

# ギャップ帯別
gbins = [-999, 1, 3, 6, 999]
glabels = ["~1点差", "1-3点差", "3-6点差", "6点以上差"]
miss2["gap_band"] = pd.cut(miss2["score_gap"], bins=gbins, labels=glabels)
gb = miss2.groupby("gap_band", observed=True).size()
print("\n■ スコア差帯別 外れ件数")
for band, cnt in gb.items():
    print(f"  {band:10s}  {cnt}件")

# 展示タイム・ST の比較（外れ時）
print("\n■ 外れ時の実際の勝者データ（平均）")
print(f"  展示タイム: {miss2['winner_exh'].mean():.3f}")
print(f"  平均ST:     {miss2['winner_st'].mean():.3f}")
print(f"  全国勝率:   {miss2['winner_nrate'].mean():.3f}")

print("\n■ 的中時の勝者データ（平均）")
print(f"  展示タイム: {hit['winner_exh'].mean():.3f}")
print(f"  平均ST:     {hit['winner_st'].mean():.3f}")
print(f"  全国勝率:   {hit['winner_nrate'].mean():.3f}")

print("\n" + "=" * 55)
print("分析完了")
print("=" * 55)
