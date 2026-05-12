import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "平和艇AI — 平和島ボートレース AI予想";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0B1F3A 0%, #060F1E 100%)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* 背景グロー */}
        <div
          style={{
            position: "absolute",
            top: -100,
            right: -100,
            width: 600,
            height: 600,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(0,212,255,0.12) 0%, transparent 70%)",
          }}
        />

        {/* 波形ライン */}
        <div
          style={{
            position: "absolute",
            bottom: 80,
            left: 0,
            right: 0,
            height: 2,
            background: "linear-gradient(90deg, transparent, rgba(0,212,255,0.3), transparent)",
          }}
        />

        {/* ロゴ */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
          <span style={{ fontSize: 72, fontWeight: 900, color: "#00D4FF" }}>平和艇</span>
          <span style={{ fontSize: 72, fontWeight: 900, color: "#E8F0FE" }}>AI</span>
        </div>

        {/* タグライン */}
        <div
          style={{
            fontSize: 28,
            color: "#8BA3C1",
            marginBottom: 48,
            letterSpacing: "0.05em",
          }}
        >
          平和島ボートレース AI予想サービス
        </div>

        {/* 特徴バッジ */}
        <div style={{ display: "flex", gap: 16 }}>
          {["AIスコア予想", "展示タイム分析", "コース特性補正"].map((label) => (
            <div
              key={label}
              style={{
                padding: "8px 20px",
                borderRadius: 24,
                border: "1px solid rgba(0,212,255,0.3)",
                background: "rgba(0,212,255,0.08)",
                color: "#00D4FF",
                fontSize: 20,
              }}
            >
              {label}
            </div>
          ))}
        </div>

        {/* URL */}
        <div
          style={{
            position: "absolute",
            bottom: 32,
            right: 48,
            fontSize: 18,
            color: "rgba(139,163,193,0.6)",
          }}
        >
          heiwatei.com
        </div>
      </div>
    ),
    { ...size }
  );
}
