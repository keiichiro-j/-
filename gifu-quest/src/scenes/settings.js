import { game } from '../game.js';
import { input, DEFAULT_KEYS } from '../core/input.js';
import { save, applySettings } from '../core/save.js';
import { audio } from '../core/audio.js';
import { renderer } from '../gfx/renderer.js';
import { touch, DEFAULT_TOUCH_LAYOUT } from '../ui/touch.js';
import { drawText, drawWashi, drawTag, drawPatternBg, drawCursor, roundRect, COL } from '../ui/text.js';
// 設定（設計書 9章）。担当：UI
// 音（初期は無音）・効果音とBGMの音量・画質・画面の揺れ・難易度・ボタン配置（タッチボタンを動かす）・キー設定
// params: { back: 'title'|'worldmap'|'stage-resume' }

const ROWS = [
  { key: 'sound', label: '音', type: 'opt', opts: [[true, '入'], [false, '切']] },
  { key: 'sfxVol', label: '効果音の音量', type: 'vol' },
  { key: 'bgmVol', label: 'BGMの音量', type: 'vol' },
  { key: 'quality', label: '画質', type: 'opt', opts: [['high', '高'], ['low', '低'], ['auto', '自動']] },
  { key: 'shake', label: '画面の揺れ', type: 'opt', opts: [[true, '入'], [false, '切']] },
  { key: 'difficulty', label: '難易度', type: 'opt', opts: [['easy', 'やさしい'], ['normal', 'ふつう']] },
  { key: 'layout', label: 'ボタン配置（スマホ）', type: 'go' },
  { key: 'keys', label: 'キー設定', type: 'go' },
  { key: 'back', label: 'もどる', type: 'back' },
];
const KEY_ROWS = [['left', '左'], ['right', '右'], ['up', '上（看板を読む）'], ['down', '下（しゃがむ）'], ['jump', 'ジャンプ'], ['attack', '技・ダッシュ'], ['pause', '一時停止']];
const PARTS = [['pad', '左右パッド'], ['jump', 'ジャンプ'], ['attack', '技'], ['pause', '一時停止']];
const ST = {
  title: { size: 30, color: COL.kinLight, stroke: COL.sumi, strokeW: 6, align: 'center', baseline: 'middle', serif: true, shadow: true },
  label: { size: 19, color: COL.sumi, align: 'left', baseline: 'middle' },
  labelA: { size: 19, color: COL.shuDark, align: 'left', baseline: 'middle' },
  opt: { size: 16, color: COL.kinari, stroke: COL.woodDark, strokeW: 3, align: 'center', baseline: 'middle' },
  optA: { size: 16, color: '#fff8e6', stroke: COL.shuDark, strokeW: 3, align: 'center', baseline: 'middle' },
  val: { size: 16, color: COL.sumi, align: 'right', baseline: 'middle' },
  key: { size: 16, color: COL.sumi, align: 'left', baseline: 'middle' },
  hint: { size: 14, color: COL.kinari, stroke: COL.sumi, strokeW: 3, align: 'center', baseline: 'middle', alpha: 0.9 },
  big: { size: 22, color: '#fff8e6', stroke: COL.shuDark, strokeW: 4, align: 'center', baseline: 'middle' },
  wait: { size: 24, color: COL.kinLight, stroke: COL.sumi, strokeW: 5, align: 'center', baseline: 'middle' },
};
const KEY_NAME = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Space: 'スペース', ShiftLeft: '左Shift', ShiftRight: '右Shift', Escape: 'Esc', Enter: 'Enter', Backspace: 'BS', ControlLeft: '左Ctrl', ControlRight: '右Ctrl', Tab: 'Tab' };
export function keyName(c) { return KEY_NAME[c] || c.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'テンキー'); }

const rect = () => ({ x: 0, y: 0, w: 0, h: 0 });
const inR = (r, p) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

