// 画面：タイトル、一時停止、設定、店、スマホ（9アプリ）、ウェポンホイール、全体地図、ランキング
import { WEAPONS, WEAPON_BY_ID, WEAPON_CLASSES, weaponName } from '../combat/weapons.js';
import { yen, pay, deposit, withdraw } from '../systems/economy.js';
import { MISSIONS } from '../systems/missions.js';
import { OUTFITS, setOutfit } from '../actors/player.js';
import { listSlots } from '../core/save.js';
import { KEY_LABELS, DEFAULT_KEYS } from '../core/input.js';
import { QUALITY, ECON } from '../core/config.js';
import { VEHICLES } from '../vehicles/vehicle.js';
import { PROPERTIES, DEALER_STOCK, dealerPrice, CAR_MODS, NEON_COLORS, PAINT_COLORS, PAINT_PRICE, REGISTER_PRICE, modLevel, nextModPrice } from '../systems/property.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createMenus(G, root) {
  const layer = document.createElement('div'); layer.id = 'menus'; root.appendChild(layer);
  const M = { open: null };

  function panel(title, body, opts = {}) {
    layer.innerHTML = '';
    const p = document.createElement('div'); p.className = 'panel ' + (opts.cls || '');
    p.innerHTML = `<div class="ptitle">${esc(title)}${opts.noClose ? '' : '<button class="x" data-act="close">×</button>'}</div><div class="pbody"></div>`;
    const b = p.querySelector('.pbody');
    if (typeof body === 'string') b.innerHTML = body; else b.appendChild(body);
    layer.appendChild(p); layer.style.display = 'flex';
    p.addEventListener('click', (e) => { const t = e.target.closest('[data-act]'); if (t && t.dataset.act === 'close') close(); });
    M.open = opts.name || title;
    G.input.exitLock();
    return p;
  }
  function close() { layer.style.display = 'none'; layer.innerHTML = ''; const was = M.open; M.open = null; if (M.onClose) { const f = M.onClose; M.onClose = null; f(was); } }
  const btn = (label, act, cls = '') => `<button class="btn ${cls}" data-act="${act}">${label}</button>`;
  function bind(p, handlers) { p.addEventListener('click', (e) => { const t = e.target.closest('[data-act]'); if (!t || t.dataset.act === 'close') return; const h = handlers[t.dataset.act]; if (h) { G.audio && G.audio.click(); h(t); } }); }

  // ---------- タイトル ----------
  function title(onNew, onLoad) {
    const slots = listSlots();
    const p = panel('GIFU OPEN ROAD 3D', `
      <div class="logo">GIFU<span>OPEN ROAD</span><small>3D</small></div>
      <p class="lead">架空の岐阜を舞台にしたオープンワールド。金華山、長良川、柳ケ瀬、駅前の黄金像——街を自由に走り回れ。</p>
      <div class="col">
        ${btn('はじめから', 'new', 'primary')}
        ${slots.some(Boolean) ? btn('つづきから', 'cont') : ''}
        ${btn('設定', 'settings')}${btn('操作方法', 'help')}${btn('ランキング', 'rank')}
      </div>
      <p class="note">暴力表現はコミカル寄り。設定の「表現レベル：マイルド」で武器が水鉄砲や紙吹雪に変わります。</p>`, { noClose: true, name: 'title', cls: 'title' });
    bind(p, {
      new: () => { close(); onNew(); },
      cont: () => loadMenu((slot) => { close(); onLoad(slot); }, () => title(onNew, onLoad)),
      settings: () => settings(() => title(onNew, onLoad)),
      help: () => help(() => title(onNew, onLoad)),
      rank: () => ranking(() => title(onNew, onLoad)),
    });
  }
  function loadMenu(onPick, back) {
    const slots = listSlots();
    const rows = slots.map((s, i) => s ? btn(`${i === 0 ? 'オートセーブ' : 'スロット' + i}　${new Date(s.savedAt).toLocaleString('ja-JP')}　${yen(s.cash)}`, 'slot' + i) : `<div class="empty">${i === 0 ? 'オートセーブ' : 'スロット' + i}：空き</div>`).join('');
    const p = panel('ロード', `<div class="col">${rows}</div>${btn('戻る', 'back')}`, { name: 'load' });
    const h = { back: () => back() };
    slots.forEach((s, i) => { if (s) h['slot' + i] = () => onPick(i); });
    bind(p, h);
  }

  // ---------- 一時停止 ----------
  function pause() {
    G.paused = true;
    const p = panel('一時停止', `<div class="col">
      ${btn('再開', 'resume', 'primary')}${btn('地図', 'map')}${btn('セーブ', 'save')}${btn('ロード', 'load')}
      ${btn('設定', 'settings')}${btn('操作方法', 'help')}${btn('ランキング', 'rank')}${btn('タイトルへ', 'title')}</div>
      <p class="note">プレイ時間 ${Math.floor(G.save.playSec / 60)}分　任務達成 ${Object.values(G.missions.done).reduce((a, b) => a + b, 0)}　タクシー ${G.save.stats.taxiFares}回</p>`, { name: 'pause' });
    M.onClose = (was) => { if (was === 'pause') G.paused = false; };
    bind(p, {
      resume: close, map: () => fullMap(true),
      save: () => saveMenu(),
      load: () => loadMenu((slot) => { close(); G.loadGame(slot); }, pause),
      settings: () => settings(pause), help: () => help(pause), rank: () => ranking(pause),
      title: () => { G.paused = false; close(); location.reload(); },
    });
  }
  function saveMenu() {
    const slots = listSlots();
    const rows = [1, 2, 3].map(i => btn(`スロット${i}　${slots[i] ? new Date(slots[i].savedAt).toLocaleString('ja-JP') : '空き'}`, 'slot' + i)).join('');
    const p = panel('セーブ', `<p class="note">手動セーブは自宅で寝るときにも行えます。</p><div class="col">${rows}</div>${btn('戻る', 'back')}`, { name: 'save' });
    bind(p, { slot1: () => { G.saveGame(1); pause(); G.hud.toast('スロット1に保存'); }, slot2: () => { G.saveGame(2); pause(); G.hud.toast('スロット2に保存'); }, slot3: () => { G.saveGame(3); pause(); G.hud.toast('スロット3に保存'); }, back: pause });
  }

  // ---------- 設定 ----------
  function settings(back) {
    const s = G.settings;
    const opt = (name, cur, list) => `<select name="${name}">${list.map(([v, l]) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    const keys = Object.keys(DEFAULT_KEYS).map(k => `<tr><td>${KEY_LABELS[k]}</td><td><button class="key" data-act="key" data-k="${k}">${(G.input.keymap[k] || '').replace('Key', '').replace('Digit', '')}</button></td></tr>`).join('');
    const p = panel('設定', `<form class="settings">
      <label>画質 ${opt('quality', s.quality, Object.entries(QUALITY).map(([k, v]) => [k, v.label]))}</label>
      <label>人と車の密度 ${opt('density', s.density, [[0.5, '少ない'], [0.75, 'やや少ない'], [1, 'ふつう'], [1.2, '多い']])}</label>
      <label>表現レベル ${opt('mild', s.mild ? 1 : 0, [[0, 'ふつう'], [1, 'マイルド（水鉄砲・紙吹雪）']])}</label>
      <label>照準アシスト ${opt('aimAssist', s.aimAssist, [['off', 'なし'], ['weak', '弱（吸い付き）'], ['strong', '強（ロックオン）']])}</label>
      <label>1日の長さ ${opt('dayMinutes', s.dayMinutes, [[4, '4分'], [8, '8分'], [12, '12分'], [24, '24分']])}</label>
      <label>視点の感度 <input type="range" name="sensitivity" min="0.3" max="2.5" step="0.1" value="${s.sensitivity}"></label>
      <label>上下反転 ${opt('invertY', s.invertY ? 1 : 0, [[0, 'しない'], [1, 'する']])}</label>
      <label>HUDの表示量 ${opt('hud', s.hud, [['full', '多い'], ['less', '少ない'], ['none', 'なし']])}</label>
      <label>音量 <input type="range" name="volume" min="0" max="1" step="0.05" value="${s.volume}"></label>
      <label>字幕の大きさ ${opt('subtitle', s.subtitle, [[1, 'ふつう'], [1.3, '大きい']])}</label>
      <details><summary>キーの割り当て</summary><table class="keys">${keys}</table>${btn('初期値に戻す', 'resetkeys')}</details>
      </form><p class="note">画質の変更は次の起動から反映されます（現在：${QUALITY[s.quality].label}）。</p>${btn('戻る', 'back', 'primary')}`, { name: 'settings' });
    const form = p.querySelector('form');
    form.addEventListener('change', () => {
      const f = new FormData(form);
      s.quality = f.get('quality'); s.density = +f.get('density'); s.mild = f.get('mild') === '1'; s.aimAssist = f.get('aimAssist');
      s.dayMinutes = +f.get('dayMinutes'); s.sensitivity = +f.get('sensitivity'); s.invertY = f.get('invertY') === '1'; s.hud = f.get('hud'); s.volume = +f.get('volume'); s.subtitle = +f.get('subtitle');
      G.audio && G.audio.setVolume(s.volume);
      G.saveSettings();
    });
    let waiting = null;
    bind(p, {
      back: () => back(),
      resetkeys: () => { s.keys = {}; G.input.setKeys({}); G.saveSettings(); settings(back); },
      key: (t) => {
        if (waiting) return; waiting = t; t.textContent = 'キーを押す…';
        const h = (e) => { e.preventDefault(); window.removeEventListener('keydown', h, true); s.keys = { ...(s.keys || {}), [t.dataset.k]: e.code }; G.input.setKeys(s.keys); G.saveSettings(); waiting = null; t.textContent = e.code.replace('Key', ''); };
        window.addEventListener('keydown', h, true);
      },
    });
  }

  function help(back) {
    const p = panel('操作方法', `<div class="help">
      <h4>PC</h4>
      <table>
      <tr><td>徒歩</td><td>WASD 移動、Shift 走る、Space ジャンプ、C しゃがむ、F 車に乗る／奪う、E 調べる・店・ミッション開始</td></tr>
      <tr><td>戦闘</td><td>マウスで視点、右クリック 構え、左クリック 攻撃・射撃、R リロード、G 投げる、Tab長押し ウェポンホイール、ホイール／1〜9 武器切り替え、Caps Lock フォーカス（スロー）</td></tr>
      <tr><td>運転</td><td>W アクセル、S ブレーキ・バック、AD ハンドル、Space サイドブレーキ、H クラクション（パトカーはサイレン）、V 視点、F 降りる</td></tr>
      <tr><td>その他</td><td>↑ スマホ、M 地図、Esc 一時停止</td></tr></table>
      <h4>スマホ（横向き）</h4>
      <p>左半分：触った位置が中心のスティック（運転中は倒した方向へ走る）。右半分：スライドで視点。ボタンは場面に合わせて入れ替わります。武器アイコン：タップで次の武器、長押しでウェポンホイール。</p>
      <h4>お店・強盗・家・車</h4>
      <p>コンビニ・ガソリンスタンド・宝飾店・銀行は、銃を構えたまま E で強盗できます。銃を構え続けていれば店員は警報を押せませんが、逃げたあとに通報されます。車屋で車を買い、不動産屋か物件の前で家を買えます。買った家は「自宅に登録」でき、車で敷地に入って E を押すとガレージにしまえます。カスタムショップ（車に乗ったまま）でエンジン・ターボ・ブレーキ・タイヤ・サスペンション・装甲・スモークガラス・ネオン・塗装を変えられます。</p>
      <h4>手配のしくみ</h4>
      <p>犯行を誰かに見られ、通報されて初めて手配されます。★1の警官は捕まえに来ます。★2以上はパトカーから降りて撃ってきて、★3以上は走りながらも撃ちます。電話している人を止めれば通報されません。★の表示：白＝視認中、点滅＝見失った直後、中空き＝犯人未特定、赤＝捜索中。捜索エリア（地図の赤い円）の外で一定時間見つからなければ解除。着替え・車の乗り換え・塗装工房で特定されにくくなります。</p>
      </div>${btn('戻る', 'back', 'primary')}`, { name: 'help' });
    bind(p, { back });
  }

  function ranking(back) {
    const p = panel('ランキング', `<div id="rank">読み込み中…</div>${btn('戻る', 'back', 'primary')}`, { name: 'rank' });
    bind(p, { back });
    G.server.getRanking('total').then((rows) => {
      const el = p.querySelector('#rank'); if (!el) return;
      if (!rows || !rows.length) { el.innerHTML = '<p class="note">まだ記録がありません（GASのWebアプリとして開くと、スプレッドシートに記録されます）。</p>'; return; }
      el.innerHTML = `<table class="rank"><tr><th>#</th><th>名前</th><th>総資産</th><th>達成</th></tr>${rows.slice(0, 20).map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.name)}</td><td>${yen(r.score)}</td><td>${esc(r.extra || '')}</td></tr>`).join('')}</table>`;
    }).catch(() => { const el = p.querySelector('#rank'); if (el) el.textContent = 'ランキングを取得できませんでした。'; });
  }

  // ---------- ミッション説明 ----------
  function brief(def, onAccept) {
    G.paused = true;
    const best = G.missions.best[def.id];
    const p = panel(`${def.kind}：${def.title}`, `<p class="lead">${esc(def.brief)}</p><p>報酬 ${yen(def.reward)}${best ? `　ベスト ${best.toFixed(1)}秒` : ''}</p><div class="row">${btn('引き受ける', 'ok', 'primary')}${btn('やめる', 'no')}</div>`, { name: 'brief' });
    M.onClose = () => { G.paused = false; };
    bind(p, { ok: () => { close(); onAccept(); }, no: close });
  }

  // ---------- 店 ----------
  function shop(kind) {
    G.paused = true;
    M.onClose = () => { G.paused = false; };
    const m = G.money, P = G.player;
    const head = `<div class="money">所持金 ${yen(m.cash)}　口座 ${yen(m.bank)}</div>`;
    if (kind === 'gunshop') {
      const owned = (id) => G.combat.inv.weapons.find(w => w.id === id);
      const rows = WEAPON_CLASSES.map(cls => `<h4>${cls}</h4>` + WEAPONS.filter(w => w.cls === cls && w.price > 0).map(w => {
        const o = owned(w.id);
        const ammoPrice = Math.max(200, Math.round(w.price / 12));
        return `<div class="item"><span>${esc(weaponName(w, G.settings.mild))}</span><small>威力${w.dmg} 射程${w.range}m</small>
          ${o && w.kind !== 'melee' && !w.unit ? btn(`弾 ${yen(ammoPrice)}`, 'ammo:' + w.id) : ''}
          ${o && !w.unit ? (w.kind === 'gun' && !o.suppressor ? btn(`サプレッサー ${yen(15000)}`, 'supp:' + w.id) : '<em>所持</em>') : btn(yen(w.price), 'buy:' + w.id)}</div>`;
      }).join('')).join('');
      const p = panel('ガンショップ', head + `<div class="item"><span>防弾ベスト</span><small>ダメージを軽減</small>${btn(yen(5000), 'armor')}</div>` + rows + `<p class="note">持てる数：近接1、拳銃類2、長い銃2。超えた分は自宅に保管されます。</p>`, { name: 'shop', cls: 'wide' });
      bind(p, new Proxy({}, { get: (_, act) => () => {
        const [a, id] = act.split(':'); const w = WEAPON_BY_ID[id];
        if (a === 'armor') { if (pay(m, 5000)) { P.armor = 100; G.audio.cash(); } else G.hud.toast('お金が足りない'); }
        else if (a === 'buy') { if (pay(m, w.price)) { G.combat.give(id, w.kind === 'melee' ? 0 : w.unit ? 3 : w.mag * 3); G.audio.cash(); G.hud.toast(`${weaponName(w, G.settings.mild)}を買った`); } else G.hud.toast('お金が足りない'); }
        else if (a === 'ammo') { const pr = Math.max(200, Math.round(w.price / 12)); if (pay(m, pr)) { owned(id).ammo += w.mag * 2; G.audio.cash(); } else G.hud.toast('お金が足りない'); }
        else if (a === 'supp') { if (pay(m, 15000)) { owned(id).suppressor = true; G.audio.cash(); G.hud.toast('サプレッサーを付けた（発砲を聞かれる範囲が1/4）'); } else G.hud.toast('お金が足りない'); }
        shop('gunshop');
      } }));
      return;
    }
    if (kind === 'clothes') {
      const rows = OUTFITS.map((o, i) => `<div class="item"><span class="sw" style="background:#${o.top.toString(16).padStart(6, '0')}"></span><span>${o.name}</span>${P.outfit === i ? '<em>着用中</em>' : btn(yen(ECON.clothesPrice), 'o' + i)}</div>`).join('');
      const p = panel('服屋', head + rows + `<div class="item"><span>マスク</span>${btn(P.mask ? '外す' : yen(1500), 'mask')}</div><p class="note">着替えると警察に特定されにくくなります（ヒートが下がる）。</p>`, { name: 'shop' });
      const h = { mask: () => { if (P.mask || pay(m, 1500)) { P.mask = !P.mask; G.hud.toast(P.mask ? 'マスクを着けた' : 'マスクを外した'); } shop('clothes'); } };
      OUTFITS.forEach((o, i) => { h['o' + i] = () => { if (pay(m, ECON.clothesPrice)) { setOutfit(G, P, i); G.audio.cash(); G.hud.toast('着替えた'); } else G.hud.toast('お金が足りない'); shop('clothes'); }; });
      bind(p, h); return;
    }
    if (kind === 'gas') {
      const car = G.nearCarFor ? G.nearCarFor() : null;
      if (!car) {
        const w = G.combat.weapon(); const arm = w.kind === 'gun' || w.kind === 'proj';
        const p = panel('ガソリンスタンド', head + '<p>給油と修理は車に乗ったまま来てください。</p>' + (arm ? `<hr><div class="item"><span>売店のレジを奪う（★★★・1.5万〜4.5万円）</span>${btn('強盗する', 'rob', 'danger')}</div>` : ''), { name: 'shop' });
        bind(p, { rob: () => { close(); G.startRobbery('gas'); } });
        return;
      }
      const need = Math.round((1 - car.phys.fuel) * 40 * ECON.fuelPrice / 4);
      const p = panel('ガソリンスタンド', head + `<p>${esc(car.spec.name)}　燃料 ${Math.round(car.phys.fuel * 100)}%　損傷 ${Math.round(100 - car.phys.hp)}%</p>
        <div class="row">${btn(`満タン ${yen(need)}`, 'fuel')}${btn(`修理 ${yen(ECON.repairPrice)}`, 'repair')}</div>`, { name: 'shop' });
      bind(p, { fuel: () => { if (pay(m, need)) { car.phys.fuel = 1; G.audio.cash(); } else G.hud.toast('お金が足りない'); shop('gas'); }, repair: () => { if (pay(m, ECON.repairPrice)) { car.phys.hp = 100; car.phys.flatTires = 0; car.explodeT = -1; G.audio.cash(); } else G.hud.toast('お金が足りない'); shop('gas'); } });
      return;
    }
    if (kind === 'paint') {
      const car = G.nearCarFor ? G.nearCarFor() : null;
      if (!car) { panel('塗装工房', head + '<p>車に乗ったまま入ってください。</p>', { name: 'shop' }); return; }
      const cols = [0xd0302a, 0x1d4fa8, 0xf2f2f2, 0x111111, 0x2a7a3a, 0xe8c020, 0x7a3ab0, 0x8a8f96];
      const p = panel('塗装工房', head + `<p>塗り替えると車の特徴が変わり、手配中でも見失われやすくなります（修理込み）。</p><div class="swatches">${cols.map(c => `<button class="sw big" data-act="c${c}" style="background:#${c.toString(16).padStart(6, '0')}"></button>`).join('')}</div><p>料金 ${yen(ECON.paintPrice)}</p>`, { name: 'shop' });
      const h = {}; cols.forEach(c => { h['c' + c] = () => { if (car.spec.police) { G.hud.toast('パトカーは塗れない'); return; } if (pay(m, ECON.paintPrice)) { G.repaint(car, c); close(); } else G.hud.toast('お金が足りない'); }; });
      bind(p, h); return;
    }
    const armed = () => { const w = G.combat.weapon(); return w.kind === 'gun' || w.kind === 'proj'; };
    const robRow = (key, label) => armed() ? `<hr><div class="item"><span>${label}</span>${btn('強盗する', 'rob', 'danger')}</div>` : `<p class="note">銃を構えて店員を脅すと強盗できる。</p>`;
    if (kind === 'conbini') {
      const items = [['onigiri', 'おにぎりとお茶（体力＋40）', 400], ['bento', '弁当（体力＋80）', 900], ['drink', '栄養ドリンク（フォーカス満タン）', 300], ['kit', '救急セット（体力満タン）', 2500]];
      const p = panel('コンビニ', head + items.map(([id, n, pr]) => `<div class="item"><span>${n}</span>${btn(yen(pr), id)}</div>`).join('') + robRow('conbini', 'レジの金を奪う（★★★・2万〜6万円）'), { name: 'shop' });
      const eat = (pr, f) => () => { if (pay(m, pr)) { f(); G.audio.cash(); } else G.hud.toast('お金が足りない'); shop('conbini'); };
      bind(p, { onigiri: eat(400, () => { P.hp = Math.min(100, P.hp + 40); }), bento: eat(900, () => { P.hp = Math.min(100, P.hp + 80); }), drink: eat(300, () => { P.focus = 100; }), kit: eat(2500, () => { P.hp = 100; }), rob: () => { close(); G.startRobbery('conbini'); } });
      return;
    }
    if (kind === 'jewelry') {
      const p = panel('宝飾店', head + `<div class="item"><span>腕時計（ギフグラムで自慢できる）</span>${btn(yen(150000), 'watch')}</div>` + robRow('jewelry', 'ショーケースを空にする（★★★・8万〜25万円）'), { name: 'shop' });
      bind(p, { watch: () => { if (pay(m, 150000)) { G.audio.cash(); G.hud.toast('高級腕時計を買った'); G.post && G.post('you', '新しい腕時計を買った。柳ケ瀬で見かけたら声かけて'); } else G.hud.toast('お金が足りない'); shop('jewelry'); }, rob: () => { close(); G.startRobbery('jewelry'); } });
      return;
    }
    if (kind === 'bank') {
      if (armed()) {
        const p = panel('銀行', head + `<div class="row">${btn('ATMを使う', 'atm', 'primary')}</div>` + robRow('bank', '金庫を開けさせる（★★★★・30万〜100万円、15秒）'), { name: 'shop' });
        bind(p, { atm: () => bankApp('銀行（ATM）'), rob: () => { close(); G.startRobbery('bank'); } });
        return;
      }
      return bankApp('銀行（ATM）');
    }
    if (kind === 'hospital') {
      const p = panel('病院', head + `<div class="item"><span>治療（体力全回復）</span>${btn(yen(2000), 'heal')}</div>`, { name: 'shop' });
      bind(p, { heal: () => { if (pay(m, 2000)) { P.hp = 100; G.audio.cash(); close(); } else G.hud.toast('お金が足りない'); } }); return;
    }
    if (kind === 'police') {
      const can = G.wanted.stars === 1 && G.wanted.status !== 'seen';
      const p = panel('警察署', head + `<p>${can ? '★1までなら罰金で済ませられる。' : G.wanted.stars ? '手配が重すぎる。逃げるしかない。' : '特に用はない。'}</p>${can ? btn(`罰金を払う ${yen(5000)}`, 'fine') : ''}`, { name: 'shop' });
      bind(p, { fine: () => { if (pay(m, 5000)) { G.clearWanted(); close(); G.hud.toast('罰金を払った'); } } }); return;
    }
    // ---------- 車屋 ----------
    if (kind === 'dealer') {
      const rows = DEALER_STOCK.map(id => { const v = VEHICLES[id]; return `<div class="item"><span>${esc(v.name)}</span><small>${esc(v.cls)}・${v.drive}・最高${Math.round(v.vmax * 3.6)}km/h</small>${btn(yen(dealerPrice(id)), 'car:' + id)}</div>`; }).join('');
      const p = panel('車屋', head + `<p class="note">買った車は店の前に出します。物件のガレージにしまえます（色とパーツはカスタムショップで）。</p>` + rows, { name: 'shop', cls: 'wide' });
      bind(p, new Proxy({}, { get: (_, act) => () => {
        const id = act.slice(4); const v = VEHICLES[id]; if (!v) return;
        const pick = v.colors[Math.floor(Math.random() * v.colors.length)];
        if (!pay(m, dealerPrice(id))) { G.hud.toast('お金が足りない'); return; }
        G.audio.cash(); close(); G.cars.buy(id, pick);
      } }));
      return;
    }
    // ---------- カスタムショップ ----------
    if (kind === 'tuner') {
      const car = P.inCar ? P.car : null;
      if (!car) { panel('カスタムショップ', head + '<p>改造する車に乗ったまま入ってください。</p>', { name: 'shop' }); return; }
      if (car.spec.police || car.modelId === 'ambulance' || car.modelId === 'armored') { panel('カスタムショップ', head + '<p>緊急車両はお断りだ。</p>', { name: 'shop' }); return; }
      if (!car.owned) {
        const p = panel('カスタムショップ', head + `<p>${esc(car.spec.name)}は登録されていない（盗難車？）。改造するには登録が必要だ。</p><div class="row">${btn(`登録する ${yen(REGISTER_PRICE)}`, 'reg', 'primary')}</div>`, { name: 'shop' });
        bind(p, { reg: () => { if (pay(m, REGISTER_PRICE)) { G.cars.own(car); G.audio.cash(); G.hud.toast('登録した。もう自分の車だ'); shop('tuner'); } else G.hud.toast('お金が足りない'); } });
        return;
      }
      const mods = car.mods || (car.mods = {});
      const rows = CAR_MODS.map(md => {
        const lv = modLevel(mods, md.id), max = md.levels.length - 1, price = nextModPrice(mods, md.id);
        return `<div class="item"><span>${md.name}　<b>${'●'.repeat(lv)}${'○'.repeat(max - lv)}</b></span><small>${md.desc}</small>${price != null ? btn(yen(price), 'mod:' + md.id) : '<em>最大</em>'}</div>`;
      }).join('');
      const neon = mods.neon ? `<h4>ネオンの色</h4><div class="swatches">${NEON_COLORS.map(c => `<button class="sw big" data-act="neon:${c}" style="background:#${c.toString(16).padStart(6, '0')}"></button>`).join('')}</div>` : '';
      const p = panel(`カスタムショップ — ${car.spec.name}`, head + rows + `<h4>塗装（${yen(PAINT_PRICE)}・修理込み）</h4><div class="swatches">${PAINT_COLORS.map(c => `<button class="sw big" data-act="paint:${c}" style="background:#${c.toString(16).padStart(6, '0')}"></button>`).join('')}</div>` + neon +
        `<div class="row">${btn(`修理 ${yen(ECON.repairPrice)}`, 'repair')}</div>`, { name: 'shop', cls: 'wide' });
      bind(p, new Proxy({}, { get: (_, act) => () => {
        const [a, v] = act.split(':');
        if (a === 'mod') { const pr = nextModPrice(mods, v); if (pr != null && pay(m, pr)) { mods[v] = modLevel(mods, v) + 1; if (v === 'neon' && !mods.neonColor) mods.neonColor = NEON_COLORS[0]; G.cars.applyMods(car); G.audio.cash(); G.hud.toast('取り付けた'); } else G.hud.toast('お金が足りない'); }
        else if (a === 'paint') { if (pay(m, PAINT_PRICE)) G.repaint(car, +v); else G.hud.toast('お金が足りない'); }
        else if (a === 'neon') { mods.neonColor = +v; G.cars.applyMods(car); }
        else if (a === 'repair') { if (pay(m, ECON.repairPrice)) { car.phys.hp = 100; car.phys.flatTires = 0; car.explodeT = -1; G.audio.cash(); } else G.hud.toast('お金が足りない'); }
        shop('tuner');
      } }));
      return;
    }
    // ---------- 不動産屋 ----------
    if (kind === 'realty') {
      const rows = PROPERTIES.map(pr => { const own = G.realty.owned(pr.id); return `<div class="item"><span>${esc(pr.name)}${G.realty.home() === pr.id ? '（自宅）' : ''}</span><small>${esc(pr.kind)}・ガレージ${pr.slots}台・${esc(pr.note)}</small>${own ? '<em>所有</em>' : btn(yen(pr.price), 'buy:' + pr.id)}${btn('地図に印', 'map:' + pr.id)}</div>`; }).join('');
      const p = panel('不動産屋', head + rows + `<p class="note">物件の前で E を押しても買えます。買った物件は「自宅に登録」でき、ガレージに車をしまえます。</p>`, { name: 'shop', cls: 'wide' });
      bind(p, new Proxy({}, { get: (_, act) => () => {
        const [a, id] = act.split(':');
        if (a === 'map') { const pos = G.world.lm['prop_' + id]; G.waypoint = { x: pos.x, z: pos.z }; G.hud.toast('地図に印をつけた'); close(); return; }
        if (a === 'buy') { if (G.realty.buy(id)) shop('realty'); }
      } }));
      return;
    }
    // ---------- 物件 ----------
    if (kind.startsWith('prop:')) {
      const id = kind.slice(5), pr = PROPERTIES.find(x => x.id === id);
      if (!G.realty.owned(id)) {
        const p = panel(pr.name, head + `<p class="lead">${esc(pr.kind)}　ガレージ${pr.slots}台<br>${esc(pr.note)}</p><div class="row">${btn(`購入する ${yen(pr.price)}`, 'buy', 'primary')}</div>`, { name: 'shop' });
        bind(p, { buy: () => { if (G.realty.buy(id)) shop(kind); } });
        return;
      }
      const isHome = G.realty.home() === id;
      const stored = G.realty.stored(id);
      const wstore = G.combat.inv.stored || [];
      const p = panel(`${pr.name}${isHome ? '（自宅）' : ''}`, head + `<div class="row">${btn('寝る（8時間・セーブ）', 'sleep', 'primary')}${isHome ? '' : btn('自宅に登録', 'home')}</div>
        <h4>ガレージ（${stored.length}/${pr.slots}台）</h4>${stored.length ? stored.map((r, i) => `<div class="item"><span class="sw" style="background:#${r.color.toString(16).padStart(6, '0')}"></span><span>${esc(VEHICLES[r.model].name)}</span><small>${Object.entries(r.mods || {}).filter(([k, v]) => v && k !== 'neonColor').map(([k, v]) => (CAR_MODS.find(c => c.id === k) || {}).name + v).join(' ')}</small>${btn('出す', 'out:' + i)}</div>`).join('') : '<p class="note">空き。車で敷地に入って E でしまえます。</p>'}
        <h4>保管している武器</h4>${wstore.length ? wstore.map((w, i) => `<div class="item"><span>${esc(weaponName(WEAPON_BY_ID[w.id], G.settings.mild))}</span>${btn('持ち出す', 'take:' + i)}</div>`).join('') : '<p class="note">なし</p>'}`, { name: 'shop' });
      bind(p, new Proxy({}, { get: (_, act) => () => {
        const [a, i] = act.split(':');
        if (a === 'sleep') { if (G.wanted.stars) { G.hud.toast('手配中は眠れない'); return; } close(); G.sleep(id); }
        else if (a === 'home') { G.realty.setHome(id); shop(kind); }
        else if (a === 'out') { close(); G.realty.retrieve(id, +i); }
        else if (a === 'take') { const w = wstore.splice(+i, 1)[0]; G.combat.give(w.id, w.ammo + w.clip); shop(kind); }
      } }));
      return;
    }
    panel(kind, '<p>準備中</p>', { name: 'shop' });
  }

  function bankApp(title = '銀行') {
    const m = G.money;
    const p = panel(title, `<div class="money big">現金 ${yen(m.cash)}<br>口座 ${yen(m.bank)}${m.stolen ? `<br>未換金の盗品 ${yen(m.stolen)}` : ''}</div>
      <div class="row">${btn('1万円入金', 'd1')}${btn('全額入金', 'dall')}</div><div class="row">${btn('1万円出金', 'w1')}${btn('5万円出金', 'w5')}</div>
      <p class="note">ダウン・逮捕で失うのは現金だけ。口座のお金は安全です。</p>`, { name: 'bank' });
    M.onClose = () => { G.paused = false; };
    bind(p, { d1: () => { deposit(m, 10000); bankApp(title); }, dall: () => { deposit(m, m.cash); bankApp(title); }, w1: () => { withdraw(m, 10000); bankApp(title); }, w5: () => { withdraw(m, 50000); bankApp(title); } });
  }

  // ---------- スマホ ----------
  const APPS = [['map', '🗺', '地図'], ['contacts', '👥', '連絡先'], ['msg', '✉', 'メッセージ'], ['gram', '📷', 'ギフグラム'], ['scan', '🚗', 'クルマスキャン'], ['bank', '¥', '銀行'], ['ride', '🚕', '配車'], ['camera', '📸', 'カメラ'], ['settings', '⚙', '設定']];
  function phone() {
    const p = panel('スマホ', `<div class="phone"><div class="apps">${APPS.map(([id, ic, n]) => `<button class="app" data-act="${id}"><span>${ic}</span>${n}</button>`).join('')}</div></div>`, { name: 'phone', cls: 'phone-panel' });
    bind(p, {
      map: () => fullMap(true), contacts, msg: messages, gram, scan, bank: () => { G.paused = true; bankApp(); }, ride,
      camera: () => { close(); G.photoMode = true; G.hud.toast('カメラ：もう一度 ↑ で戻る'); },
      settings: () => { G.paused = true; settings(() => { close(); }); },
    });
  }
  function contacts() {
    const list = [['ハルカ（相棒）', '「金華山の上から見る夜景は最高だよ。ロープウェイは公園から出てる」'], ['タツミ（整備士）', '「手配中なら塗装工房に飛び込め。色が変われば警察も迷う」'], ['ミドリ（情報屋）', '「柳ケ瀬は夜に人が増える。目立つことはするなよ」'], ['シゲさん（農家）', '「田んぼの農道は滑るから気をつけな」']];
    const p = panel('連絡先', list.map(([n], i) => `<div class="item"><span>${n}</span>${btn('電話', 'c' + i)}</div>`).join(''), { name: 'phoneapp' });
    const h = {}; list.forEach(([n, t], i) => { h['c' + i] = () => { close(); G.hud.subtitle(`${n.split('（')[0]}：${t}`, 6); }; }); bind(p, h);
  }
  function messages() {
    const rows = MISSIONS.map(d => `<div class="item"><span>${G.missions.done[d.id] ? '✔ ' : ''}${esc(d.kind)}：${esc(d.title)}</span><small>${yen(d.reward)}</small>${btn('目的地に設定', 'm:' + d.id)}</div>`).join('');
    const p = panel('メッセージ（依頼）', rows + `<p class="note">地図の「!」でミッションを始められます。タクシーに乗って E でタクシー業務。</p>`, { name: 'phoneapp', cls: 'wide' });
    bind(p, new Proxy({}, { get: (_, act) => () => { const d = MISSIONS.find(x => 'm:' + x.id === act); const pos = G.resolve(d.start); if (pos) { G.waypoint = pos; G.hud.toast('目的地を設定した'); } close(); } }));
  }
  function gram() {
    const rows = G.feed.slice(-20).reverse().map((f, i) => `<div class="post"><b>${esc(f.user)}</b> <small>${esc(f.time)}</small><p>${esc(f.text)}</p>${f.x != null ? btn('現場へ', 'g' + i) : ''}</div>`).join('') || '<p class="note">まだ投稿がありません</p>';
    const p = panel('ギフグラム', `<div class="feed">${rows}</div>`, { name: 'phoneapp', cls: 'wide' });
    const h = {}; G.feed.slice(-20).reverse().forEach((f, i) => { h['g' + i] = () => { G.waypoint = { x: f.x, z: f.z }; G.hud.toast('現場を地図に印した'); close(); }; }); bind(p, h);
  }
  function scan() {
    const P = G.player;
    const c = G.vehicles.nearest(P.x, P.z, 30, (c) => c !== P.car && !c.wreck);
    const body = c ? `<div class="scan"><h3>${esc(c.spec.name)}</h3><p>${esc(c.spec.cls)}　駆動 ${c.spec.drive}　最高速 ${Math.round(c.spec.vmax * 3.6)}km/h</p>
      <p>防犯レベル ${'■'.repeat(c.spec.security)}${'□'.repeat(5 - c.spec.security)}</p><p>必要な道具：${c.spec.security >= 4 ? 'ハッキング端末' : c.spec.security >= 2 ? '合鍵' : 'なし（直結）'}</p>
      <p>売値の目安 ${yen(c.spec.price * 0.08)}</p>${c.spec.tracker ? '<p class="warn">追跡装置あり：盗むと自動で通報される</p>' : ''}${c.driver ? '<p>運転手が乗っている</p>' : ''}</div>` : '<p>近く（30m以内）に車がない</p>';
    panel('クルマスキャン', body, { name: 'phoneapp' });
  }
  function ride() {
    const dests = [['岐阜駅前', 'statue'], ['柳ケ瀬', 'florist'], ['自宅（長良）', 'home'], ['岐阜公園', 'park'], ['西岐阜の農家', 'farm'], ['ガンショップ', 'gunshop'], ['病院', 'hospital']];
    const P = G.player;
    const p = panel('配車', `<p class="note">タクシーを呼んで目的地へ移動（ファストトラベル）。手配中は使えません。</p>` + dests.map(([n, k]) => { const pos = G.resolve(k); const d = pos ? Math.hypot(pos.x - P.x, pos.z - P.z) : 0; return `<div class="item"><span>${n}</span><small>${Math.round(d)}m</small>${btn(yen(500 + d * 3), 'r:' + k)}</div>`; }).join(''), { name: 'phoneapp' });
    bind(p, new Proxy({}, { get: (_, act) => () => {
      const k = act.slice(2); const pos = G.resolve(k); if (!pos) return;
      if (G.wanted.stars) { G.hud.toast('手配中は配車できない'); return; }
      const fare = 500 + Math.hypot(pos.x - P.x, pos.z - P.z) * 3;
      if (!pay(G.money, fare)) { G.hud.toast('お金が足りない'); return; }
      close(); G.fastTravel(pos);
    } }));
  }

  // ---------- 全体地図 ----------
  function fullMap(pauseIt) {
    G.paused = !!pauseIt || G.paused;
    const cv = document.createElement('canvas');
    const w = Math.min(window.innerWidth - 40, 1100), h = Math.min(window.innerHeight - 110, 780);
    cv.width = w; cv.height = h; cv.className = 'fullmap';
    const wrap = document.createElement('div'); wrap.appendChild(cv);
    const note = document.createElement('p'); note.className = 'note'; note.textContent = 'クリック／タップで目的地を設定（もう一度で解除）'; wrap.appendChild(note);
    panel('地図', wrap, { name: 'map', cls: 'mapwrap' });
    M.onClose = () => { G.paused = false; };
    const info = G.hud.drawFullMap(cv, G.explored);
    cv.addEventListener('click', (e) => {
      const r = cv.getBoundingClientRect(); const x = (e.clientX - r.left - info.ox) / info.s, z = (e.clientY - r.top - info.oy) / info.s;
      if (G.waypoint && Math.hypot(G.waypoint.x - x, G.waypoint.z - z) < 20) G.waypoint = null; else G.waypoint = { x, z };
      G.hud.drawFullMap(cv, G.explored);
    });
  }

  // ---------- ウェポンホイール ----------
  const wheelEl = document.createElement('div'); wheelEl.id = 'wheel'; root.appendChild(wheelEl);
  let wheelSel = -1, wheelAng = 0;
  function wheelShow(v) {
    if (!v) { if (wheelEl.style.display === 'block' && wheelSel >= 0) G.combat.select(wheelSel); wheelEl.style.display = 'none'; return; }
    if (wheelEl.style.display !== 'block') {
      const ws = G.combat.inv.weapons; wheelSel = G.combat.inv.cur;
      wheelEl.innerHTML = ws.map((w, i) => { const a = i / ws.length * Math.PI * 2 - Math.PI / 2; const d = WEAPON_BY_ID[w.id]; return `<div class="wslot" data-i="${i}" style="left:calc(50% + ${Math.cos(a) * 130}px);top:calc(50% + ${Math.sin(a) * 130}px)"><b>${esc(d.cls)}</b>${esc(weaponName(d, G.settings.mild))}<small>${d.kind === 'gun' ? w.clip + '/' + w.ammo : d.unit ? '×' + w.clip : ''}</small></div>`; }).join('') + '<div class="wcenter">ウェポンホイール</div>';
      wheelEl.style.display = 'block';
      wheelEl.querySelectorAll('.wslot').forEach(s => { s.addEventListener('touchstart', (e) => { wheelSel = +s.dataset.i; mark(); e.preventDefault(); }, { passive: false }); s.addEventListener('mouseenter', () => { wheelSel = +s.dataset.i; mark(); }); });
      mark();
    }
  }
  function mark() { wheelEl.querySelectorAll('.wslot').forEach(s => s.classList.toggle('sel', +s.dataset.i === wheelSel)); }
  function wheelLook(dx, dy) {
    if (Math.hypot(dx, dy) < 0.004) return;
    wheelAng = Math.atan2(dy, dx); const n = G.combat.inv.weapons.length;
    let k = Math.round(((wheelAng + Math.PI / 2) / (Math.PI * 2)) * n); k = ((k % n) + n) % n; wheelSel = k; mark();
  }

  return { M, close, title, pause, settings, shop, phone, fullMap, brief, wheelShow, wheelLook, ranking, panel, isOpen: () => !!M.open, layer };
}
