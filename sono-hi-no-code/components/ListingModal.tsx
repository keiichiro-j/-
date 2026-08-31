'use client';

import { useEffect, useState } from 'react';
import Modal from './Modal';
import type { ClothingItem, ListingCopy } from '@/lib/types';

export default function ListingModal({
  item,
  onClose,
}: {
  item: ClothingItem | null;
  onClose: () => void;
}) {
  const [listing, setListing] = useState<ListingCopy | null>(null);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<'claude' | 'rule-based' | null>(null);
  const [copied, setCopied] = useState<'title' | 'body' | null>(null);

  useEffect(() => {
    if (!item) {
      setListing(null);
      setSource(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch('/api/listing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item }),
    })
      .then((res) => res.json())
      .then((data: { listing: ListingCopy; source: 'claude' | 'rule-based' }) => {
        if (cancelled) return;
        setListing(data.listing);
        setSource(data.source);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [item]);

  const copy = async (text: string, which: 'title' | 'body') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // clipboard API unavailable; ignore silently
    }
  };

  return (
    <Modal open={!!item} onClose={onClose} title="出品文を作成">
      {loading ? (
        <div className="flex flex-col items-center gap-2 py-10">
          <span className="animate-pulse text-2xl">✍️</span>
          <p className="text-xs text-text-muted">出品文を作成中…</p>
        </div>
      ) : listing && item ? (
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900">
            ⚠️ 出品前に必ず、実物の状態・サイズ・傷や汚れの有無などをご自身の目でご確認のうえ、内容を修正してからご利用ください。
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-semibold text-text-muted">タイトル</span>
              <button
                onClick={() => copy(listing.title, 'title')}
                className="text-[11px] font-semibold text-brand-pink"
              >
                {copied === 'title' ? 'コピーしました ✓' : 'コピー'}
              </button>
            </div>
            <p className="rounded-lg border border-text/10 bg-text/5 px-3 py-2 text-sm text-text">
              {listing.title}
            </p>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-semibold text-text-muted">本文</span>
              <button
                onClick={() => copy(listing.body, 'body')}
                className="text-[11px] font-semibold text-brand-pink"
              >
                {copied === 'body' ? 'コピーしました ✓' : 'コピー'}
              </button>
            </div>
            <p className="whitespace-pre-wrap rounded-lg border border-text/10 bg-text/5 px-3 py-2.5 text-xs leading-relaxed text-text">
              {listing.body}
            </p>
          </div>

          <p className="text-[10px] leading-relaxed text-text-faint">
            {source === 'rule-based'
              ? 'ルールベースで作成した文章です（ANTHROPIC_API_KEY未設定）。'
              : 'AIが作成した文章です。'}
            価格は含まれていないため、出品時にご自身で設定してください。
          </p>
        </div>
      ) : (
        <p className="py-10 text-center text-xs text-text-faint">生成に失敗しました。もう一度お試しください。</p>
      )}
    </Modal>
  );
}
