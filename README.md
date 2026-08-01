# 車両在庫管理アプリ（GAS実装）

`24a6efae-______________.md`（車両在庫管理アプリ ビジョン）をベースにコード化した Google Apps Script プロジェクトです。
Google スプレッドシートをDBとし、GASの HTML Service で Webアプリ（拠点切替表示／3拠点横断表示、レスポンシブ対応）を提供します。

## ファイル構成

| ファイル | 対応するビジョン項目 |
|---|---|
| `Constants.gs` | 5.2 管理項目（列定義）、ステータス／仕入区分の選択肢 |
| `CompanyConfig.gs` | 5.1 3社×3タブ構成、会社ごとのスプレッドシート/ドライブフォルダ管理 |
| `SheetService.gs` | 4.2 在庫管理（CRUD）の基盤 |
| `ValidationService.gs` | 10.1 入力バリデーション（OCN・車台番号重複、必須項目） |
| `OcnService.gs` | 4.5 OCN自動採番 |
| `PdfLinkService.gs` | 4.1 車検証PDFリンク自動反映、4.7 自社名義車検証リンク |
| `StatusService.gs` | 4.3 販売済タブへの自動移動 |
| `NotificationService.gs` | 4.4 車検満了日メール通知、10.3 Slack等Webhook通知 |
| `OcrService.gs` | 査定書・車検証共通のOCR/テンプレート抽出基盤 |
| `AppraisalExtractionService.gs` | 4.5 査定書からの仕入情報自動抽出・下取損計算 |
| `InspectionExtractionService.gs` | 4.6 車検証からの顧客名・住所自動抽出 |
| `SearchService.gs` | 10.2 検索・絞り込み強化（登録番号4分割検索を含む） |
| `CsvExportService.gs` | 10.4 期間指定CSV出力 |
| `Api.gs` | クライアント（HTML）から呼び出すユースケース単位API |
| `Triggers.gs` | 時間主導型トリガー（PDF監視・車検満了チェック）のセットアップ |
| `Code.gs` | `doGet` エントリポイント |
| `html/Index.html` `html/Stylesheet.html` `html/JavaScript.html` | Webアプリ画面（一覧／詳細／新規登録ウィザード／ダッシュボード） |
| `tests/run.js` | 外部サービス非依存の純粋関数に対する単体テスト（Node.js, 追加依存なし） |

## セットアップ手順

1. **スプレッドシート・ドライブフォルダの準備**
   - 3社分のスプレッドシートを作成（各シートは初回アクセス時に `輸入車`/`国産車`/`販売済` タブが自動生成されます）
   - 会社ごとに「車検証PDF保管フォルダ」「査定書PDF保管フォルダ」をGoogleドライブに作成
2. **claspでのデプロイ**
   ```bash
   npm i -g @google/clasp
   clasp login
   clasp create --type webapp --title "車両在庫管理"
   clasp push
   ```
3. **会社設定の登録**
   - `CompanyConfig.gs` の `setupCompanies_()` 内のIDを実際のスプレッドシートID／フォルダIDに書き換えて、GASエディタから一度だけ実行
4. **拡張サービスの有効化**
   - GASエディタの「サービス」から **Drive API（v2）** を追加（`OcrService.gs` のOCR変換で使用）
5. **Script Properties の設定**（GASエディタ「プロジェクトの設定」）
   - `NOTIFY_MAIL_TO`: 車検満了通知の送信先メールアドレス
   - `SLACK_WEBHOOK_URL`: Slack等のIncoming Webhook URL（10.3、未設定なら通知はスキップ）
   - `VISION_API_KEY`: Cloud Vision API を使う場合のみ（`OcrService.gs` の代替実装で使用）
6. **トリガー設定**
   - GASエディタから `setupTimeDrivenTriggers_()` を一度だけ実行（PDF監視30分毎・車検満了チェック毎日8時）
7. **Webアプリとして公開**
   - `clasp deploy` または GASエディタの「デプロイ」→「ウェブアプリ」

## テスト

外部サービス（Spreadsheet/Drive/Vision等）に依存しない純粋ロジック（OCN採番の連番解析、PDFファイル名パース、
査定書テンプレート抽出・下取損計算、登録番号の複合検索、CSV生成）を Node.js の `vm` サンドボックスで検証します。

```bash
npm test
```

## 未実装・今回スコープ外（ビジョン 11. 今後の検討事項）

- 権限設計の詳細（編集者／閲覧者範囲、シート保護、承認フロー）
- 査定書PDFの実サンプルに基づくラベル文字列の最終調整（現状は複数の候補ラベルを許容する暫定テンプレート）
- Cloud Vision API利用時のコスト試算・呼び出し回数の見積もり
- ログイン・アクセス制御の最終方式（現状 `appsscript.json` は `DOMAIN` アクセスを既定値としており、要件に応じて変更が必要）
