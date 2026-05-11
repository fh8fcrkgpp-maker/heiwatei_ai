"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b" style={{ borderColor: "var(--border)", background: "rgba(11,31,58,0.92)", backdropFilter: "blur(12px)" }}>
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* ロゴ */}
        <Link href="/" className="flex items-center gap-2 group">
          <span className="text-xl font-bold tracking-tight" style={{ color: "var(--cyan)" }}>
            平和艇
          </span>
          <span className="text-xl font-bold tracking-tight" style={{ color: "var(--foreground)" }}>
            AI
          </span>
          {/* 波形アイコン */}
          <span className="flex items-end gap-0.5 ml-1 h-4">
            {[1, 1.5, 1, 0.6, 1.2].map((h, i) => (
              <span
                key={i}
                className="wave-bar inline-block w-0.5 rounded-sm"
                style={{
                  height: `${h * 10}px`,
                  background: "var(--cyan)",
                  animationDelay: `${i * 0.15}s`,
                  opacity: 0.8,
                }}
              />
            ))}
          </span>
        </Link>

        {/* ナビゲーション */}
        <nav className="flex items-center gap-1">
          <Link
            href="/"
            className="px-3 py-1.5 rounded-md text-sm transition-colors"
            style={{
              color: pathname === "/" ? "var(--cyan)" : "var(--muted)",
              background: pathname === "/" ? "rgba(0,212,255,0.1)" : "transparent",
            }}
          >
            ホーム
          </Link>
          <Link
            href="/app"
            className="px-3 py-1.5 rounded-md text-sm transition-colors"
            style={{
              color: pathname === "/app" ? "var(--cyan)" : "var(--muted)",
              background: pathname === "/app" ? "rgba(0,212,255,0.1)" : "transparent",
            }}
          >
            AI予想
          </Link>
        </nav>
      </div>
    </header>
  );
}
