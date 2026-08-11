# 資格試験 解答記録アプリ（Next.js + Google Sheets、Vercelデプロイ版）

`資格試験解答アプリ_企画書.md` の「②ショートカット起動のWebアプリ方式」に基づくWebアプリです。
Vercel上でホストし、データはGoogleスプレッドシートに保存することで、iPhone・PCのどちらからアクセスしても
同じ解答セット・履歴を参照できるようにしています（`kaitou-kiroku-gas/` のGoogle Apps Script版と同じ設計思想を、
Next.js + Vercelスタックで実装したものです）。

## 画面構成（企画書 6.）

1. **セット一覧画面**（`/`）: 解答セットの新規作成・過去セットの選択
2. **設定画面**（`/new`）: 問題数・出題形式（一括設定＋問題ごとの個別上書き）
3. **解答入力画面**（`/sets/[id]/answer`）: 問題ごとの解答欄（選択式ボタン／記述式テキスト）＋備考欄。入力は自動保存
4. **採点・結果画面**（`/sets/[id]/result`）: 正解入力→選択式は自動採点、記述式は○／△／✕の自己申告。正答率・不正解一覧・備考の振り返り
5. **アプリ設定画面**（`/settings`）: テーマ（ライト／ダーク／端末設定に追従）

## 技術構成

- **Next.js 16**（App Router）／React 19／TypeScript／Tailwind CSS v4
- **データ保存先**: Googleスプレッドシート（サービスアカウントで [Google Sheets API](https://developers.google.com/sheets/api) を直接呼び出し、`lib/sheetsStore.ts` が読み書きする）
- ローカル開発時、Sheetsの認証情報が未設定であれば `lib/memoryStore.ts`（`.data/dev-store.json` に保存するファイルストア）に自動フォールバックし、認証情報を用意しなくても `npm run dev` で画面遷移を確認できます。**本番（Vercel）では常にGoogle Sheetsを使用します。**

## Vercelへのデプロイ手順

### 1. Google Cloud側の準備（サービスアカウント作成）

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成（または既存のものを利用）
2. 「APIとサービス」→「ライブラリ」から **Google Sheets API** を有効化
3. 「APIとサービス」→「認証情報」→「認証情報を作成」→「サービスアカウント」で新規作成
4. 作成したサービスアカウントの「鍵」タブから「鍵を追加」→ JSON形式でキーをダウンロード
   - JSON内の `client_email` と `private_key` を後で使用します

### 2. データ保存用スプレッドシートの準備

1. Googleスプレッドシートを新規作成（空のシートでよい。シート/タブは初回アクセス時にアプリが自動生成します）
2. 右上の「共有」から、手順1の `client_email`（例: `xxx@yyy.iam.gserviceaccount.com`）を**編集者**として共有
3. スプレッドシートのURL `https://docs.google.com/spreadsheets/d/【この部分】/edit` からIDをコピー

### 3. Vercelへのデプロイ

1. このリポジトリ（`kaitou-kiroku-web/` をルートディレクトリに指定）をVercelにインポート
2. プロジェクトの環境変数（Settings → Environment Variables）に以下を設定
   | 変数名 | 値 |
   |---|---|
   | `GOOGLE_SERVICE_ACCOUNT_EMAIL` | サービスアカウントの `client_email` |
   | `GOOGLE_PRIVATE_KEY` | サービスアカウントの `private_key`（`-----BEGIN PRIVATE KEY-----` を含む全文をそのまま貼り付け。改行がエスケープされた `\n` 形式でも、実改行のままでもどちらでも動作します） |
   | `GOOGLE_SHEETS_SPREADSHEET_ID` | 手順2でコピーしたスプレッドシートID |
3. デプロイ実行。デプロイ後に発行されるURLがアプリのURLになります

### 4. iPhoneのショートカット設定（企画書 9.）

「ショートカット」アプリで「Webサイトを開く」アクションにデプロイ後のURLを設定し、ホーム画面に追加します。
（またはSafariでURLを開き、共有シートから「ホーム画面に追加」でもOK）

## ローカル開発

```bash
cd kaitou-kiroku-web
npm install
npm run dev
```

Google Sheetsの認証情報（環境変数）が未設定の場合、自動的に `.data/dev-store.json` を使うローカル用ストアで動作します
（`.gitignore` 済み）。Sheets連携ごと確認したい場合は `.env.local` に上記3つの環境変数を設定してください。

## テスト・ビルド

```bash
npm test    # lib/scoring.ts の純粋ロジックの単体テスト（Node.js標準のtest runner、追加依存なし）
npm run lint
npm run build
```

## ファイル構成

| パス | 役割 |
|---|---|
| `lib/scoring.ts` | 外部サービス非依存の純粋ロジック（出題形式の組み立て、正誤判定、正答率集計）。`tests/scoring.test.ts` の対象 |
| `lib/sheetSchema.ts` | Sheets上のシート名・列定義 |
| `lib/sheetsStore.ts` | Google Sheets APIを使ったデータストア実装（本番用） |
| `lib/memoryStore.ts` | ローカル開発用フォールバックストア（`.data/dev-store.json`） |
| `lib/store.ts` | 環境に応じてどちらのストアを使うか選択する |
| `lib/theme.ts` | テーマ（ライト／ダーク／端末設定）の適用・永続化 |
| `app/api/**` | クライアントから呼び出すRoute Handlers（セットのCRUD、解答保存、採点保存、テーマ設定） |
| `app/page.tsx` `app/new/page.tsx` `app/sets/[id]/answer/page.tsx` `app/sets/[id]/result/page.tsx` `app/settings/page.tsx` | 5画面 |
| `components/AnswerScreen.tsx` `components/ResultScreen.tsx` | 解答入力・採点結果画面のクライアントロジック |

## 実装上の簡略化・今後の検討事項（企画書 9. に対応）

- **テーマ設定の同期**: Sheets上の`Settings`シートに保存し、初回アクセス時のみサーバー値で端末のlocalStorageを補正します（既存タブでの選択直後に古いサーバー値で上書きしないよう、再取得は初回ロード時の一度のみに限定しています）
- **自動保存**: 解答・備考の入力はデバウンス（約0.7秒）でサーバーへ保存し、画面離脱時・タブ非表示化時にも即時保存します。オフライン時のローカル下書き保持は未実装のため、電波が不安定な環境では保存タイミングにご注意ください
- **分野別（カテゴリ別）の正答率集計・複数資格のフォルダ分け・記述式の点数式採点・受験結果の推移グラフ**: 未実装（今後の検討事項）
- **アプリアイコン**: 暫定のコード生成アイコン（`app/icon.tsx` / `app/apple-icon.tsx`）を仮で設定しています。企画書 7. の通り、洗練されたデザイン案は別途差し替え可能です
