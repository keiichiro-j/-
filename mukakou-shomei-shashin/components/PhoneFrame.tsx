export default function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center sm:py-8">
      <div
        className="flex flex-col w-full h-dvh bg-white text-zinc-900 overflow-hidden
                   sm:h-[780px] sm:w-[380px] sm:rounded-[2.5rem] sm:border-[3px] sm:border-zinc-800 sm:shadow-xl"
      >
        {children}
      </div>
    </div>
  );
}
