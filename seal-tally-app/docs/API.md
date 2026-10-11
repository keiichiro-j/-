# 画面⇔サーバー API 仕様（社内用）

画面（html/）は `google.script.run` で Api.gs の関数を呼ぶ。全関数は次の形の**プレーンなオブジェクト**を返す
（Date 型は使わず、日付は `"yyyy-MM-dd"`、日時は `"yyyy-MM-dd HH:mm"` の文字列）。

```js
{ ok: true,  data: {...}, message: "画面に出す一言（任意）" }
{ ok: false, error: "利用者に見せる理由文" }
```

例外はサーバー側ですべて捕まえて `ok:false` にする（`withApi_(fn)` ラッパー）。
権限が無い場合は `error: "この操作は管理者のみ行えます"` など。

## 共通オブジェクト

### Payload（画面全体の再描画用。保存系はすべてこれを data.payload で返す）

```js
{
  user: { email, name, role },            // role: "管理者" | "編集者"
  today: "2026-10-11",
  month: "2026-10",                        // 表示中の月
  months: ["2026-10", "2026-09"],          // 選べる月（新しい順。開始月〜今月）
  records: [RecordView],                   // 表示中の月の明細（monthOfRecord_ が month のもの）
  review: [RecordView],                    // 全期間で状態が 重複/要確認/誤りの疑い の明細
  stock: { A: StockSum, B: StockSum, AI: StockSum },  // 表示中の月
  stockRows: [StockRow],                   // 受入・調整の全記録（日付の新しい順）
  closings: { "2026-09": { closed: true, by, at } },
  settings: {
    folders: [ { key:"folder.A新", label:"ブランドA・新車", brand:"A", nc:"新", id, url, name, ok, pending } ],
    autoEnabled, intervalMin, tolDays, useVin, lowStock, closeRemind, notifyTo,
    startMonth, startCarry: { A, B, AI }, yearly, appUrl
  },
  areas: { "岐阜": [..], "愛知": [..], "対象外": [..] },
  recentLog: [ { at, fileName, kind: "record"|"skip"|"error", recordId, status, statusCode, regDate, unit, reason } ],  // 新しい順 最大10件
  importStatus: { lastRun, pendingPdf, skippedThisMonth, nextClose: "2026-11-01" },
  users: [ { email, name, role } ],
  settingsHistory: [ { at, by, text } ],   // 新しい順 最大20件
  outputFiles: { detail: { name, url }, count: { name, url }, report: { name, url } }   // 未作成なら null
}
```

### RecordView

明細シートの1行（Config.gs の COLUMNS[明細] のプロパティ名）に次を足したもの。

```js
{
  id, regDate, area, cls, kana, num, brand, nc, unit, vin, status,
  checks: [ { code, level, title, msg } ],   // level: "err"|"pend"|"warn"|"info"
  acked: ["kana"], noSeal, noSealReason, inputType: "自動"|"手入力", manualReason,
  excluded, excludeReason, dateCandidates: ["2026-10-09"], fileId, fileName, savedDate, importedAt,
  updatedBy, updatedAt,
  statusCode: "ok"|"err"|"warn"|"pend"|"ns"|"ex",
  month: "2026-10",
  locked: false                              // 締め済みの月なら true
}
```

### StockSum / StockRow

```js
StockSum = { carry, received, adjusted, used, left, negativeDays: ["2026-10-06"], pending: 3 /* 未確定件数 */, low: true /* left < lowStock */ }
StockRow = { id, kind: "受入"|"調整", date, unit, qty, memo, canceled, by, at, locked }
```

## 関数一覧

| 関数 | 引数 | data | 権限 |
|---|---|---|---|
| `apiBootstrap(month?)` | 省略時は今月 | `Payload` | 全員 |
| `apiGetRecord(id)` | | `{ record: RecordView, history: [{at,by,text}], previewUrl }` previewUrl は `https://drive.google.com/file/d/<id>/preview`（手入力は null） | 全員 |
| `apiSaveRecord(id, patch, month)` | patch: `{area,cls,kana,num,regDate,brand,nc,noSeal,noSealReason,manualReason}` | `{ payload, record }` | 編集者以上 |
| `apiAckCheck(id, code, month)` | | `{ payload, record }` | 編集者以上 |
| `apiExclude(id, reason, month)` | reason 必須 | `{ payload, record }` | 編集者以上 |
| `apiRestore(id, month)` | | `{ payload, record }` | 編集者以上 |
| `apiAddManual(input, month)` | `{area,cls,kana,num,regDate,brand,nc,manualReason}` 全項目必須 | `{ payload, record }` | 編集者以上 |
| `apiAddStock(input, month)` | `{kind:"受入"|"調整",date,unit,qty,memo}` | `{ payload }` | 編集者以上 |
| `apiToggleStock(id, month)` | 取消⇔取消の取り消し | `{ payload }` | 編集者以上 |
| `apiGetReport(month)` | | `ReportData`（下記） | 全員 |
| `apiCloseMonth(month)` | | `{ closed: true, payload }` または `{ closed: false, blocking: { dup, pend, warn, total } }` | 管理者 |
| `apiReopenMonth(month, reason)` | reason 必須 | `{ payload }` | 管理者 |
| `apiExportSubmission(month)` | | `{ folderUrl, files: [{name,url}] }` 要確認が残っていれば ok:false | 編集者以上 |
| `apiCheckFolder(urlOrId)` | | `{ id, url, name, pending }` 見つからない／権限なしは ok:false | 管理者 |
| `apiSaveSettings(input, month)` | `{folders:{"folder.A新":urlOrId,...}, autoEnabled, intervalMin, tolDays, useVin, lowStock, closeRemind, notifyTo, startCarry:{A,B,AI}, yearly}` | `{ payload }` | 管理者 |
| `apiSaveAreas(areas, month)` | `{岐阜:[..],愛知:[..],対象外:[..]}` | `{ payload }` | 管理者 |
| `apiSaveUsers(users, month)` | `[{email,name,role}]` 管理者が最低1人 | `{ payload }` | 管理者 |
| `apiRunImportNow(month)` | | `{ payload, result: { imported, skipped, review, errors, remaining } }` | 編集者以上 |

### ReportData（帳票タブのプレビュー。シートに書く内容と同じ組み立て関数から作る）

```js
{
  month, closed, blocking: { dup, pend, warn, total },
  files: { detail: "封印明細書_2026", count: "封印台数集計書_2026", report: "封印報告書_2026" },
  detail: [ { key:"A新", label:"ブランドA新車", unit:"A", sheetName:"10月_ブランドA新車",
              rows: [ { date, dow:"木", dayType:""|"sat"|"sun"|"hol", holiday:"", count, pending, plates:["岐阜303に1213"] } ],
              total, maxCols } ],
  count:  [ { key:"A", label:"ブランドA", unit:"A", sheetName:"10月_ブランドA", carry,
              rows: [ { date, dow, dayType, holiday, received, adjusted, used, pending, balance } ],
              totals: { received, adjusted, used, left } } ],
  report: [ { key:"A", label:"ブランドA", unit:"A", sheetName:"10月_ブランドA", carry, received, adjusted, used, left } ]
}
```
