import { input } from '../core/input.js';
import { audio } from '../core/audio.js';
import { touch } from './touch.js';
import { drawTag, drawText, drawSumiPanel, drawCursor, COL, ST } from './text.js';
// メニューの共通部品と一時停止メニュー（設計書 9章）。担当：UI

// 縦（または横）に並ぶ木札のメニュー。キー・パッド（上下／左右・決定）、タップ、マウスで選べる
export class MenuList {
  constructor(items, opt = {}) {
    this.items = items;                  // [{ key, label, disabled }]
    this.sel = 0;
    this.horizontal = !!opt.horizontal;
    this.rects = items.map(() => ({ x: 0, y: 0, w: 0, h: 0 }));
    this.t = 0;
    this.size = opt.size || 24;
    this._st = { ...ST.item, size: this.size };
    this._stA = { ...ST.itemActive, size: this.size };
  }
  // 中心 (cx, y0) から並べる
  layout(cx, y0, w, h, gap) {
    const n = this.items.length;
    for (let i = 0; i < n; i++) {
      const r = this.rects[i];
      if (this.horizontal) { const tot = n * w + (n - 1) * gap; r.x = cx - tot / 2 + i * (w + gap); r.y = y0; }
      else { r.x = cx - w / 2; r.y = y0 + i * (h + gap); }
      r.w = w; r.h = h;
    }
    return this;
  }
  hit(x, y) {
    for (let i = 0; i < this.rects.length; i++) { const r = this.rects[i]; if (x >= r.x && x <= r.x + r.w && y >= r.y - 4 && y <= r.y + r.h + 4) return i; }
    return -1;
  }
  move(d) {
    const n = this.items.length;
    for (let k = 0; k < n; k++) { this.sel = (this.sel + d + n) % n; if (!this.items[this.sel].disabled) break; }
    audio.sfx('select');
  }
  // 戻り値：選ばれた項目の key／'back'／null
  update(dt, opt) {
    this.t += dt;
    const prev = this.horizontal ? 'left' : 'up', next = this.horizontal ? 'right' : 'down';
    if (input.pressed[next]) this.move(1);
    if (input.pressed[prev]) this.move(-1);
    // マウスを動かしたら、その上の項目を選ぶ
    const P = touch.pointer;
    if (P.mouse && P.hover) { P.hover = false; const i = this.hit(P.x, P.y); if (i >= 0 && i !== this.sel && !this.items[i].disabled) this.sel = i; }
    const tp = touch.peekTap();
    if (tp) {
      const i = this.hit(tp.x, tp.y);
      if (i >= 0) {
        touch.clearTap();
        if (this.items[i].disabled) { audio.sfx('cancel'); return null; }
        this.sel = i; audio.sfx('confirm'); return this.items[i].key;
      }
    }
    if (input.pressed.confirm || (!(opt && opt.noJump) && input.pressed.jump)) {
      const it = this.items[this.sel];
      if (it.disabled) { audio.sfx('cancel'); return null; }
      audio.sfx('confirm'); return it.key;
    }
    if (input.pressed.back && !(opt && opt.noBack)) { audio.sfx('cancel'); return 'back'; }
    return null;
  }
  draw(ctx) {
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 5);
    for (let i = 0; i < this.items.length; i++) {
      const r = this.rects[i], it = this.items[i], a = i === this.sel;
      const lift = a ? -2 : 0;
      drawTag(ctx, r.x, r.y + lift, r.w, r.h, a, it.disabled, a ? pulse : 0);
      drawText(ctx, it.label, r.x + r.w / 2, r.y + r.h / 2 + 1 + lift, a ? this._stA : this._st);
      if (a && !this.horizontal) { drawCursor(ctx, r.x - 16, r.y + r.h / 2, 9); drawCursor(ctx, r.x + r.w + 16, r.y + r.h / 2, 9); }
    }
  }
}

// 確認ダイアログ（はい／いいえ）
export class Confirm {
  constructor(msg, yes = 'はい', no = 'いいえ') {
    this.msg = msg; this.open = false;
    this.list = new MenuList([{ key: 'yes', label: yes }, { key: 'no', label: no }], { horizontal: true, size: 22 });
  }
  show() { this.open = true; this.list.sel = 1; touch.clearTap(); }
  update(dt) {
    if (!this.open) return null;
    const r = this.list.update(dt);
    if (r === 'back' || r === 'no') { this.open = false; return 'no'; }
    if (r === 'yes') { this.open = false; return 'yes'; }
    return null;
  }
  draw(ctx, vw, vh) {
    if (!this.open) return;
    ctx.fillStyle = 'rgba(10,6,8,0.55)'; ctx.fillRect(0, 0, vw, vh);
    const w = 520, h = 210, x = vw / 2 - w / 2, y = vh / 2 - h / 2;
    drawSumiPanel(ctx, x, y, w, h);
    drawText(ctx, this.msg, vw / 2, y + 62, CONF_ST);
    this.list.layout(vw / 2, y + 120, 170, 52, 30).draw(ctx);
  }
}
const CONF_ST = { size: 22, color: COL.kinari, stroke: COL.sumi, strokeW: 4, align: 'center', baseline: 'middle' };

// 一時停止メニュー。update() は選ばれた項目のキー（'resume'|'retry'|'map'|'settings'）を返す
const PAUSE_TITLE = { size: 34, color: COL.kinLight, stroke: COL.sumi, strokeW: 6, align: 'center', baseline: 'middle', shadow: true, serif: true };
export const pauseMenu = {
  list: new MenuList([
    { key: 'resume', label: '続ける' }, { key: 'retry', label: 'やり直す' },
    { key: 'map', label: 'マップへ戻る' }, { key: 'settings', label: '設定' },
  ]),
  confirm: new Confirm('はじめからやり直しますか？'),
  t: 0,
  open() { this.list.sel = 0; this.t = 0; this.confirm.open = false; touch.show('menu'); touch.clearTap(); },
  update(dt) {
    this.t += dt;
    if (this.confirm.open) { const c = this.confirm.update(dt); if (c === 'yes') return this._done('retry'); return null; }
    if (input.pressed.pause) return this._done('resume');
    const r = this.list.update(dt);
    if (!r) return null;
    if (r === 'back' || r === 'resume') return this._done('resume');
    if (r === 'retry') { this.confirm.show(); return null; }
    return this._done(r);
  },
  _done(r) { touch.show('play'); return r; },
  draw(ctx, vw, vh) {
    const k = Math.min(1, this.t / 0.15);
    ctx.fillStyle = `rgba(12,8,10,${0.6 * k})`; ctx.fillRect(0, 0, vw, vh);
    const w = 340, h = 370, x = vw / 2 - w / 2, y = vh / 2 - h / 2;
    drawSumiPanel(ctx, x, y, w, h);
    drawText(ctx, '一時停止', vw / 2, y + 44, PAUSE_TITLE);
    this.list.layout(vw / 2, y + 86, 240, 50, 16).draw(ctx);
    this.confirm.draw(ctx, vw, vh);
  },
};
