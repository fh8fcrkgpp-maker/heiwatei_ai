"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase, type Race, type Racer, fetchTrifectaOdds } from "@/lib/supabase";
import CalendarDrawer from "@/components/CalendarDrawer";
import RacerDrawer from "@/components/RacerDrawer";

type MonthStat = { label: string; hit: number; total: number };
type Trifecta = [number, number, number];

// 1:白 2:黒 3:赤 4:青 5:黄 6:緑（ボートレース公式カラー）
const LANE_COLORS = ["#FFFFFF", "#1A1A1A", "#E53935", "#1565C0", "#F9A825", "#2E7D32"];
const LANE_TEXT   = ["#000",   "#fff",    "#fff",    "#fff",    "#000",    "#fff"   ];
const WEATHER_ICON: Record<string, string> = {
  晴: "☀️", 曇: "☁️", 雨: "🌧️", 雪: "❄️",
};

// 平和島実績308レース: 2着・3着コース別発生率 ÷ 均等分布16.67%
const PLACE2_BONUS: Record<number, number> = {1:1.05, 2:1.51, 3:1.21, 4:0.90, 5:0.86, 6:0.47};
const PLACE3_BONUS: Record<number, number> = {1:0.97, 2:0.90, 3:1.23, 4:1.07, 5:0.82, 6:1.01};

type BoatScore = { boat_no: number; score: number };

function topTrifectaFromScores(boats: BoatScore[]): Trifecta | null {
  const total = boats.reduce((s, b) => s + b.score, 0);
  if (total === 0 || boats.length < 3) return null;
  let bestProb = -1;
  let best: Trifecta | null = null;
  for (const a of boats) {
    for (const b of boats) {
      if (b.boat_no === a.boat_no) continue;
      for (const c of boats) {
        if (c.boat_no === a.boat_no || c.boat_no === b.boat_no) continue;
        const prob = (a.score / total)
          * (b.score / (total - a.score)) * (PLACE2_BONUS[b.boat_no] ?? 1.0)
          * (c.score / (total - a.score - b.score)) * (PLACE3_BONUS[c.boat_no] ?? 1.0);
        if (prob > bestProb) { bestProb = prob; best = [a.boat_no, b.boat_no, c.boat_no]; }
      }
    }
  }
  return best;
}

function calcTrifecta(racers: Racer[], top = 5) {
  const total = racers.reduce((s, r) => s + r.prediction_score, 0);
  if (total === 0) return [];
  const combos: { boats: [number, number, number]; prob: number }[] = [];
  for (const a of racers) {
    for (const b of racers) {
      if (b.boat_no === a.boat_no) continue;
      for (const c of racers) {
        if (c.boat_no === a.boat_no || c.boat_no === b.boat_no) continue;
        const prob = (a.prediction_score / total)
          * (b.prediction_score / (total - a.prediction_score)) * (PLACE2_BONUS[b.boat_no] ?? 1.0)
          * (c.prediction_score / (total - a.prediction_score - b.prediction_score)) * (PLACE3_BONUS[c.boat_no] ?? 1.0);
        combos.push({ boats: [a.boat_no, b.boat_no, c.boat_no], prob: prob * 100 });
      }
    }
  }
  return combos.sort((a, b) => b.prob - a.prob).slice(0, top);
}

