import Link from "next/link";
import BrandLogo from "./BrandLogo";
import { BackIcon } from "./icons";

export default function StaticPageLayout({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-dvh bg-zinc-100 px-6 py-10">
      <div className="mx-auto w-full max-w-xl rounded-xl border border-zinc-800 bg-white p-6 shadow-sm sm:p-8">
        <BrandLogo className="mb-6" />
        <Link href="/" className="mb-4 inline-flex items-center gap-1 text-[11px] text-zinc-500">
          <BackIcon className="h-3.5 w-3.5" />
          アプリのトップに戻る
        </Link>
        <h1 className="mb-4 text-[16px] font-bold">{title}</h1>
        <div className="space-y-4 text-[12px] leading-relaxed text-zinc-700">{children}</div>
      </div>
    </main>
  );
}
