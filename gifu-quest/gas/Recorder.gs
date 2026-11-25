/**
 * ぎふクエスト 〜六つの宝珠〜：GAS「記録係」プロジェクト（Recorder.gs）
 *
 * 作った人のスプレッドシートに付けて使う（スプレッドシートの メニュー「拡張機能 → Apps Script」に貼る）。
 * デプロイ：ウェブアプリ、次のユーザーとして実行「自分」、アクセスできるユーザー「全員」。
 * 「ゲーム」プロジェクトから、遊ぶ人の Google の ID トークン付きで記録が届く。トークンを Google に確かめてから書くので、
 * 遊ぶ人が他人になりすますことはできない。シート「プレイヤー」「クリア記録」「ベスト」は自動で作られる。
 * ランキングで返すのはニックネームとタイムだけ（メールは返さない）。
 */

// 「ゲーム」プロジェクトで showGameId を実行するとログに出る値を貼る（ほかのアプリ向けのトークンを受け付けないため）
const GAME_AUD = '';

const STAGE_MAX = 8;
// ありえない速さの記録を弾く（秒）。ステージ0は練習場
const MIN_CLEAR_SEC = { 0: 10, 1: 60, 2: 60, 3: 60, 4: 60, 5: 60, 6: 60, 7: 60, 8: 60 };
const STAGE_NAMES = ['れんしゅう', '金華山', '長良川', '郡上八幡', '飛騨高山', '白川郷', '奥飛騨', 'うらステージ', '沖縄'];

// 動作確認用：エディタで実行するとシートが作られる
function setup() { ensureSheets_(SpreadsheetApp.getActiveSpreadsheet()); Logger.log('シートを用意しました: ' + SpreadsheetApp.getActiveSpreadsheet().getUrl()); }

function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad_request' }); }
  const who = verifyToken_(req.token);
  if (!who) return json_({ ok: false, error: 'auth' });
  const nick = cleanNickname_(req.nickname) || '名無しの旅人';
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    ensureSheets_(ss);
    switch (req.action) {
      case 'profile': upsertPlayer_(ss, who, nick, null); return json_({ ok: true });
      case 'progress': upsertPlayer_(ss, who, nick, req.data || {}); return json_({ ok: true });
      case 'clear': return json_(recordClear_(ss, who, nick, req.data || {}));
      case 'ranking': return json_(ranking_(ss, who, Number((req.data || {}).stage)));
      default: return json_({ ok: false, error: 'unknown_action' });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (e2) { /* 取れていない時 */ }
  }
}

// Google の ID トークンを Google に確かめる（同じトークンは5分覚えて、確かめる回数を減らす）
function verifyToken_(token) {
  if (!token || typeof token !== 'string') return null;
  const cache = CacheService.getScriptCache();
  const key = 'tok_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token)).slice(0, 40);
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  const r = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token), { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) return null;
  const info = JSON.parse(r.getContentText());
  if (GAME_AUD && String(info.aud) !== GAME_AUD) return null;                       // 別のアプリ用のトークンは受け付けない
  if (!(info.email_verified === true || info.email_verified === 'true')) return null;
  if (Number(info.exp) * 1000 < Date.now()) return null;
  const who = { sub: String(info.sub), email: String(info.email || '') };
  cache.put(key, JSON.stringify(who), 300);
  return who;
}

