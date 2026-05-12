#!/usr/bin/env python3
"""
平和島ボートレース データ取得スクリプト
主要データは Boatrace Open API (MIT) 経由で取得し、
boatrace.jp へのアクセスを最小限に抑える。

使い方:
  python scrape.py              # 本日のデータを取得
  python scrape.py 20260506     # 指定日のデータを取得
"""

import os
import sys
import re
import time
import json
import math
import datetime
import unicodedata
import requests
from pathlib import Path
from bs4 import BeautifulSoup

try:
    import joblib
    import numpy as np
    _ML_AVAILABLE = True
except ImportError:
    _ML_AVAILABLE = False

MODEL_PATH    = Path(__file__).parent / "model.pkl"
MODEL2_PATH   = Path(__file__).parent / "model2.pkl"
MODEL3_PATH   = Path(__file__).parent / "model3.pkl"
FEATURES_PATH = Path(__file__).parent / "model_features.json"

_model  = None
_model2 = None
_model3 = None
_feature_cols = None

def _load_model():
    global _model, _model2, _model3, _feature_cols
    if not _ML_AVAILABLE or not MODEL_PATH.exists():
        return False
    if _model is None:
        _model  = joblib.load(MODEL_PATH)
        _model2 = joblib.load(MODEL2_PATH) if MODEL2_PATH.exists() else None
        _model3 = joblib.load(MODEL3_PATH) if MODEL3_PATH.exists() else None
        with open(FEATURES_PATH) as f:
            _feature_cols = json.load(f)
    return True

# ── 設定 ──────────────────────────────────────────────
SUPABASE_URL    = os.environ.get("SUPABASE_URL", "https://talatqiolwndddxnzdwy.supabase.co")
SUPABASE_KEY    = os.environ.get("SUPABASE_KEY", "sb_publishable_fJslxpwUQy0PVJ-cfPuaJQ_1TLgKgqe")
VENUE_CODE      = "04"   # 平和島
STADIUM_NUMBER  = 4      # Boatrace Open API での平和島番号
BASE_URL        = "https://www.boatrace.jp"
API_BASE        = "https://boatraceopenapi.github.io"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    )
}

SB_HEADERS = {
    "apikey":        SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type":  "application/json",
    "Prefer":        "return=representation",
}

# racer_class_number → 級別文字列
CLASS_MAP = {1: "A1", 2: "A2", 3: "B1", 4: "B2"}
# weather_number → 天候文字列
WEATHER_MAP = {1: "晴", 2: "曇", 3: "雨", 4: "雪", 5: "霧"}


# ── AI予想スコア計算 ───────────────────────────────────
# 平和島実績308レース: コース別1着率 ÷ 均等分布16.67%
# 特徴: 1号艇46.6%（全国~55%より低め）、3コース=2コース同等、6コースほぼ戦力外
COURSE_BONUS = {1: 2.73, 2: 0.99, 3: 1.01, 4: 0.67, 5: 0.49, 6: 0.11}

def weather_course_factor(wind_speed: float, wave_height: float) -> dict:
    if wave_height >= 20:
        wave_adj = {1: 0.80, 2: 0.90, 3: 0.95, 4: 1.00, 5: 1.05, 6: 1.10}
    elif wave_height >= 10:
        wave_adj = {1: 0.90, 2: 0.95, 3: 1.00, 4: 1.00, 5: 1.02, 6: 1.05}
    else:
        wave_adj = {i: 1.0 for i in range(1, 7)}

    if wind_speed >= 10:
        wind_adj = {1: 0.88, 2: 0.93, 3: 0.97, 4: 1.00, 5: 1.03, 6: 1.06}
    elif wind_speed >= 7:
        wind_adj = {1: 0.93, 2: 0.97, 3: 1.00, 4: 1.00, 5: 1.01, 6: 1.03}
    else:
        wind_adj = {i: 1.0 for i in range(1, 7)}

    return {i: wave_adj[i] * wind_adj[i] for i in range(1, 7)}