export const settingsScene = {
  mode: 'list', sel: 0, t: 0,
  rowRects: ROWS.map(() => ({ row: rect(), opts: [rect(), rect(), rect()], bar: rect() })),
  keyRects: [...KEY_ROWS.map(rect), rect(), rect()],
  toolRects: [rect(), rect(), rect(), rect(), rect()],
  enter(params) {
    this.params = params || {};
    this.mode = 'list'; this.sel = 0; this.t = 0; this.capture = null; this.dragging = null; this.wasDown = false;
    touch.show('menu');
    if (this.params.back !== 'stage-resume') audio.bgm('map');
  },
  exit() { this.stopCapture(); touch.hide(); },
  get S() { return save.data.settings; },
  commit() {
    applySettings(this.S);
    save.write();
    audio.unlock(); if (audio.setVolumes) audio.setVolumes();
    renderer.resize();
  },
  back() {
    audio.sfx('cancel');
    const b = this.params.back;
    if (b === 'stage-resume') game.go('stage', { resume: true }, 'fade');
    else if (b === 'worldmap') game.go('worldmap', {}, 'wipe');
    else game.go('title', {}, 'wipe');
  },
  setOpt(row, i) {
    const v = row.opts[i][0];
    if (this.S[row.key] === v) return;
    this.S[row.key] = v; this.commit(); audio.sfx('select');
  },
  stepOpt(row, d) {
    if (row.type === 'vol') { this.S[row.key] = Math.round(Math.max(0, Math.min(1, this.S[row.key] + d * 0.1)) * 10) / 10; this.commit(); audio.sfx('select'); return; }
    let i = row.opts.findIndex((o) => o[0] === this.S[row.key]);
    i = (i + d + row.opts.length) % row.opts.length;
    this.setOpt(row, i);
  },
  activate(row) {
    if (row.type === 'back') return this.back();
    if (row.type === 'opt') return this.stepOpt(row, 1);
    // 配置の編集へ。項目を押した指（マウス）がまだ下りていても、それで部品をつかまないように wasDown を今の状態にする
    if (row.key === 'layout') { this.mode = 'layout'; this.L = structuredClone(this.S.touchLayout || DEFAULT_TOUCH_LAYOUT); this.part = 0; this.dragging = null; this.wasDown = touch.pointer.down; audio.sfx('confirm'); }
    if (row.key === 'keys') { this.mode = 'keys'; this.ksel = 0; audio.sfx('confirm'); }
  },
  update(dt) {
    this.t += dt;
    if (this.t < 0.2) { touch.clearTap(); return; }
    if (this.mode === 'list') this.updateList(dt);
    else if (this.mode === 'layout') this.updateLayout(dt);
    else this.updateKeys(dt);
  },
  updateList(dt) {
    const n = ROWS.length;
    if (input.pressed.down) { this.sel = (this.sel + 1) % n; audio.sfx('select'); }
    if (input.pressed.up) { this.sel = (this.sel + n - 1) % n; audio.sfx('select'); }
    const row = ROWS[this.sel];
    if (input.pressed.left && (row.type === 'opt' || row.type === 'vol')) this.stepOpt(row, -1);
    if (input.pressed.right && (row.type === 'opt' || row.type === 'vol')) this.stepOpt(row, 1);
    const P = touch.pointer;
    if (P.mouse && P.hover) { P.hover = false; for (let i = 0; i < n; i++) if (inR(this.rowRects[i].row, P)) this.sel = i; }
    // 音量バーはドラッグでも
    if (P.down) for (let i = 0; i < n; i++) { const R = this.rowRects[i]; if (ROWS[i].type === 'vol' && inR(R.bar, { x: P.sx, y: P.sy })) { const v = Math.round(Math.max(0, Math.min(1, (P.x - R.bar.x) / R.bar.w)) * 10) / 10; if (v !== this.S[ROWS[i].key]) { this.S[ROWS[i].key] = v; this.commit(); } this.sel = i; } }
    const tp = touch.tap();
    if (tp) {
      for (let i = 0; i < n; i++) {
        const R = this.rowRects[i], rw = ROWS[i];
        if (!inR(R.row, tp)) continue;
        this.sel = i;
        if (rw.type === 'opt') { for (let j = 0; j < rw.opts.length; j++) if (inR(R.opts[j], tp)) this.setOpt(rw, j); }
        else if (rw.type === 'vol') { /* ドラッグで処理済み */ }
        else this.activate(rw);
        return;
      }
    }
    if (input.pressed.confirm || input.pressed.jump) this.activate(row);
    else if (input.pressed.back || input.pressed.pause) this.back();
  },
  // ---- ボタン配置 ----
  updateLayout(dt) {
    const L = this.L, P = touch.pointer, vw = renderer.viewW, vh = renderer.viewH;
    const T = this.toolRects;
    // ツールバー（部品の切替・小さく・大きく・初期配置・決定）
    const tp = touch.peekTap();
    if (tp) {
      let used = true;
      if (inR(T[0], tp)) { this.part = (this.part + 1) % PARTS.length; audio.sfx('select'); }
      else if (inR(T[1], tp)) this.resize(-0.1);
      else if (inR(T[2], tp)) this.resize(0.1);
      else if (inR(T[3], tp)) { this.L = structuredClone(DEFAULT_TOUCH_LAYOUT); audio.sfx('select'); }
      else if (inR(T[4], tp)) { this.finishLayout(true); }
      else used = false;
      if (used) { touch.clearTap(); this.wasDown = P.down; return; }
    }
    // ドラッグで動かす
    if (P.down && !this.wasDown) {
      const B = touch.buttons(vw, vh, L);
      let best = -1, bd = 1e9;
      for (let i = 0; i < PARTS.length; i++) {
        const k = PARTS[i][0], b = B[k];
        const cx = k === 'pad' ? b.cx : b.x, cy = k === 'pad' ? b.cy : b.y, r = k === 'pad' ? b.w / 2 : b.r + 20;
        const d = Math.hypot(P.x - cx, P.y - cy);
        if (d < r && d < bd) { bd = d; best = i; }
      }
      if (best >= 0) { this.part = best; const d = L[PARTS[best][0]]; this.dragging = { dx: d.x * vw - P.x, dy: d.y * vh - P.y }; }
    }
    if (P.down && this.dragging) {
      const d = L[PARTS[this.part][0]];
      d.x = Math.max(0.04, Math.min(0.96, (P.x + this.dragging.dx) / vw));
      d.y = Math.max(0.06, Math.min(0.95, (P.y + this.dragging.dy) / vh));
    }
    if (!P.down) this.dragging = null;
    this.wasDown = P.down;
    // キー操作
    if (input.pressed.left) { this.part = (this.part + PARTS.length - 1) % PARTS.length; audio.sfx('select'); }
    if (input.pressed.right) { this.part = (this.part + 1) % PARTS.length; audio.sfx('select'); }
    if (input.pressed.up) this.resize(0.1);
    if (input.pressed.down) this.resize(-0.1);
    if (input.pressed.confirm) this.finishLayout(true);
    else if (input.pressed.back || input.pressed.pause) this.finishLayout(false);
  },
  resize(d) { const p = this.L[PARTS[this.part][0]]; p.s = Math.round(Math.max(0.6, Math.min(1.6, p.s + d)) * 10) / 10; audio.sfx('select'); },
  finishLayout(ok) {
    if (ok) { this.S.touchLayout = this.L; this.commit(); audio.sfx('confirm'); } else audio.sfx('cancel');
    this.mode = 'list'; this.dragging = null;
  },
  // ---- キー設定 ----
  updateKeys(dt) {
    if (this.capture) { this.capture.t += dt; if (this.capture.t > 6) this.stopCapture(); return; }
    const n = KEY_ROWS.length + 2;
    if (input.pressed.down) { this.ksel = (this.ksel + 1) % n; audio.sfx('select'); }
    if (input.pressed.up) { this.ksel = (this.ksel + n - 1) % n; audio.sfx('select'); }
    const tp = touch.tap();
    if (tp) for (let i = 0; i < n; i++) if (inR(this.keyRects[i], tp)) { this.ksel = i; return this.keyActivate(); }
    if (input.pressed.confirm) this.keyActivate();
    else if (input.pressed.back || input.pressed.pause) { audio.sfx('cancel'); this.mode = 'list'; }
  },
  keyActivate() {
    const i = this.ksel;
    if (i === KEY_ROWS.length) { // 初期設定に戻す
      this.S.keymap = null; this.commit(); audio.sfx('confirm'); return;
    }
    if (i === KEY_ROWS.length + 1) { audio.sfx('cancel'); this.mode = 'list'; return; }
    audio.sfx('confirm');
    const action = KEY_ROWS[i][0];
    const fn = (e) => {
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.code === 'F1') return;
      this.assign(action, e.code);
      this.stopCapture();
    };
    this.capture = { action, fn, t: 0 };
    window.addEventListener('keydown', fn, true);
  },
  stopCapture() {
    if (!this.capture) return;
    window.removeEventListener('keydown', this.capture.fn, true);
    this.capture = null;
    input.consume();
  },
  assign(action, code) {
    const km = structuredClone(input.keymap);
    for (const [a] of KEY_ROWS) if (a !== action) km[a] = km[a].filter((c) => c !== code);
    km[action] = [code, ...km[action].filter((c) => c !== code)].slice(0, 2);
    for (const [a] of KEY_ROWS) if (!km[a].length) km[a] = DEFAULT_KEYS[a].filter((c) => !Object.values(km).some((l) => l !== km[a] && l.includes(c))).slice(0, 1);
    // 決定・もどるはジャンプ・技のキーにも合わせる
    km.confirm = [...new Set(['Enter', ...km.jump])];
    km.back = [...new Set(['Escape', 'Backspace', ...km.attack])];
    this.S.keymap = km; this.commit(); audio.sfx('select');
  },

  // ---- 描画 ----
  draw(ctx, a, vw, vh) {
    const t = this.t;
    if (this.mode === 'layout') return this.drawLayout(ctx, vw, vh);
    drawPatternBg(ctx, vw, vh, '#1f2a40', '#34465f', t);
    drawText(ctx, this.mode === 'keys' ? 'キー設定' : '設定', vw / 2, 34, ST.title);
    if (this.mode === 'keys') return this.drawKeys(ctx, vw, vh);
    const pw = 640, px = vw / 2 - pw / 2, py = 60, rh = 43, ph = ROWS.length * rh + 28;
    drawWashi(ctx, px, py, pw, ph);
    const S = this.S;
    for (let i = 0; i < ROWS.length; i++) {
      const rw = ROWS[i], R = this.rowRects[i], y = py + 14 + i * rh, on = i === this.sel;
      R.row.x = px + 10; R.row.y = y; R.row.w = pw - 20; R.row.h = rh;
      if (on) { roundRect(ctx, px + 14, y + 3, pw - 28, rh - 6, 10); ctx.fillStyle = 'rgba(208,69,47,0.12)'; ctx.fill(); drawCursor(ctx, px + 30, y + rh / 2, 7, COL.shu); }
      drawText(ctx, rw.label, px + 46, y + rh / 2, on ? ST.labelA : ST.label);
      if (rw.type === 'opt') {
        const ow = rw.opts.length > 2 ? 86 : 104;
        for (let j = 0; j < rw.opts.length; j++) {
          const r = R.opts[j]; r.w = ow; r.h = 34; r.x = px + pw - 30 - (rw.opts.length - j) * (ow + 8) + 8; r.y = y + 6;
          const act = S[rw.key] === rw.opts[j][0];
          drawTag(ctx, r.x, r.y, r.w, r.h, act, false);
          drawText(ctx, rw.opts[j][1], r.x + r.w / 2, r.y + r.h / 2 + 1, act ? ST.optA : ST.opt);
        }
      } else if (rw.type === 'vol') {
        const b = R.bar; b.w = 250; b.h = 30; b.x = px + pw - 30 - 250 - 50; b.y = y + 8;
        const v = S[rw.key];
        roundRect(ctx, b.x, b.y + 11, b.w, 8, 4); ctx.fillStyle = 'rgba(90,60,40,0.25)'; ctx.fill();
        roundRect(ctx, b.x, b.y + 11, b.w * v, 8, 4); ctx.fillStyle = S.sound ? COL.shu : COL.gray; ctx.fill();
        ctx.fillStyle = COL.kin; ctx.beginPath(); ctx.arc(b.x + b.w * v, b.y + 15, 11, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = COL.woodDark; ctx.lineWidth = 2; ctx.stroke();
        drawText(ctx, String(Math.round(v * 10)), px + pw - 34, y + rh / 2, ST.val);
      } else if (rw.type === 'go') drawText(ctx, '▶', px + pw - 40, y + rh / 2, ST.val);
    }
    const hint = touch.enabled ? 'タップで変更・項目を選ぶ' : '↑↓ 項目　←→ 変更　Z 決定　X もどる';
    drawText(ctx, hint, vw / 2, vh - 18, ST.hint);
    if (!S.sound && this.sel === 0) drawText(ctx, '音は初期状態では鳴りません。「入」にすると鳴ります', vw / 2, vh - 38, ST.hint);
  },
  drawKeys(ctx, vw, vh) {
    const pw = 560, px = vw / 2 - pw / 2, py = 62, rh = 44, n = KEY_ROWS.length + 2;
    drawWashi(ctx, px, py, pw, n * rh + 28);
    for (let i = 0; i < n; i++) {
      const y = py + 14 + i * rh, r = this.keyRects[i], on = i === this.ksel;
      r.x = px + 10; r.y = y; r.w = pw - 20; r.h = rh;
      if (on) { roundRect(ctx, px + 14, y + 3, pw - 28, rh - 6, 10); ctx.fillStyle = 'rgba(208,69,47,0.12)'; ctx.fill(); drawCursor(ctx, px + 30, y + rh / 2, 7, COL.shu); }
      if (i < KEY_ROWS.length) {
        const [act, label] = KEY_ROWS[i];
        drawText(ctx, label, px + 46, y + rh / 2, on ? ST.labelA : ST.label);
        const waiting = this.capture && this.capture.action === act;
        drawText(ctx, waiting ? '…キーを押してください' : input.keymap[act].map(keyName).join(' / '), px + 300, y + rh / 2, waiting ? ST.labelA : ST.key);
      } else drawText(ctx, i === KEY_ROWS.length ? '初期設定に戻す' : 'もどる', px + 46, y + rh / 2, on ? ST.labelA : ST.label);
    }
    drawText(ctx, this.capture ? '新しいキーを押してください（6秒で取り消し）' : '↑↓ で選び Z で変更', vw / 2, vh - 18, ST.hint);
  },
  drawLayout(ctx, vw, vh) {
    // ゲーム画面の見本
    const g = ctx.createLinearGradient(0, 0, 0, vh); g.addColorStop(0, '#6fb7ff'); g.addColorStop(1, '#d8f0ff');
    ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
    ctx.fillStyle = '#5a8a4a'; ctx.fillRect(0, vh - 90, vw, 90); ctx.fillStyle = '#7a5a3a'; ctx.fillRect(0, vh - 60, vw, 60);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 0, vw, vh);
    const sel = PARTS[this.part][0];
    touch.drawButtons(ctx, vw, vh, sel, touch.state, this.L);
    // 選択中の枠
    const B = touch.buttons(vw, vh, this.L), b = B[sel];
    ctx.strokeStyle = COL.kin; ctx.lineWidth = 2; ctx.setLineDash([6, 5]); ctx.lineDashOffset = -this.t * 20;
    if (sel === 'pad') { ctx.strokeRect(b.x - 6, b.y - 6, b.w + 12, b.h + 12); } else { ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 8, 0, Math.PI * 2); ctx.stroke(); }
    ctx.setLineDash([]);
    // ツールバー
    const T = this.toolRects, labels = [PARTS[this.part][1] + ' ▶', '小さく', '大きく', '初期配置', '決定'], ws = [150, 90, 90, 100, 90];
    let x = vw / 2 - (ws.reduce((s, w) => s + w + 8, -8)) / 2;
    for (let i = 0; i < 5; i++) {
      const r = T[i]; r.x = x; r.y = 70; r.w = ws[i]; r.h = 40; x += ws[i] + 8;
      drawTag(ctx, r.x, r.y, r.w, r.h, i === 4 || i === 0, false);
      drawText(ctx, labels[i], r.x + r.w / 2, r.y + r.h / 2 + 1, i === 4 || i === 0 ? ST.optA : ST.opt);
    }
    drawText(ctx, 'ボタン配置', vw / 2, 34, ST.title);
    drawText(ctx, touch.enabled ? 'ボタンを指で動かせます' : 'ドラッグで移動　←→ 部品　↑↓ 大きさ　Enter 決定　Esc 取り消し', vw / 2, 130, ST.hint);
    drawText(ctx, `大きさ ×${this.L[sel].s.toFixed(1)}`, vw / 2, 152, ST.hint);
  },
};
