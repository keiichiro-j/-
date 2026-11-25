// ランキングに出すニックネームの入力（キャンバスの上に重ねる、日本語入力ができる本物の入力欄）
// open({ title, value, onDone(name) }) / close()。開いている間はゲームの操作を止める（isOpen を見る）
import { renderer } from '../gfx/renderer.js';
let box = null;
export const nameInput = {
  isOpen: false,
  open({ title = 'ニックネーム', note = '', value = '', onDone, onCancel } = {}) {
    if (this.isOpen) return;
    this.isOpen = true;
    box = document.createElement('div');
    box.style.cssText = 'position:fixed;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;background:rgba(10,6,4,.6);padding:16px';
    box.innerHTML = `<form style="background:#efe4cc;border:3px solid #b98a5a;border-radius:14px;padding:18px 20px;max-width:420px;width:100%;box-shadow:0 10px 30px rgba(0,0,0,.5);font-family:'Hiragino Maru Gothic ProN','Yu Gothic',sans-serif;color:#1d1816">
      <div style="font-weight:bold;font-size:18px;color:#8e2a1c;margin-bottom:6px"></div>
      <div class="gq-note" style="font-size:13px;line-height:1.6;margin-bottom:10px;color:#5a3a2a"></div>
      <input id="gq-nick" maxlength="10" autocomplete="off" style="width:100%;box-sizing:border-box;font-size:18px;padding:10px 12px;border:2px solid #8a5a34;border-radius:8px;background:#fffaf0">
      <div class="gq-err" style="min-height:1.4em;font-size:13px;color:#b8402c;margin-top:4px"></div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:6px">
        <button type="button" class="gq-cancel" style="font-size:15px;padding:8px 16px;border-radius:8px;border:2px solid #8a5a34;background:#f3ead7;cursor:pointer">あとで</button>
        <button type="submit" style="font-size:15px;font-weight:bold;padding:8px 18px;border-radius:8px;border:2px solid #8e2a1c;background:#d0452f;color:#fff;cursor:pointer">決める</button>
      </div></form>`;
    box.querySelector('div').textContent = title;
    box.querySelector('.gq-note').textContent = note;
    const inp = box.querySelector('input'); inp.value = value;
    const err = box.querySelector('.gq-err');
    const stop = (e) => e.stopPropagation();
    box.addEventListener('keydown', stop); box.addEventListener('keyup', stop);
    box.querySelector('.gq-cancel').addEventListener('click', () => { this.close(); onCancel && onCancel(); });
    box.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = inp.value.trim();
      if (!v) { err.textContent = '名前を入れてください'; return; }
      err.textContent = 'ほぞん中…';
      try { await onDone(v); this.close(); } catch (ex) { err.textContent = (ex && ex.message) || '保存できませんでした'; }
    });
    document.body.appendChild(box);
    setTimeout(() => inp.focus(), 50);
  },
  close() { if (box) box.remove(); box = null; this.isOpen = false; if (renderer.canvas) renderer.canvas.focus(); },
};