def _build_feature_rows(boats: list) -> list:
    """特徴量行列を構築（レース内相対ランクを含む）"""
    def ranked(vals, ascending=True):
        sv = sorted(set(v for v in vals if v > 0), reverse=not ascending)
        return {v: i + 1 for i, v in enumerate(sv)}

    time_rank     = ranked([b["exhibition_time"]   for b in boats], ascending=True)
    st_rank       = ranked([b["avg_st"]            for b in boats], ascending=True)
    odds_rank     = ranked([b["win_odds"]          for b in boats], ascending=True)
    local_rank    = ranked([b["local_win_rate"]    for b in boats], ascending=False)
    national_rank = ranked([b["national_win_rate"] for b in boats], ascending=False)
    motor_rank    = ranked([b["motor_rate"]        for b in boats], ascending=False)

    rows = []
    for b in boats:
        row = {
            "national_win_rate":  b["national_win_rate"],
            "local_win_rate":     b["local_win_rate"],
            "motor_rate":         b["motor_rate"],
            "boat_rate":          b["boat_rate"],
            "avg_st":             b["avg_st"],
            "exhibition_time":    b["exhibition_time"],
            "win_odds":           b["win_odds"],
            "exh_time_rank":      time_rank.get(b["exhibition_time"], 3.5)   if b["exhibition_time"]   > 0 else 3.5,
            "st_rank":            st_rank.get(b["avg_st"], 3.5)              if b["avg_st"]            > 0 else 3.5,
            "odds_rank":          odds_rank.get(b["win_odds"], 3.5)          if b["win_odds"]          > 0 else 3.5,
            "local_rate_rank":    local_rank.get(b["local_win_rate"], 3.5)   if b["local_win_rate"]    > 0 else 3.5,
            "national_rate_rank": national_rank.get(b["national_win_rate"], 3.5) if b["national_win_rate"] > 0 else 3.5,
            "motor_rate_rank":    motor_rank.get(b["motor_rate"], 3.5)       if b["motor_rate"]        > 0 else 3.5,
        }
        rows.append([row[col] for col in _feature_cols])
    return rows


def ml_scores(boats: list, wind_speed: float = 0.0, wave_height: float = 0.0) -> list:
    """1着・2着・3着モデルで prediction_score を計算。失敗時は None を返す。"""
    if not _load_model():
        return None

    try:
        X = np.array(_build_feature_rows(boats))
        p1 = _model.predict_proba(X)[:, 1]
        p2 = _model2.predict_proba(X)[:, 1] if _model2 else p1.copy()
        p3 = _model3.predict_proba(X)[:, 1] if _model3 else p1.copy()

        total1 = p1.sum() or 1.0
        for i, b in enumerate(boats):
            b["prediction_score"] = round(float(p1[i] / total1 * 100), 1)
            b["_p1"] = float(p1[i])
            b["_p2"] = float(p2[i])
            b["_p3"] = float(p3[i])

        return boats
    except Exception as e:
        print(f"  MLスコア計算エラー: {e} → 従来式にフォールバック")
        return None


def normalize_scores(boats: list, wind_speed: float = 0.0, wave_height: float = 0.0) -> list:
    times = [b["exhibition_time"] for b in boats if b["exhibition_time"] > 0]
    avg_time = sum(times) / len(times) if times else 0.0
    for b in boats:
        if b["exhibition_time"] > 0 and avg_time > 0:
            b["_t"] = max(0.0, min(10.0, 5.0 + (avg_time - b["exhibition_time"]) * 10.0))
        else:
            b["_t"] = 5.0

    for b in boats:
        if b["avg_st"] > 0:
            b["_st"] = max(0.0, min(10.0, (0.25 - b["avg_st"]) * 50.0))
        else:
            b["_st"] = 5.0

    for b in boats:
        if b["season_avg_rank"] > 0:
            b["_season"] = max(0.0, (7.0 - b["season_avg_rank"]) / 6.0 * 10.0)
        else:
            b["_season"] = 5.0

    weather_adj = weather_course_factor(wind_speed, wave_height)

    for b in boats:
        course_bonus = math.pow(COURSE_BONUS.get(b["boat_no"], 1.0), 1/3) * weather_adj.get(b["boat_no"], 1.0)
        raw = (
            b["national_win_rate"] * 0.15
            + b["local_win_rate"]  * 0.25
            + b["motor_rate"]      * 0.10
            + b["_t"]              * 0.30
            + b["_st"]             * 0.10
            + b["_season"]         * 0.15
        ) * course_bonus
        if b["f_count"] > 0 or b["l_count"] > 0:
            raw *= 0.85
        b["_raw"] = raw
        del b["_t"], b["_st"], b["_season"]

    total = sum(b["_raw"] for b in boats) or 1.0
    for b in boats:
        b["prediction_score"] = round(b["_raw"] / total * 100, 1)
        del b["_raw"]
    return boats


