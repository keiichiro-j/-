import { createStore, get, set, del, keys } from 'idb-keyval';
import type { ClothingItem, Outfit, UserProfile } from './types';

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

export async function listClothingItems(): Promise<ClothingItem[]> {
  if (!closetStore) return [];
  const ks = await keys(closetStore);
  const items = await Promise.all(
    ks.map((k) => get<ClothingItem>(k, closetStore))
  );
  return items
    .filter((i): i is ClothingItem => Boolean(i))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveClothingItem(
  item: Omit<ClothingItem, 'id' | 'createdAt' | 'wearCount'> &
    Partial<Pick<ClothingItem, 'id' | 'createdAt' | 'wearCount'>>
): Promise<ClothingItem> {
  if (!closetStore) throw new Error('storage unavailable');
  const full: ClothingItem = {
    ...item,
    id: item.id ?? genId(),
    createdAt: item.createdAt ?? new Date().toISOString(),
    wearCount: item.wearCount ?? 0,
  };
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
