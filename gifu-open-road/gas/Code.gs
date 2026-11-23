/**
 * GIFU OPEN ROAD 3D — Google Apps Script 側
 * 役割は「配信」「ランキング」だけ。ゲームの処理はすべてブラウザで動く。
 * index.html は `npm run build` で生成される（src/ を1本にまとめたもの）。
 */
var SHEET_NAME = 'ranking';
var RATE_LIMIT_PER_MIN = 6;

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('GIFU OPEN ROAD 3D')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** ランキング用のスプレッドシート（初回に自動作成し、IDをスクリプトプロパティに保存） */
function getSheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('RANKING_SHEET_ID');
  var ss;
  if (id) {
    try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; }
  }
  if (!ss) {
    ss = SpreadsheetApp.create('GIFU OPEN ROAD ランキング');
    props.setProperty('RANKING_SHEET_ID', ss.getId());
  }
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(['id', 'name', 'score', 'extra', 'updatedAt']);
  }
  return sh;
}

function sanitize_(s, max) {
  return String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, '').slice(0, max);
}

/** スコア送信：匿名ID＋1分あたりの送信回数制限。同じIDは上書き（最高値を保持） */
function submitScore(rec) {
  if (!rec || typeof rec !== 'object') throw new Error('bad request');
  var id = sanitize_(rec.id, 24);
  if (!/^[a-z0-9]{4,24}$/i.test(id)) throw new Error('bad id');
  var score = Math.floor(Number(rec.score));
  if (!isFinite(score) || score < 0 || score > 1e12) throw new Error('bad score');
  var cache = CacheService.getScriptCache();
  var key = 'rl_' + id;
  var n = Number(cache.get(key) || 0);
  if (n >= RATE_LIMIT_PER_MIN) throw new Error('rate limited');
  cache.put(key, String(n + 1), 60);

  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    var sh = getSheet_();
    var values = sh.getDataRange().getValues();
    var row = -1;
    for (var i = 1; i < values.length; i++) if (values[i][0] === id) { row = i + 1; break; }
    var name = sanitize_(rec.name, 20) || 'ゲスト';
    var extra = sanitize_(rec.extra, 40);
    if (row > 0) {
      var best = Math.max(Number(values[row - 1][2]) || 0, score);
      sh.getRange(row, 2, 1, 4).setValues([[name, best, extra, new Date()]]);
    } else {
      sh.appendRow([id, name, score, extra, new Date()]);
    }
  } finally {
    lock.releaseLock();
  }
  return true;
}

/** ランキング取得（上位50件） */
function getRanking(kind) {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('ranking');
  if (hit) return JSON.parse(hit);
  var values = getSheet_().getDataRange().getValues().slice(1);
  var rows = values.map(function (v) { return { name: String(v[1]), score: Number(v[2]) || 0, extra: String(v[3] || '') }; })
    .sort(function (a, b) { return b.score - a.score; }).slice(0, 50);
  cache.put('ranking', JSON.stringify(rows), 30);
  return rows;
}