# ── Boatrace Open API ────────────────────────────────
def fetch_api(endpoint: str) -> list:
    """BoatraceOpenAPI から JSON を取得し、内部リストを返す。
    レスポンスは {"programs": [...]} / {"previews": [...]} / {"results": [...]} のいずれか。"""
    url = f"{API_BASE}/{endpoint}"
    resp = requests.get(url, timeout=20)
    resp.raise_for_status()
    data = resp.json()
    if isinstance(data, dict):
        return next(iter(data.values()))  # 最初の値（リスト）を取り出す
    return data


def filter_heiwajima(data: list) -> dict:
    """平和島のレースだけ抽出し race_number → record の辞書を返す"""
    return {r["number"]: r for r in data if r.get("stadium_number") == STADIUM_NUMBER}


# ── boatrace.jp 最小スクレイピング（今節着順・単勝オッズのみ）──

def get_soup(url: str) -> BeautifulSoup:
    resp = requests.get(url, headers=HEADERS, timeout=15)
    resp.encoding = "utf-8"
    return BeautifulSoup(resp.text, "lxml")


def to_float(text: str) -> float:
    try:
        return float(text.strip())
    except (ValueError, AttributeError):
        return 0.0


def scrape_season_rank(date_str: str, race_no: int) -> dict:
    """号艇番号 → 今節平均着順。取得できなければ空辞書。"""
    url = f"{BASE_URL}/owpc/pc/race/racelist?rno={race_no}&jcd={VENUE_CODE}&hd={date_str}"
    result = {}
    try:
        soup = get_soup(url)
        for link in soup.find_all("a", href=re.compile(r"toban=\d+")):
            if not link.get_text(strip=True):
                continue
            tr = link.find_parent("tr")
            if not tr:
                continue
            tds = tr.find_all("td")
            if not tds:
                continue
            boat_no_raw = unicodedata.normalize("NFKC", tds[0].get_text(strip=True))
            try:
                boat_no = int(boat_no_raw)
            except ValueError:
                continue
            if boat_no not in range(1, 7):
                continue

            tbody = tr.find_parent("tbody")
            if not tbody:
                continue
            result_tr = tbody.find("tr", class_="is-fBold")
            if not result_tr:
                continue
            ranks = []
            for td in result_tr.find_all("td"):
                a = td.find("a")
                if not a:
                    continue
                rank_text = unicodedata.normalize("NFKC", a.get_text(strip=True))
                try:
                    rank = int(rank_text)
                    if 1 <= rank <= 6:
                        ranks.append(rank)
                except ValueError:
                    pass
            if ranks:
                result[boat_no] = round(sum(ranks) / len(ranks), 2)
    except Exception:
        pass
    return result


def scrape_odds(date_str: str, race_no: int) -> dict:
    """号艇番号 → 単勝オッズ。取得できなければ空辞書。"""
    url = f"{BASE_URL}/owpc/pc/race/oddstf?rno={race_no}&jcd={VENUE_CODE}&hd={date_str}"
    odds = {}
    try:
        import warnings
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            soup = get_soup(url)
        for table in soup.find_all("table"):
            if "単勝オッズ" not in table.get_text():
                continue
            for tr in table.find_all("tr"):
                tds = tr.find_all("td")
                boat_td = next(
                    (td for td in tds if any("is-boatColor" in c for c in td.get("class", []))),
                    None,
                )
                odds_td = next(
                    (td for td in tds if "oddsPoint" in " ".join(td.get("class", []))),
                    None,
                )
                if boat_td and odds_td:
                    try:
                        boat_no  = int(boat_td.get_text(strip=True))
                        odds_val = float(odds_td.get_text(strip=True))
                        if 1 <= boat_no <= 6:
                            odds[boat_no] = odds_val
                    except ValueError:
                        pass
            break
    except Exception:
        pass
    return odds


