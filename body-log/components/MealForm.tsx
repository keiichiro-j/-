'use client';

import { useRef, useState } from 'react';
import clsx from 'clsx';
import * as db from '@/lib/db';
import { fileToResizedDataUrl } from '@/lib/image';
import { todayKey } from '@/lib/date';
import {
  MEAL_ICON,
  MEAL_LABEL,
  MEAL_TAG_VARS,
  MEAL_TYPES,
  mealTotals,
  type FoodItem,
  type MealEntry,
  type MealType,
} from '@/lib/types';

function genLocalId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function autoMealType(): MealType {
  const h = new Date().getHours();
  if (h >= 5 && h < 10) return 'breakfast';
  if (h >= 10 && h < 14) return 'lunch';
  if (h >= 14 && h < 17) return 'snack';
  if (h >= 17 && h < 22) return 'dinner';
  return 'snack';
}

function emptyItem(): FoodItem {
  return { id: genLocalId(), name: '', amount: '', calories: 0, protein: 0, fat: 0, carbs: 0 };
}

export default function MealForm({
  initial,
  defaultMealType,
  defaultDate,
  onSaved,
  onDelete,
}: {
  initial?: MealEntry;
  defaultMealType?: MealType;
  defaultDate?: string;
  onSaved: () => void;
  onDelete?: () => void;
}) {
  const [date, setDate] = useState(initial?.date ?? defaultDate ?? todayKey());
  const [mealType, setMealType] = useState<MealType>(initial?.mealType ?? defaultMealType ?? autoMealType());
  const [photoDataUrl, setPhotoDataUrl] = useState<string | undefined>(initial?.photoDataUrl);
  const [items, setItems] = useState<FoodItem[]>(initial?.items ?? []);
  const [memo, setMemo] = useState(initial?.memo ?? '');
  const [analyzedByAi, setAnalyzedByAi] = useState(initial?.analyzedByAi ?? false);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const totals = mealTotals(items);

  const handlePhoto = async (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;
    setError(null);
    setNote(null);
    try {
      const dataUrl = await fileToResizedDataUrl(file);
      setPhotoDataUrl(dataUrl);
      setAnalyzing(true);
      const res = await fetch('/api/analyze-meal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUrl: dataUrl, mealType }),
      });
      const data = (await res.json()) as {
        items?: Omit<FoodItem, 'id'>[];
        note?: string;
        error?: string;
      };
      if (data.error) throw new Error(data.error);
      if (data.items && data.items.length > 0) {
        setItems(data.items.map((i) => ({ ...i, id: genLocalId() })));
        setAnalyzedByAi(true);
      }
      if (data.note) setNote(data.note);
    } catch (err) {
      console.error('Meal photo analysis failed', err);
      setError('写真の解析に失敗しました。品目を手動で追加してください。');
    } finally {
      setAnalyzing(false);
    }
  };

  const updateItem = (id: string, patch: Partial<FoodItem>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const addItem = () => {
    setItems((prev) => [...prev, emptyItem()]);
  };

  const handleSave = async () => {
    const cleanedItems = items
      .map((item) => ({ ...item, name: item.name.trim() }))
      .filter((item) => item.name.length > 0);
    if (cleanedItems.length === 0) {
      setError('少なくとも1品目を入力してください。');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await db.saveMeal({
        id: initial?.id,
        date,
        mealType,
        photoDataUrl,
        items: cleanedItems,
        memo: memo.trim() || undefined,
        analyzedByAi,
        createdAt: initial?.createdAt,
      });
      onSaved();
    } catch (err) {
      console.error('Failed to save meal', err);
      setError('保存に失敗しました。もう一度お試しください。');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <label className="flex-1 text-xs font-semibold text-text-muted">
          日付
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            max={todayKey()}
            className="input mt-1"
          />
        </label>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-semibold text-text-muted">区分</p>
        <div className="grid grid-cols-4 gap-2">
          {MEAL_TYPES.map((mt) => {
            const tag = MEAL_TAG_VARS[mt];
            const selected = mealType === mt;
            return (
              <button
                key={mt}
                type="button"
                onClick={() => setMealType(mt)}
                className={clsx(
                  'flex flex-col items-center gap-1 rounded-xl border py-2.5 text-xs font-bold transition-all',
                  selected ? 'scale-[1.03] border-transparent' : 'border-border bg-text/5 text-text-muted'
                )}
                style={selected ? { background: tag.bg, color: tag.text } : undefined}
              >
                <span className="text-base">{MEAL_ICON[mt]}</span>
                {MEAL_LABEL[mt]}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-semibold text-text-muted">写真</p>
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => handlePhoto(e.target.files)}
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handlePhoto(e.target.files)}
        />
        {photoDataUrl ? (
          <div className="relative overflow-hidden rounded-xl border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoDataUrl} alt="食事の写真" className="h-48 w-full object-cover" />
            {analyzing && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 text-white">
                <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                <span className="text-xs font-medium">AIが解析中…</span>
              </div>
            )}
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="absolute bottom-2 right-2 rounded-full bg-black/55 px-3 py-1.5 text-[11px] font-semibold text-white"
            >
              撮り直す
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="brand-fill flex flex-col items-center justify-center gap-1 rounded-xl py-6 text-xs font-semibold"
            >
              <span className="text-xl">📷</span>
              写真を撮る
            </button>
            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-1 rounded-xl border border-border bg-text/5 py-6 text-xs font-semibold text-text-muted"
            >
              <span className="text-xl">🖼️</span>
              アルバムから選ぶ
            </button>
          </div>
        )}
        {note && <p className="mt-2 text-[11px] text-text-faint">{note}</p>}
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <p className="text-xs font-semibold text-text-muted">品目</p>
          <button type="button" onClick={addItem} className="text-xs font-semibold text-brand">
            ＋ 品目を追加
          </button>
        </div>
        {items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-text-faint">
            写真をアップロードするか、手動で品目を追加してください
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((item) => (
              <div key={item.id} className="glass-card rounded-lg p-3">
                <div className="mb-2 flex items-center gap-2">
                  <input
                    value={item.name}
                    onChange={(e) => updateItem(item.id, { name: e.target.value })}
                    placeholder="品目名"
                    className="input flex-1 text-sm font-semibold"
                  />
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    aria-label="削除"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-text/5 text-text-muted"
                  >
                    ✕
                  </button>
                </div>
                <input
                  value={item.amount}
                  onChange={(e) => updateItem(item.id, { amount: e.target.value })}
                  placeholder="目安量(例: 茶碗1杯)"
                  className="input mb-2 text-xs"
                />
                <div className="grid grid-cols-4 gap-1.5">
                  <NumberField
                    label="kcal"
                    value={item.calories}
                    onChange={(v) => updateItem(item.id, { calories: v })}
                  />
                  <NumberField label="P(g)" value={item.protein} onChange={(v) => updateItem(item.id, { protein: v })} />
                  <NumberField label="F(g)" value={item.fat} onChange={(v) => updateItem(item.id, { fat: v })} />
                  <NumberField label="C(g)" value={item.carbs} onChange={(v) => updateItem(item.id, { carbs: v })} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div className="brand-soft flex items-center justify-between rounded-lg px-3.5 py-2.5 text-sm font-bold">
          <span>合計</span>
          <span>
            {totals.calories} kcal
            <span className="ml-2 text-xs font-medium opacity-80">
              P{totals.protein} F{totals.fat} C{totals.carbs}
            </span>
          </span>
        </div>
      )}

      <label className="text-xs font-semibold text-text-muted">
        メモ(任意)
        <textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          rows={2}
          className="input mt-1 resize-none"
          placeholder="外食、飲み会など"
        />
      </label>

      {error && (
        <div className="rounded-lg border border-danger-border bg-danger-bg px-3 py-2.5 text-xs text-danger-text">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="rounded-full border border-danger-border px-4 py-2.5 text-sm font-semibold text-danger-text"
          >
            削除
          </button>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || analyzing}
          className="brand-fill flex-1 rounded-full py-2.5 text-sm font-semibold disabled:opacity-60"
        >
          {saving ? '保存中…' : '保存する'}
        </button>
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-0.5 text-center text-[10px] font-medium text-text-faint">
      {label}
      <input
        type="number"
        inputMode="numeric"
        min={0}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className="input px-1 py-1.5 text-center text-xs"
      />
    </label>
  );
}
