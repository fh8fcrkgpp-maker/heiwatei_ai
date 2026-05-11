import Link from "next/link";

const features = [
  {
    icon: "🤖",
    title: "AIスコア予想",
    desc: "全国勝率・当地勝率・展示タイム・ST等を独自アルゴリズムで数値化。6艇を即座に比較。",
  },
  {
    icon: "⚡",
    title: "リアルタイム更新",
    desc: "当日の展示タイム・天候・オッズを自動取得。レース前の最新情報をそのまま反映。",
  },
  {
    icon: "🏟️",
    title: "平和島特化",
    desc: "平和島競艇場のコース特性・有利不利をAIが加味。1コースのスタート優位を正確に反映。",
  },
  {
    icon: "📊",
    title: "全レース一覧",
    desc: "当日12レースをまとめて確認。結果が出たレースはリアルタイムで着順バッジを表示。",
  },
];

const steps = [
  { step: "01", text: "「AI予想」ページを開く" },
  { step: "02", text: "当日のレースから気になるレースを選択" },
  { step: "03", text: "AIスコア・展示タイム・オッズを確認" },
  { step: "04", text: "スコア上位艇を参考に購入判断" },
];

export default function Home() {
  return (
    <>
      {/* ヒーローセクション */}
      <section className="bg-hero min-h-[85vh] flex flex-col items-center justify-center px-4 text-center relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          <div className="absolute top-1/3 left-0 right-0 h-px opacity-10" style={{ background: "linear-gradient(90deg, transparent, var(--cyan), transparent)" }} />
          <div className="absolute top-2/3 left-0 right-0 h-px opacity-5" style={{ background: "linear-gradient(90deg, transparent, var(--cyan), transparent)" }} />
        </div>

        <div className="max-w-2xl mx-auto">
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium mb-6"
            style={{ background: "rgba(0,212,255,0.1)", color: "var(--cyan)", border: "1px solid rgba(0,212,255,0.3)" }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current pulse-cyan" />
            平和島競艇場 対応
          </span>

          <h1 className="text-4xl sm:text-5xl font-bold leading-tight mb-4" style={{ color: "var(--foreground)" }}>
            AIが選ぶ、<br />
            <span style={{ color: "var(--cyan)" }}>今日の本命艇</span>
          </h1>

          <p className="text-lg mb-8 leading-relaxed" style={{ color: "var(--muted)" }}>
            平和島ボートレースの出走データをAIがリアルタイム解析。<br />
            展示タイム・勝率・コース特性を総合スコアで可視化します。
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/app"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-semibold text-sm transition-all hover:opacity-90 active:scale-95"
              style={{ background: "var(--cyan)", color: "#0B1F3A" }}
            >
              今日の予想を見る →
            </Link>
            <a
              href="#features"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-semibold text-sm transition-all hover:opacity-90"
              style={{ border: "1px solid var(--border)", color: "var(--foreground)", background: "rgba(255,255,255,0.04)" }}
            >
              サービスを詳しく見る
            </a>
          </div>
        </div>

        <div className="absolute bottom-8 left-0 right-0 flex justify-center">
          <div className="flex flex-col items-center gap-1 opacity-40">
            <span className="text-xs" style={{ color: "var(--muted)" }}>scroll</span>
            <span style={{ color: "var(--cyan)" }}>↓</span>
          </div>
        </div>
      </section>

      {/* 特徴セクション */}
      <section id="features" className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-3" style={{ color: "var(--foreground)" }}>
              平和艇AIの特徴
            </h2>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              データに基づいた客観的スコアで、勝負艇選びをサポートします
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {features.map((f) => (
              <div key={f.title} className="card-glow rounded-xl p-6">
                <div className="text-3xl mb-3">{f.icon}</div>
                <h3 className="font-semibold text-base mb-2" style={{ color: "var(--foreground)" }}>
                  {f.title}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 使い方セクション */}
      <section className="py-20 px-4" style={{ background: "rgba(0,0,0,0.2)" }}>
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-12" style={{ color: "var(--foreground)" }}>
            使い方
          </h2>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {steps.map((s, i) => (
              <div key={s.step} className="flex-1 relative">
                {i < steps.length - 1 && (
                  <div className="hidden sm:block absolute top-6 left-full w-4 z-10 text-center text-xs" style={{ color: "var(--muted)" }}>→</div>
                )}
                <div className="card-glow rounded-xl p-5 flex flex-col items-center gap-2">
                  <span className="text-2xl font-bold" style={{ color: "var(--cyan)" }}>{s.step}</span>
                  <p className="text-sm text-center" style={{ color: "var(--muted)" }}>{s.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTAセクション */}
      <section className="py-20 px-4">
        <div className="max-w-xl mx-auto text-center card-glow rounded-2xl p-10">
          <h2 className="text-2xl font-bold mb-3" style={{ color: "var(--foreground)" }}>
            今すぐ無料で使う
          </h2>
          <p className="text-sm mb-6" style={{ color: "var(--muted)" }}>
            会員登録不要。今日のレースをすぐに確認できます。
          </p>
          <Link
            href="/app"
            className="inline-flex items-center justify-center gap-2 px-8 py-3 rounded-lg font-semibold text-sm transition-all hover:opacity-90 active:scale-95"
            style={{ background: "var(--cyan)", color: "#0B1F3A" }}
          >
            AI予想を見る →
          </Link>
        </div>
      </section>
    </>
  );
}