// ---- スプレッドシート ----
const SHEETS = {
  players: { name: 'プレイヤー', head: ['ID', 'メール', 'ニックネーム', 'はじめて', 'さいご', '保存した回数', 'クリアしたステージ', '宝珠', 'さるぼぼ', '持ちコイン', '称号', '武器', 'いつものキャラ'] },
  clears: { name: 'クリア記録', head: ['日時', 'ID', 'メール', 'ニックネーム', 'ステージ', 'ステージ名', 'タイム（秒）', 'キャラ', 'ミス', 'コイン', '武器', '判定'] },
  best: { name: 'ベスト', head: ['ステージ', 'ID', 'ニックネーム', 'ベストタイム（秒）', '日時'] },
};
function ensureSheets_(ss) {
  for (const k of Object.keys(SHEETS)) {
    const S = SHEETS[k];
    let sh = ss.getSheetByName(S.name);
    if (!sh) {
      sh = ss.insertSheet(S.name);
      sh.getRange(1, 1, 1, S.head.length).setValues([S.head]).setFontWeight('bold').setBackground('#f3ead7');
      sh.setFrozenRows(1);
    }
  }
  const first = ss.getSheetByName('シート1') || ss.getSheetByName('Sheet1');
  if (first && ss.getSheets().length > 1 && first.getLastRow() === 0) ss.deleteSheet(first);
}
function findRow_(sh, col, value) {
  const n = sh.getLastRow() - 1;
  if (n <= 0) return -1;
  const vals = sh.getRange(2, col, n, 1).getValues();
  for (let i = 0; i < n; i++) if (String(vals[i][0]) === String(value)) return i + 2;
  return -1;
}
function upsertPlayer_(ss, who, nick, sum) {
  const sh = ss.getSheetByName(SHEETS.players.name);
  const now = new Date();
  let row = findRow_(sh, 1, who.sub);
  if (row < 0) {
    sh.appendRow([who.sub, who.email, nick, now, now, 0, '', 0, 0, 0, 0, 0, '']);
    row = sh.getLastRow();
  }
  sh.getRange(row, 2, 1, 2).setValues([[who.email, nick]]);
  sh.getRange(row, 5).setValue(now);
  if (sum) {
    const saves = Number(sh.getRange(row, 6).getValue()) || 0;
    sh.getRange(row, 6, 1, 8).setValues([[saves + 1, sum.cleared, sum.orbs, sum.sarubobo, sum.coins, sum.titles, sum.weapons, sum.char]]);
  }
}
function recordClear_(ss, who, nick, d) {
  const stage = Number(d.stage), time = Math.round(Number(d.time) * 10) / 10;
  if (!(stage >= 0 && stage <= STAGE_MAX)) return { ok: false, error: 'stage' };
  const ok = time >= (MIN_CLEAR_SEC[stage] || 30) && time <= 7200;
  ss.getSheetByName(SHEETS.clears.name).appendRow([new Date(), who.sub, who.email, nick, stage, STAGE_NAMES[stage] || '', time, d.char, d.misses, d.coins, d.weapon, ok ? '' : '対象外（時間が不自然）']);
  upsertPlayer_(ss, who, nick, null);
  if (!ok || stage === 0) return { ok: true, ranked: false };
  // ベスト（ステージ×人で1行）
  const sh = ss.getSheetByName(SHEETS.best.name);
  const n = sh.getLastRow() - 1;
  const vals = n > 0 ? sh.getRange(2, 1, n, 4).getValues() : [];
  let row = -1;
  for (let i = 0; i < vals.length; i++) if (Number(vals[i][0]) === stage && String(vals[i][1]) === who.sub) { row = i + 2; break; }
  let newBest = false;
  if (row < 0) { sh.appendRow([stage, who.sub, nick, time, new Date()]); newBest = true; }
  else {
    sh.getRange(row, 3).setValue(nick);
    if (time < Number(vals[row - 2][3])) { sh.getRange(row, 4, 1, 2).setValues([[time, new Date()]]); newBest = true; }
  }
  return { ok: true, ranked: true, newBest: newBest };
}
// ランキング：ニックネームとタイムだけを返す（メールは返さない）
function ranking_(ss, who, stage) {
  const sh = ss.getSheetByName(SHEETS.best.name);
  const n = sh.getLastRow() - 1;
  if (n <= 0) return { ok: true, stage: stage, list: [], me: null, total: 0 };
  const rows = sh.getRange(2, 1, n, 4).getValues().filter(function (r) { return Number(r[0]) === stage; })
    .sort(function (a, b) { return Number(a[3]) - Number(b[3]); });
  const list = rows.slice(0, 10).map(function (r, i) { return { rank: i + 1, nickname: String(r[2]), time: Number(r[3]), me: String(r[1]) === who.sub }; });
  let me = null;
  for (let i = 0; i < rows.length; i++) if (String(rows[i][1]) === who.sub) { me = { rank: i + 1, time: Number(rows[i][3]) }; break; }
  return { ok: true, stage: stage, list: list, me: me, total: rows.length };
}


// ---- 入力の掃除 ----
function cleanNickname_(name) {
  if (typeof name !== 'string') return '';
  // 記号やタグに使われる文字・改行を消し、10文字まで。式として解釈されないよう先頭の = + - @ も消す
  let s = name.replace(/[<>&"'`\\\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().replace(/^[=+\-@]+/, '');
  return Array.from(s).slice(0, 10).join('');
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
