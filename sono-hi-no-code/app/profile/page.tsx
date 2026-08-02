'use client';

import { useMemo, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import { useClothingItems, useProfile } from '@/lib/hooks';
import * as db from '@/lib/db';
import { fileToResizedDataUrl } from '@/lib/image';
import { assetBreakdownByCategory, totalAssetValue } from '@/lib/resale';
import {
  CATEGORY_LABEL,
  PERSONAL_COLOR_LABEL,
  STATUS_LABEL,
  type PersonalColorSeason,
} from '@/lib/types';

export default function ProfilePage() {
  const { profile, refresh } = useProfile();
  const { items } = useClothingItems();

  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [faceImageDataUrl, setFaceImageDataUrl] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [personalColor, setPersonalColor] = useState<PersonalColorSeason | undefined>(undefined);
  const [colorNote, setColorNote] = useState<string | undefined>(undefined);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!hydrated && profile) {
    setHeightCm(profile.heightCm ? String(profile.heightCm) : '');
    setWeightKg(profile.weightKg ? String(profile.weightKg) : '');
    setFaceImageDataUrl(profile.faceImageDataUrl);
    setPersonalColor(profile.personalColor);
    setColorNote(profile.silhouetteNote);
    setHydrated(true);
  }

  const total = useMemo(() => totalAssetValue(items), [items]);
  const breakdown = useMemo(() => assetBreakdownByCategory(items), [items]);
  const statusCounts = useMemo(() => {
    const counts = { active: 0, cleaning: 0, retired: 0 };
    items.forEach((i) => counts[i.status]++);
    return counts;
  }, [items]);
  const totalWearCount = useMemo(() => items.reduce((s, i) => s + i.wearCount, 0), [items]);

  const handleFaceImage = async (file: File | null) => {
    if (!file) return;
    setError(null);
    setAnalyzing(true);
    try {
      const dataUrl = await fileToResizedDataUrl(file, 600);
      setFaceImageDataUrl(dataUrl);
      const res = await fetch('/api/analyze-face', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUrl: dataUrl }),
      });
      if (!res.ok) throw new Error(`analyze-face failed: ${res.status}`);
      const data = (await res.json()) as { personalColor: PersonalColorSeason; note: string };
      setPersonalColor(data.personalColor);
      setColorNote(data.note);
    } catch (err) {
      console.error(err);
      setError(
        '写真の読み込みに失敗しました。HEIC形式など一部の画像形式は対応していない場合があります。別の写真でお試しください。'
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await db.saveProfile({
        ...profile,
        heightCm: heightCm ? Number(heightCm) : undefined,
        weightKg: weightKg ? Number(weightKg) : undefined,
        faceImageDataUrl,
        personalColor,
        silhouetteNote: colorNote,
      });
      await refresh();
      setSaved(true);
    } catch (err) {
      console.error(err);
      setError('保存に失敗しました。もう一度お試しください。');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader eyebrow="Profile" title="プロフィール" subtitle="体型・顔立ちの情報を提案に反映します" />

      <div className="flex flex-col gap-4 px-5 pb-8">
        <section className="glass-card flex flex-col items-center gap-3 rounded-lg p-5">
          <label className="flex flex-col items-center gap-2">
            <div className="h-24 w-24 overflow-hidden rounded-full bg-black/5">
              {faceImageDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={faceImageDataUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-3xl opacity-40">
                  🙂
                </div>
              )}
            </div>
            <span className="text-xs font-semibold text-brand-pink">
              {analyzing ? '解析中…' : '顔写真を登録（任意）'}
            </span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFaceImage(e.target.files?.[0] ?? null)}
            />
          </label>

          {error && (
            <p className="w-full rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-center text-xs text-red-800">
              {error}
            </p>
          )}

          {personalColor && (
            <div className="w-full rounded-xl bg-black/5 p-3 text-center">
              <p className="text-xs font-bold text-text">{PERSONAL_COLOR_LABEL[personalColor]}</p>
              {colorNote && <p className="mt-1 text-[11px] leading-relaxed text-text-faint">{colorNote}</p>}
            </div>
          )}

          <div className="grid w-full grid-cols-2 gap-3">
            <div>
              <p className="mb-1 text-xs font-semibold text-text-muted">身長 (cm)</p>
              <input
                type="number"
                inputMode="numeric"
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                placeholder="165"
                className="input"
              />
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold text-text-muted">体重 (kg)</p>
              <input
                type="number"
                inputMode="numeric"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                placeholder="58"
                className="input"
              />
            </div>
          </div>

          <p className="text-[10px] leading-relaxed text-text-faint">
            身長・体重・顔写真は端末内（IndexedDB）にのみ保存され、コーデ提案時のシルエット・色味の調整に使われます。
          </p>

          <button
            onClick={handleSave}
            disabled={saving}
            className="brand-gradient w-full rounded-xl py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {saving ? '保存中…' : '保存する'}
          </button>
          {saved && (
            <p className="text-center text-xs font-semibold text-[var(--success)]">
              保存しました ✓
            </p>
          )}
        </section>

        <section className="glass-card rounded-lg p-5">
          <p className="mb-3 text-sm font-bold text-text">クローゼット資産（概算）</p>
          <p className="font-display text-3xl font-medium text-text">
            ¥{total.toLocaleString()}
          </p>
          <p className="mb-4 mt-1 text-[11px] text-text-faint">
            カテゴリ・ブランド帯・状態から算出したリセール概算の合計です（処分予定を除く）
          </p>
          <div className="flex flex-col gap-2">
            {breakdown.map((b) => (
              <div key={b.category} className="flex items-center justify-between text-xs">
                <span className="text-text-muted">
                  {CATEGORY_LABEL[b.category]}
                  <span className="ml-1 text-text-faint">×{b.count}</span>
                </span>
                <span className="font-semibold text-text">¥{b.value.toLocaleString()}</span>
              </div>
            ))}
            {breakdown.length === 0 && (
              <p className="text-xs text-text-faint">アイテムを登録すると資産額が表示されます</p>
            )}
          </div>
          <p className="mt-4 text-[10px] leading-relaxed text-text-faint">
            ※実際のフリマ相場APIには接続していないため、あくまで概算値です。実売価格とは差が生じる場合があります。
          </p>
        </section>

        <section className="glass-card rounded-lg p-5">
          <p className="mb-3 text-sm font-bold text-text">クローゼット統計</p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <StatBlock label={STATUS_LABEL.active} value={statusCounts.active} />
            <StatBlock label={STATUS_LABEL.cleaning} value={statusCounts.cleaning} />
            <StatBlock label={STATUS_LABEL.retired} value={statusCounts.retired} />
          </div>
          <div className="mt-3 flex items-center justify-between rounded-xl bg-black/5 px-3 py-2.5 text-xs">
            <span className="text-text-muted">これまでの総着用回数</span>
            <span className="font-bold text-text">{totalWearCount}回</span>
          </div>
        </section>
      </div>
    </div>
  );
}

function StatBlock({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-black/5 py-3">
      <p className="text-lg font-semibold text-text">{value}</p>
      <p className="text-[10px] text-text-faint">{label}</p>
    </div>
  );
}
