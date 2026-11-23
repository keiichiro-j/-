# GIFU OPEN ROAD 3D
設計書は docs/design.md。仕様の判断に迷ったら必ず設計書を優先する。

## 制約
- 配信は Google Apps Script（HtmlService）。最終成果物は dist/index.html と gas/Code.gs（gas/index.html はビルドで生成）
- three.js は r128 固定。他の外部ライブラリ、外部画像、外部音声は使わない（すべてコードで生成）
- 実在の企業名、商品名、GTAの名称・ロゴ・UIは使わない
- 血や肉体の欠損は描かない。子どものNPCは出さない
- PC 60fps、中位スマホ30fpsを守る。設計書2章の性能予算を超えない

## 進め方
- 1回の作業で1フェーズだけ実装する。始める前に計画を書いて確認を取る
- 数値パラメータは src/core/config.js と各定義表（weapons.js, vehicle.js, wanted.js, missions.js）に集め、コードに直書きしない
- ロジックは node:test（tests/unit）、表示は Playwright（tests/smoke.mjs、three.js は同梱ビルドを使う）で確認し、スクリーンショットを tests/shots/ に保存する
- 完了時は、受け入れ基準の各項目について確認結果を報告する

## コマンド
- npm run build        → dist/index.html と gas/index.html（three.js は CDN）
- npm run build:inline → three.js 同梱（外部通信なしで起動）
- npm test             → ロジックの単体テスト
- npm run smoke        → ヘッドレスChromiumで起動確認（先に build:inline）
- npm run deploy       → build → clasp push（.clasp.json が必要）
