"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Props = {
  open: boolean;
  selected: Date;
  onSelect: (d: Date) => void;
  onClose: () => void;
};

function toDateStr(d: Date) {
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

const WEEKS = ["日", "月", "火", "水", "木", "金", "土"];

export default function CalendarDrawer({ open, selected, onSelect, onClose }: Props) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(selected.getFullYear());
  const [viewMonth, setViewMonth] = useState(selected.getMonth());
  const [availableDates, setAvailableDates] = useState<Set<string>>(new Set());

  // 表示月が変わるたびにSupabaseからデータあり日付を取得
  useEffect(() => {
    const from = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(viewYear, viewMonth + 1, 0).getDate();
    const to = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${lastDay}`;

    supabase
      .from("races")
      .select("race_date")
      .gte("race_date", from)
      .lte("race_date", to)
      .then(({ data }) => {
        if (data) setAvailableDates(new Set(data.map((r) => r.race_date)));
      });
  }, [viewYear, viewMonth]);

  // selectedが変わったら表示月を同期
  useEffect(() => {
    setViewYear(selected.getFullYear());
    setViewMonth(selected.getMonth());
  }, [selected]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  // カレンダーのセル生成
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // 6行になるよう末尾をnullで埋める
  while (cells.length % 7 !== 0) cells.push(null);

  const selectedStr = toDateStr(selected);
  const todayStr = toDateStr(today);

  return (
    <>
      {/* オーバーレイ */}
      {open && (
        <div
          className="fixed inset-0 z-40"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={onClose}
        />
      )}

      {/* ドロワー */}
      <div
        className="fixed top-0 right-0 h-full z-50 flex flex-col"
        style={{
          width: "300px",
          background: "var(--navy-light)",
          borderLeft: "1px solid var(--border)",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.25s ease",
          boxShadow: open ? "-8px 0 32px rgba(0,0,0,0.4)" : "none",
        }}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-4 py-4 border-b" style={{ borderColor: "var(--border)" }}>
          <span className="font-bold text-sm" style={{ color: "var(--foreground)" }}>日付を選ぶ</span>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:opacity-70"
            style={{ color: "var(--muted)", background: "var(--card)" }}
          >
            ✕
          </button>
        </div>

        {/* 月ナビゲーション */}
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded hover:opacity-70" style={{ color: "var(--muted)" }}>‹</button>
          <span className="font-semibold text-sm" style={{ color: "var(--foreground)" }}>
            {viewYear}年{viewMonth + 1}月
          </span>
          <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded hover:opacity-70" style={{ color: "var(--muted)" }}>›</button>
        </div>

        {/* 曜日ヘッダー */}
        <div className="grid grid-cols-7 px-2 pb-1">
          {WEEKS.map((w, i) => (
            <div key={w} className="text-center text-xs py-1" style={{ color: i === 0 ? "#FF5252" : i === 6 ? "#4A9EFF" : "var(--muted)" }}>
              {w}
            </div>
          ))}
        </div>

        {/* 日付グリッド */}
        <div className="grid grid-cols-7 px-2 gap-y-1 flex-1">
          {cells.map((day, i) => {
            if (!day) return <div key={i} />;

            const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const isSelected = dateStr === selectedStr;
            const isToday = dateStr === todayStr;
            const hasData = availableDates.has(dateStr);
            const dow = i % 7;

            return (
              <button
                key={i}
                onClick={() => {
                  const d = new Date(viewYear, viewMonth, day);
                  onSelect(d);
                  onClose();
                }}
                className="relative flex flex-col items-center justify-center h-9 rounded-lg text-sm transition-all hover:opacity-80"
                style={{
                  background: isSelected ? "var(--cyan)" : isToday ? "rgba(0,212,255,0.12)" : "transparent",
                  color: isSelected ? "#0B1F3A" : dow === 0 ? "#FF5252" : dow === 6 ? "#4A9EFF" : hasData ? "var(--foreground)" : "var(--muted)",
                  fontWeight: isSelected || isToday ? "700" : "400",
                  border: isToday && !isSelected ? "1px solid rgba(0,212,255,0.4)" : "1px solid transparent",
                }}
              >
                {day}
                {/* データあり●マーカー */}
                {hasData && !isSelected && (
                  <span className="absolute bottom-1 w-1 h-1 rounded-full" style={{ background: "var(--cyan)" }} />
                )}
              </button>
            );
          })}
        </div>

        {/* 凡例 */}
        <div className="px-4 py-3 border-t flex items-center gap-3 text-xs" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--cyan)" }} />
            データあり
          </span>
          <span className="flex items-center gap-1">
            <span className="w-4 h-4 rounded flex items-center justify-center text-xs border" style={{ borderColor: "rgba(0,212,255,0.4)", color: "var(--cyan)" }}>今</span>
            今日
          </span>
        </div>
      </div>
    </>
  );
}
