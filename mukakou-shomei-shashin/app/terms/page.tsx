import type { Metadata } from "next";
import StaticPageLayout from "@/components/StaticPageLayout";

export const metadata: Metadata = {
  title: "利用規約 | 無加工証明写真",
};

const SECTIONS = [
  {
    heading: "第1条（適用）",
    body: "本規約は、「無加工証明写真」（以下「本アプリ」）の利用に関する条件を、本アプリを利用するすべてのユーザーと運営者との間で定めるものです。",
  },
  {
    heading: "第2条（本アプリが証明する内容）",
    body: "本アプリが証明できるのは「本アプリのカメラで撮影後に画像データが改変されていないこと」であり、「被写体の実際の容姿・状態を保証すること」ではありません。他の画面や印刷物を撮影する等、技術的に防止できない経路が存在することにユーザーは同意するものとします。",
  },
  {
    heading: "第3条（禁止事項）",
    body: "ユーザーは、他者の証明情報を偽って自身のものと主張する行為、証明情報の改ざん・不正な生成を試みる行為、その他本アプリの運営を妨げる行為を行ってはなりません。",
  },
  {
    heading: "第4条（免責事項）",
    body: "運営者は、本アプリの利用により生じた損害について、法令上許容される範囲で責任を負わないものとします。",
  },
  {
    heading: "第5条（規約の変更）",
    body: "運営者は、必要と判断した場合、ユーザーへの事前通知なく本規約を変更できるものとします。",
  },
];

export default function TermsPage() {
  return (
    <StaticPageLayout title="利用規約">
      <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-[10.5px] text-amber-700">
        本ページは動作確認用のプレースホルダーです。正式リリース前に法務担当者による確認・正式な条文への差し替えが必要です。
      </p>
      {SECTIONS.map((s) => (
        <section key={s.heading}>
          <h2 className="mb-1 text-[12px] font-bold">{s.heading}</h2>
          <p>{s.body}</p>
        </section>
      ))}
    </StaticPageLayout>
  );
}
