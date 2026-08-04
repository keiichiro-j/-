'use client';

import { useCallback, useEffect, useState } from 'react';
import * as db from './db';
import type { MealEntry, Settings, WeightEntry } from './types';
import { DEFAULT_SETTINGS } from './types';

export function useMeals() {
  const [meals, setMeals] = useState<MealEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await db.listMeals();
      setMeals(list);
      setError(null);
    } catch (err) {
      console.error('Failed to load meals', err);
      setError('食事記録の読み込みに失敗しました。ページを再読み込みしてください。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { meals, loading, error, refresh };
}

export function useWeights() {
  const [weights, setWeights] = useState<WeightEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await db.listWeights();
      setWeights(list);
      setError(null);
    } catch (err) {
      console.error('Failed to load weights', err);
      setError('体重記録の読み込みに失敗しました。ページを再読み込みしてください。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { weights, loading, error, refresh };
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const s = await db.getSettings();
      setSettings(s);
    } catch (err) {
      console.error('Failed to load settings', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const update = useCallback(async (next: Settings) => {
    setSettings(next);
    await db.saveSettings(next);
  }, []);

  return { settings, loading, update, refresh };
}
