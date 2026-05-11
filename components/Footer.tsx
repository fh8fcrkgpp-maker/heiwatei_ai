import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t mt-16" style={{ borderColor: "var(--border)" }}>
      <div className="max-w-5xl mx-auto px-4 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <span className="font-bold" style={{ color: "var(--cyan)" }}>平和艇AI</span>
          <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
            平和島ボートレース AI予想サービス
          </p>
        </div>
        <nav className="flex items-center gap-4 text-xs" style={{ color: "var(--muted)" }}>
          <Link href="/terms" className="hover:underline">利用規約</Link>
          <Link href="/privacy" className="hover:underline">プライバシーポリシー</Link>
        </nav>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          © 2026 平和艇AI. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
