import { TabKey } from "@/lib/types";
import { CameraIcon, HistoryIcon, SettingsIcon } from "./icons";

const TABS: { key: TabKey; label: string; Icon: typeof CameraIcon }[] = [
  { key: "camera", label: "撮影", Icon: CameraIcon },
  { key: "history", label: "履歴", Icon: HistoryIcon },
  { key: "settings", label: "設定", Icon: SettingsIcon },
];

export default function TabBar({
  active,
  onChange,
}: {
  active: TabKey;
  onChange: (tab: TabKey) => void;
}) {
  return (
    <nav className="flex items-center justify-around border-t border-zinc-800 bg-white py-2">
      {TABS.map(({ key, label, Icon }) => {
        const isActive = key === active;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className="flex flex-col items-center gap-1 px-4 py-1 text-[10px] text-zinc-500"
            aria-current={isActive}
          >
            <Icon className={`h-5 w-5 ${isActive ? "text-zinc-900" : "text-zinc-400"}`} />
            <span className={isActive ? "font-bold text-zinc-900" : ""}>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
