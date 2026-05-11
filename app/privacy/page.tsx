export const metadata = {
  title: "プライバシーポリシー | 平和艇AI",
};

export default function PrivacyPage() {
  const sections = [
    {
      title: "1. 取得する情報",
      body: `本サービスは以下の情報を取得する場合があります。
・アクセスログ（IPアドレス、ブラウザ情報、参照元URL）
・サービス利用状況（閲覧ページ、操作ログ）
・お問い合わせ時にご入力いただいた情報

本サービスは現在、会員登録機能を提供していないため、氏名・メールアドレス等の個人情報は原則として収集しません。`,
    },
    {
      title: "2. 情報の利用目的",
      body: `取得した情報は以下の目的に使用します。
・サービスの改善・品質向上
・アクセス解析・統計処理
・不正アクセスの検知・防止`,
    },
    {
      title: "3. 第三者への提供",
      body: `法令に基づく場合を除き、取得した情報を第三者に提供することはありません。`,
    },
    {
      title: "4. Cookieの利用",
      body: `本サービスはアクセス解析のためCookieを使用する場合があります。ブラウザの設定からCookieを無効にすることができますが、一部機能が制限される場合があります。`,
    },
    {
      title: "5. セキュリティ",
      body: `取得した情報は適切なセキュリティ対策を講じて管理します。ただし、インターネット上での完全な安全性を保証するものではありません。`,
    },
    {
      title: "6. プライバシーポリシーの変更",
      body: `本ポリシーは必要に応じて変更する場合があります。変更後のポリシーは本ページに掲載した時点で効力を生じます。`,
    },
    {
      title: "7. お問い合わせ",
      body: `個人情報の取り扱いに関するお問い合わせは、サービス内のお問い合わせフォームよりご連絡ください。`,
    },
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold mb-2" style={{ color: "var(--foreground)" }}>プライバシーポリシー</h1>
      <p className="text-sm mb-8" style={{ color: "var(--muted)" }}>最終更新日: 2026年5月11日</p>

      <div className="flex flex-col gap-8">
        {sections.map((s) => (
          <section key={s.title}>
            <h2 className="font-semibold mb-2" style={{ color: "var(--cyan)" }}>{s.title}</h2>
            <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: "var(--muted)" }}>{s.body}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
