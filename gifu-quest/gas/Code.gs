/**
 * ぎふクエスト 〜六つの宝珠〜：GAS「ゲーム」プロジェクト（Code.gs・index.html・appsscript.json）
 *
 * 遊ぶ人の Google アカウントで動く（デプロイ：次のユーザーとして実行「ウェブアプリにアクセスしているユーザー」、
 * アクセスできるユーザー「Google アカウントを持つ全員」）。
 *  - 本人のセーブを本人の Google アカウント（UserProperties）に保存 → 別の端末でも続きから遊べる
 *  - 本人であることの証明（Google の ID トークン）を付けて、記録係（スプレッドシート側の別プロジェクト Recorder.gs）に記録を送る
 * 記録係の URL を下の RECORDER_URL に貼る。空のときは本人のセーブだけ動く。手順は docs/cloud.md
 * ゲームの処理はすべてブラウザ（index.html）で行う。
 */

// 記録係（スプレッドシートの Apps Script をウェブアプリとしてデプロイした URL …/exec）
const RECORDER_URL = '';

const STAGE_MAX = 8;

// =====================================================================
// 画面
// =====================================================================
function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('ぎふクエスト 〜六つの宝珠〜')
    .addMetaTag('viewport', 'width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// =====================================================================
// 作った人が最初に1回だけ実行する：記録係（Recorder.gs）の GAME_AUD に貼る値をログに出す
// =====================================================================
function showGameId() {
  const p = decodeJwt_(ScriptApp.getIdentityToken());
  Logger.log('記録係の GAME_AUD に貼る値: ' + (p && p.aud));
  Logger.log('RECORDER_URL: ' + (RECORDER_URL || '（まだ空です）'));
}

// =====================================================================
// ① ゲーム（遊ぶ人の Google アカウントで動く）：ブラウザから google.script.run で呼ばれる
// =====================================================================
function gqHello() {
  const email = Session.getActiveUser().getEmail();
  const up = PropertiesService.getUserProperties();
  return {
    signedIn: !!email,
    nickname: up.getProperty('nickname') || '',
    savedAt: Number(up.getProperty('savedAt') || 0),
    recorder: !!RECORDER_URL,
  };
}

// 本人のセーブ（UserProperties は1つの値が約9KBまでなので分けて入れる）
const CHUNK = 8000;
function gqLoad() {
  const up = PropertiesService.getUserProperties();
  const n = Number(up.getProperty('save_n') || 0);
  if (!n) return { json: '', savedAt: 0 };
  let json = '';
  for (let i = 0; i < n; i++) json += up.getProperty('save_' + i) || '';
  return { json: json, savedAt: Number(up.getProperty('savedAt') || 0) };
}

function gqSave(json, summary) {
  if (typeof json !== 'string' || json.length > 200000) throw new Error('セーブが大きすぎます');
  try { JSON.parse(json); } catch (e) { throw new Error('セーブの形が正しくありません'); }
  const up = PropertiesService.getUserProperties();
  const old = Number(up.getProperty('save_n') || 0);
  const parts = Math.ceil(json.length / CHUNK);
  const obj = {};
  for (let i = 0; i < parts; i++) obj['save_' + i] = json.slice(i * CHUNK, (i + 1) * CHUNK);
  obj.save_n = String(parts);
  const savedAt = Date.now();
  obj.savedAt = String(savedAt);
  up.setProperties(obj);
  for (let i = parts; i < old; i++) up.deleteProperty('save_' + i);
  // 作った人のスプレッドシートにも進み具合を送る（失敗してもセーブは成功）
  let recorded = false;
  try { recorded = !!(sendToRecorder_('progress', cleanSummary_(summary)) || {}).ok; } catch (e) { recorded = false; }
  return { savedAt: savedAt, recorded: recorded };
}

function gqSetNickname(name) {
  const nick = cleanNickname_(name);
  if (!nick) throw new Error('名前を入れてください');
  PropertiesService.getUserProperties().setProperty('nickname', nick);
  try { sendToRecorder_('profile', {}); } catch (e) { /* 記録係が止まっていても名前は保存できる */ }
  return nick;
}

function gqRecordClear(rec) {
  const r = rec || {};
  const stage = Number(r.stage);
  if (!(stage >= 0 && stage <= STAGE_MAX)) return { ok: false };
  return sendToRecorder_('clear', {
    stage: stage, time: Number(r.time) || 0, char: String(r.char || '').slice(0, 12),
    misses: Number(r.misses) || 0, coins: Number(r.coins) || 0, weapon: String(r.weapon || '').slice(0, 8),
  }) || { ok: false };
}

function gqRanking(stage) {
  return sendToRecorder_('ranking', { stage: Number(stage) }) || { ok: false, list: [] };
}

function sendToRecorder_(action, data) {
  if (!RECORDER_URL) return null;
  const up = PropertiesService.getUserProperties();
  const res = UrlFetchApp.fetch(RECORDER_URL, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true, followRedirects: true,
    payload: JSON.stringify({ action: action, data: data || {}, token: ScriptApp.getIdentityToken(), nickname: up.getProperty('nickname') || '' }),
  });
  if (res.getResponseCode() !== 200) return null;
  try { return JSON.parse(res.getContentText()); } catch (e) { return null; }
}

// ---- 入力の掃除 ----
function cleanNickname_(name) {
  if (typeof name !== 'string') return '';
  // 記号やタグに使われる文字・改行を消し、10文字まで。式として解釈されないよう先頭の = + - @ も消す
  let s = name.replace(/[<>&"'`\\\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().replace(/^[=+\-@]+/, '');
  return Array.from(s).slice(0, 10).join('');
}
function cleanSummary_(s) {
  const o = s || {};
  const num = function (v, max) { v = Number(v); return v >= 0 && v <= max ? Math.floor(v) : 0; };
  return {
    cleared: String(o.cleared || '').replace(/[^0-9,]/g, '').slice(0, 40),
    orbs: num(o.orbs, 9), sarubobo: num(o.sarubobo, 99), coins: num(o.coins, 1e7),
    titles: num(o.titles, 999), weapons: num(o.weapons, 99), char: String(o.char || '').replace(/[^a-z]/g, '').slice(0, 12),
  };
}
function decodeJwt_(t) {
  try {
    let seg = String(t).split('.')[1];
    seg += '==='.slice((seg.length + 3) % 4);   // 足りない = を補う
    return JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(seg)).getDataAsString());
  } catch (e) { return null; }
}
