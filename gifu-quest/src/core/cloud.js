// Google ログインとつながる（GAS の「ゲーム」プロジェクトで動いている時だけ）。仕様は docs/cloud.md
// - 起動時：本人の Google アカウントに保存したセーブと、端末のセーブのうち新しい方を使う
// - セーブするたび（数秒まとめて）：Google アカウントにも保存し、作った人のスプレッドシートに進み具合を送る
// - クリアした時：タイムを記録してランキングに出す（表示はニックネームだけ）
// GAS の外（ファイルを直接開いた時・claude.ai のページ）では何もしない
const run = () => (typeof google !== 'undefined' && google.script && google.script.run) ? google.script.run : null;

function call(fn, ...args) {
  return new Promise((resolve, reject) => {
    const r = run();
    if (!r) { reject(new Error('offline')); return; }
    r.withSuccessHandler(resolve).withFailureHandler(reject)[fn](...args);
  });
}
function withTimeout(p, ms) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]); }

export const cloud = {
  available: false,     // GAS の中で動いている
  signedIn: false,      // Google ログインを確認できた
  recorder: false,      // 記録係（スプレッドシート）とつながっている
  nickname: '',
  status: 'local',      // 'local' | 'connecting' | 'online' | 'error'
  message: '',
  lastSync: 0,
  _timer: 0, _save: null, _busy: false, _again: false,

  // 起動時に1回。セーブを合わせる。待ちすぎないよう timeoutMs で打ち切る（その時は端末のセーブで遊べる）
  async init(save, timeoutMs = 6000) {
    this._save = save;
    this.available = !!run();
    if (!this.available) { this.status = 'local'; return; }
    save.onWrite = () => this.scheduleUpload();
    this.status = 'connecting';
    try {
      const h = await withTimeout(call('gqHello'), timeoutMs);
      this.signedIn = !!h.signedIn; this.nickname = h.nickname || ''; this.recorder = !!h.recorder;
      const cl = await withTimeout(call('gqLoad'), timeoutMs);
      const local = save.data;
      if (cl && cl.json && cl.savedAt > (local.savedAt || 0)) {
        save.replace(JSON.parse(cl.json));          // Google アカウントの方が新しい（別の端末で遊んだ）
        this.message = 'Google アカウントのセーブを読み込みました';
      } else if ((local.savedAt || 0) > (cl && cl.savedAt || 0)) {
        this.scheduleUpload(100);                    // 端末の方が新しい
      }
      this.status = 'online';
    } catch (e) {
      this.status = 'error';
      this.message = 'Google とつながりませんでした（この端末にだけ保存します）';
    }
  },
  summary(d) {
    const cleared = [...d.cleared].sort((a, b) => a - b);
    let sb = 0; for (const k of Object.keys(d.sarubobo || {})) for (const v of d.sarubobo[k]) if (v) sb++;
    return { cleared: cleared.join(','), orbs: cleared.filter((n) => n >= 1 && n <= 6).length, sarubobo: sb, coins: d.coins, titles: Object.keys(d.achievements || {}).length, weapons: Object.keys(d.weapons || {}).length, char: d.lastChar };
  },
  scheduleUpload(ms = 3000) {
    if (!this.available || this.status === 'local') return;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.upload(), ms);
  },
  async upload() {
    if (this._busy) { this._again = true; return; }
    this._busy = true;
    try {
      const d = this._save.data;
      const r = await call('gqSave', JSON.stringify(d), this.summary(d));
      this.lastSync = Date.now(); this.status = 'online';
      if (r && r.savedAt && d.savedAt !== r.savedAt) { d.savedAt = r.savedAt; this._save.writeLocalOnly(); }
    } catch (e) { this.status = 'error'; this.message = '保存がとどきませんでした。あとでもう一度送ります'; }
    this._busy = false;
    if (this._again) { this._again = false; this.scheduleUpload(1000); }
  },
  async recordClear(rec) {
    if (!this.available || !this.signedIn) return null;
    try { return await call('gqRecordClear', rec); } catch { return null; }
  },
  async ranking(stage) {
    if (!this.available || !this.recorder) return null;
    try { return await withTimeout(call('gqRanking', stage), 10000); } catch { return null; }
  },
  async setNickname(name) {
    const nick = await call('gqSetNickname', name);
    this.nickname = nick;
    return nick;
  },
};
