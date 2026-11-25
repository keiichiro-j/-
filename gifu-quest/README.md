# ぎふクエスト 〜六つの宝珠〜

岐阜県の名所を舞台にした横スクロールアクション。Google Apps Script の Web アプリとして配信する（ゲームはすべてブラウザで動く・外部通信なし）。

- 設計書：[docs/design.md](docs/design.md)
- 実装の約束事・担当：[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- 開発ルール：[CLAUDE.md](CLAUDE.md)

## 遊び方（開発中）
```
npm install
npm run build          # dist/index.html ができる
open dist/index.html   # ブラウザで開くだけで遊べる
```
- `dist/index.html?stage=1&char=gen` … ステージ1からゲンで始める（char: leaf / minamo / gen / haku）
- F1 … 当たり判定・fps の表示と物理パラメータの調整

操作：←→ 移動 / ↓ しゃがむ / Z・Space ジャンプ / X・Shift 技（押しっぱなしでダッシュ）/ Esc 一時停止。ゲームパッド・スマホ横向きのタッチにも対応。

## GAS へ配置
`dist/` の `index.html`・`Code.gs`・`appsscript.json` を Apps Script プロジェクトへ（clasp なら `cd dist && clasp push`）。ウェブアプリとしてデプロイする（実行ユーザー：自分、アクセス：全員。Googleアカウントなしで遊べる）。

## テスト
`npm test` … vitest（当たり判定・物理・レベル検査）＋ヘッドレス Chrome で全ステージを自動プレイしてコンソールエラー0件を確認

## Google ログインと記録
GAS で公開すると、遊ぶ人を Google アカウントで見分けて、本人のセーブを Google アカウントに保存し、作った人のスプレッドシートに記録を残す（番付はニックネームだけ）。作り方は [docs/cloud.md](docs/cloud.md)
