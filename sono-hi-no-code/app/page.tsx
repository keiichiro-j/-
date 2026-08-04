'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import WeatherCard from '@/components/WeatherCard';
import OutfitCard from '@/components/OutfitCard';
import Link from 'next/link';
import { useClothingItems, useOutfits, useProfile } from '@/lib/hooks';
import * as db from '@/lib/db';
import { todayKey, formatDateJa } from '@/lib/date';
import { readWeatherCache, writeWeatherCache } from '@/lib/weatherCache';
import {
  TPO_LABEL,
  type ClothingItem,
  type OutfitSuggestion,
  type Tpo,
  type WeatherInfo,
} from '@/lib/types';
import clsx from 'clsx';

const TPOS = Object.keys(TPO_LABEL) as Tpo[];

export default function HomePage() {
  const { items, error: itemsError, refresh: refreshItems } = useClothingItems();
  const { outfits, refresh: refreshOutfits } = useOutfits();
  const { profile } = useProfile();

  // Starts null (matching the server-rendered skeleton) and is filled from
  // cache inside the effect below, since reading localStorage during the
  // lazy useState initializer would make the client's first render diverge
  // from the server's and trigger a hydration mismatch.
  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const [locationLabel, setLocationLabel] = useState<string | undefined>();
  const [tpo, setTpo] = useState<Tpo>('work');
  const [suggestions, setSuggestions] = useState<OutfitSuggestion[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestSource, setSuggestSource] = useState<'claude' | 'rule-based' | null>(null);

  const today = todayKey();
  const todaysOutfit = useMemo(() => outfits.find((o) => o.date === today), [outfits, today]);
  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const hasCore =
    items.some((i) => i.category === 'tops' && i.status === 'active') &&
    items.some((i) => i.category === 'bottoms' && i.status === 'active');

  const resolveItems = (ids: string[]): ClothingItem[] =>
    ids.map((id) => itemsById.get(id)).filter((i): i is ClothingItem => Boolean(i));

  async function fetchWeather(lat?: number, lon?: number) {
    const label = lat != null && lon != null ? '現在地' : profile?.homeLabel ?? '東京（デフォルト）';
    const params = new URLSearchParams();
    if (lat != null && lon != null) {
      params.set('lat', String(lat));
      params.set('lon', String(lon));
    }
    setLocationLabel(label);
    const res = await fetch(`/api/weather?${params.toString()}`);
    const data = (await res.json()) as WeatherInfo;
    setWeather(data);
    writeWeatherCache(data, label);
  }

  useEffect(() => {
    const cached = readWeatherCache();
    if (cached) {
      setWeather(cached.weather);
      setLocationLabel(cached.locationLabel);
    }

    if (!navigator.geolocation) {
      fetchWeather();
      return;
    }
    let settled = false;
    const resolveOnce = (lat?: number, lon?: number) => {
      if (settled) return;
      settled = true;
      fetchWeather(lat, lon);
    };
    // A left-unanswered permission prompt can leave getCurrentPosition's own
    // `timeout` unfired in some browsers, so this fallback guarantees the
    // weather (and therefore the suggestion flow) never hangs indefinitely.
    const safetyNet = setTimeout(() => resolveOnce(), 6000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(safetyNet);
        resolveOnce(pos.coords.latitude, pos.coords.longitude);
      },
      () => {
        clearTimeout(safetyNet);
        resolveOnce();
      },
      { timeout: 5000 }
    );
    return () => clearTimeout(safetyNet);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchSuggestions = useCallback(async () => {
    if (!weather || !hasCore) return;
    setSuggestLoading(true);
    try {
      const res = await fetch('/api/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, weather, tpo, history: outfits, profile, patternCount: 3 }),
      });
      const data = (await res.json()) as {
        suggestions: OutfitSuggestion[];
        source: 'claude' | 'rule-based';
      };
      setSuggestions(data.suggestions);
      setSuggestSource(data.source);
    } finally {
      setSuggestLoading(false);
    }
  }, [weather, hasCore, tpo, items, outfits, profile]);

  useEffect(() => {
    if (weather && hasCore && !todaysOutfit) {
      fetchSuggestions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weather, hasCore, tpo, todaysOutfit?.id]);

  const chooseOutfit = async (s: OutfitSuggestion) => {
    await db.saveOutfit({
      date: today,
      itemIds: s.itemIds,
      tpo,
      weatherSummary: weather?.description,
      reason: s.reason,
      feedback: null,
      isFavorite: false,
    });
    await Promise.all(
      s.itemIds.map((id) => {
        const item = itemsById.get(id);
        if (!item) return Promise.resolve();
        return db.saveClothingItem({ ...item, lastWornAt: today, wearCount: item.wearCount + 1 });
      })
    );
    await refreshItems();
    await refreshOutfits();
  };

  const setFeedback = async (feedback: 'good' | 'meh') => {
    if (!todaysOutfit) return;
    await db.saveOutfit({ ...todaysOutfit, feedback });
    await refreshOutfits();
  };

  const toggleFavorite = async () => {
    if (!todaysOutfit) return;
    await db.saveOutfit({ ...todaysOutfit, isFavorite: !todaysOutfit.isFavorite });
    await refreshOutfits();
  };

  const chooseAgain = async () => {
    if (!todaysOutfit) return;
    // Reverse the wear-count bump applied when this outfit was chosen, so
    // re-picking doesn't double-count wear stats for the same items.
    await Promise.all(
      todaysOutfit.itemIds.map((id) => {
        const item = itemsById.get(id);
        if (!item) return Promise.resolve();
        return db.saveClothingItem({
          ...item,
          wearCount: Math.max(0, item.wearCount - 1),
          lastWornAt: item.lastWornAt === today ? undefined : item.lastWornAt,
        });
      })
    );
    await db.deleteOutfit(todaysOutfit.id);
    await refreshItems();
    await refreshOutfits();
  };

  return (
    <div>
      <PageHeader
        eyebrow={formatDateJa(today)}
        title="今日のおすすめ"
        subtitle="AIがベストな一着を提案します"
        emphasize
        mark={<TodayMark />}
      />

      <div className="flex flex-col gap-4 px-5 pb-8">
        {itemsError && (
          <div className="rounded-lg border border-danger-border bg-danger-bg px-3 py-2.5 text-xs text-danger-text">
            {itemsError}
          </div>
        )}
        <WeatherCard weather={weather} locationLabel={locationLabel} />

        <div className="scrollbar-none flex gap-2 overflow-x-auto">
          {TPOS.map((t) => (
            <button
              key={t}
              onClick={() => setTpo(t)}
              disabled={!!todaysOutfit}
              className={clsx(
                'shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold disabled:opacity-60',
                tpo === t
                  ? 'border-transparent brand-gradient text-white'
                  : 'border-text/10 bg-text/5 text-text-muted'
              )}
            >
              {TPO_LABEL[t]}
            </button>
          ))}
        </div>

        {!hasCore ? (
          <div className="glass-card flex flex-col items-center gap-3 rounded-lg px-6 py-10 text-center">
            <span className="text-4xl">🧺</span>
            <p className="text-sm font-semibold text-text">
              トップスとボトムスを1着ずつ登録すると提案が始まります
            </p>
            <Link
              href="/closet"
              className="brand-gradient mt-1 rounded-full px-5 py-2 text-xs font-bold text-white"
            >
              ワードローブに追加する
            </Link>
          </div>
        ) : todaysOutfit ? (
          <OutfitCard
            highlight
            items={resolveItems(todaysOutfit.itemIds)}
            reason={todaysOutfit.reason}
            footer={
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setFeedback('good')}
                    className={clsx(
                      'flex-1 rounded-xl py-2.5 text-xs font-bold transition-colors',
                      todaysOutfit.feedback === 'good'
                        ? 'bg-[var(--success)] text-white'
                        : 'border border-text/10 bg-text/5 text-text-muted'
                    )}
                  >
                    良い 👍
                  </button>
                  <button
                    onClick={() => setFeedback('meh')}
                    className={clsx(
                      'flex-1 rounded-xl py-2.5 text-xs font-bold transition-colors',
                      todaysOutfit.feedback === 'meh'
                        ? 'bg-[var(--warn)] text-white'
                        : 'border border-text/10 bg-text/5 text-text-muted'
                    )}
                  >
                    微妙 🤔
                  </button>
                  <button
                    onClick={toggleFavorite}
                    aria-label="お気に入り"
                    className={clsx(
                      'flex h-9 w-9 items-center justify-center rounded-xl border text-base',
                      todaysOutfit.isFavorite
                        ? 'border-transparent brand-gradient text-white'
                        : 'border-text/10 bg-text/5'
                    )}
                  >
                    {todaysOutfit.isFavorite ? '★' : '☆'}
                  </button>
                </div>
                <button
                  onClick={chooseAgain}
                  className="text-center text-[11px] font-medium text-text-faint underline underline-offset-2"
                >
                  今日のコーデを選び直す
                </button>
              </div>
            }
          />
        ) : (
          <div className="flex flex-col gap-4">
            {suggestLoading ? (
              <div className="glass-card flex flex-col items-center gap-2 rounded-lg py-10">
                <span className="animate-pulse text-3xl">✨</span>
                <p className="text-xs text-text-muted">コーディネーターが提案を考え中…</p>
              </div>
            ) : suggestions.length === 0 ? (
              <p className="py-6 text-center text-xs text-text-faint">
                提案を作成できませんでした。ワードローブのアイテムを増やしてみてください。
              </p>
            ) : (
              suggestions.map((s, i) => (
                <OutfitCard
                  key={i}
                  items={resolveItems(s.itemIds)}
                  reason={s.reason}
                  footer={
                    <button
                      onClick={() => chooseOutfit(s)}
                      className="brand-gradient rounded-xl py-2.5 text-xs font-bold text-white"
                    >
                      この着こなしにする
                    </button>
                  }
                />
              ))
            )}

            {!suggestLoading && suggestions.length > 0 && (
              <button
                onClick={fetchSuggestions}
                className="rounded-xl border border-text/10 bg-text/5 py-2.5 text-xs font-semibold text-text-muted"
              >
                他の提案を見る 🔄
              </button>
            )}

            {suggestSource === 'rule-based' && !suggestLoading && suggestions.length > 0 && (
              <p className="text-center text-[10px] text-text-faint">
                ルールベース提案（ANTHROPIC_API_KEY未設定）
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TodayMark() {
  return (
    <svg viewBox="0 0 32 32" className="h-6 w-6 shrink-0 text-text" aria-hidden="true">
      <circle
        cx={16}
        cy={16}
        r={9.5}
        fill="none"
        stroke="currentColor"
        strokeWidth={4}
        strokeLinecap="round"
        strokeDasharray="47 12"
        strokeDashoffset={-4}
      />
    </svg>
  );
}
