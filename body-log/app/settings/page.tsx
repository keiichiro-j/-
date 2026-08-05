'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import PageHeader from '@/components/PageHeader';
import BmiGauge from '@/components/BmiGauge';
import { useSettings, useWeights } from '@/lib/hooks';
import * as db from '@/lib/db';
import { formatDateJa, todayKey } from '@/lib/date';
import { useTheme, type ThemePreference } from '@/lib/theme';
import { bmiCategory, computeBmi, idealWeightRange } from '@/lib/health';
import type { Settings } from '@/lib/types';

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: '自動' },
  { value: 'light', label: 'ライト' },
  { value: 'dark', label: 'ダーク' },
];

export default function SettingsPage() {
  const { settings, update } = useSettings();
  const { weights, refresh: refreshWeights } = useWeights();
  const { theme, setTheme } = useTheme();

  const [form, setForm] = useState<Settings>(settings);
  const [savedFlash, setSavedFlash] = useState(false);

  const [weightInput, setWeightInput] = useState('');
  const [bodyFatInput, setBodyFatInput] = useState('');
  const [weightError, setWeightError] = useState<string | null>(null);

  const [importError, setImportError] = useState<string | null>(null);
  const [importOk, setImportOk] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Settings load asynchronously from IndexedDB; sync the edit form once they arrive.
  useEffect(() => {
    setForm(settings);
  }, [settings]);

  const latestWeight = weights[0];
  const bmi = useMemo(
    () => (latestWeight && form.heightCm ? computeBmi(latestWeight.weightKg, form.heightCm) : null),
    [latestWeight, form.heightCm]
  );
  const ideal = useMemo(() => (form.heightCm ? idealWeightRange(form.heightCm) : null), [form.heightCm]);

  const handleFormChange = (patch: Partial<Settings>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const handleSaveTargets = async () => {
    await update(form);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  };

  const handleAddWeight = async () => {
    const weightKg = Number(weightInput);
    if (!weightInput || !Number.isFinite(weightKg) || weightKg <= 0) {
      setWeightError('正しい体重を入力してください。');
      return;
    }
    const bodyFatPercent = bodyFatInput ? Number(bodyFatInput) : undefined;
    setWeightError(null);
    await db.saveWeight({ date: todayKey(), weightKg, bodyFatPercent });
    setWeightInput('');
    setBodyFatInput('');
    refreshWeights();
  };

  const handleDeleteWeight = async (id: string) => {
    await db.deleteWeight(id);
    refreshWeights();
  };

  const handleExport = async () => {
    const data = await db.exportBackup();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `body-log-backup-${todayKey()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;
    setImportError(null);
    setImportOk(false);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data.meals) || !Array.isArray(data.weights)) {
        throw new Error('invalid backup file');
      }
      await db.importBackup(data);
      setImportOk(true);
      refreshWeights();
    } catch (err) {
      console.error('Import failed', err);
      setImportError('バックアップファイルの読み込みに失敗しました。');
    }
  };

  return (
    <div>
      <PageHeader eyebrow="Settings" title="設定" subtitle="目標や体重、表示設定を管理します" />

      <div className="flex flex-col gap-4 px-5 pb-8">
        <section className="glass-card rounded-xl p-4">
          <p className="mb-3 text-sm font-bold text-text">目標設定</p>
          <div className="flex flex-col gap-3">
            <label className="text-xs font-semibold text-text-muted">
              目標カロリー(kcal/日)
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={form.targetCalories}
                onChange={(e) => handleFormChange({ targetCalories: Number(e.target.value) || 0 })}
                className="input mt-1"
              />
            </label>
            <div className="grid grid-cols-3 gap-2">
              <label className="text-[11px] font-semibold text-text-muted">
                タンパク質(g)
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={form.targetProtein}
                  onChange={(e) => handleFormChange({ targetProtein: Number(e.target.value) || 0 })}
                  className="input mt-1"
                />
              </label>
              <label className="text-[11px] font-semibold text-text-muted">
                脂質(g)
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={form.targetFat}
                  onChange={(e) => handleFormChange({ targetFat: Number(e.target.value) || 0 })}
                  className="input mt-1"
                />
              </label>
              <label className="text-[11px] font-semibold text-text-muted">
                炭水化物(g)
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={form.targetCarbs}
                  onChange={(e) => handleFormChange({ targetCarbs: Number(e.target.value) || 0 })}
                  className="input mt-1"
                />
              </label>
            </div>
            <button onClick={handleSaveTargets} className="brand-fill rounded-full py-2.5 text-sm font-semibold">
              {savedFlash ? '保存しました ✓' : '保存する'}
            </button>
          </div>
        </section>

        <section className="glass-card rounded-xl p-4">
          <p className="mb-3 text-sm font-bold text-text">身長・健康状態</p>
          <label className="mb-3 block text-xs font-semibold text-text-muted">
            身長(cm)
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              min={0}
              placeholder="例: 165"
              value={form.heightCm ?? ''}
              onChange={(e) => handleFormChange({ heightCm: e.target.value ? Number(e.target.value) : undefined })}
              className="input mt-1"
            />
          </label>
          <button onClick={handleSaveTargets} className="brand-fill mb-4 w-full rounded-full py-2.5 text-sm font-semibold">
            {savedFlash ? '保存しました ✓' : '保存する'}
          </button>

          {!form.heightCm ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-text-faint">
              身長を登録するとBMI・理想体重の目安が表示されます
            </p>
          ) : !latestWeight ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-text-faint">
              体重を記録するとBMIが計算されます
            </p>
          ) : (
            bmi !== null && (
              <div>
                <div className="mb-3 flex items-end justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-text-faint">BMI</p>
                    <p className="font-display text-3xl font-bold text-text">{bmi.toFixed(1)}</p>
                  </div>
                  <span
                    className="tag-chip"
                    style={{ background: bmiCategory(bmi).colorVar, color: bmiCategory(bmi).textVar }}
                  >
                    {bmiCategory(bmi).label}
                  </span>
                </div>
                <BmiGauge bmi={bmi} />
                {ideal && (
                  <p className="mt-3 text-xs text-text-muted">
                    標準体重の目安: <span className="font-semibold text-text">{ideal.min}〜{ideal.max}kg</span>
                    (標準 {ideal.standard}kg)
                  </p>
                )}
              </div>
            )
          )}
        </section>

        <section className="glass-card rounded-xl p-4">
          <p className="mb-3 text-sm font-bold text-text">体重・体組成の記録</p>
          <div className="mb-3 flex gap-2">
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              placeholder="体重(kg)"
              value={weightInput}
              onChange={(e) => setWeightInput(e.target.value)}
              className="input flex-1"
            />
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              placeholder="体脂肪率(%)"
              value={bodyFatInput}
              onChange={(e) => setBodyFatInput(e.target.value)}
              className="input flex-1"
            />
            <button onClick={handleAddWeight} className="brand-fill shrink-0 rounded-full px-4 text-sm font-semibold">
              記録
            </button>
          </div>
          {weightError && <p className="mb-3 text-xs text-danger-text">{weightError}</p>}

          {weights.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-text-faint">
              まだ体重記録がありません
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {weights.slice(0, 10).map((w) => (
                <div key={w.id} className="flex items-center justify-between rounded-lg bg-text/5 px-3 py-2 text-xs">
                  <span className="text-text-muted">{formatDateJa(w.date)}</span>
                  <span className="font-semibold text-text">
                    {w.weightKg}kg
                    {w.bodyFatPercent !== undefined && (
                      <span className="ml-1.5 font-normal text-text-faint">体脂肪 {w.bodyFatPercent}%</span>
                    )}
                  </span>
                  <button onClick={() => handleDeleteWeight(w.id)} aria-label="削除" className="text-text-faint">
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="glass-card rounded-xl p-4">
          <p className="mb-3 text-sm font-bold text-text">表示テーマ</p>
          <div className="flex gap-2">
            {THEME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setTheme(opt.value)}
                className={clsx(
                  'flex-1 rounded-xl py-2 text-xs font-semibold',
                  theme === opt.value ? 'brand-fill' : 'border border-border bg-text/5 text-text-muted'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>

        <section className="glass-card rounded-xl p-4">
          <p className="mb-1 text-sm font-bold text-text">データのバックアップ</p>
          <p className="mb-3 text-[11px] text-text-faint">
            記録はすべて端末内(ブラウザ)に保存されます。機種変更や万一に備えてバックアップを取得できます。
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleExport}
              className="flex-1 rounded-full border border-border bg-text/5 py-2.5 text-xs font-semibold text-text"
            >
              書き出す
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 rounded-full border border-border bg-text/5 py-2.5 text-xs font-semibold text-text"
            >
              読み込む
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => handleImport(e.target.files)}
            />
          </div>
          {importError && <p className="mt-2 text-xs text-danger-text">{importError}</p>}
          {importOk && <p className="mt-2 text-xs text-brand">読み込みが完了しました。ホームで確認してください。</p>}
        </section>

        <p className="px-1 text-center text-[10px] leading-relaxed text-text-faint">
          写真解析には Claude API を利用します。サーバーに ANTHROPIC_API_KEY
          が設定されていない場合、自動解析はスキップされ手動入力になります。
        </p>
      </div>
    </div>
  );
}
