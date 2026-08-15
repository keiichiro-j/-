import BrandMark from "./BrandMark";

/** Mark + wordmark lockup. "UNEDITED" is the international wordmark (it
 * also matches the `UNEDITED-XXXX-XXXX` proof ID prefix), with the
 * Japanese app name as a subline for the domestic audience. */
export default function BrandLogo({
  className,
  markClassName = "h-6 w-6",
  subline = true,
}: {
  className?: string;
  markClassName?: string;
  subline?: boolean;
}) {
  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <BrandMark className={markClassName} />
      <div className="leading-tight">
        <div className="text-[13px] font-extrabold tracking-[0.12em]">UNEDITED</div>
        {subline && <div className="text-[9px] text-zinc-500">無加工証明写真</div>}
      </div>
    </div>
  );
}
