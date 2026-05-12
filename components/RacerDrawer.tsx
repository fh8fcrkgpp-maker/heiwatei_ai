"use client";

import { useEffect, useState } from "react";
import { supabase, type Racer } from "@/lib/supabase";

type RecentResult = {
  race_date: string;
  race_no: number;
  boat_no: number;
  finish: number | null;
};

type Props = {
  racer: Racer | null;
  onClose: () => void;
};

const LANE_COLORS = ["#FFFFFF", "#1A1A1A", "#E53935", "#1565C0", "#F9A825", "#2E7D32"];
const LANE_TEXT   = ["#000",   "#fff",    "#fff",    "#fff",    "#000",    "#fff"   ];

const FINISH_LABEL: Record<number, string> = { 1: "1着", 2: "2着", 3: "3着" };
const FINISH_COLOR: Record<number, string> = {
  1: "var(--cyan)",
  2: "#C0C0C0",
  3: "#CD7F32",
};

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg px-3 py-2 text-center" style={{ background: "var(--navy)", border: "1px solid var(--border)" }}>
      <p className="text-xs mb-0.5" style={{ color: "var(--muted)" }}>{label}</p>
      <p className="text-sm font-bold" style={{ color: "var(--foreground)" }}>{value}</p>
    </div>
  );
}