def scrape_trifecta_odds(date_str: str, race_no: int) -> dict:
    """三連単オッズを取得。(1着,2着,3着) -> odds の辞書を返す。"""
    url = f"{BASE_URL}/owpc/pc/race/odds3t?rno={race_no}&jcd={VENUE_CODE}&hd={date_str}"
    odds = {}
    try:
        import warnings
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            soup = get_soup(url)
        tables = soup.find_all("table")
        if len(tables) < 2:
            return {}
        table = tables[1]
        rows = table.find_all("tr")
        if len(rows) < 2:
            return {}

        first_boats = [int(th.get_text(strip=True)) for th in rows[0].find_all("th") if th.get_text(strip=True).isdigit()]
        second_by_col = {}

        for row in rows[1:]:
            tds = list(row.find_all("td"))
            td_iter = iter(tds)
            try:
                for col_idx in range(6):
                    if col_idx in second_by_col and second_by_col[col_idx][1] > 0:
                        second_boat, rem = second_by_col[col_idx]
                        second_by_col[col_idx] = (second_boat, rem - 1)
                        third_boat = int(next(td_iter).get_text(strip=True))
                        odds_val = float(next(td_iter).get_text(strip=True))
                    else:
                        td = next(td_iter)
                        second_boat = int(td.get_text(strip=True))
                        rowspan = int(td.get("rowspan", 1))
                        second_by_col[col_idx] = (second_boat, rowspan - 1)
                        third_boat = int(next(td_iter).get_text(strip=True))
                        odds_val = float(next(td_iter).get_text(strip=True))
                    odds[(first_boats[col_idx], second_boat, third_boat)] = odds_val
            except (StopIteration, ValueError):
                pass
    except Exception:
        pass
    return odds


def scrape_weather(date_str: str, race_no: int) -> dict:
    """風速・波高・天候をboatrace.jpの直前情報ページから取得。取得できなければ空辞書。"""
    url = f"{BASE_URL}/owpc/pc/race/beforeinfo?rno={race_no}&jcd={VENUE_CODE}&hd={date_str}"
    result = {}
    try:
        soup = get_soup(url)
        for span in soup.find_all("span"):
            label = span.get_text(strip=True)
            parent_text = span.find_parent().get_text(strip=True) if span.find_parent() else ""
            if label == "風速":
                m = re.search(r"(\d+(?:\.\d+)?)", parent_text.replace("風速", ""))
                if m:
                    result["wind_speed"] = float(m.group(1))
            elif label == "波高":
                m = re.search(r"(\d+(?:\.\d+)?)", parent_text.replace("波高", ""))
                if m:
                    result["wave_height"] = float(m.group(1))
        # 天候: 「晴」「曇」「雨」などのテキストを探す
        weather_map_rev = {"晴": 1, "曇": 2, "雨": 3, "雪": 4, "霧": 5}
        for text in [el.get_text(strip=True) for el in soup.find_all("span")]:
            if text in weather_map_rev:
                result["weather"] = text
                break
    except Exception:
        pass
    return result


