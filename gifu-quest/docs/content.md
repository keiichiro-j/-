# やり込み：称号・毎日のお題・腕試し 仕様

マップの「記録」から入る画面（`records`、params: `{ back, tab: 0称号|1お題|2腕試し }`）で、3つのタブを見られる。
**現実のお金は使わない。** 報酬はすべて持ちコイン（福引きに使う）。

## コインの目安
| もらい方 | 枚数 |
|---|---|
| ステージ1回 | 約110枚 |
| 毎日のお題（1日3つ） | 1つ60〜120枚。1日最大 約360枚（福引き3回分ほど） |
| 称号（一度きり・35個） | 50〜300枚。全部で約5200枚 |
| 腕試し（1回6〜8分） | 勝ちぬき150・ノーミス+100・ベスト更新+50 |

## 1. 称号（src/data/achievements.json）
達成すると「称号を得た」の木札の通知（src/ui/toast.js）が出て、すぐにコインが入る。記録画面では、得た称号は朱の「得」の判子と日付、まだの称号も条件・報酬・進み具合（例 120 / 300）が見える。

| id | 名前 | 条件 | 報酬 |
|---|---|---|---|
| first_clear | 初陣 | ステージを1つクリア | 50 |
| orb3 | 宝珠みっつ | 宝珠を3つ | 100 |
| orb6 | 六つの宝珠 | 宝珠を6つ全部 | 200 |
| ending | 物語の結び | エンディングを見る | 150 |
| ura | 天空の宝殿 | うらステージをクリア | 300 |
| south_orb | 南の宝珠 | 特別ステージ8（沖縄・ニライカナイの島）をクリア | 300 |
| nirai_hero | ニライカナイの勇者 | ステージ8をミスも被弾もなしでクリア | 300 |
| sarubobo6 / sarubobo18 | さるぼぼ集め／名人 | さるぼぼ6個／18個 | 50 / 200 |
| coins1000 / coins5000 | 小判長者／大判長者 | コインを累計1000／5000枚拾う | 100 / 200 |
| enemy100 / enemy300 | 腕自慢／百戦錬磨 | 敵を累計100／300体 | 80 / 150 |
| stomp100 | 踏みつけ上手 | 累計100回踏みつける | 80 |
| chain5 / chain8 | 五段跳び／八艘跳び | 着地せずに5／8体続けて踏む | 80 / 150 |
| nomiss_clear | 無傷の旅 | ミスも被弾もなしでクリア | 100 |
| nomiss_boss / nomiss_boss6 | 見切り／見切りの達人 | 一度も当たらずにボスを倒す（1体／6体それぞれ） | 120 / 300 |
| char_leaf, char_minamo, char_gen, char_haku | 〇〇の旅人 | そのキャラでクリア | 各50 |
| char_sarubobo | 守り神の旅 | さるぼぼでクリア | 100 |
| weapon_kiwami | 極めし者 | 極の武器を手に入れる | 150 |
| weapon10 / weapon30 | 武器集め／武器蔵の主 | 武器10種／30種 | 100 / 300 |
| gacha10 | 福引き好き | 福引き累計10回 | 50 |
| signs_all | 物知り博士 | 名物看板（ステージ1〜7）を全部読む | 150 |
| zukan_all | 敵図鑑の完成 | すべての種類の敵を倒す | 150 |
| target1 / target6 | 早駆け／韋駄天 | 目標タイムを1つ／6ステージすべて | 50 / 300 |
| missions10 | 日々精進 | お題を累計10個 | 100 |
| rush_clear | 六番勝負 | 腕試しを勝ちぬく | 200 |
| rush_nomiss | 天下無双 | 腕試しをノーミスで | 300 |

条件の種類（cond.type）：mainCleared(n), stageCleared(stage), stageNoMiss(stage：そのステージをノーミスでクリア。recordClear が records.noMissStages に書く), seenEnding, sarubobo(n), rec(key,n：records の累計), noMissBoss(n), charClear(char), weaponRarity(r), weaponCount(n), gachaTotal(n), signsAll, defeatedAll, targets(n), rushClear, rushNoMiss。新しい種類は src/systems/achievements.js の progressOf に足す。

