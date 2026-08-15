import type { Metadata } from "next";
import StaticPageLayout from "@/components/StaticPageLayout";

export const metadata: Metadata = {
  title: "プライバシーポリシー | 無加工証明写真",
};

const SECTIONS = [
  {
    heading: "1. 取得する情報",
    body: "本アプリは、撮影した画像データそのものをサーバーへ送信・保存しません。サーバーに保存されるのは、証明ID・画像のハッシュ値（SHA-256）・電子署名・撮影日時のみです。撮影した画像ファイル自体は、お使いの端末（ブラウザ）内にのみ保存されます。",
  },
  {
    heading: "2. 利用目的",
    body: "取得した情報は、証明情報の発行・第三者による検証（QRコード／証明IDからの照会）の提供のみに利用します。",
  },
  {
    heading: "3. 第三者提供",
    body: "法令に基づく場合を除き、取得した情報を本人の同意なく第三者へ提供することはありません。",
  },
  {
    heading: "4. 検証ページについて",
    body: "証明ID・QRコードを知る第三者は、検証ページ（/verify）から証明ID・撮影日時・署名検証結果を閲覧できます。これらは画像の真正性を検証するために意図的に公開される情報です。",
  },
  {
    heading: "5. お問い合わせ窓口",
    body: "本ポリシーに関するお問い合わせは「お問い合わせ」ページの連絡先までご連絡ください。",
  },
];

export default function PrivacyPage() {
  return (
    <StaticPageLayout title="プライバシーポリシー">
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
