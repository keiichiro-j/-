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

共通オプション：`range`（巡回の幅・タイル）, `face`（-1/1）, `amp`（flyer の上下幅・タイル）, `period`（popper の周期・秒）, `dir`（"h"|"v"：flyer の巡回方向）

## 仕掛けの配置名（敵担当が実装、レベル担当が置く）
| type | spec | 内容 |
|---|---|---|
| movingPlatform | w（タイル）, dx, dy（往復の距離・タイル）, speed（タイル/秒）, kind（wood/stone/cloud/ice） | 往復する床 |
| fallingPlatform | w, kind（wood/rock） | 乗って0.5秒で落ちる。3秒で復活（崩れる岩の足場） |
| gondola | x2, y2（終点タイル）, speed | ロープウェイ。乗ると動き出し、終点で止まる。ケーブルも描く |
| boat | w, x2（終点）, speed | 鵜飼船。乗ると川を下る（自動スクロール区間）。篝火の明かり付き |
| festivalFloat | w, x2, speed | 祭り屋台。乗って進む大きな床 |
| rhythmPlatform | w, beat（0/1）, bpm | 郡上踊りの太鼓に合わせて出たり消えたり（予告で点滅） |
| waterLevel | id, x0, x1, yLow, yHigh, start（"low"/"high"） | 水位が変わる水域（タイル単位） |
| waterSwitch | target（waterLevel の id） | 叩く・踏むと水位が切り替わる |
| risingLava | x0, x1, y（開始の高さ）, speed（タイル/秒）, trigger（主人公がこの x を越えたら開始）, stopY | せり上がる溶岩 |
| steamVent | power, period | 温泉の湯気で上に押し上げる |
| icicle | — | 下に来ると揺れて落ちる |
| windZone | x0, x1, force, period | 吹雪の横風（予告の雪煙あり） |
| lightningZone | x0, x1 | 落雷（予告マーク→落雷）。ステージ3・6 |
| tightrope | w | 提灯の綱渡り（たわむ通り抜け足場） |
| bouncer | power | 跳ね台（太鼓・傘など） |

## 背景の小物（decor）
`{ "type": "decor", "sprite": "prop_toro", "x": .., "y": .., "z": -5, "light": { "r": 110, "color": "#ffbf6a" } }`
アート担当が用意する prop：toro（石灯籠）, pine, cedar, bamboo, rock, bush, grass, machiya（町家）, gassho（合掌造り）, castle_wall, torii_small（小さな鳥居ではなく木の門：gate）, chochin（提灯）, kagaribi（篝火）, onsen（湯けむりの湯船）, snowman, fence, bridge_rail, noren, yatai_stall（朝市の屋台）, lamp（街灯）
