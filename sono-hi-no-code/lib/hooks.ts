'use client';

import { useCallback, useEffect, useState } from 'react';
import * as db from './db';
import type { ClothingItem, Outfit, UserProfile } from './types';

export function useClothingItems() {
  const [items, setItems] = useState<ClothingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await db.listClothingItems();
      setItems(list);
      setError(null);
    } catch (err) {
      console.error('Failed to load clothing items', err);
      setError('クローゼットの読み込みに失敗しました。ページを再読み込みしてください。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { items, loading, error, refresh };
}

export function useOutfits() {
  const [outfits, setOutfits] = useState<Outfit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await db.listOutfits();
      setOutfits(list);
      setError(null);
    } catch (err) {
      console.error('Failed to load outfits', err);
      setError('履歴の読み込みに失敗しました。ページを再読み込みしてください。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { outfits, loading, error, refresh };
}

export function useProfile() {
  const [profile, setProfile] = useState<UserProfile | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const p = await db.getProfile();
      setProfile(p);
      setError(null);
    } catch (err) {
      console.error('Failed to load profile', err);
      setError('プロフィールの読み込みに失敗しました。ページを再読み込みしてください。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { profile, loading, error, refresh };
}