export default function RacerDrawer({ racer, onClose }: Props) {
  const [results, setResults] = useState<RecentResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!racer) return;
    setResults([]);
    setLoading(true);

    (async () => {
      // racer_name で直近レースを検索（最大20件、日付降順）
      const { data: racerRows } = await supabase
        .from("racers")
        .select("race_id, boat_no")
        .eq("racer_name", racer.racer_name)
        .order("race_id", { ascending: false })
        .limit(20);

      if (!racerRows?.length) { setLoading(false); return; }

      const raceIds = racerRows.map((r) => r.race_id);
      const { data: raceRows } = await supabase
        .from("races")
        .select("id, race_date, race_no, result_1st, result_2nd, result_3rd")
        .in("id", raceIds)
        .order("race_date", { ascending: false })
        .order("race_no",  { ascending: false });

      if (!raceRows) { setLoading(false); return; }

      const combined: RecentResult[] = raceRows.slice(0, 10).map((race) => {
        const racerRow = racerRows.find((r) => r.race_id === race.id);
        const bn = racerRow?.boat_no ?? 0;
        const finish =
          race.result_1st === bn ? 1 :
          race.result_2nd === bn ? 2 :
          race.result_3rd === bn ? 3 : null;
        return {
          race_date: race.race_date,
          race_no:   race.race_no,
          boat_no:   bn,
          finish,
        };
      });

      setResults(combined);
      setLoading(false);
    })();
  }, [racer]);

  if (!racer) return null;

  return (
    <>
      {/* オーバーレイ */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: "rgba(0,0,0,0.6)" }}
        onClick={onClose}
      />

      {/* ドロワー本体 */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl overflow-y-auto"
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          maxHeight: "80vh",
        }}
      >
        {/* ハンドル */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: "var(--border)" }} />
        </div>

        <div className="px-5 pb-8 pt-2">
          {/* ヘッダー */}
          <div className="flex items-center gap-3 mb-4">
            <span
              className="w-10 h-10 rounded-lg flex items-center justify-center text-base font-bold flex-shrink-0"
              style={{ background: LANE_COLORS[racer.boat_no - 1], color: LANE_TEXT[racer.boat_no - 1] }}
            >
              {racer.boat_no}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold" style={{ color: "var(--foreground)" }}>
                  {racer.racer_name}
                </span>
                <span
                  className="text-xs px-1.5 py-0.5 rounded font-bold"
                  style={{
                    background: racer.grade === "A1" ? "#FFD700" : racer.grade === "A2" ? "#C0C0C0" : racer.grade === "B1" ? "#4A9EFF" : "#666",
                    color: racer.grade === "A1" || racer.grade === "A2" ? "#000" : "#fff",
                  }}
                >
                  {racer.grade}
                </span>
                {racer.f_count > 0 && (
                  <span className="text-xs font-bold" style={{ color: "#FF5252" }}>F{racer.f_count}</span>
                )}
                {racer.l_count > 0 && (
                  <span className="text-xs font-bold" style={{ color: "#FF9800" }}>L{racer.l_count}</span>
                )}
              </div>
              <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                登録 {racer.racer_no}　体重 {racer.weight > 0 ? `${racer.weight}kg` : "-"}
              </p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-xs" style={{ color: "var(--muted)" }}>AIスコア</p>
              <p className="text-xl font-bold" style={{ color: "var(--cyan)" }}>
                {racer.prediction_score.toFixed(1)}
              </p>
            </div>
          </div>

          {/* 成績グリッド */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            <StatBox label="全国勝率"    value={racer.national_win_rate > 0 ? racer.national_win_rate.toFixed(2) : "-"} />
            <StatBox label="当地勝率"    value={racer.local_win_rate    > 0 ? racer.local_win_rate.toFixed(2)    : "-"} />
            <StatBox label="モーター2連" value={racer.motor_rate        > 0 ? `${racer.motor_rate.toFixed(1)}%`  : "-"} />
          </div>
          <div className="grid grid-cols-3 gap-2 mb-4">
            <StatBox label="平均ST"      value={racer.avg_st         > 0 ? racer.avg_st.toFixed(2)              : "-"} />
            <StatBox label="展示タイム"  value={racer.exhibition_time > 0 ? racer.exhibition_time.toFixed(2)     : "-"} />
            <StatBox label="今節平均着順" value={racer.season_avg_rank > 0 ? racer.season_avg_rank.toFixed(1)    : "-"} />
          </div>

          {/* 単勝オッズ */}
          {racer.win_odds > 0 && (
            <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg" style={{ background: "var(--navy)", border: "1px solid var(--border)" }}>
              <span className="text-xs" style={{ color: "var(--muted)" }}>単勝オッズ</span>
              <span className="text-base font-bold" style={{ color: "var(--foreground)" }}>{racer.win_odds.toFixed(1)} 倍</span>
            </div>
          )}

          {/* 直近成績 */}
          <p className="text-xs font-bold mb-2" style={{ color: "var(--cyan)" }}>直近の成績</p>
          {loading ? (
            <div className="flex flex-col gap-1.5">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-9 rounded-lg pulse-cyan" style={{ background: "var(--navy)" }} />
              ))}
            </div>
          ) : results.length === 0 ? (
            <p className="text-xs text-center py-4" style={{ color: "var(--muted)" }}>過去データなし</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {results.map((r, i) => {
                const md = r.race_date.slice(5).replace("-", "/");
                return (
                  <div
                    key={i}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg"
                    style={{ background: "var(--navy)", border: "1px solid var(--border)" }}
                  >
                    <span className="text-xs w-10 flex-shrink-0" style={{ color: "var(--muted)" }}>{md}</span>
                    <span className="text-xs flex-shrink-0" style={{ color: "var(--muted)" }}>{r.race_no}R</span>
                    <span
                      className="w-5 h-5 rounded flex items-center justify-center text-xs font-bold flex-shrink-0"
                      style={{ background: LANE_COLORS[r.boat_no - 1], color: LANE_TEXT[r.boat_no - 1] }}
                    >
                      {r.boat_no}
                    </span>
                    <span className="flex-1" />
                    {r.finish != null ? (
                      <span className="text-sm font-bold" style={{ color: FINISH_COLOR[r.finish] ?? "var(--muted)" }}>
                        {FINISH_LABEL[r.finish] ?? `${r.finish}着`}
                      </span>
                    ) : (
                      <span className="text-xs" style={{ color: "var(--muted)" }}>圏外</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
