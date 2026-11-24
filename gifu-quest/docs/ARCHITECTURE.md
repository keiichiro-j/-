# ぎふクエスト アーキテクチャと担当の約束事

設計書（docs/design.md）を実装するための、モジュール間のインターフェース。**担当ファイル以外を変えるときは、このファイルを更新すること。**

## 座標と単位
- 1タイル＝36ドット。論理画面は高さ540・幅960〜1200（`renderer.viewW`）
- 物理は120Hz固定ステップ。`update(dt)` の dt は通常 1/120 秒
- 速度はドット/秒。エンティティの x,y は左上、w,h は大きさ
- 描画は `draw(ctx, alpha)`：ctx はすでにカメラ分ずらしてある（ワールド座標で描く）。`this.ix(alpha)` `this.iy(alpha)` で補間位置

## チーム（担当とファイル）
| 役割 | ファイル |
|---|---|
| ディレクター／リードプログラマ | src/main.js, game.js, core/{config,input,timestep,rng,events}.js, gfx/{renderer,atlas,camera,tilemap,particles}.js, world/{level,collision,tiles,world,levels}.js, actors/{entity,player,abilities,projectiles}.js, systems/pickups.js, scenes/{boot,stage}.js, build.mjs, tests/ |
| アート | src/art/{heroes,props,tiles,backdrops}.js |
| レベルデザイン | levels/stage1〜6.json, tools/level-editor.html, tools/levelgen/, src/world/validate.js |
| 敵・仕掛け | src/actors/enemyTypes.js, src/art/enemies.js（敵と仕掛けの絵も担当）, src/world/{platforms,liquids,triggers}.js |
| ボス | src/bosses/*.js, src/art/bosses.js |
| FX・サウンド | src/systems/{env,weather,timeOfDay}.js, src/gfx/{lighting,postfx}.js, src/core/audio.js |
| UI・画面 | src/scenes/{title,opening,select,worldmap,results,gameover,ending,settings}.js, src/ui/{hud,touch,menus,text}.js, src/systems/dialogue.js, src/core/save.js |

## 絵：アトラス（src/gfx/atlas.js）
```js
defineSprite(name, { w, h, frames = 1, ox = w/2, oy = h, draw(ctx, frame, def) })
drawSprite(ctx, name, frame, x, y, { flip, sx, sy, rot, alpha })   // (x,y) が基準点(ox,oy)の位置
```
- draw は (0,0)-(w,h) の論理座標に描く。起動時に2倍解像度で焼き付けられる。毎フレームは呼ばれない
- 未登録の名前はマゼンタの四角になる（見つけやすい）
- `assets/<name>.png` と `assets/<name>.json`（`{w,h,ox,oy,frames:[{x,y,w,h}]}`）を置くとそちらが優先される

### スプライト名の約束
| 名前 | 大きさ・基準点 | コマ |
|---|---|---|
| `hero_<id>_<anim>` id: leaf, minamo, gen, haku, sarubobo | 64×64, ox=32, oy=54（足元が下端から10ドット上） | HERO_ANIMS（下表） |
| `enemy_<kind>_<anim>` | 自由。基準点は足元中央 | 自由（敵担当と相談。下の敵一覧） |
| `boss_<name>_<anim>` | 自由 | ボス担当 |
| `item_coin` 20×24, `item_sarubobo` 28×32, `item_skewer` 30×30, `item_heart` 24×24, `item_orb_<stage>` 36×36 | 足元中央 | coin は8コマ回転, orb は8コマ |
| `prop_checkpoint` 30×72（2コマ：未/済）, `prop_sign` 40×44, `ui_up_hint` 20×20(ox=10,oy=20) | 足元中央 | |
| `fx_leaf` 20×14, `fx_leaf_big` 34×26, `fx_ukai` 26×18（羽ばたき4コマ）, `fx_bullet` 16×16, `fx_slash` 90×70（4コマ） | **中心**（ox=w/2, oy=h/2） | |
| `prop_<name>` 背景の小物（灯籠・木・家・看板） | 足元中央 | |

HERO_ANIMS（src/actors/player.js）：idle4, walk8, run8, brake1, jumpUp2, apex1, fall2, land1, crouch1, wall1, attack4, attack2 4, hurt2, win4, fidget6, swim4, glide2, dash3, slide1

## タイル（src/world/tiles.js）
レベルJSONの文字 → タイル。`drawTile(ctx, t, tx, ty, level, theme)`（src/art/tiles.js）が (0,0)-(36,36) に描く。隣は `level.get(tx±1, ty±1)` で見て継ぎ目を描き分ける。16×16タイルのチャンクに焼き付けるので重い描画をしてよい。

| 文字 | タイル | 性質 |
|---|---|---|
| `.` | 空 | |
| `#` | GROUND 地面（テーマで見た目が変わる） | 固い |
| `S` | STONE 石垣 | 固い |
| `R` | ROOF 屋根瓦 | 固い |
| `W` | WOOD 木の床 | 固い |
| `N` | SNOW 雪の地面 | 固い |
| `I` | ICE 氷 | 固い・滑る（ハクは滑らない） |
| `B` | BRICK レンガ | 固い・ゲンが壊せる |
| `%` | CRACK ひび割れの壁 | 固い・ゲンが壊せる |
| `-` | ONEWAY 通り抜け足場 | 上からだけ乗れる。↓＋ジャンプで降りる |
| `/` `\` | 45度の坂（右上がり／右下がり） | |
| `a` `b` | 22.5度 右上がり（低い半分→高い半分。`ab` で1段） | |
| `c` `d` | 22.5度 右下がり（高い半分→低い半分。`cd` で1段） | |
| `>` `<` | 合掌造りの急な屋根（滑り台。右下がり／左下がり、45度） | 乗ると滑り下りる |
| `^` | トゲ | 触れると1ダメージ |
| `~` `w` | 水面・水 | 泳ぐ |
| `L` `l` | 溶岩の表面・溶岩 | 触れるとミス |
| `H` | FAKE 見た目は壁、通り抜けられる（隠し部屋の入口） | |
| `o` | コイン（エンティティになる） | |

## レベルデータ（levels/stageN.json）
```json
{
  "id": 1, "name": "金華山・岐阜城", "theme": "kinka",
  "timeOfDay": "day",                // day | dusk | night | festival。 "timeFlow": ["dusk","night"] で進むと変化
  "weathers": ["sunny","cloudy","shower"],
  "bgm": "stage1",
  "areas": [ { "name": "導入", "x0": 0, "x1": 70, "tall": false }, ... ],   // x はタイル。tall: 縦に長いエリア（縦にも追従）
  "tiles": [ "....", "...." ],       // 行の配列（上から下）。高さは15以上
  "entities": [ { "type": "start", "x": 3, "y": 12 }, ... ]
}
```
- エンティティの x,y はタイル単位。**足元中央がタイル (x,y) の底辺中央**になるように置く（`Entity.placeAt`）
- テーマ：kinka（金華山）, nagara（長良川）, gujo（郡上八幡）, takayama（飛騨高山）, shirakawa（白川郷）, okuhida（奥飛騨・乗鞍）

### エンティティの種類（type）
| type | 担当 | spec の項目 |
|---|---|---|
| start | リード | 主人公の開始位置 |
| coin | リード | （`o` 文字でも置ける） |
| sarubobo | リード | index: 0,1,2 |
| skewer | リード | 飛騨牛串（無敵8秒） |
| heart | リード | ハート回復 |
| checkpoint | リード | index: 0,1。触れるとハート全回復 |
| sign | リード | id, title, text（名物・名所の説明。事実に基づく短文） |
| orb | リード | 宝珠。ボス撃破時に world.bossDefeated が出す |
| goal | リード | 練習ステージ用のゴール |
| cameraZone | リード | x,y,w,h（タイル）。中にいる間カメラ固定（隠し部屋） |
| walker / spiky / hopper / flyer / thrower / popper / charger / shielder | 敵・仕掛け | kind（見た目：例 "uribo"）, range など。設計書6章「敵の種類」 |
| movingPlatform, gondola, boat, fallingPlatform, rhythmPlatform, festivalFloat, steamVent, icicle, windZone, waterGate, waterSwitch, risingLava, lantern, autoScroll | 敵・仕掛け | ARCHITECTURE「仕掛け」を敵担当が追記 |
| bossArena | ボス | x0,x1,y0,y1（タイル）, boss: musasabi/salamander/dancer/yatai/yukioni/dragon |
| decor | アート | sprite: prop_xxx。背景の小物（当たり判定なし） |

## World（src/world/world.js）— エンティティから使えるもの
```
w.level (get/set/at/pxW/pxH)   w.player   w.entities   w.camera (shake(amp,dur), lock)   w.particles
w.time  w.tick  w.env  w.lights（毎フレーム {x,y,r,color,a} を push すると夜に光る）  w.liquids（{kind:'water'|'lava', x0,x1,y}）
w.spawn(entity)  w.sfx(name, opts)  w.hitstop(sec)  w.slowmo(scale, dur)
w.breakTile(tx,ty)  w.bumpTile(tx,ty)  w.lockCamera({x,y,w,h})  w.unlockCamera()
w.setBoss(b)  w.bossDefeated(b)（宝珠を出す）  w.showDialogue(title, text)  w.stageClear()
w.events.emit/on（'enemyDefeated','stomp','coin','bossStart','bossDefeated','stageClear','playerHurt','checkpoint','tileBroken' など）
```

## Entity（src/actors/entity.js）
`registerEntity(type, Class)` で登録。`constructor(world, spec)` で `this.placeAt(spec, w, h)`。
フラグ：`enemy`（触れると被弾・技で倒せる）`stompable` `hazard`（敵の弾）`cancelable`（ゲンの一閃で消せる）`pickup`（onTouch）`platform`（動く床：x,y,w,h。World が dx,dy を計算し、乗った主人公を運ぶ。`oneWay`, `dropable`）`boss` `persistent`（画面外でも更新）`z`（描画順。<0は地形の後ろ、>=10は主人公の前）
メソッド：`update(dt)` `draw(ctx, alpha)` `hurtRect()` `onStomp(player, dmg)` `damage(dmg, source)`（倒れたら `die()`）`shielded(source, rect)`（true で防ぐ）
敵の弾：`new Bullet(world, x, y, { sprite, w, h, vx, vy, grav, life, damage, cancelable, bounce, spin })`（src/actors/projectiles.js）
地形との当たり：`moveBody(world.level, this, dt, { platforms: world.platforms })`（src/world/collision.js）。this に onGround, wallL, wallR が入る

## 主人公（src/actors/player.js）
`p.x,y,w(24),h(44),vx,vy,face,onGround,hearts,maxHearts,star,dashT,inWater,stats{walk,dash,jump,power}`、`p.hurt(source, dmg)`、`p.heal(n)`、`p.has('wallKick'|'glide'|'swim'|'heavyStomp'|'breakBricks'|'doubleJump'|'noSlip')`

## 環境（src/systems/env.js）
`createEnv(world, levelData)` が返すオブジェクト：`update(dt)`, `drawFront(ctx, cam, vw, vh)`（雨・雪など画面の手前）, `wet`（雨で滑る）, `wind`（横風 ドット/秒。主人公の速度に足される）, `darkness`(0..1), `flash`(稲光 0..1), `sky{top,bottom}`, `tint`, `weather`, `timeOfDay`, `fog`(0..1)
背景：`createBackdrop(theme, levelData)` → `{ draw(ctx, camX, camY, vw, vh, env, time), drawFront(...) }`（src/art/backdrops.js）。draw は空〜中景（画面座標）、drawFront は前景の草むら等（スクロール1.3）
光：`new Lighting().draw(ctx, world, cam, vw, vh)` は env.darkness>0 のとき暗い膜に world.lights の穴を開ける

## サウンド（src/core/audio.js）
`audio.sfx(name, opts)`：jump, land, coin, stomp({chain}), hurt, miss, down, hit, defeat, shoot, shootBig, bird, slash, dash, break, bump, splash, swim, checkpoint, sarubobo, star, heart, sign, pause, select, confirm, cancel, clear, bossIntro, bossPhase, bossDefeat, clang, thunder, explosion
`audio.bgm(name)`：title, map, stage1〜6, boss, clear, ending, gameover。`audio.stopBgm()`。RUNTIME.sound が false なら鳴らさない

## 画面（src/game.js）
`game.go(name, params, kind='iris'|'wipe'|'fade'|'none')`。画面：boot, title, opening, select, worldmap, stage, results, gameover, ending, settings
- stage params: `{ stage, char, checkpoint }`
- results params: `{ stage, char, stats{coins,sarubobo[3],hits,misses,time,enemies}, newBest, prevBest }`
- gameover params: `{ stage, char }`
- settings params: `{ back: 'title'|'worldmap'|'stage-resume' }`
セーブ：`save.data`（src/core/save.js。形式は defaultSave()）、`save.write()`

## 敵の配置名（レベル担当と敵担当の共通語）
`{ "type": "<動き>", "kind": "<見た目>", "x": .., "y": .. }`。動きは設計書6章の8種類。

| ステージ | kind（動き） |
|---|---|
| 1 金華山 | uribo（walker）, karasu（flyer）, iga（spiky）, saru（thrower）, inoshishi（charger） |
| 2 長良川 | sawagani（walker）, kajika（hopper）, tonbo（flyer）, ayu（popper） |
| 3 郡上八幡 | chochin（flyer：提灯おばけ）, uchiwa（hopper：踊りうちわ）, geta（thrower：下駄投げ）, kappa（shielder） |
| 4 飛騨高山 | karakuri（shielder：からくり小僧）, tako（flyer：凧）, hanabi（thrower：花火師）, shishi（charger：獅子舞） |
| 5 白川郷 | yukidama（walker）, yukiusagi（hopper）, koritoge（spiky）, yukigumo（flyer：つららを落とす） |
| 6 奥飛騨 | hinotama（popper）, yogangaeru（hopper）, komori（flyer）, iwanage（thrower）, hibashira（popper：火柱）, kamoshika（charger） |

共通オプション：`face`（-1/1。既定 -1＝左向き）, `range`（巡回の幅・タイル。walker/spiky/charger/shielder は家からこの距離で折り返す、flyer は巡回の全幅。既定 flyer 3〜6）, `hp`
- 置き方：足元中央をタイル (x,y) の底辺中央に（flyer はその高さを中心に上下）。popper は **水面（`~`）・溶岩の表面（`L`）のタイル** に置く（waterLevel・risingLava の上では表面の高さに自動で合わせる）
- walker：`speed`（タイル/秒）。壁で折り返し、崖から落ちる ／ spiky：`speed`。崖で折り返す。踏めない（技・ダッシュ・無敵で倒す）
- hopper：`jump`（跳ぶ初速 ドット/秒）。待つ→しゃがむ予告0.24秒→主人公の方へ跳ぶ（見つける距離7〜8タイル、画面内のときだけ）
- flyer：`dir`（"h"|"v"）, `amp`（上下の幅・タイル）, `speed`（タイル/秒）。yukigumo は真下に来ると0.6秒震えてからつららを落とす
- thrower：`ammo`（iga/geta/hanabi/yukidama/iwa/ougi。既定は kind ごと）, `cd`（間隔・秒）, `windup`（腕を振り上げる予告・秒。既定0.5〜0.65）。画面内で9タイル以内のときだけ投げる
- popper：`period`（秒）, `height`（跳ぶ高さ・タイル）。出る0.75秒前に泡・火の粉の予告。kind=hibashira は火柱（0.9秒の予告→1秒立つ。踏めない・倒せない）
- charger：`speed`（普段の速さ）, `windup`（溜め・秒）。7〜8タイル以内・同じ高さで見つけると「！」と足かきの溜め→突進。壁にぶつかると目を回す（隙）。HP2
- shielder：`speed`。正面からの弾・ダッシュを防ぐ。上から踏める・後ろから技が当たる。後ろに回られると0.8秒で振り向く。HP2
- HP は基本1（charger・shielder は2）。倒されるとひっくり返って落ちる／踏まれるとつぶれて消える

## 仕掛けの配置名（敵担当が実装、レベル担当が置く）
**床の置き方**：movingPlatform / fallingPlatform / gondola / boat / festivalFloat / rhythmPlatform / tightrope の x,y は「床の左端のタイル」と「床の上面がくる行」（上面＝タイル y の上端）。他の仕掛けは特記なければ足元中央をタイル (x,y) に。

| type | spec | 内容 |
|---|---|---|
| movingPlatform | w（タイル, 既定3）, dx, dy（往復の距離・タイル）, speed（タイル/秒, 既定2）, kind（wood/stone/cloud/ice）, phase（0..1） | 往復する床（端でゆっくり折り返す） |
| fallingPlatform | w（既定2）, kind（wood/rock）, delay（既定0.5） | 乗って0.5秒揺れて落ちる。3秒後、主人公が重なっていなければ元の場所に復活 |
| gondola | x2, y2（終点の床の左端タイル・上面の行）, speed（既定2） | ロープウェイ（床は3タイル。ケーブルは床の78ドット上）。乗ると動き出し、終点で止まる。乗らずに主人公が始点側へ戻ると（ミス後など）始点へ帰る |
| boat | w（既定5）, x2（終点の左端タイル）, speed（既定2.2） | 鵜飼船。y は水面（`~`）の行。乗ると川を下り、降りても終点まで進む。舳先に篝火（光る）。帰り方は gondola と同じ |
| festivalFloat | w（既定4）, x2, speed（既定1.8） | 祭り屋台。乗って進む大きな床（屋根と提灯は主人公の後ろに描く。提灯が光る） |
| rhythmPlatform | w（既定2）, beat（0/1）, bpm（既定100）, beats（切り替えまでの拍。既定4） | 太鼓に合わせて beat 0 と 1 が交互に出る。消える1拍前から点滅、消えている間はうすい輪郭、出る1拍前に輪郭が濃くなる |
| waterLevel | id, x0, x1, yLow, yHigh（水面の行）, start（"low"/"high"）, speed（タイル/秒, 既定0.8） | 水位が変わる水域。範囲のタイルは空（`.`）にしておく。水面より下が泳げる水（world.liquids） |
| waterSwitch | target（waterLevel の id） | 踏む・技で叩くと水位と、同じ target の水門が切り替わる（水位が動いている間は無効） |
| waterGate | target, h（高さ・タイル, 既定3）, open | 水門。x,y は門のいちばん下のタイル。閉じている間そのタイルが固くなる（WOOD に書き換え）。スイッチで開閉 |
| risingLava | x0, x1, y（開始の表面の行）, speed（タイル/秒, 既定0.55）, trigger（主人公の x がこのタイルを越えたら開始）, stopY | せり上がる溶岩。主人公から画面の3/4以上離れると速くなる。ミスで中間地点に戻ると始めの高さに戻る |
| steamVent | power（既定1）, period（秒, 既定3, 0で出っぱなし）, h（届く高さ・タイル, 既定5）, phase | 温泉の湯気で上に押し上げる（周期の前半55%）。出る0.6秒前に小さく噴く |
| icicle | delay（既定0.6） | x,y は天井のすぐ下のタイル（上端から吊り下がる）。真下に来ると揺れて落ちる。5秒でまた生える。ゲンの一閃で割れる |
| windZone | x0, x1, force（ドット/秒。負で左向き, 既定 -150）, period（既定4）, phase | 吹雪の横風（周期の前半に吹く）。吹く0.8秒前に足元の雪煙で予告。壁は越えない |
| lightningZone | x0, x1, interval（秒, 既定4）, weather（例 "thunder"。指定するとその天気の時だけ） | ゾーン内の主人公の足元に予告の印（1秒点滅）→ 落雷（1ダメージ）。ステージ3・6 |
| tightrope | w（既定6） | 提灯の綱渡り（たわむ通り抜け足場）。両端に柱、綱から提灯がさがって光る |
| bouncer | power（既定1で約5タイル。ジャンプ押しっぱなしでさらに高く）, kind（taiko/kasa） | 跳ね台（太鼓・和傘） |
| autoScroll | x0, x1（タイル）, speed（タイル/秒, 既定2） | 主人公が x0 を越えると画面が一定速度で右へ進む。左端に押されて壁に挟まるとミス |
| lantern | color（red/white） | 吊り下げ提灯（揺れる・夜に光る）。x,y は吊り下げ点のタイル（上端） |

仕掛けと敵の絵の名前：`enemy_<kind>_<anim>`, `enemy_shot_<ammo>`, `enemy_mark_alert/star`, `gim_*`（src/art/enemies.js）

## 背景の小物（decor）
`{ "type": "decor", "sprite": "prop_toro", "x": .., "y": .., "z": -5, "light": { "r": 110, "color": "#ffbf6a" } }`
アート担当が用意する prop（prop_torii_small は prop_gate と同じ絵）：toro（石灯籠）, pine, cedar, bamboo, rock, bush, grass, machiya（町家）, gassho（合掌造り）, castle_wall, torii_small（小さな鳥居ではなく木の門：gate）, chochin（提灯）, kagaribi（篝火）, onsen（湯けむりの湯船）, snowman, fence, bridge_rail, noren, yatai_stall（朝市の屋台）, lamp（街灯）

## UI の追加の約束（UI担当）
- タッチ：`touch.tap()`（0.3秒以内のタップを1回だけ返す {x,y}）、`touch.peekTap()`、`touch.clearTap()`、`touch.pointer`（ドラッグ用）、`touch.show('play'|'menu')`。PC のマウスクリックも同じ扱い
- セーブ形式 v2：`lastStage`, `seenEnding` を追加。`save.saruboboCount()`
- src/data/stages.json：UI 用のステージ名・地図上の位置・目標タイム（秒）・天気名・敵の和名
- HUD が使うイベント：'stomp', 'sarubobo', 'checkpoint', 'stageEnter', 'enemyDefeated'（{ kind } を含めると図鑑に記録される）
- ボスは `phaseMarks`（HPに対する割合の配列、例 [0.66, 0.33]）を持つと HP バーの目盛りがその位置になる
- 難易度「やさしい」：主人公のハート+1、ボスの HP×0.7・待ち時間×1.3

## ボス（ボス担当）
- 置き方：`{ "type":"bossArena", "x0":.., "x1":.., "y0":.., "y1":.., "boss":"musasabi|salamander|dancer|yatai|yukioni|dragon" }`。幅30タイル・高さ15行。下2行は平らな固い床。x0 列が入口の壁（空いたマスが入口）、x1 列が奥の壁。主人公の中心が x0+2 列を越えると開始。中間地点はアリーナより手前
- Boss が持つもの：`name`, `title`, `hp`, `maxHp`, `phase`, `phaseMarks`（[2/3, 1/3]）, `reset()`。1回のダメージは最大3
- スプライト名 `boss_<name>_<anim>`：右向き・基準点は足元中央（弾・首の節などは中心）
- 川・溶岩・木・岩・いかだはボスが自分で作る。調整用の数値は各ボスファイル先頭の表
