'use client';

import { useState } from 'react';
import { fileToResizedDataUrl } from '@/lib/image';
import * as db from '@/lib/db';
import {
  BRAND_TIER_LABEL,
  CATEGORY_LABEL,
  CONDITION_LABEL,
  SEASON_LABEL,
  SIZE_OPTIONS,
  STATUS_LABEL,
  TPO_LABEL,
  type BrandTier,
  type ClothingCategory,
  type ClothingItem,
  type ClothingStatus,
  type ConditionLevel,
  type Season,
  type Tpo,
} from '@/lib/types';
import clsx from 'clsx';

const CATEGORIES = Object.keys(CATEGORY_LABEL) as ClothingCategory[];
const SEASONS = Object.keys(SEASON_LABEL) as Season[];
const STATUSES = Object.keys(STATUS_LABEL) as ClothingStatus[];
const BRAND_TIERS = Object.keys(BRAND_TIER_LABEL) as BrandTier[];
const CONDITIONS = Object.keys(CONDITION_LABEL) as ConditionLevel[];
const TPOS = Object.keys(TPO_LABEL) as Tpo[];

export default function ClothingForm({
  initial,
  onSaved,
  onDelete,
  onCreateListing,
}: {
  initial?: ClothingItem;
  onSaved: () => void;
  onDelete?: () => void;
  onCreateListing?: () => void;
}) {
  const [brand, setBrand] = useState(initial?.brand ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [category, setCategory] = useState<ClothingCategory>(initial?.category ?? 'tops');
  const [size, setSize] = useState(initial?.size ?? '');
  const [color, setColor] = useState(initial?.color ?? '');
  const [season, setSeason] = useState<Season[]>(
    initial?.season && initial.season.length > 0 ? initial.season : ['all']
  );
  const [status, setStatus] = useState<ClothingStatus>(initial?.status ?? 'active');
  const [material, setMaterial] = useState(initial?.material ?? '');
  const [brandTier, setBrandTier] = useState<BrandTier>(initial?.brandTier ?? 'mid');
  const [condition, setCondition] = useState<ConditionLevel>(initial?.condition ?? 'good');
  const [originalPrice, setOriginalPrice] = useState(
    initial?.originalPrice ? String(initial.originalPrice) : ''
  );
  const [tpoTags, setTpoTags] = useState<Tpo[]>(initial?.tpoTags ?? []);
  const [imageDataUrl, setImageDataUrl] = useState<string | undefined>(initial?.imageDataUrl);
  const [saving, setSaving] = useState(false);
  const [imgLoading, setImgLoading] = useState(false);

  const handleCategoryChange = (c: ClothingCategory) => {
    setCategory(c);
    setSize((prev) => (SIZE_OPTIONS[c].includes(prev) ? prev : ''));
  };

  const toggleTpo = (t: Tpo) => {
    setTpoTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

  const toggleSeason = (s: Season) => {
    setSeason((prev) => {
      if (s === 'all') return ['all'];
      const withoutAll = prev.filter((x) => x !== 'all');
      const next = withoutAll.includes(s)
        ? withoutAll.filter((x) => x !== s)
        : [...withoutAll, s];
      return next.length > 0 ? next : ['all'];
    });
  };

  const [error, setError] = useState<string | null>(null);

  const handleImage = async (file: File | null) => {
    if (!file) return;
    setError(null);
    setImgLoading(true);
    try {
      const dataUrl = await fileToResizedDataUrl(file);
      setImageDataUrl(dataUrl);
    } catch (err) {
      console.error(err);
      setError('画像の読み込みに失敗しました。別の写真でお試しください。');
    } finally {
      setImgLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!name.trim() || !color.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await db.saveClothingItem({
        id: initial?.id,
        name: name.trim(),
        brand: brand.trim() || undefined,
        category,
        size: size || undefined,
        color: color.trim(),
        season,
        status,
        material: material.trim() || undefined,
        brandTier,
        condition,
        originalPrice: originalPrice ? Number(originalPrice) : undefined,
        tpoTags: tpoTags.length ? tpoTags : undefined,
        imageDataUrl,
        wearCount: initial?.wearCount ?? 0,
        createdAt: initial?.createdAt,
        purchasedAt: initial?.purchasedAt,
        lastWornAt: initial?.lastWornAt,
      });
      onSaved();
    } catch (err) {
      console.error(err);
      setError('保存に失敗しました。もう一度お試しください。');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col items-center gap-2">
        <div className="relative h-28 w-28 overflow-hidden rounded-lg bg-text/5">
          {imageDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageDataUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-3xl opacity-40">
              📷
            </div>
          )}
          {imgLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-[var(--scrim)] text-xs text-white">
              処理中…
            </div>
          )}
        </div>
        <span className="text-xs font-semibold text-brand-pink">写真を撮る・選択</span>
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleImage(e.target.files?.[0] ?? null)}
        />
      </label>

      {error && (
        <p className="rounded-lg border border-danger-border bg-danger-bg px-3 py-2 text-xs text-danger-text">
          {error}
        </p>
      )}

      <Field label="ブランド名（任意）">
        <input
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          placeholder="例：UNIQLO"
          className="input"
        />
      </Field>

      <Field label="アイテム名">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例：ネイビーのウールコート"
          className="input"
        />
      </Field>

      <Field label="カテゴリ">
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <Chip key={c} active={category === c} onClick={() => handleCategoryChange(c)}>
              {CATEGORY_LABEL[c]}
            </Chip>
          ))}
        </div>
      </Field>

      <Field label="サイズ（任意）">
        <select
          value={size}
          onChange={(e) => setSize(e.target.value)}
          className="input"
        >
          <option value="">選択してください</option>
          {SIZE_OPTIONS[category].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>

      <Field label="色">
        <input
          value={color}
          onChange={(e) => setColor(e.target.value)}
          placeholder="例：ネイビー"
          className="input"
        />
      </Field>

      <Field label="季節（複数選択可）">
        <div className="flex flex-wrap gap-2">
          {SEASONS.map((s) => (
            <Chip key={s} active={season.includes(s)} onClick={() => toggleSeason(s)}>
              {SEASON_LABEL[s]}
            </Chip>
          ))}
        </div>
      </Field>

      <Field label="向いているシーン（任意）">
        <div className="flex flex-wrap gap-2">
          {TPOS.map((t) => (
            <Chip key={t} active={tpoTags.includes(t)} onClick={() => toggleTpo(t)}>
              {TPO_LABEL[t]}
            </Chip>
          ))}
        </div>
      </Field>

      <Field label="ステータス">
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <Chip key={s} active={status === s} onClick={() => setStatus(s)}>
              {STATUS_LABEL[s]}
            </Chip>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="素材（任意）">
          <input
            value={material}
            onChange={(e) => setMaterial(e.target.value)}
            placeholder="コットン等"
            className="input"
          />
        </Field>
        <Field label="購入価格（任意・円）">
          <input
            type="number"
            inputMode="numeric"
            value={originalPrice}
            onChange={(e) => setOriginalPrice(e.target.value)}
            placeholder="12000"
            className="input"
          />
        </Field>
      </div>

      <Field label="ブランド帯（リセール概算に使用）">
        <div className="flex flex-wrap gap-2">
          {BRAND_TIERS.map((b) => (
            <Chip key={b} active={brandTier === b} onClick={() => setBrandTier(b)}>
              {BRAND_TIER_LABEL[b]}
            </Chip>
          ))}
        </div>
      </Field>

      <Field label="状態（リセール概算に使用）">
        <div className="flex flex-wrap gap-2">
          {CONDITIONS.map((c) => (
            <Chip key={c} active={condition === c} onClick={() => setCondition(c)}>
              {CONDITION_LABEL[c]}
            </Chip>
          ))}
        </div>
      </Field>

      {initial && onCreateListing && (
        <button
          onClick={onCreateListing}
          className="rounded-xl border border-text/10 px-4 py-3 text-sm font-semibold text-text"
        >
          この服の出品文を作成する ✍️
        </button>
      )}

      <div className="mt-2 flex gap-2">
        {initial && onDelete && (
          <button
            onClick={onDelete}
            className="rounded-xl border border-text/10 px-4 py-3 text-sm font-semibold text-danger-text"
          >
            削除
          </button>
        )}
        <button
          onClick={handleSubmit}
          disabled={saving || !name.trim() || !color.trim()}
          className="brand-gradient flex-1 rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? '保存中…' : initial ? '更新する' : 'ワードローブに追加'}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-text-muted">{label}</span>
      {children}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
        active
          ? 'border-transparent brand-gradient text-white'
          : 'border-text/10 bg-text/5 text-text-muted'
      )}
    >
      {children}
    </button>
  );
}
