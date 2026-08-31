import type { WeatherInfo } from './types';

const CACHE_KEY = 'sono-hi-no-code:weather-cache';
const TTL_MS = 20 * 60 * 1000;

interface WeatherCache {
  weather: WeatherInfo;
  locationLabel?: string;
  cachedAt: number;
}

export function readWeatherCache(): WeatherCache | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WeatherCache;
    if (Date.now() - parsed.cachedAt > TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeWeatherCache(weather: WeatherInfo, locationLabel?: string): void {
  if (typeof window === 'undefined') return;
  try {
    const cache: WeatherCache = { weather, locationLabel, cachedAt: Date.now() };
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // storage unavailable (private mode, quota, etc.); ignore
  }
}
