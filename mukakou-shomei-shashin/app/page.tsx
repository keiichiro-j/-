"use client";

import { useState } from "react";
import PhoneFrame from "@/components/PhoneFrame";
import TabBar from "@/components/TabBar";
import CaptureFlow from "@/components/CaptureFlow";
import HistoryScreen from "@/components/HistoryScreen";
import SettingsScreen from "@/components/SettingsScreen";
import DetailScreen from "@/components/DetailScreen";
import { TabKey } from "@/lib/types";

export default function Home() {
  const [tab, setTab] = useState<TabKey>("camera");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [captureFullScreen, setCaptureFullScreen] = useState(false);

  const showTabBar = !detailId && !(tab === "camera" && captureFullScreen);

  return (
    <PhoneFrame>
      {detailId ? (
        <DetailScreen id={detailId} onBack={() => setDetailId(null)} />
      ) : (
        <>
          {tab === "camera" && (
            <CaptureFlow
              onOpenHistory={() => setTab("history")}
              onOpenDetail={(id) => setDetailId(id)}
              onFullScreenChange={setCaptureFullScreen}
            />
          )}
          {tab === "history" && <HistoryScreen onOpenDetail={(id) => setDetailId(id)} />}
          {tab === "settings" && <SettingsScreen />}
        </>
      )}
      {showTabBar && <TabBar active={tab} onChange={setTab} />}
    </PhoneFrame>
  );
}
