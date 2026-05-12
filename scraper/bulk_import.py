#!/usr/bin/env python3
"""
平和島ボートレース 一括過去データ取得スクリプト
Boatrace Open API + boatrace.jp（単勝オッズ）を使用

使い方:
  python bulk_import.py                        # 過去30日
  python bulk_import.py 20260401 20260430      # 指定期間
"""

import os
import sys
import re
import time
import datetime
import requests
from bs4 import BeautifulSoup

SUPABASE_URL   = os.environ.get("SUPABASE_URL", "https://talatqiolwndddxnzdwy.supabase.co")
SUPABASE_KEY   = os.environ.get("SUPABASE_KEY", "sb_publishable_fJslxpwUQy0PVJ-cfPuaJQ_1TLgKgqe")
STADIUM_NUMBER = 4
VENUE_CODE     = "04"
API_BASE       = "https://boatraceopenapi.github.io"
BASE_URL       = "https://www.boatrace.jp"

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

CLASS_MAP   = {1: "A1", 2: "A2", 3: "B1", 4: "B2"}
WEATHER_MAP = {1: "晴", 2: "曇", 3: "雨", 4: "雪", 5: "霧"}

COURSE_BONUS = {1: 2.88, 2: 0.82, 3: 0.91, 4: 0.83, 5: 0.47, 6: 0.17}


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


def normalize_scores(boats: list, wind_speed: float = 0.0, wave_height: float = 0.0) -> list:
    times = [b["exhibition_time"] for b in boats if b["exhibition_time"] > 0]
    avg_time = sum(times) / len(times) if times else 0.0
    for b in boats:
        b["_t"] = max(0.0, min(10.0, 5.0 + (avg_time - b["exhibition_time"]) * 10.0)) if (b["exhibition_time"] > 0 and avg_time > 0) else 5.0

    for b in boats:
        b["_st"] = max(0.0, min(10.0, (0.25 - b["avg_st"]) * 50.0)) if b["avg_st"] > 0 else 5.0

    for b in boats:
        b["_season"] = 5.0  # 過去データは今節着順なし → デフォルト値

    weather_adj = weather_course_factor(wind_speed, wave_height)
    for b in boats:
        course_bonus = COURSE_BONUS.get(b["boat_no"], 1.0) * weather_adj.get(b["boat_no"], 1.0)
        raw = (
            b["national_win_rate"] * 0.20
            + b["local_win_rate"]  * 0.15
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


def fetch_api(endpoint: str) -> list:
    url = f"{API_BASE}/{endpoint}"
    resp = requests.get(url, timeout=20)
    resp.raise_for_status()
    data = resp.json()
    return next(iter(data.values())) if isinstance(data, dict) else data


def filter_heiwajima(data: list) -> dict:
    return {r["number"]: r for r in data if r.get("stadium_number") == STADIUM_NUMBER}


# ── Supabase ──────────────────────────────────────────
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

def delete_existing(date_str: str) -> None:
    formatted = f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:]}"
    existing = sb_get("races", {"select": "id", "race_date": f"eq.{formatted}"})
    for row in existing:
        sb_delete("racers", {"race_id": f"eq.{row['id']}"})
    sb_delete("races", {"race_date": f"eq.{formatted}"})

