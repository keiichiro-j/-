// GASとの通信（セーブ・ランキングのみ。ゲーム中の通信はしない）
// google.script.run が無い環境（ローカル確認）では端末内に保存する
export function createServer() {
  const gs = typeof google !== 'undefined' && google.script && google.script.run;
  const call = (fn, ...args) => new Promise((res, rej) => {
    if (!gs) return rej(new Error('offline'));
    google.script.run.withSuccessHandler(res).withFailureHandler(rej)[fn](...args);
  });
  const LKEY = 'gifu-open-road:ranking';
  const local = () => { try { return JSON.parse(localStorage.getItem(LKEY) || '[]'); } catch (e) { return []; } };
  return {
    online: !!gs,
    submitScore(rec) {
      if (gs) return call('submitScore', rec);
      const rows = local().filter(r => r.id !== rec.id); rows.push(rec); rows.sort((a, b) => b.score - a.score);
      try { localStorage.setItem(LKEY, JSON.stringify(rows.slice(0, 50))); } catch (e) { /* 保存不可 */ }
      return Promise.resolve(true);
    },
    getRanking(kind) { return gs ? call('getRanking', kind) : Promise.resolve(local()); },
  };
}
