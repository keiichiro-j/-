# 車両在庫管理アプリ（GAS実装）

`24a6efae-______________.md`（車両在庫管理アプリ ビジョン）をベースにコード化した Google Apps Script プロジェクトです。
Google スプレッドシートをDBとし、GASの HTML Service で Webアプリ（拠点切替表示／3拠点横断表示、レスポンシブ対応）を提供します。

同じGASプロジェクト内に、ワイヤーフレームを元にした「登録スケジュール管理アプリ」（弊社休日・陸運支局休日・登録締切のカレンダー管理）も同梱しています。
Webアプリの `?page=schedule` でアクセスできます（未指定時は車両在庫管理画面）。

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
| `PdfReportService.gs` | 10.4 期間指定PDF帳票出力（A4横・複数ページ対応） |
| `Api.gs` | クライアント（HTML）から呼び出すユースケース単位API |
| `Triggers.gs` | 時間主導型トリガー（PDF監視・車検満了チェック）のセットアップ |
| `Code.gs` | `doGet` エントリポイント（`?page=schedule` で登録スケジュール管理画面を出し分け） |
| `html/Index.html` `html/Stylesheet.html` `html/JavaScript.html` | Webアプリ画面（一覧／詳細／新規登録ウィザード／ダッシュボード） |
| `ScheduleConstants.gs` | 登録スケジュール管理：イベント種別（休日／締切）・Script Propertiesキー定義 |
| `ScheduleCalendar.gs` | 登録スケジュール管理：カレンダーグリッド生成・イベント集計・月次シートタブ名の算出（外部サービス非依存の純粋関数） |
| `ScheduleService.gs` | 登録スケジュール管理：予定データの月次シート（`yyyy-MM`）CRUD、編集権限・支局マスタ管理 |
| `ScheduleApi.gs` | 登録スケジュール管理：クライアントから呼び出すAPI |
| `html/ScheduleIndex.html` `html/ScheduleStylesheet.html` `html/ScheduleJavaScript.html` | 登録スケジュール管理 画面（月表示カレンダー・日付詳細ポップアップ、レスポンシブ対応） |
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
   - GASエディタの「サービス」から **Drive API（v2）** を追加（アップロード時の自動ドキュメント変換防止で使用）
5. **OCR.space APIキーの取得（査定書・車検証OCRに必須・無料・カード登録不要）**
   - https://ocr.space/ocrapi にアクセスし、メールアドレスを入力してAPIキーを取得（月25,000件まで無料、クレジットカード不要）
   - GCPの課金設定が可能であれば、代わりにCloud Vision API（より高精度・要課金設定）へ切り替えることも可能（`OcrService.gs` の `ocrFileToTextViaVisionApi_` を参照）
6. **Script Properties の設定**（GASエディタ「プロジェクトの設定」）
   - `OCR_SPACE_API_KEY`: 手順5で取得したAPIキー（**必須**。査定書・車検証のOCR読み取りに使用）
   - `NOTIFY_MAIL_TO`: 車検満了通知の送信先メールアドレス
   - `SLACK_WEBHOOK_URL`: Slack等のIncoming Webhook URL（10.3、未設定なら通知はスキップ）
7. **トリガー設定**
   - GASエディタから `setupTimeDrivenTriggers_()` を一度だけ実行（PDF監視30分毎・車検満了チェック毎日8時）
8. **Webアプリとして公開**
   - `clasp deploy` または GASエディタの「デプロイ」→「ウェブアプリ」

## 登録スケジュール管理アプリ（付属機能）のセットアップ

弊社休日・陸運支局休日・登録締切（紙登録／OSS登録／希望番号）をカレンダーで確認・登録できる画面です。
上記の車両在庫管理と同じGASプロジェクト・同じデプロイで動作し、`?page=schedule` を付けたURLでアクセスします
（例：`https://script.google.com/macros/s/【デプロイID】/exec?page=schedule`）。

1. **予定データ用スプレッドシートの準備**
   - 予定（休日・締切）を保存するスプレッドシートを1つ作成する
   - シートタブは **月ごと**（`2026-08` のような `yyyy-MM` 形式）に自動生成・自動振り分けされる（その月の予定が最初に登録されたタイミングで作成され、既存タブと時系列順に並ぶ）。事前に手動でタブを作る必要はない
2. **Script Properties の設定**（GASエディタ「プロジェクトの設定」、車両在庫管理と共通のプロジェクトに追加）
   - `SCHEDULE_SHEET_ID`: 手順1で作成したスプレッドシートのID（**必須**。`ScheduleService.gs` の `setupScheduleSpreadsheet_()` を書き換えて一度だけ実行しても登録できます）
   - `SCHEDULE_EDITORS`: 編集権限を持つユーザーのメールアドレスをJSON配列で指定（例：`["a@example.com","b@example.com"]`）。**未設定の場合は全員が編集可**（閲覧専用に制限したい場合は設定してください）
   - `SCHEDULE_OFFICES`: 管轄する陸運支局名のJSON配列（例：`["〇〇陸運支局","△△陸運支局"]`）。未設定時は仮の支局名1件のみで動作し、編集権限者は画面から「＋支局追加」で追加登録できます
3. **動作確認**
   - 編集権限があるユーザーでアクセスすると、日付クリック時のポップアップに「＋ 予定を追加」「編集」「削除」が表示されます
   - 編集権限がないユーザー（`SCHEDULE_EDITORS` 設定時）には閲覧のみが表示されます

## テスト

外部サービス（Spreadsheet/Drive/Vision等）に依存しない純粋ロジック（OCN採番の連番解析、PDFファイル名パース、
査定書テンプレート抽出・下取損計算、登録番号の複合検索、登録スケジュール管理のカレンダーグリッド生成・イベント集計）を
Node.js の `vm` サンドボックスで検証します。
PDF帳票生成（`PdfReportService.gs`）やスプレッドシートCRUD（`ScheduleService.gs` 等）はスプレッドシート/Driveに依存するためNode側のテスト対象外です。

```bash
npm test
```

## 未実装・今回スコープ外（ビジョン 11. 今後の検討事項）

- 権限設計の詳細（編集者／閲覧者範囲、シート保護、承認フロー）
- 査定書PDFの実サンプルに基づくラベル文字列の最終調整（現状は複数の候補ラベルを許容する暫定テンプレート）
- Cloud Vision API利用時のコスト試算・呼び出し回数の見積もり
- ログイン・アクセス制御の最終方式（現状 `appsscript.json` は `DOMAIN` アクセスを既定値としており、要件に応じて変更が必要）