# ── データマージ ──────────────────────────────────────
def build_race_data(prog: dict, prev: dict, result: dict,
                    season_ranks: dict, win_odds: dict, weather: dict = None) -> dict:
    boats = []
    for b in prog.get("boats", []):
        boat_no = b["racer_boat_number"]

        prev_boat = {}
        if prev:
            # previews の boats は {1: {...}, 2: {...}} 形式（整数キー）
            prev_boats = prev.get("boats", {})
            prev_boat = prev_boats.get(boat_no) or prev_boats.get(str(boat_no)) or {}

        boats.append({
            "boat_no":           boat_no,
            "racer_name":        b.get("racer_name", ""),
            "racer_no":          str(b.get("racer_number", "")),
            "grade":             CLASS_MAP.get(b.get("racer_class_number"), ""),
            "weight":            b.get("racer_weight", 0.0),
            "national_win_rate":  b.get("racer_national_top_1_percent") or 0.0,
            "local_win_rate":     b.get("racer_local_top_1_percent") or 0.0,
            "national_top3_rate": b.get("racer_national_top_3_percent") or 0.0,
            "local_top3_rate":    b.get("racer_local_top_3_percent") or 0.0,
            "motor_rate":         b.get("racer_assigned_motor_top_2_percent") or 0.0,
            "motor_top3_rate":    b.get("racer_assigned_motor_top_3_percent") or 0.0,
            "boat_rate":          b.get("racer_assigned_boat_top_2_percent") or 0.0,
            "f_count":            b.get("racer_flying_count") or 0,
            "l_count":            b.get("racer_late_count") or 0,
            "avg_st":             b.get("racer_average_start_timing") or 0.0,
            "season_avg_rank":    season_ranks.get(boat_no, 0.0),
            "exhibition_time":    prev_boat.get("racer_exhibition_time", 0.0),
            "win_odds":           win_odds.get(boat_no, 0.0),
        })

    # 天候: boatrace.jp直前情報を優先、なければAPIにフォールバック
    if weather:
        wind_speed  = weather.get("wind_speed",  float(prev.get("wind_speed",  0) if prev else 0))
        wave_height = weather.get("wave_height", float(prev.get("wave_height", 0) if prev else 0))
        weather_str = weather.get("weather", WEATHER_MAP.get(prev.get("weather_number", 0) if prev else 0, ""))
    else:
        weather_no  = prev.get("weather_number", 0) if prev else 0
        weather_str = WEATHER_MAP.get(weather_no, "")
        wind_speed  = float(prev.get("wind_speed",  0) if prev else 0)
        wave_height = float(prev.get("wave_height", 0) if prev else 0)

    # 締切時刻: "2026-05-08 11:55:00" → "11:55"
    closed_at = prog.get("closed_at", "")
    deadline = closed_at[11:16] if len(closed_at) >= 16 else ""

    # subtitle = レース固有名（優勝戦/特別選抜戦/一般など）
    # title   = 大会名（全レース共通）→ 表示には使わない
    race_name = prog.get("subtitle") or f"{prog['number']}R"

    # レース結果（results APIから）
    result_map = {}
    if result:
        for b in result.get("boats", []):
            place = b.get("racer_place_number")
            bn    = b.get("racer_boat_number")
            if place in (1, 2, 3):
                result_map[place] = bn

    return {
        "deadline":    deadline,
        "race_name":   race_name,
        "weather":     weather_str,
        "wind_speed":  wind_speed,
        "wave_height": wave_height,
        "result_1st":  result_map.get(1),
        "result_2nd":  result_map.get(2),
        "result_3rd":  result_map.get(3),
        "boats":       boats,
    }


# ── Supabase REST API ─────────────────────────────────
def sb_get(table: str, params: dict) -> list:
    r = requests.get(f"{SUPABASE_URL}/rest/v1/{table}", headers=SB_HEADERS, params=params)
    r.raise_for_status()
    return r.json()

def sb_insert(table: str, payload) -> list:
    r = requests.post(f"{SUPABASE_URL}/rest/v1/{table}", headers=SB_HEADERS, json=payload)
    r.raise_for_status()
    return r.json()

def sb_delete(table: str, params: dict) -> None:
    r = requests.delete(f"{SUPABASE_URL}/rest/v1/{table}", headers=SB_HEADERS, params=params)
    r.raise_for_status()


