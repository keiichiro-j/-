import { brandMarkInnerSvg } from "@/lib/brandMark";

/** The "UNEDITED" brand mark: an aperture-blade ring (camera) with a
 * checkmark (verified) at its center. Renders via the same geometry used
 * to bake the mark into the exported photo's watermark (lib/watermark.ts). */
export default function BrandMark({
  className,
  color = "currentColor",
}: {
  className?: string;
  color?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="UNEDITED"
      // Safe: brandMarkInnerSvg only ever emits our own static, parameter-free shape data.
      dangerouslySetInnerHTML={{ __html: brandMarkInnerSvg(color) }}
    />
  );
}
