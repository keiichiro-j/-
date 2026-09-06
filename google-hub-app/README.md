# Google連携統合管理アプリ（GAS実装）

`ab1f91ff-google_______________v2.docx`（Google連携統合管理アプリ 企画書 v2）をベースにコード化した
Google Apps Script プロジェクトです。Drive・Calendar・Mail と自社製GASアプリ群を1画面に集約する
「統合ホーム画面」を提供します。

他のプロジェクト（`vehicle-order-app/` 等）と異なり、本プロジェクトは企画書 13章の指定に従い
**clasp + TypeScript** でローカル開発し、ビルド成果物（`dist/`）をGASへpushする構成です。

## ディレクトリ構成

| パス | 対応する企画書項目 |
|---|---|
| `src/Code.ts` | 7. システム構成（`doGet`エントリポイント、`google.script.run`用API） |
| `src/theme.ts` | 6. カラーテーマ仕様（11色+ランダム2色、YIQ輝度による文字色自動切替） |
| `src/services/driveService.ts` | 4. Drive機能（一覧・検索・並び替え・プレビュー・共有設定変更・移動） |
| `src/services/calendarService.ts` | 4. Calendar機能（予定作成/編集/削除・ゲスト招待・複数カレンダー統合） |
| `src/services/mailService.ts` | 4. Mail機能（直近N件の件名一覧） |
| `src/services/appLedger.ts` | 4. スクリプト管理／11.2 自社アプリ台帳（スプレッドシート台帳・簡易死活監視） |
| `src/services/userSettingsService.ts` | 5.2 ホーム画面のカスタマイズ機能（個人設定） |
| `src/services/globalSettingsService.ts` | 5.3 アプリ全域のデータ設定（全体設定） |
| `src/services/dateUtils.ts` | ミニカレンダー表示用の月範囲計算 |
| `src/html/Index.html` 他 | 5.1 全体レイアウト（左コントロールパネル＋右カード縦積み／Drive画面／設定画面） |
| `tests/run.js` | 外部サービス非依存の純粋関数に対する単体テスト（Node.js, 追加依存なし） |

Drive機能は企画書5.1のホーム3カード（カレンダー／メール／リンク集）には含まれないため、
左コントロールパネルに専用の「Drive」ナビ項目を追加し、別画面として実装しています。

## セットアップ手順

1. **依存パッケージのインストール**
   ```bash
   cd google-hub-app
   npm install
   ```
2. **GASプロジェクトの作成**
   ```bash
   npx clasp login
   npx clasp create --type webapp --title "Google連携統合管理アプリ" --rootDir dist
   ```
   生成された `.clasp.json` の内容を確認し、`scriptId` を控えておく（`.clasp.json` はコミット対象外）。
   `.clasp.json.example` を参考にしてください。
3. **ビルド＆プッシュ**
   ```bash
   npm run clasp:push
   ```
4. **Webアプリとしてデプロイ**
   - GASエディタの「デプロイ」→「ウェブアプリ」、または `npx clasp deploy`
   - `appsscript.json` の既定値は `access: MYSELF`（個人アカウント運用を前提とした最も安全な既定値）。
     社内Workspaceドメインで運用する場合は `DOMAIN` に変更してください（11.1 参照）。
5. **初回アクセス**
   - アプリ台帳（スクリプト管理）用のスプレッドシートは初回アクセス時に自動作成され、
     スクリプトプロパティ `LEDGER_SPREADSHEET_ID` に保存されます（手動作成不要）。
   - 同期対象カレンダー・メールラベル・通知設定は「全体設定」画面からいつでも変更できます。

## テスト

Calendar/Drive/Gmail/Spreadsheet等の外部サービスに依存しない純粋ロジック
（テーマ抽選・輝度判定、設定値のサニタイズ、ゲストCSV解析、HTTPステータス判定、
Drive一覧の並び替え、月範囲計算）を Node.js の `vm` サンドボックスで検証します。
実行前に一度 `npm run build` が必要です。

```bash
npm run build
npm test
```

## OAuthスコープについて（11.1 開発・セキュリティ面のベストプラクティス）

`appsscript.json` は本アプリの機能（Driveの共有設定変更・移動、Calendarの予定操作、
Gmail読み取り、スプレッドシート台帳、簡易死活監視のUrlFetchApp）に必要な最小限のスコープを
指定しています。Drive共有設定の変更・移動はアプリ作成外のファイルにも及ぶため、
`drive.readonly` や `drive.file` では不足し、フルスコープの `drive` を使用しています。
将来的に共有設定変更・移動機能を使わない場合は、`drive.readonly` へ絞り込むことを推奨します。

## 制約事項・留意点（企画書 8章 準拠）

- 1回のスクリプト実行は最大6分でタイムアウトするため、`checkAllApps()` によるアプリ台帳の
  一括稼働確認は登録数が多い場合に分割実行を検討してください。
- カレンダーへのゲスト招待メール送信もGmail送信枠を消費するため、大量自動送信は避けてください。
- Google Chatとの連携は本フェーズの対象外です（将来フェーズで再検討）。

## 未実装・今回スコープ外

- Google Chat連携（将来フェーズ）
- 承認フロー・PDF帳票自動生成・生成AI連携（企画書 11.3 将来拡張候補）
- Drive一覧のサムネイル画像表示（現状はmimeTypeベースのアイコン表示のみ）
- 複数メンバー分の統合閲覧機能（Workspaceアカウント運用への移行時に再検討）

## 開発体制

企画書9章の体制（プロジェクトオーナー／ディレクター・PM／GAS開発担当／UI・UXデザイン担当／
QA担当）を踏まえ、要件整理・実装・UI設計・品質確認の観点を横断しながら実装しました。
