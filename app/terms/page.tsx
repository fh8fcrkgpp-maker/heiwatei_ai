export const metadata = {
  title: "利用規約 | 平和艇AI",
};

export default function TermsPage() {
  const sections = [
    {
      title: "第1条（本サービスについて）",
      body: `平和艇AI（以下「本サービス」）は、平和島ボートレース場の出走情報をもとにAIが予想スコアを算出・表示するウェブサービスです。本サービスは情報提供のみを目的としており、投票や購入を推奨するものではありません。`,
    },
    {
      title: "第2条（免責事項）",
      body: `本サービスが提供するAI予想スコアおよびすべての情報は参考情報であり、的中・利益を保証するものではありません。本サービスを利用して生じた損害について、運営者は一切の責任を負いません。ボートレースの投票はご自身の判断と責任において行ってください。`,
    },
    {
      title: "第3条（禁止事項）",
      body: `以下の行為を禁止します。
・本サービスのデータを無断で商業目的に転用する行為
・本サービスのシステムへの不正アクセスまたはその試み
・本サービスの運営を妨害する行為
・その他、法令または公序良俗に違反する行為`,
    },
    {
      title: "第4条（知的財産権）",
      body: `本サービスのデザイン・ソースコード・AI予想アルゴリズムに関する知的財産権は運営者に帰属します。ボートレース公式データはBoatrace Open API（MITライセンス）に基づき利用しています。`,
    },
    {
      title: "第5条（サービスの変更・停止）",
      body: `運営者は、事前通知なくサービスの内容を変更または停止できるものとします。これによりユーザーに生じた損害について、運営者は責任を負いません。`,
    },
    {
      title: "第6条（準拠法・管轄裁判所）",
      body: `本規約は日本法に準拠します。本サービスに関する紛争は、東京地方裁判所を第一審の専属的合意管轄裁判所とします。`,
    },
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold mb-2" style={{ color: "var(--foreground)" }}>利用規約</h1>
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