def save_race(date_str: str, race_no: int, data: dict) -> None:
    formatted = f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:]}"
    res = sb_insert("races", {
        "race_no":     race_no,
        "race_date":   formatted,
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


def scrape_odds(date_str: str, race_no: int) -> dict:
    """号艇番号 → 単勝オッズ。取得できなければ空辞書。"""
    url = f"{BASE_URL}/owpc/pc/race/oddstf?rno={race_no}&jcd={VENUE_CODE}&hd={date_str}"
    odds = {}
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        resp.encoding = "utf-8"
        soup = BeautifulSoup(resp.text, "lxml")
        for tbody in soup.find_all("tbody"):
            tr = tbody.find("tr")
            if not tr:
                continue
            tds = tr.find_all("td")
            boat_td = next((td for td in tds if any("is-boatColor" in c for c in td.get("class", []))), None)
            odds_td = next((td for td in tds if "oddsPoint" in " ".join(td.get("class", []))), None)
            if boat_td and odds_td:
                try:
                    boat_no  = int(boat_td.get_text(strip=True))
                    odds_val = float(odds_td.get_text(strip=True))
                    if 1 <= boat_no <= 6:
                        odds[boat_no] = odds_val
                except ValueError:
                    pass
    except Exception:
        pass
    return odds


def boats_dict_from(raw) -> dict:
    """boats フィールドをリスト・辞書どちらでも {boat_no: record} 形式に変換"""
    if isinstance(raw, dict):
        result = {}
        for k, v in raw.items():
            try:
                result[int(k)] = v
            except (ValueError, TypeError):
                pass
        return result
    if isinstance(raw, list):
        return {b["racer_boat_number"]: b for b in raw if isinstance(b, dict) and "racer_boat_number" in b}
    return {}


def fetch_optional(endpoint: str) -> list:
    """404 などは空リストで返す（学習には必須でないデータ）"""
    try:
        return fetch_api(endpoint)
    except Exception:
        return []


# ── 1日分処理 ─────────────────────────────────────────
def process_date(date_str: str) -> int:
    year = date_str[:4]
    try:
        prog_data = fetch_api(f"programs/v3/{year}/{date_str}.json")
    except Exception as e:
        print(f"  {date_str}: programs API取得失敗 ({e})")
        return 0

    prev_data   = fetch_optional(f"previews/v3/{year}/{date_str}.json")
    result_data = fetch_optional(f"results/v3/{year}/{date_str}.json")

    prog_races   = filter_heiwajima(prog_data)
    prev_races   = filter_heiwajima(prev_data)   if prev_data   else {}
    result_races = filter_heiwajima(result_data) if result_data else {}

    if not prog_races:
        return 0  # 開催なし

    delete_existing(date_str)

    saved = 0
    for race_no, prog in sorted(prog_races.items()):
        prev     = prev_races.get(race_no)   or {}
        result   = result_races.get(race_no) or {}
        win_odds = scrape_odds(date_str, race_no)
        time.sleep(0.5)

        # 天候
        weather_no  = prev.get("weather_number", 0)
        wind_speed  = float(prev.get("wind_speed", 0) or 0)
        wave_height = float(prev.get("wave_height", 0) or 0)

        # 締切時刻・レース名
        closed_at = prog.get("closed_at", "")
        deadline  = closed_at[11:16] if len(closed_at) >= 16 else ""
        race_name = prog.get("subtitle") or f"{race_no}R"

        # 結果（boats が list / dict 両対応）
        result_map = {}
        result_boats_raw = result.get("boats", [])
        result_boats = (
            result_boats_raw.values() if isinstance(result_boats_raw, dict)
            else result_boats_raw
        )
        for b in result_boats:
            if not isinstance(b, dict):
                continue
            place = b.get("racer_place_number")
            bn    = b.get("racer_boat_number")
            if place in (1, 2, 3):
                result_map[place] = bn

        # 艇情報（previews.boats は {1:{...}, "1":{...}, or [{...}]} のいずれか）
        prev_boats = boats_dict_from(prev.get("boats", {}))
        boats = []
        prog_boats_raw = prog.get("boats", [])
        prog_boats = (
            prog_boats_raw.values() if isinstance(prog_boats_raw, dict)
            else prog_boats_raw
        )
        for b in prog_boats:
            if not isinstance(b, dict):
                continue
            boat_no   = b.get("racer_boat_number")
            if not boat_no:
                continue
            prev_boat = prev_boats.get(boat_no) or {}
            boats.append({
                "boat_no":           boat_no,
                "racer_name":        b.get("racer_name", ""),
                "racer_no":          str(b.get("racer_number", "")),
                "grade":             CLASS_MAP.get(b.get("racer_class_number"), ""),
                "weight":            b.get("racer_weight") or 0.0,
                "national_win_rate": b.get("racer_national_top_1_percent") or 0.0,
                "local_win_rate":    b.get("racer_local_top_1_percent") or 0.0,
                "motor_rate":        b.get("racer_assigned_motor_top_2_percent") or 0.0,
                "boat_rate":         b.get("racer_assigned_boat_top_2_percent") or 0.0,
                "f_count":           b.get("racer_flying_count") or 0,
                "l_count":           b.get("racer_late_count") or 0,
                "avg_st":            b.get("racer_average_start_timing") or 0.0,
                "season_avg_rank":   0.0,
                "exhibition_time":   prev_boat.get("racer_exhibition_time") or 0.0,
                "win_odds":          win_odds.get(boat_no, 0.0),
            })

        if not boats:
            continue

        boats = normalize_scores(boats, wind_speed, wave_height)
        boats.sort(key=lambda x: x["boat_no"])

        save_race(date_str, race_no, {
            "deadline":    deadline,
            "race_name":   race_name,
            "weather":     WEATHER_MAP.get(weather_no, ""),
            "wind_speed":  wind_speed,
            "wave_height": wave_height,
            "result_1st":  result_map.get(1),
            "result_2nd":  result_map.get(2),
            "result_3rd":  result_map.get(3),
            "boats":       boats,
        })
        saved += 1

    return saved


# ── メイン ────────────────────────────────────────────
def main():
    args = [a for a in sys.argv[1:] if re.match(r"^\d{8}$", a)]
    if len(args) >= 2:
        start = datetime.date(int(args[0][:4]), int(args[0][4:6]), int(args[0][6:]))
        end   = datetime.date(int(args[1][:4]), int(args[1][4:6]), int(args[1][6:]))
    else:
        end   = datetime.date.today() - datetime.timedelta(days=1)
        start = end - datetime.timedelta(days=30)

    dates = []
    d = start
    while d <= end:
        dates.append(d.strftime("%Y%m%d"))
        d += datetime.timedelta(days=1)

    print(f"期間: {start} 〜 {end} ({len(dates)}日間)")
    print("boatrace.jp へのアクセスなし（Boatrace Open API のみ使用）\n")

    total_days  = 0
    total_races = 0
    for date_str in dates:
        saved = process_date(date_str)
        if saved > 0:
            print(f"  {date_str}: {saved}レース 保存")
            total_days  += 1
            total_races += saved

    print(f"\n完了: {total_days}日 / {total_races}レース を保存しました")


if __name__ == "__main__":
    main()
