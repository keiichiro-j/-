# ぎふクエスト 開発ルール

## 必ず守ること
- 実行環境は Google Apps Script の HtmlService。最終成果物は Code.gs と index.html の2ファイルのみ
- 描画は Canvas 2D。外部ライブラリ・外部画像・外部音声・CDNは使わない（絵も音もコードで作る）
- index.html は build スクリプトで src/ から組み立てる。dist/index.html を直接編集しない
- 任天堂等の既存作品のキャラ・名前・デザイン・音楽を真似しない。土管、キノコで巨大化、？ブロック、旗ざおのゴールは使わない
- 岐阜の地名・名物は題材として使うが、地図は架空。タイトル画面に「この作品はフィクションです」を表示する
- PCで60fps、スマホで50fps以上。毎フレームの新しい配列・オブジェクトの作成は避ける
- 物理は固定ステップ（1/120秒）で計算し、描画と分ける

## 作業の進め方
- 設計書（docs/design.md）の数値・仕様に従う。変える必要があれば理由を書いて提案する
- モジュール間の約束事は docs/ARCHITECTURE.md。担当ファイル以外を変えるときはそこを更新する
- 調整用の数値は src/core/config.js と src/data/ にまとめ、コードに直接書かない
- 変更のたびに `npm run build && npm test`（vitest＋ヘッドレスChromeの自動テスト）を通す。コンソールエラー0件
- フェーズの終わりに、PCとスマホ幅の画面写真を screenshots/ に保存する（`node tests/e2e/smoke.mjs --shots`）

## コマンド
- `npm run build` … dist/index.html を作る（`--dev` でソースマップ付き、`--out dist-artifact --artifact` で claude.ai アーティファクト用）
- `npm test` … 単体テスト＋全ステージ自動プレイ
- ブラウザで `dist/index.html?stage=1&char=gen` を開くとステージ1から直接始まる。F1 で当たり判定表示と物理パラメータ調整
