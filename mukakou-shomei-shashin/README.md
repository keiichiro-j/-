# 無加工証明写真（Web版・動作確認用）

「無加工証明写真」アプリ企画書とワイヤーフレームをもとに、iOS（Xcode）実装に入る前の**動作確認・機能テスト用**に作った Web 版（Next.js）です。

## セットアップ

```bash
npm install
npm run dev
```

http://localhost:3000 をブラウザで開いてください。カメラ機能を使うため、スマートフォン実機でテストする場合は HTTPS（もしくは localhost）でのアクセスが必要です。

## 画面構成（ワイヤーフレームとの対応）

| 画面 | 実装 |
|---|---|
| ① 撮影画面 | `components/CameraScreen.tsx`（`getUserMedia` によるライブプレビュー、前後カメラ切替） |
| ②a 撮影直後の確認画面 | `components/ConfirmScreen.tsx`（アプリ内UIバッジのみ、画像は未加工） |
| ②b 保存・共有時に生成される画像 | `components/ExportScreen.tsx` + `lib/watermark.ts`（QR＋IDをピクセルに合成・常時ON） |
| ③ 証明情報 詳細画面 | `components/DetailScreen.tsx` |
| ④ 履歴（マイフォト）画面 | `components/HistoryScreen.tsx`（すべて／お気に入りタブ） |
| ⑤ Web検証ページ（外部） | `app/verify/[id]/page.tsx`（アプリ未インストールでもブラウザから確認可能） |

設定タブ（`components/SettingsScreen.tsx`）はワイヤーフレームに詳細がなかったため、証明のしくみの説明とローカル履歴削除（テスト用）を最小限で追加しています。

## 証明のしくみの実装

企画書 6章の7ステップに対応させています。

1. アプリ内カメラで撮影（`AVFoundation` 相当＝`getUserMedia`）
2. 固有ID発行（`UNEDITED-XXXX-XXXX`、`lib/id.ts`）・撮影日時を記録
3. 保存・共有操作時に、QR＋ID を画像ピクセルに合成（`lib/watermark.ts`）— **常時ON、オフ不可**
4. 合成後の最終画像（＝SNS等に流通する実ファイル）の SHA-256 ハッシュを算出（`lib/hash.ts`）
5. サーバーが ECDSA (P-256) で電子署名（`lib/server/keys.ts`、`app/api/records/route.ts`）
   - 署名対象は「合成後の最終画像」のハッシュのため、書き出し後に1ピクセルでも変化するとハッシュが変わり、検証で不一致になります（ハードバインディング）。
   - 画像本体はサーバーに保存されません。保存されるのは ID・ハッシュ値・署名・撮影日時のみ（`lib/server/store.ts`）。画像自体はブラウザの IndexedDB にのみ保存されます（`lib/history.ts`）。iOS版では PhotoKit 経由の写真ライブラリに相当します。
6. QRコードから `/verify/[id]` を開くと第三者が検証可能
7. 検証ページでは署名の正当性チェックに加え、画像ファイルをアップロードしてハッシュ値と完全一致するかを確認できます（`components/VerifyUploadCheck.tsx`）

## Xcode（ネイティブ）移行時の対応表

| Web版で使用 | iOS版での対応 |
|---|---|
| `getUserMedia` | `AVFoundation` |
| Web Crypto (`SHA-256`) | `CryptoKit` |
| IndexedDB（`idb-keyval`） | `PhotoKit` の写真ライブラリ（証明対象は自アプリ撮影分のみ） |
| Next.js API Routes（署名・検証API） | 企画書7章のバックエンド（証明ID発行・検証サーバー） |
| Canvas合成（QR＋透かし） | Core Graphics / Core Image でのピクセル合成 |

サーバー側の署名鍵・証明レコードは `data/`（gitignore 対象）にローカル保存される簡易実装です。本番運用では鍵管理（Secure Enclave / KMS 等）とDBへの置き換えが必要です。

## 動作確認済みの項目

Playwright（フェイクカメラデバイス）でのE2Eテストにより、以下を確認済みです。

- 撮影 → 確認 → 署名発行 → 透かし合成 → 保存/共有 の一連の流れ
- 証明情報詳細画面での署名の再検証（クライアント側で独立に検証）
- 履歴（IndexedDB）への保存、お気に入りタブでの絞り込み
- 撮り直し・カメラ切替後もカメラストリームが継続すること
- 外部の検証ページ（`/verify/[id]`）が正しい証明情報を表示すること、未登録IDでは「証明情報が見つかりません」と表示されること
- 検証ページでの画像アップロード照合：元の書き出しファイルは「一致」、1バイトでも改変すると「不一致」と判定されること（ハードバインディングの実証）