function toDateStr(d: Date) {
  // JST (UTC+9) で日付文字列を生成
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function formatDate(d: Date) {
  return `${d.getMonth() + 1}月${d.getDate()}日（${"日月火水木金土"[d.getDay()]}）`;
}

export default function AppPage() {
  const [date, setDate] = useState<Date>(new Date());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [races, setRaces] = useState<Race[]>([]);
  const [selectedRace, setSelectedRace] = useState<number | null>(null);
  const [racers, setRacers] = useState<Racer[]>([]);
  const [loadingRaces, setLoadingRaces] = useState(true);
  const [loadingRacers, setLoadingRacers] = useState(false);
  const [monthStats, setMonthStats] = useState<MonthStat[]>([]);
  const [dayTopTrifecta, setDayTopTrifecta] = useState<Record<number, Trifecta>>({});
  const [selectedRacer, setSelectedRacer] = useState<Racer | null>(null);
  const [trifectaOddsMap, setTrifectaOddsMap] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    (async () => {
      const from = new Date();
      from.setMonth(from.getMonth() - 2);
      from.setDate(1);
      const { data: races } = await supabase
        .from("races")
        .select("race_date, result_1st, result_2nd, result_3rd, id")
        .not("result_1st", "is", null)
        .not("result_2nd", "is", null)
        .not("result_3rd", "is", null)
        .gte("race_date", toDateStr(from));
      if (!races?.length) return;

      const raceIds = races.map((r) => r.id);
      const { data: racers } = await supabase
        .from("racers")
        .select("race_id, boat_no, prediction_score")
        .in("race_id", raceIds);
      if (!racers) return;

      const byRace: Record<number, { boat_no: number; score: number }[]> = {};
      for (const r of racers) {
        if (!byRace[r.race_id]) byRace[r.race_id] = [];
        byRace[r.race_id].push({ boat_no: r.boat_no, score: r.prediction_score });
      }
      const trifectaByRace: Record<number, Trifecta> = {};
      for (const [id, boats] of Object.entries(byRace)) {
        const sorted = boats.sort((a, b) => b.score - a.score);
        if (sorted.length >= 3)
          trifectaByRace[Number(id)] = [sorted[0].boat_no, sorted[1].boat_no, sorted[2].boat_no];
      }

      const monthMap: Record<string, { hit: number; total: number }> = {};
      for (const race of races) {
        const key = race.race_date.slice(0, 7);
        if (!monthMap[key]) monthMap[key] = { hit: 0, total: 0 };
        monthMap[key].total++;
        const tf = trifectaByRace[race.id];
        if (tf && tf[0] === race.result_1st && tf[1] === race.result_2nd && tf[2] === race.result_3rd)
          monthMap[key].hit++;
      }

      const stats = Object.entries(monthMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-3)
        .map(([key, v]) => ({
          label: `${parseInt(key.slice(5))}月`,
          hit: v.hit,
          total: v.total,
        }));
      setMonthStats(stats);
    })();
  }, []);

  const fetchRaces = useCallback(async (d: Date) => {
    setLoadingRaces(true);
    setSelectedRace(null);
    setRacers([]);
    setDayTopTrifecta({});
    const { data: raceData } = await supabase
      .from("races")
      .select("*")
      .eq("race_date", toDateStr(d))
      .order("race_no");
    const raceList = raceData ?? [];
    setRaces(raceList);

    if (raceList.length > 0) {
      const ids = raceList.map((r) => r.id);
      const { data: allRacers } = await supabase
        .from("racers")
        .select("race_id, boat_no, prediction_score")
        .in("race_id", ids);
      if (allRacers) {
        const byRace: Record<number, { boat_no: number; score: number }[]> = {};
        for (const r of allRacers) {
          if (!byRace[r.race_id]) byRace[r.race_id] = [];
          byRace[r.race_id].push({ boat_no: r.boat_no, score: r.prediction_score });
        }
        const trifectas: Record<number, Trifecta> = {};
        for (const [id, boats] of Object.entries(byRace)) {
          const top = topTrifectaFromScores(boats);
          if (top) trifectas[Number(id)] = top;
        }
        setDayTopTrifecta(trifectas);
      }
    }
    setLoadingRaces(false);
  }, []);

  const fetchRacers = useCallback(async (raceId: number) => {
    setLoadingRacers(true);
    const [{ data }, oddsMap] = await Promise.all([
      supabase.from("racers").select("*").eq("race_id", raceId).order("boat_no"),
      fetchTrifectaOdds(raceId),
    ]);
    setRacers(data ?? []);
    setTrifectaOddsMap(oddsMap);
    setLoadingRacers(false);
  }, []);

  useEffect(() => { fetchRaces(date); }, [date, fetchRaces]);

  const handleSelectRace = (race: Race) => {
    if (selectedRace === race.race_no) {
      setSelectedRace(null);
      setRacers([]);
    } else {
      setSelectedRace(race.race_no);
      fetchRacers(race.id);
    }
  };

  const maxScore = racers.length > 0 ? Math.max(...racers.map((r) => r.prediction_score)) : 1;

  const today = new Date();
  const isToday = toDateStr(date) === toDateStr(today);

  const finishedRaces = races.filter((r) => r.result_1st != null && r.result_2nd != null && r.result_3rd != null);
  const dayHit = finishedRaces.filter((r) => {
    const t = dayTopTrifecta[r.id];
    return t && t[0] === r.result_1st && t[1] === r.result_2nd && t[2] === r.result_3rd;
  }).length;
  const dayHitRate = finishedRaces.length > 0 ? Math.round((dayHit / finishedRaces.length) * 100) : null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <CalendarDrawer
        open={calendarOpen}
        selected={date}
        onSelect={setDate}
        onClose={() => setCalendarOpen(false)}
      />

      {/* 的中率 */}
      {monthStats.length > 0 && (
        <div className="flex gap-2 mb-5">
          {monthStats.map((s) => (
            <div key={s.label} className="flex-1 rounded-xl px-3 py-2 text-center" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <p className="text-xs mb-0.5" style={{ color: "var(--muted)" }}>{s.label}の的中率</p>
              <p className="text-lg font-bold" style={{ color: "var(--cyan)" }}>
                {s.total > 0 ? Math.round((s.hit / s.total) * 100) : 0}%
              </p>
              <p className="text-xs" style={{ color: "var(--muted)" }}>{s.hit}/{s.total}レース</p>
            </div>
          ))}
        </div>
      )}

      {/* 日付ナビゲーション */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => setDate((d) => addDays(d, -1))}
          className="w-9 h-9 flex items-center justify-center rounded-lg transition-colors hover:opacity-80"
          style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--foreground)" }}
        >
          ‹
        </button>
        <div className="text-center">
          <button
            onClick={() => setCalendarOpen(true)}
            className="font-bold text-lg hover:opacity-80 transition-opacity"
            style={{ color: "var(--foreground)" }}
          >
            {formatDate(date)}
          </button>
          <div className="flex items-center justify-center gap-2 mt-0.5">
            <p className="text-xs" style={{ color: "var(--muted)" }}>平和島ボートレース場</p>
            {dayHitRate !== null && (
              <span className="text-xs px-1.5 py-0.5 rounded font-bold" style={{ background: "rgba(255,214,0,0.15)", color: "#FFD600", border: "1px solid rgba(255,214,0,0.4)" }}>
                当日 {dayHitRate}% ({dayHit}/{finishedRaces.length})
              </span>
            )}
            {!isToday && (
              <button
                onClick={() => setDate(new Date())}
                className="text-xs px-1.5 py-0.5 rounded"
                style={{ background: "rgba(0,212,255,0.15)", color: "var(--cyan)", border: "1px solid rgba(0,212,255,0.3)" }}
              >
                今日
              </button>
            )}
          </div>
        </div>
        <button
          onClick={() => setDate((d) => addDays(d, 1))}
          className="w-9 h-9 flex items-center justify-center rounded-lg transition-colors hover:opacity-80"
          style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--foreground)" }}
        >
          ›
        </button>
      </div>

      {/* レース一覧 */}
      {loadingRaces ? (
        <div className="flex flex-col gap-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl pulse-cyan" style={{ background: "var(--card)" }} />
          ))}
        </div>
      ) : races.length === 0 ? (
        <div className="text-center py-20" style={{ color: "var(--muted)" }}>
          <p className="text-4xl mb-3">🚤</p>
          <p className="text-sm">この日のレースデータがありません</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {races.map((race) => {
            const isOpen = selectedRace === race.race_no;
            const hasResult = race.result_1st != null && race.result_2nd != null && race.result_3rd != null;
            const t = dayTopTrifecta[race.id];
            const isHit = hasResult && !!t && t[0] === race.result_1st && t[1] === race.result_2nd && t[2] === race.result_3rd;
            const borderColor = isHit ? "#FFD600" : isOpen ? "var(--cyan)" : "var(--border)";

            return (
              <div key={race.race_no} className="rounded-xl overflow-hidden" style={{ border: `1px solid ${borderColor}`, background: isHit ? "rgba(255,214,0,0.04)" : "var(--card)" }}>
                {/* レースヘッダー */}
                <button
                  onClick={() => handleSelectRace(race)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:opacity-80"
                >
                  <span
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0"
                    style={{ background: isOpen ? "var(--cyan)" : "rgba(0,212,255,0.1)", color: isOpen ? "#0B1F3A" : "var(--cyan)" }}
                  >
                    {race.race_no}
                  </span>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate" style={{ color: "var(--foreground)" }}>
                        {race.race_name || `第${race.race_no}レース`}
                      </span>
                      {race.deadline && (
                        <span className="text-xs flex-shrink-0" style={{ color: "var(--muted)" }}>{race.deadline?.slice(0, 5)}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
                      {race.weather && <span>{WEATHER_ICON[race.weather] ?? "🌤️"} {race.weather}</span>}
                      {race.wind_speed != null && <span>風{race.wind_speed}m</span>}
                      {race.wave_height != null && <span>波{race.wave_height}cm</span>}
                    </div>
                  </div>

                  {/* 的中バッジ */}
                  {isHit && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: "rgba(255,214,0,0.2)", color: "#FFD600", border: "1px solid rgba(255,214,0,0.5)" }}>
                      的中！
                    </span>
                  )}

                  {/* 結果バッジ */}
                  {hasResult && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {[race.result_1st, race.result_2nd, race.result_3rd].map((r, i) =>
                        r != null ? (
                          <span
                            key={i}
                            className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                            style={{ background: LANE_COLORS[r - 1], color: LANE_TEXT[r - 1] }}
                          >
                            {r}
                          </span>
                        ) : null
                      )}
                    </div>
                  )}

                  <span className="text-xs flex-shrink-0" style={{ color: "var(--muted)" }}>{isOpen ? "▲" : "▼"}</span>
                </button>

                {/* レース詳細（展開） */}
                {isOpen && (
                  <div className="border-t px-4 pb-4 pt-3" style={{ borderColor: "var(--border)" }}>
                    {loadingRacers ? (
                      <div className="flex flex-col gap-2">
                        {[...Array(6)].map((_, i) => (
                          <div key={i} className="h-12 rounded-lg pulse-cyan" style={{ background: "var(--navy)" }} />
                        ))}
                      </div>
                    ) : racers.length === 0 ? (
                      <p className="text-sm text-center py-4" style={{ color: "var(--muted)" }}>選手データがありません</p>
                    ) : (() => {
                        const sorted = [...racers].sort((a, b) => b.prediction_score - a.prediction_score);
                        const trifecta = calcTrifecta(racers);

                        return (
                          <div className="flex flex-col gap-2">
                            {/* 三連単予想（本命・対抗・穴） */}
                            {trifecta.length > 0 && (() => {
                              const allTrifectas = calcTrifecta(racers, 120);
                              const honmeiBoat = sorted[0].boat_no;
                              const taikouBoat = sorted[1].boat_no;
                              const topTwoBoats = new Set([honmeiBoat, taikouBoat]);

                              // 本命: AIスコア1位の艇が1着の中で最高確率
                              const honmei = allTrifectas.find(t => t.boats[0] === honmeiBoat) ?? null;
                              // 対抗: AIスコア2位の艇が1着の中で最高確率
                              const taikou = allTrifectas.find(t => t.boats[0] === taikouBoat) ?? null;
                              // 穴: AIスコア3位以下の艇が1着の中で最高確率
                              const ana = allTrifectas.find(t => !topTwoBoats.has(t.boats[0])) ?? null;

                              const picks = [
                                { label: "◎本命", color: "var(--cyan)", combo: honmei },
                                { label: "○対抗", color: "#9BB3CC",     combo: taikou },
                                ...(ana ? [{ label: "△穴", color: "#FFA040", combo: ana }] : []),
                              ];

                              return (
                                <div className="rounded-lg px-3 py-2" style={{ background: "var(--navy)", border: "1px solid var(--border)" }}>
                                  <p className="text-xs font-bold mb-2" style={{ color: "var(--cyan)" }}>三連単 AI予想</p>
                                  <div className="flex flex-col gap-1.5">
                                    {picks.map((pick, i) => {
                                      if (!pick.combo) return null;
                                      const oddsKey = pick.combo.boats.join("-");
                                      const oddsVal = trifectaOddsMap.get(oddsKey);
                                      return (
                                        <div key={i} className="flex items-center justify-between">
                                          <div className="flex items-center gap-1.5">
                                            <span className="font-bold w-10 flex-shrink-0" style={{ color: pick.color, fontSize: "10px" }}>{pick.label}</span>
                                            {pick.combo.boats.map((bn, j) => (
                                              <span key={j} className="flex items-center gap-0.5">
                                                <span
                                                  className="w-5 h-5 rounded flex items-center justify-center text-xs font-bold"
                                                  style={{ background: LANE_COLORS[bn - 1], color: LANE_TEXT[bn - 1] }}
                                                >
                                                  {bn}
                                                </span>
                                                {j < 2 && <span className="text-xs" style={{ color: "var(--muted)" }}>→</span>}
                                              </span>
                                            ))}
                                          </div>
                                          <span className="text-xs font-bold tabular-nums" style={{ color: pick.color }}>
                                            {oddsVal != null ? `${oddsVal.toFixed(1)}倍` : `${pick.combo.prob.toFixed(1)}%`}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })()}

                            {/* ヘッダー */}
                            <div className="grid text-xs px-2 gap-1" style={{ gridTemplateColumns: "28px minmax(5.5rem, 1fr) 56px 44px 46px 68px", color: "var(--muted)" }}>
                              <span></span>
                              <span>選手</span>
                              <span className="text-right">全国率</span>
                              <span className="text-right">ST</span>
                              <span className="text-right">展示</span>
                              <span className="text-right">スコア</span>
                            </div>

                            {/* 選手リスト */}
                            {sorted.map((racer, rank) => {
                              const scoreRatio = racer.prediction_score / maxScore;
                              const isWinner = race.result_1st === racer.boat_no;
                              const honmeiBoat2 = sorted[0].boat_no;
                              const taikouBoat2 = sorted[1].boat_no;
                              const topTwo2 = new Set([honmeiBoat2, taikouBoat2]);
                              const allTrifectas2 = calcTrifecta(racers, 120);
                              const anaBoat2 = allTrifectas2.find(t => !topTwo2.has(t.boats[0]))?.boats[0] ?? null;
                              const pickSymbol = racer.boat_no === honmeiBoat2 ? "◎" : racer.boat_no === taikouBoat2 ? "○" : racer.boat_no === anaBoat2 ? "△" : null;
                              const pickColor  = racer.boat_no === honmeiBoat2 ? "var(--cyan)" : racer.boat_no === taikouBoat2 ? "#9BB3CC" : "#FFA040";

                              return (
                                <div
                                  key={racer.boat_no}
                                  className="rounded-lg px-2 py-2 relative overflow-hidden"
                                  style={{
                                    background: rank === 0 ? "rgba(0,212,255,0.06)" : "var(--navy)",
                                    border: `1px solid ${isWinner ? "var(--cyan)" : "transparent"}`,
                                  }}
                                >
                                  <div className="grid items-start gap-1 relative z-10" style={{ gridTemplateColumns: "28px minmax(5.5rem, 1fr) 56px 44px 46px 68px" }}>
                                    {/* 号艇 */}
                                    <span
                                      className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold"
                                      style={{ background: LANE_COLORS[racer.boat_no - 1], color: LANE_TEXT[racer.boat_no - 1] }}
                                    >
                                      {racer.boat_no}
                                    </span>

                                    {/* 選手名 */}
                                    <div>
                                      <div className="flex items-center gap-1">
                                        <button
                                          className="text-xs font-medium leading-tight text-left underline-offset-2 hover:underline whitespace-nowrap"
                                          style={{ color: "var(--cyan)" }}
                                          onClick={(e) => { e.stopPropagation(); setSelectedRacer(racer); }}
                                        >
                                          {racer.racer_name}
                                        </button>
                                        <span
                                          className="text-xs px-1 rounded"
                                          style={{
                                            background: racer.grade === "A1" ? "#FFD700" : racer.grade === "A2" ? "#C0C0C0" : racer.grade === "B1" ? "#4A9EFF" : "#666",
                                            color: racer.grade === "A1" || racer.grade === "A2" ? "#000" : "#fff",
                                            fontSize: "10px",
                                          }}
                                        >
                                          {racer.grade}
                                        </span>
                                        {racer.f_count > 0 && (
                                          <span className="text-xs" style={{ color: "#FF5252", fontSize: "10px" }}>F{racer.f_count}</span>
                                        )}
                                      </div>
                                      {/* スコアバー + 予想シンボル */}
                                      <div className="flex items-center gap-1 mt-1">
                                        {pickSymbol && (
                                          <span className="font-bold flex-shrink-0" style={{ color: pickColor, fontSize: "9px", lineHeight: 1 }}>{pickSymbol}</span>
                                        )}
                                        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                                          <div
                                            className="h-full rounded-full transition-all duration-700"
                                            style={{ width: `${scoreRatio * 100}%`, background: rank === 0 ? "var(--cyan)" : "var(--cyan-dim)", opacity: 0.7 + scoreRatio * 0.3 }}
                                          />
                                        </div>
                                      </div>
                                    </div>

                                    {/* 全国勝率 */}
                                    <span className="text-xs text-right tabular-nums" style={{ color: "var(--muted)" }}>
                                      {racer.national_win_rate?.toFixed(2) ?? "-"}
                                    </span>

                                    {/* 平均ST */}
                                    <span className="text-xs text-right tabular-nums" style={{ color: "var(--muted)" }}>
                                      {racer.avg_st > 0 ? racer.avg_st.toFixed(2) : "-"}
                                    </span>

                                    {/* 展示タイム */}
                                    <span className="text-xs text-right tabular-nums" style={{ color: racer.exhibition_time > 0 ? "var(--foreground)" : "var(--muted)" }}>
                                      {racer.exhibition_time > 0 ? racer.exhibition_time.toFixed(2) : "-"}
                                    </span>

                                    {/* AIスコア */}
                                    <span
                                      className="text-xs font-bold text-right tabular-nums"
                                      style={{ color: rank === 0 ? "var(--cyan)" : "var(--foreground)" }}
                                    >
                                      {racer.prediction_score.toFixed(1)}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()
                    }
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 免責 */}
      <p className="text-xs text-center mt-8" style={{ color: "var(--muted)" }}>
        ※ AIスコアは参考情報です。投票判断はご自身の責任でお願いします。
      </p>

      {/* 選手詳細ドロワー */}
      <RacerDrawer racer={selectedRacer} onClose={() => setSelectedRacer(null)} />
    </div>
  );
}
