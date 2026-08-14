import { createStore, entries, get, set, del } from "idb-keyval";

// Local "photo library" (stands in for iOS PhotoKit while testing in the
// browser). The server never sees the image itself, only its hash — so the
// exported, watermark-baked-in photo lives only here, on-device.

export interface HistoryEntry {
  id: string;
  capturedAt: string;
  registeredAt: string;
  hash: string;
  signature: string;
  verifyUrl: string;
  favorite: boolean;
  imageBlob: Blob;
}

const historyStore = createStore("mukakou-shomei-shashin", "history");

export async function saveHistoryEntry(entry: HistoryEntry): Promise<void> {
  await set(entry.id, entry, historyStore);
}

export async function getHistoryEntry(id: string): Promise<HistoryEntry | undefined> {
  return get(id, historyStore);
}

export async function listHistoryEntries(): Promise<HistoryEntry[]> {
  const all = await entries<string, HistoryEntry>(historyStore);
  return all
    .map(([, value]) => value)
    .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
}

export async function setFavorite(id: string, favorite: boolean): Promise<void> {
  const entry = await getHistoryEntry(id);
  if (!entry) return;
  await saveHistoryEntry({ ...entry, favorite });
}

export async function deleteHistoryEntry(id: string): Promise<void> {
  await del(id, historyStore);
}
