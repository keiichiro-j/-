/**
 * Main.gs
 * Webアプリの入口（doGet）、スプレッドシートのメニュー、初期セットアップ、トリガーの作成。
 * メニュー・トリガーから呼ぶ関数は末尾に _ を付けない（_ 付きは GAS で非公開になり呼べないため）。
 */

/** Webアプリの入口。利用者一覧にない人には「利用権限がありません」ページを返す */
function doGet(e) {
  var user = null;
  try { user = currentUser_(); } catch (err) { console.error(err); }
  if (!user) {
    var email = currentEmail_();
    return HtmlService.createHtmlOutput(
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<div style="font-family:sans-serif;max-width:560px;margin:48px auto;padding:0 16px;line-height:1.8">' +
      '<h1 style="font-size:20px">利用権限がありません</h1>' +
      '<p>' + escHtml_(email || 'このアカウント') + ' は' + escHtml_(APP_TITLE) + 'の利用者に登録されていません。</p>' +
      '<p>利用するには管理者に登録を依頼してください。</p></div>')
      .setTitle(APP_TITLE);
  }
  var t = HtmlService.createTemplateFromFile('html/index');
  t.initialMonth = (e && e.parameter && isMonthStr_(e.parameter.month)) ? e.parameter.month : '';
  return t.evaluate()
    .setTitle(APP_TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** HTML テンプレートからほかのファイル（css・js）を読み込む：<?!= include_('html/css') ?> */
function include_(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

/** HTML エスケープ */
function escHtml_(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

/** スプレッドシートを開いたときのメニュー */
function onOpen() {
  SpreadsheetApp.getUi().createMenu(APP_TITLE)
    .addItem('初期セットアップ', 'setup')
    .addItem('今すぐ取込', 'menuImportNow')
    .addItem('今月の帳票を作り直す', 'menuRegenerateReports')
    .addSeparator()
    .addItem('Webアプリを開く', 'menuOpenWebApp')
    .addItem('トリガーを設定し直す', 'menuReinstallTriggers')
    .addToUi();
}

/** メニュー：今すぐ取込 */
function menuImportNow() {
  var r = importNow_();
  var ui = SpreadsheetApp.getUi();
  if (r.busy) { ui.alert('別の処理が実行中です。しばらくしてからもう一度お試しください。'); return; }
  ui.alert('取込が終わりました。\n\n取込 ' + r.imported + '件（うち要確認 ' + r.review + '件）\n対象外 ' + r.skipped +
    '件\nエラー ' + r.errors + '件\n次回に回した件数 ' + r.remaining + '件');
}

/** メニュー：今月の帳票を作り直す */
function menuRegenerateReports() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { regenerateReports_([thisMonth_()]); } finally { lock.releaseLock(); }
  SpreadsheetApp.getUi().alert(monthLabelLong_(thisMonth_()) + 'の帳票を作り直しました。');
}

/** メニュー：Webアプリを開く */
function menuOpenWebApp() {
  var url = getSetting_('app.url');
  if (!url) { try { url = ScriptApp.getService().getUrl(); } catch (e) { url = ''; } }
  if (!url) {
    SpreadsheetApp.getUi().alert('WebアプリのURLがありません。ウェブアプリとしてデプロイし、設定シートの app.url にURLを入れてください。');
    return;
  }
  var html = HtmlService.createHtmlOutput(
    '<p style="font-family:sans-serif"><a href="' + escHtml_(url) + '" target="_blank" onclick="google.script.host.close()">' +
    escHtml_(APP_TITLE) + 'を開く</a></p><script>window.open(' + JSON.stringify(url) + ',"_blank");</script>')
    .setWidth(320).setHeight(90);
  SpreadsheetApp.getUi().showModalDialog(html, 'Webアプリを開く');
}

/** メニュー：トリガーを設定し直す */
function menuReinstallTriggers() {
  var msg = reinstallTriggers_();
  SpreadsheetApp.getUi().alert(msg);
}

/**
 * 初期セットアップ（何度実行してもよい）。
 * - 全シートを COLUMNS の見出しで作成、文字列書式にする
 * - 地域名マスタ・設定の初期値（既存の値は残す）
 * - 利用者シートに実行者を管理者で登録
 * - アプリ用フォルダと移動先フォルダの作成
 * - シート保護（スクリプト実行者＝所有者以外は編集不可）
 * - トリガーの作成
 */
function setup() {
  var ss = getSs_();
  Object.keys(SHEET).forEach(function (k) {
    var name = SHEET[k];
    var sheet = getSheet_(name);
    var cols = COLUMNS[name];
    if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, cols.length).setValues([cols.map(function (c) { return c[1]; })]);
    sheet.getRange(1, 1, sheet.getMaxRows(), cols.length).setNumberFormat('@');
  });

  // 地域名マスタ
  if (!readAll_(SHEET.AREAS).length) {
    var areas = [];
    Object.keys(DEFAULT_AREAS).forEach(function (kind) {
      DEFAULT_AREAS[kind].forEach(function (a) { areas.push({ area: a, kind: kind }); });
    });
    writeRows_(SHEET.AREAS, areas);
  }

  // 設定（無いキーだけ初期値で追加。真偽・数値も文字列で保存する）
  var existing = {};
  readAll_(SHEET.SETTINGS).forEach(function (r) { existing[r.key] = true; });
  var add = DEFAULT_SETTINGS.filter(function (d) { return !existing[d[0]]; })
    .map(function (d) { return { key: d[0], value: settingStr_(d[1]), note: d[2] }; });
  appendRows_(SHEET.SETTINGS, add);
  settingsCache_ = null;

  // 利用者
  var email = currentEmail_() || String(Session.getEffectiveUser().getEmail() || '');
  var users = readAll_(SHEET.USERS);
  if (email && !users.some(function (u) { return String(u.email).toLowerCase() === email.toLowerCase(); })) {
    appendRows_(SHEET.USERS, [{ email: email, name: email.split('@')[0], role: ROLE.ADMIN }]);
  }

  // フォルダ
  ensureOutputFolders_();

  // シート保護
  Object.keys(SHEET).forEach(function (k) {
    var sheet = ss.getSheetByName(SHEET[k]);
    if (sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET).length) return;
    var p = sheet.protect().setDescription(APP_TITLE + '：スクリプト以外の編集禁止');
    p.removeEditors(p.getEditors());
    if (p.canDomainEdit()) p.setDomainEdit(false);
  });

  var msg = reinstallTriggers_();
  audit_('初期セットアップ', '', '', '', '', 'シート・フォルダ・トリガーを作成');

  try {
    SpreadsheetApp.getUi().alert('初期セットアップが終わりました。\n\n' + msg +
      '\n\n続けて、Webアプリの設定画面で4つの読み取りフォルダと開始月の繰越数を入力してください。');
  } catch (e) { console.log('初期セットアップが終わりました。' + msg); }
}

/** 設定値をシートに保存する文字列にする（真偽は TRUE/FALSE） */
function settingStr_(v) {
  if (v === true) return 'TRUE';
  if (v === false) return 'FALSE';
  if (v === null || v === undefined) return '';
  return String(v);
}

/**
 * トリガーを作り直す。
 * runImport：auto.enabled が TRUE のとき auto.intervalMin（5/10/15/30分）ごと
 * runCloseReminder：毎月1日 9時
 * @return {string} 結果の説明
 */
function reinstallTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var h = t.getHandlerFunction();
    if (h === 'runImport' || h === 'runCloseReminder') ScriptApp.deleteTrigger(t);
  });
  var s = getSettings_();
  var msg = [];
  if (s['auto.enabled'] !== false) {
    var n = Number(s['auto.intervalMin']);
    if ([5, 10, 15, 30].indexOf(n) < 0) n = 10;
    ScriptApp.newTrigger('runImport').timeBased().everyMinutes(n).create();
    msg.push('自動取込：' + n + '分ごと');
  } else {
    msg.push('自動取込：オフ');
  }
  ScriptApp.newTrigger('runCloseReminder').timeBased().onMonthDay(1).atHour(9).create();
  msg.push('締めリマインド：毎月1日 9時');
  return msg.join('\n');
}