def save_race(date_str: str, race_no: int, data: dict, trifecta_odds: dict = None) -> None:
    formatted_date = f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:]}"
    res = sb_insert("races", {
        "race_no":     race_no,
        "race_date":   formatted_date,
        "deadline":    data["deadline"],
        "race_name":   data["race_name"],
        "weather":     data["weather"],
        "wind_speed":  data["wind_speed"],
        "wave_height": data["wave_height"],
        "result_1st":  data.get("result_1st"),
        "result_2nd":  data.get("result_2nd"),
        "result_3rd":  data.get("result_3rd"),
    })
    race_id = res[0]["id"]
    for boat in data["boats"]:
        boat["race_id"] = race_id
    sb_insert("racers", data["boats"])
    if trifecta_odds:
        rows = [
            {"race_id": race_id, "boat1": b1, "boat2": b2, "boat3": b3, "odds": o}
            for (b1, b2, b3), o in trifecta_odds.items()
        ]
        sb_insert("trifecta_odds", rows)


def delete_existing(date_str: str) -> None:
    formatted_date = f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:]}"
    existing = sb_get("races", {"select": "id", "race_date": f"eq.{formatted_date}"})
    for row in existing:
        sb_delete("racers", {"race_id": f"eq.{row['id']}"})
    sb_delete("races", {"race_date": f"eq.{formatted_date}"})


# ── メイン ────────────────────────────────────────────
def main():
    date_str = next(
        (a for a in sys.argv[1:] if re.match(r"^\d{8}$", a)),
        datetime.date.today().strftime("%Y%m%d"),
    )
    year = date_str[:4]

    print(f"平和島 {date_str} のデータを取得中...")
    print("  [1/3] Boatrace Open API からプログラムデータ取得...")
    try:
        programs_data = fetch_api(f"programs/v3/{year}/{date_str}.json")
        prog_races    = filter_heiwajima(programs_data)
    except Exception as e:
        print(f"  プログラムAPI取得失敗: {e}")
        return

    if not prog_races:
        print("  本日は平和島の開催なし（またはAPIにデータ未掲載）")
        return

    print("  [2/3] Boatrace Open API から直前・結果データ取得...")
    try:
        prev_races   = filter_heiwajima(fetch_api(f"previews/v3/{year}/{date_str}.json"))
    except Exception:
        prev_races   = {}
        print("  直前情報API: データなし（展示タイム・天候はゼロ扱い）")

    try:
        result_races = filter_heiwajima(fetch_api(f"results/v3/{year}/{date_str}.json"))
    except Exception:
        result_races = {}
        print("  結果API: データなし")

    print("  [3/3] boatrace.jp から今節着順・単勝オッズ取得...")
    delete_existing(date_str)

    success = 0
    for race_no in sorted(prog_races.keys()):
        print(f"  {race_no}R ...", end=" ", flush=True)

        season_ranks    = scrape_season_rank(date_str, race_no)
        win_odds        = scrape_odds(date_str, race_no)
        trifecta_odds   = scrape_trifecta_odds(date_str, race_no)
        weather         = scrape_weather(date_str, race_no)
        time.sleep(0.8)  # 礼儀的ウェイト

        data = build_race_data(
            prog_races[race_no],
            prev_races.get(race_no),
            result_races.get(race_no),
            season_ranks,
            win_odds,
            weather,
        )
        scored = ml_scores(
            data["boats"],
            wind_speed=data["wind_speed"],
            wave_height=data["wave_height"],
        )
        if scored is None:
            data["boats"] = normalize_scores(
                data["boats"],
                wind_speed=data["wind_speed"],
                wave_height=data["wave_height"],
            )
        else:
            data["boats"] = scored
        data["boats"].sort(key=lambda x: x["boat_no"])

        # ML内部フィールドをDB保存前に除去
        for b in data["boats"]:
            b.pop("_p1", None)
            b.pop("_p2", None)
            b.pop("_p3", None)

        save_race(date_str, race_no, data, trifecta_odds)
        success += 1
        scores = [f"{b['boat_no']}号:{b['prediction_score']}%" for b in data["boats"]]
        print(f"OK  {' / '.join(scores)}")

    print(f"\n完了: {success}レースを保存しました")


if __name__ == "__main__":
    main()
