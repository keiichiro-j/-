import { createStore, get, set, del, keys, clear } from 'idb-keyval';
import type { BackupData, ClothingItem, Outfit, UserProfile } from './types';

// Each store gets its own database: idb-keyval's createStore() only creates
// the single object store it's given during that database's upgrade, so
// reusing one database name across multiple createStore() calls leaves the
// later stores missing (NotFoundError on transaction).
const closetStore =
  typeof window !== 'undefined'
    ? createStore('sono-hi-no-code-closet', 'closet')
    : undefined;
const outfitStore =
  typeof window !== 'undefined'
    ? createStore('sono-hi-no-code-outfits', 'outfits')
    : undefined;
const profileStore =
  typeof window !== 'undefined'
    ? createStore('sono-hi-no-code-profile', 'profile')
    : undefined;

function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

// Items saved before `season` became a multi-select array stored a single
// string value (e.g. "spring"). Normalize on read so old data keeps working
// instead of crashing array methods called on a string downstream.
function normalizeClothingItem(item: ClothingItem): ClothingItem {
  const rawSeason = item.season as unknown;
  const season = Array.isArray(rawSeason)
    ? rawSeason
    : rawSeason
      ? [rawSeason as ClothingItem['season'][number]]
      : ['all' as const];
  return { ...item, season };
}

export async function listClothingItems(): Promise<ClothingItem[]> {
  if (!closetStore) return [];
  const ks = await keys(closetStore);
  const items = await Promise.all(
    ks.map((k) => get<ClothingItem>(k, closetStore))
  );
  return items
    .filter((i): i is ClothingItem => Boolean(i))
    .map(normalizeClothingItem)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveClothingItem(
  item: Omit<ClothingItem, 'id' | 'createdAt' | 'wearCount'> &
    Partial<Pick<ClothingItem, 'id' | 'createdAt' | 'wearCount'>>
): Promise<ClothingItem> {
  if (!closetStore) throw new Error('storage unavailable');
  const full: ClothingItem = normalizeClothingItem({
    ...item,
    id: item.id ?? genId(),
    createdAt: item.createdAt ?? new Date().toISOString(),
    wearCount: item.wearCount ?? 0,
  });
  await set(full.id, full, closetStore);
  return full;
}

export async function deleteClothingItem(id: string): Promise<void> {
  if (!closetStore) return;
  await del(id, closetStore);
}

export async function listOutfits(): Promise<Outfit[]> {
  if (!outfitStore) return [];
  const ks = await keys(outfitStore);
  const items = await Promise.all(
    ks.map((k) => get<Outfit>(k, outfitStore))
  );
  return items
    .filter((i): i is Outfit => Boolean(i))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export async function saveOutfit(
  outfit: Omit<Outfit, 'id' | 'createdAt'> &
    Partial<Pick<Outfit, 'id' | 'createdAt'>>
): Promise<Outfit> {
  if (!outfitStore) throw new Error('storage unavailable');
  const full: Outfit = {
    ...outfit,
    id: outfit.id ?? genId(),
    createdAt: outfit.createdAt ?? new Date().toISOString(),
  };
  await set(full.id, full, outfitStore);
  return full;
}

export async function deleteOutfit(id: string): Promise<void> {
  if (!outfitStore) return;
  await del(id, outfitStore);
}

const PROFILE_KEY = 'me';

export async function getProfile(): Promise<UserProfile | undefined> {
  if (!profileStore) return undefined;
  return get<UserProfile>(PROFILE_KEY, profileStore);
}

export async function saveProfile(profile: UserProfile): Promise<UserProfile> {
  if (!profileStore) throw new Error('storage unavailable');
  const full: UserProfile = { ...profile, updatedAt: new Date().toISOString() };
  await set(PROFILE_KEY, full, profileStore);
  return full;
}

export async function clearAllData(): Promise<void> {
  await Promise.all(
    [closetStore, outfitStore, profileStore]
      .filter((store): store is NonNullable<typeof store> => Boolean(store))
      .map((store) => clear(store))
  );
}

export async function exportAllData(): Promise<BackupData> {
  const [closet, outfits, profile] = await Promise.all([
    listClothingItems(),
    listOutfits(),
    getProfile(),
  ]);
  return {
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    closet,
    outfits,
    profile,
  };
}

// Restores a previously exported backup, replacing all existing local data.
export async function importAllData(data: BackupData): Promise<void> {
  await clearAllData();
  for (const item of data.closet ?? []) {
    if (closetStore) await set(item.id, normalizeClothingItem(item), closetStore);
  }
  for (const outfit of data.outfits ?? []) {
    if (outfitStore) await set(outfit.id, outfit, outfitStore);
  }
  if (data.profile && profileStore) {
    await set(PROFILE_KEY, data.profile, profileStore);
  }
}
