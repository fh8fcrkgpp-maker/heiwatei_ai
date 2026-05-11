"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase, type Race, type Racer } from "@/lib/supabase";

const LANE_COLORS = ["#E53935", "#1565C0", "#F9A825", "#2E7D32", "#E0E0E0", "#6A1B9A"];
const LANE_TEXT = ["#fff", "#fff", "#000", "#fff", "#000", "#fff"];
const WEATHER_ICON: Record<string, string> = {
  晴: "☀️", 曇: "☁️", 雨: "🌧️", 雪: "❄️",
};

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
  const [races, setRaces] = useState<Race[]>([]);
  const [selectedRace, setSelectedRace] = useState<number | null>(null);
  const [racers, setRacers] = useState<Racer[]>([]);
  const [loadingRaces, setLoadingRaces] = useState(true);
  const [loadingRacers, setLoadingRacers] = useState(false);

  const fetchRaces = useCallback(async (d: Date) => {
    setLoadingRaces(true);
    setSelectedRace(null);
    setRacers([]);
    const { data } = await supabase
      .from("races")
      .select("*")
      .eq("race_date", toDateStr(d))
      .order("race_no");
    setRaces(data ?? []);
    setLoadingRaces(false);
  }, []);

  const fetchRacers = useCallback(async (raceNo: number) => {
    setLoadingRacers(true);
    const { data } = await supabase
      .from("racers")
      .select("*")
      .eq("race_date", toDateStr(date))
      .eq("race_no", raceNo)
      .order("boat_no");
    setRacers(data ?? []);
    setLoadingRacers(false);
  }, [date]);

  useEffect(() => { fetchRaces(date); }, [date, fetchRaces]);

  const handleSelectRace = (raceNo: number) => {
    if (selectedRace === raceNo) {
      setSelectedRace(null);
      setRacers([]);
    } else {
      setSelectedRace(raceNo);
      fetchRacers(raceNo);
    }
  };

  const maxScore = racers.length > 0 ? Math.max(...racers.map((r) => r.prediction_score)) : 1;

  const today = new Date();
  const isToday = toDateStr(date) === toDateStr(today);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
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
          <h1 className="font-bold text-lg" style={{ color: "var(--foreground)" }}>{formatDate(date)}</h1>
          <div className="flex items-center justify-center gap-2 mt-0.5">
            <p className="text-xs" style={{ color: "var(--muted)" }}>平和島ボートレース場</p>
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
            const hasResult = race.result_1st != null;

            return (
              <div key={race.race_no} className="rounded-xl overflow-hidden" style={{ border: `1px solid ${isOpen ? "var(--cyan)" : "var(--border)"}`, background: "var(--card)" }}>
                {/* レースヘッダー */}
                <button
                  onClick={() => handleSelectRace(race.race_no)}
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
                        <span className="text-xs flex-shrink-0" style={{ color: "var(--muted)" }}>{race.deadline}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
                      {race.weather && <span>{WEATHER_ICON[race.weather] ?? "🌤️"} {race.weather}</span>}
                      {race.wind_speed != null && <span>風{race.wind_speed}m</span>}
                      {race.wave_height != null && <span>波{race.wave_height}cm</span>}
                    </div>
                  </div>

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
                    ) : (
                      <div className="flex flex-col gap-2">
                        {/* ヘッダー */}
                        <div className="grid text-xs mb-1 px-1" style={{ gridTemplateColumns: "28px 1fr 60px 48px 48px 60px", color: "var(--muted)" }}>
                          <span></span>
                          <span>選手</span>
                          <span className="text-right">全国率</span>
                          <span className="text-right">ST</span>
                          <span className="text-right">展示</span>
                          <span className="text-right">スコア</span>
                        </div>

                        {[...racers]
                          .sort((a, b) => b.prediction_score - a.prediction_score)
                          .map((racer, rank) => {
                            const scoreRatio = racer.prediction_score / maxScore;
                            const isWinner = race.result_1st === racer.boat_no;

                            return (
                              <div
                                key={racer.boat_no}
                                className="rounded-lg px-2 py-2 relative overflow-hidden"
                                style={{
                                  background: rank === 0 ? "rgba(0,212,255,0.06)" : "var(--navy)",
                                  border: `1px solid ${isWinner ? "var(--cyan)" : "transparent"}`,
                                }}
                              >
                                <div className="grid items-center gap-1 relative z-10" style={{ gridTemplateColumns: "28px 1fr 60px 48px 48px 60px" }}>
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
                                      <span className="text-sm font-medium leading-tight" style={{ color: "var(--foreground)" }}>
                                        {racer.racer_name}
                                      </span>
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
                                    {/* スコアバー */}
                                    <div className="mt-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                                      <div
                                        className="h-full rounded-full transition-all duration-700"
                                        style={{ width: `${scoreRatio * 100}%`, background: rank === 0 ? "var(--cyan)" : "var(--cyan-dim)", opacity: 0.7 + scoreRatio * 0.3 }}
                                      />
                                    </div>
                                  </div>

                                  {/* 全国勝率 */}
                                  <span className="text-xs text-right" style={{ color: "var(--muted)" }}>
                                    {racer.national_win_rate?.toFixed(2) ?? "-"}
                                  </span>

                                  {/* 平均ST */}
                                  <span className="text-xs text-right" style={{ color: "var(--muted)" }}>
                                    {racer.avg_st > 0 ? racer.avg_st.toFixed(2) : "-"}
                                  </span>

                                  {/* 展示タイム */}
                                  <span className="text-xs text-right" style={{ color: racer.exhibition_time > 0 ? "var(--foreground)" : "var(--muted)" }}>
                                    {racer.exhibition_time > 0 ? racer.exhibition_time.toFixed(2) : "-"}
                                  </span>

                                  {/* AIスコア */}
                                  <span
                                    className="text-sm font-bold text-right"
                                    style={{ color: rank === 0 ? "var(--cyan)" : "var(--foreground)" }}
                                  >
                                    {racer.prediction_score.toFixed(1)}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    )}
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
    </div>
  );
}
