'use client';

import { useState } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import { useProfile } from '@/lib/hooks';
import * as db from '@/lib/db';
import { STYLE_VIBE_LABEL, type BackupData, type StyleVibe } from '@/lib/types';
import clsx from 'clsx';

const STYLE_VIBES = Object.keys(STYLE_VIBE_LABEL) as StyleVibe[];

const APP_VERSION = '1.0.0';

export default function SettingsPage() {
  const { profile, refresh } = useProfile();

  const [styleVibes, setStyleVibes] = useState<StyleVibe[]>([]);
  const [hairstyleNote, setHairstyleNote] = useState<string | undefined>(undefined);
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagError, setDiagError] = useState<string | null>(null);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  if (!hydrated && profile) {
    setStyleVibes(profile.styleVibes ?? []);
    setHairstyleNote(profile.hairstyleNote);
    setHydrated(true);
  }

  const toggleVibe = (v: StyleVibe) => {
    setStyleVibes((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  };

  const handleSaveVibes = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await db.saveProfile({ ...profile, styleVibes });
      await refresh();
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const handleDiagnoseHairstyle = async () => {
    if (!profile?.faceImageDataUrl) return;
    setDiagnosing(true);
    setDiagError(null);
    try {
      const res = await fetch('/api/hairstyle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUrl: profile.faceImageDataUrl, styleVibes }),
      });
      if (!res.ok) throw new Error(`hairstyle failed: ${res.status}`);
      const data = (await res.json()) as { note: string };
      setHairstyleNote(data.note);
      await db.saveProfile({ ...profile, styleVibes, hairstyleNote: data.note });
      await refresh();
    } catch (err) {
      console.error(err);
      setDiagError('診断に失敗しました。もう一度お試しください。');
    } finally {
      setDiagnosing(false);
    }
  };

  const handleClearData = async () => {
    if (!window.confirm('登録した服・履歴・プロフィールなど、すべてのデータを端末から削除します。この操作は取り消せません。よろしいですか？')) {
      return;
    }
    setClearing(true);
    try {
      await db.clearAllData();
      window.location.href = '/';
    } finally {
      setClearing(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await db.exportAllData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `coordinator-backup-${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const handleImportFile = async (file: File | null) => {
    if (!file) return;
    setImportError(null);
    if (
      !window.confirm(
        'このファイルの内容で、現在端末に保存されているすべてのデータを上書きします。よろしいですか？'
      )
    ) {
      return;
    }
    setImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text) as BackupData;
      if (!data.closet || !data.outfits) {
        throw new Error('invalid backup file');
      }
      await db.importAllData(data);
      window.location.href = '/';
    } catch (err) {
      console.error(err);
      setImportError('読み込みに失敗しました。正しいバックアップファイルかご確認ください。');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div>
      <PageHeader eyebrow="Settings" title="設定" subtitle="アプリの世界観・一般設定を管理します" />

      <div className="flex flex-col gap-4 px-5 pb-8">
        <section className="glass-card rounded-lg p-5">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-faint">
            Original
          </p>
          <p className="mb-3 text-sm font-bold text-text">世界観設定</p>
          <p className="mb-3 text-xs leading-relaxed text-text-muted">
            好みのスタイルの方向性を選択すると、AIコーデ提案時の雰囲気づくりの参考にします（複数選択可）。
          </p>
          <div className="flex flex-wrap gap-2">
            {STYLE_VIBES.map((v) => (
              <button
                key={v}
                onClick={() => toggleVibe(v)}
                className={clsx(
                  'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                  styleVibes.includes(v)
                    ? 'border-transparent brand-gradient text-white'
                    : 'border-black/10 bg-black/5 text-text-muted'
                )}
              >
                {STYLE_VIBE_LABEL[v]}
              </button>
            ))}
          </div>

          <button
            onClick={handleSaveVibes}
            disabled={saving}
            className="brand-gradient mt-4 w-full rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? '保存中…' : '世界観設定を保存する'}
          </button>
          {saved && (
            <p className="mt-2 text-center text-xs font-semibold text-[var(--success)]">
              保存しました ✓
            </p>
          )}

          <div className="mt-5 border-t border-black/10 pt-4">
            <p className="mb-2 text-xs font-semibold text-text">髪型診断（顔写真ベース）</p>
            {profile?.faceImageDataUrl ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full bg-black/5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={profile.faceImageDataUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <button
                    onClick={handleDiagnoseHairstyle}
                    disabled={diagnosing}
                    className="flex-1 rounded-xl border border-black/10 px-4 py-2.5 text-xs font-semibold text-text disabled:opacity-50"
                  >
                    {diagnosing ? '診断中…' : '登録済みの顔写真から診断する'}
                  </button>
                </div>
                {diagError && (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                    {diagError}
                  </p>
                )}
                {hairstyleNote && (
                  <p className="rounded-lg bg-black/5 px-3 py-2.5 text-xs leading-relaxed text-text">
                    {hairstyleNote}
                  </p>
                )}
                <p className="text-[10px] leading-relaxed text-text-faint">
                  スタイリングの参考としての一般的な提案です。美容・医療的な助言ではありません。
                </p>
              </div>
            ) : (
              <p className="text-xs leading-relaxed text-text-muted">
                <Link href="/profile" className="font-semibold text-brand-pink">
                  プロフィール
                </Link>
                で顔写真を登録すると、髪型診断が利用できます。
              </p>
            )}
          </div>
        </section>

        <section className="glass-card rounded-lg p-5">
          <p className="mb-3 text-sm font-bold text-text">一般</p>
          <div className="flex flex-col divide-y divide-black/10">
            <SettingsRow
              title="このアプリについて"
              open={openRow === 'about'}
              onToggle={() => setOpenRow(openRow === 'about' ? null : 'about')}
            >
              コーディネーター v{APP_VERSION}
              <br />
              天気・シーン・手持ちの服からAIが今日のコーデを提案するパーソナルコーディネートアプリです。
            </SettingsRow>

            <SettingsRow
              title="利用規約"
              open={openRow === 'terms'}
              onToggle={() => setOpenRow(openRow === 'terms' ? null : 'terms')}
            >
              本アプリは個人利用を目的とした試験的なサービスです。提案内容・リセール概算・生成された出品文などの正確性を保証するものではなく、実際の利用・出品・購入等の判断はご自身の責任で行ってください。予告なく機能内容が変更・終了する場合があります。
            </SettingsRow>

            <SettingsRow
              title="プライバシーポリシー"
              open={openRow === 'privacy'}
              onToggle={() => setOpenRow(openRow === 'privacy' ? null : 'privacy')}
            >
              服の写真・顔写真・身長体重などの入力データは、お使いの端末のブラウザ内（IndexedDB）にのみ保存され、外部サーバーには送信されません。ただし、AIコーデ提案・パーソナルカラー診断・髪型診断・出品文作成の各機能でClaude
              APIを利用する場合、その処理に必要な範囲でテキストや写真がAnthropic社のAPIに送信されます。データを削除したい場合は、下記「ローカルデータを削除」からいつでも削除できます。
            </SettingsRow>

            <SettingsRow
              title="お問い合わせ"
              open={openRow === 'contact'}
              onToggle={() => setOpenRow(openRow === 'contact' ? null : 'contact')}
            >
              準備中です。お問い合わせ先メールアドレスは後日こちらに掲載予定です。
            </SettingsRow>
          </div>
        </section>

        <section className="glass-card rounded-lg p-5">
          <p className="mb-1 text-sm font-bold text-text">バックアップ</p>
          <p className="mb-3 text-xs leading-relaxed text-text-muted">
            データは端末内にのみ保存されており、機種変更やブラウザのデータ削除で失われます。定期的にエクスポートしておくことをおすすめします。
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleExport}
              disabled={exporting}
              className="brand-gradient flex-1 rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {exporting ? '書き出し中…' : 'データをエクスポート'}
            </button>
            <label className="flex flex-1 cursor-pointer items-center justify-center rounded-xl border border-black/10 px-4 py-3 text-sm font-semibold text-text">
              {importing ? '読み込み中…' : 'インポート'}
              <input
                type="file"
                accept="application/json"
                className="hidden"
                disabled={importing}
                onChange={(e) => handleImportFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
          {importError && (
            <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              {importError}
            </p>
          )}
        </section>

        <section className="glass-card rounded-lg p-5">
          <p className="mb-1 text-sm font-bold text-text">データ管理</p>
          <p className="mb-3 text-xs leading-relaxed text-text-muted">
            登録した服・履歴・プロフィールなど、端末に保存されたすべてのデータを削除します。この操作は取り消せません。
          </p>
          <button
            onClick={handleClearData}
            disabled={clearing}
            className="w-full rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800 disabled:opacity-50"
          >
            {clearing ? '削除中…' : 'ローカルデータを削除する'}
          </button>
        </section>
      </div>
    </div>
  );
}

function SettingsRow({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-xs font-semibold text-text">{title}</span>
        <span className={clsx('text-text-faint transition-transform', open && 'rotate-180')}>
          ⌄
        </span>
      </button>
      {open && <p className="mt-2 text-[11px] leading-relaxed text-text-muted">{children}</p>}
    </div>
  );
}
