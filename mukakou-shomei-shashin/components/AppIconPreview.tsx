import { appIconSvgMarkup } from "@/lib/brandMark";

/** Renders the polished, colored app-icon treatment (rounded-square
 * gradient + accent checkmark) — e.g. for a Settings screen preview of
 * what the icon will look like on a home screen / in the App Store. */
export default function AppIconPreview({ className }: { className?: string }) {
  return (
    <div
      className={className}
      style={{ borderRadius: "22%", overflow: "hidden", lineHeight: 0 }}
      // Safe: appIconSvgMarkup only ever emits our own static, parameter-free shape data.
      dangerouslySetInnerHTML={{ __html: appIconSvgMarkup({ size: 100 }) }}
    />
  );
}
