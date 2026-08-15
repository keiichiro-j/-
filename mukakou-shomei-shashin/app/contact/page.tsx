import type { Metadata } from "next";
import StaticPageLayout from "@/components/StaticPageLayout";

export const metadata: Metadata = {
  title: "お問い合わせ | 無加工証明写真",
};

const CONTACT_EMAIL = "support@example.com";

export default function ContactPage() {
  return (
    <StaticPageLayout title="お問い合わせ">
      <p>
        アプリの不具合報告・ご意見・証明情報に関するお問い合わせは、以下のメールアドレスまでご連絡ください。
      </p>
      <div className="rounded-md border border-zinc-300 bg-zinc-50 p-3 text-center">
        <a href={`mailto:${CONTACT_EMAIL}`} className="font-bold text-zinc-900 underline">
          {CONTACT_EMAIL}
        </a>
      </div>
      <p className="text-[10.5px] text-zinc-400">
        ※ 現在は動作確認用のプレースホルダーのアドレスです。正式リリース時には運用チームの窓口に差し替えてください。
      </p>
      <p>お問い合わせの際は、可能であれば証明ID（例：UNEDITED-7F3A-92KD）を添えていただけると調査がスムーズです。</p>
    </StaticPageLayout>
  );
}
