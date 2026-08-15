export function VerifyCard({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-start justify-center bg-zinc-100 p-6 sm:items-center">
      <div className="w-full max-w-sm rounded-xl border border-zinc-800 bg-white p-6 shadow-sm">{children}</div>
    </main>
  );
}

export function VerifyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-zinc-200 py-2 text-[11px]">
      <span className="text-zinc-400">{label}</span>
      <span className="font-bold">{value}</span>
    </div>
  );
}