## 2. 毎日のお題（src/data/missions.json）
- 1日3つ。端末の日付（src/systems/gacha.js の today()、福引きの無料と同じ）から決まり、0時に入れ替わる。同じ日は誰でも同じお題。違う group から選ぶ
- 種類：敵を20/40体倒す、コインを80/150枚拾う、ステージを1/2回クリア、ノーミスでクリア、指定キャラ（リーフ・ミナモ・ゲン・ハクのどれか）でクリア、福引きを引く（無料でもよい）、15回踏みつける、3体続けて踏む、ボスを1体倒す、目標タイム内にクリア
- 達成で「お題達成」の通知とコイン。マップの左上に「お題 ○○○」（済んだら朱の丸）。タップで記録画面のお題タブ
- 「クリア」は練習（0）と試験用ステージ（90〜）を数えない（特別ステージ8は数える）。拾ったコインは、途中でやめたステージの分も数える
- 福引きは福引き蔵の画面がイベントを出さないため、`gacha.total − その日の始まりの total` で判定（マップ・記録画面に入った時）

## 3. 腕試し（ボス連戦。画面 `bossrush`、params: `{ char }`、src/data/bossrush.json）
- エンディングを見た後（save.data.seenEnding）、マップの上の段に「腕試し」が出る（記録画面の腕試しタブ →「挑む！」）
- 6体のボスと続けて戦う。アリーナは levels/stage91〜96.json（ボス担当の試験用アリーナ）
- 遊ぶキャラ（最後に選んだキャラ）と装備した武器で挑む。ハートは引き継ぎ（World の opts.hearts）、ボスの間に1つ回復（最大まで）
- 宝珠を取る（world の stageClear → result 'clear'）と次のボスへ。力尽きる（playerDown → result 'gameover'）と終わり。落下などのミスは通常どおり中間地点から（ボスは全快）
- 記録：ベストタイム（6体の合計の経過時間）、ノーミス達成、勝ちぬき回数、挑戦回数、いちばん先まで倒した数
- 一時停止の「設定」は腕試しの間は開けない（設定画面の戻り先に腕試しが無いため。案内を出す）

## 実装
- 判定：src/systems/achievements.js（progressOf / checkAchievements / recordClear と、イベントにつなぐ `progress`）、src/systems/missions.js（dailyMissions / ensureMissions / addMission / syncGacha）。DOMなし。tests/achievements.test.js, tests/missions.test.js
- `progress.install({ events, save, toast, signIds })` を main.js が1回呼ぶ。数えるイベント：'coin'{n}, 'enemyDefeated', 'stomp'{chain}, 'bossStart'{boss}, 'bossDefeated'{boss}, 'stageEnter'。ボスのノーミスは bossStart 時と bossDefeated 時の world.stats.hits+misses を比べる（読むだけ）
- stage.js の finish から `progress.stageCleared({ stage, char, stats, target })`。マップ・記録画面に入ると `progress.check()`（日付の入れ替え・福引き・保存状態からの称号）
- 通知：`toast.push(kind, name, reward)` / `toast.draw(ctx, vw, vh, y?, left?)`。stage・results・worldmap・records・bossrush が描く
- セーブ v4：records { coins, enemies, stomps, bestChain, clears, noMissClears, bosses, missionsDone, charClears{} }, achievements { id: 日付 }, missions { date, list[{id,p,done,char?}], gachaBase }, bossRush { best, noMiss, clears, tries, most }。noMissBoss { bossId: true } を書くようにした。v3 からは既定値（clears はクリア済みの数から）
- 通しテスト：tests/e2e/content.mjs（`--shots` で screenshots/content-*.png）

## 4. 特別ステージ8（沖縄）について
- 敵図鑑（stages.json の enemies）にステージ8の敵7種を足したので、「敵図鑑の完成」はステージ8の敵も倒す必要がある
- 腕試し（ボス連戦）には大シーサーを入れない（6体のまま）
