# 新車新規登録依頼書 発行システム（GAS実装）

`SPEC.md`（仕様書 v0.2）をベースに実装した、独立スタンドアロンのGoogle Apps Scriptプロジェクトです。
既存の「車両在庫管理アプリ」（リポジトリルート）とは別ファイル・別スプレッドシートで動作します。

## ファイル構成

| ファイル | 内容 |
|---|---|
| `Constants.gs` | シート名・セル位置・列マッピング・履歴タブのヘッダー等の定数 |
| `ValidationService.gs` | フォーム入力のサーバー側検証（純粋関数、Node.jsでテスト可能） |
| `TemplateService.gs` | テンプレート複製・値の書き込み・PDFエクスポート・Drive保存 |
| `HistoryService.gs` | 履歴タブ（月次管理）の取得/作成/追記、サジェスト候補の収集 |
| `Api.gs` | クライアントから呼び出すエントリポイント（`processFormData` `getSuggestions`） |
| `Code.gs` | `doGet` エントリポイント |
| `html/Index.html` `html/Stylesheet.html` `html/JavaScript.html` | 入力フォーム画面 |
| `tests/run.js` | 外部サービス非依存の純粋関数に対する単体テスト（Node.js、追加依存なし） |

## 主な設計ポイント（SPEC.md 3章対応）

- 依頼の送信ごとに、テンプレートシート（OSS用/紙用）を`copyTo()`で一時シートとして複製し、複製先にのみ値を書き込む。複製の瞬間だけ`LockService`で保護し、PDF出力を待つ間は他の担当者をブロックしない。同時送信でデータが混在しない。
- 車両ごとに、その車両の**登録日が属する年月**のタブ（`YYYY-MM`）へ履歴を追記する。タブが無ければヘッダー付きで自動作成する。登録日が未入力の場合は「登録日未定」タブへ記録する。
- PDFは `依頼書PDF/yyyy-MM/`（処理日基準）フォルダへ保存する。

## セットアップ手順

1. **専用スプレッドシートの作成**
   - 新規スプレッドシートを1冊作成し、以下のシートを手動で用意する
     - `新車新規登録依頼書（書類送付書）OSS`（テンプレート、`Constants.gs`の`COMMON_CELLS`/`VEHICLE_COLUMNS.OSS`のセル位置に合わせてレイアウト）
     - `新車新規登録依頼書（書類送付書）紙`（同上、`VEHICLE_COLUMNS.PAPER`）
   - 履歴タブ（`YYYY-MM`、「登録日未定」）は初回送信時に自動生成されるため事前作成は不要
2. **claspでのデプロイ**
   ```bash
   npm i -g @google/clasp
   clasp login
   cd vehicle-registration-form-system
   clasp create --type webapp --title "新車新規登録依頼書 発行システム"
   clasp push
   ```
   - `clasp create`で生成された`.clasp.json`のスプレッドシートを、手順1で作成した専用スプレッドシートに**コンテナバインド**する（`clasp create --parentId <スプレッドシートID>`、または後からGASエディタの「リソース」からバインドし直す）
3. **拡張サービスの有効化**
   - 特別な拡張サービスの追加は不要（`SpreadsheetApp` `DriveApp` `UrlFetchApp` `LockService`は標準）
4. **Webアプリとして公開**
   - `clasp deploy` または GASエディタの「デプロイ」→「ウェブアプリ」
   - アクセス範囲は`appsscript.json`の`webapp.access`で管理（デフォルト`DOMAIN`＝組織内のみ）

## テスト

```bash
npm test
```

## 実装にあたって暫定で決めた事項（SPEC.md 8章「未確定事項」への対応）

仕様確定前に実装を進めたため、以下は暫定のデフォルト値で実装している。運用が固まり次第、`Constants.gs`の値を調整するか、設計を見直すこと。

| 項目 | 暫定の実装内容 |
|---|---|
| サジェスト候補の収集元 | 固定マスタは使わず、履歴タブの過去入力から自動収集（`HistoryService.gs#collectSuggestions_`） |
| サジェスト収集の対象範囲 | 直近6ヶ月分のタブ（`Constants.gs`の`SUGGESTION_MONTHS_BACK`で変更可） |
| Web Appのアクセス範囲 | `appsscript.json`で`DOMAIN`（組織内のみ）に設定。特定ユーザーのみに絞る場合は要変更 |
| PDFの保存期間 | 無期限保存（自動削除は未実装） |
| 「登録日未定」タブの移動運用 | 手動移動を前提とし、移動用のUI・自動化機能は未実装（スコープ外） |

また、SPEC.md 4.1の表では OSS の個別登録日を「行内に入力がある場合は必須」としていたが、4.3で設計した「登録日未定」タブの受け皿と矛盾するため、**実装では個別登録日を必須にしていない**（未入力なら「登録日未定」タブに記録する）。この解釈で問題なければSPEC.mdの4.1表も合わせて修正する。
