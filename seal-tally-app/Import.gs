/**
 * Import.gs
 * 読み取りフォルダの巡回、PDFのテキスト化（Drive API v3 で Googleドキュメントに変換）、
 * 明細の登録、ファイルの移動、処理済みの記録。移動先フォルダの用意もここで行う。
 */

var DOC_MIME_ = 'application/vnd.google-apps.document';

/* ---------------- フォルダ ---------------- */

/** スプレッドシートと同じフォルダ（取れなければマイドライブ） */
function spreadsheetParentFolder_() {
  try {
    var it = DriveApp.getFileById(getSs_().getId()).getParents();
    if (it.hasNext()) return it.next();
  } catch (e) { console.warn('親フォルダを取得できません: ' + e); }
  return DriveApp.getRootFolder();
}

/** 親フォルダの中の同名フォルダ（無ければ作る） */
function getOrCreateSubFolder_(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

/** アプリ用フォルダ（folder.root）。未設定・開けないときはスプレッドシートと同じフォルダに「封印集計」を作る */
function rootFolder_() {
  var id = getSetting_('folder.root');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { console.warn('folder.root を開けません: ' + id); }
  }
  var f = getOrCreateSubFolder_(spreadsheetParentFolder_(), '封印集計');
  setSettings_({ 'folder.root': f.getId() });
  return f;
}

/**
 * 移動先フォルダ（処理済・要確認・対象外・エラー・提出用）を用意して返す。
 * @return {{root, done, review, skip, error, submit}} Folder
 */
function ensureOutputFolders_() {
  var root = rootFolder_();
  var out = { root: root };
  var updates = {};
  OUTPUT_FOLDERS.forEach(function (f) {
    var key = f[0];
    var id = getSetting_(key);
    var folder = null;
    if (id) { try { folder = DriveApp.getFolderById(id); } catch (e) { folder = null; } }
    if (!folder) {
      folder = getOrCreateSubFolder_(root, f[1]);
      updates[key] = folder.getId();
    }
    out[key.replace('folder.', '')] = folder;
  });
  if (Object.keys(updates).length) setSettings_(updates);
  return out;
}

/**
 * 読み取りフォルダの名前と未処理PDF件数（開始月の1日以降に作成されたPDFの数。5分キャッシュ）。
 * @param {string} id フォルダID
 * @param {boolean} fresh キャッシュを使わない
 * @return {{ok:boolean, name:string, pending:number}}
 */
function folderInfo_(id, fresh) {
  if (!id) return { ok: false, name: '', pending: 0 };
  var cache = CacheService.getScriptCache();
  var key = 'folderinfo_' + id;
  if (!fresh) {
    var hit = cache.get(key);
    if (hit) return JSON.parse(hit);
  }
  var info;
  try {
    var f = DriveApp.getFolderById(id);
    var name = f.getName();
    var n = 0;
    var startYmd = startMonth_() + '-01';
    var it = f.getFilesByType(MimeType.PDF);
    while (it.hasNext()) {
      if (fmtDate_(it.next().getDateCreated(), 'yyyy-MM-dd') >= startYmd) n++;
    }
    info = { ok: true, name: name, pending: n };
  } catch (e) {
    info = { ok: false, name: '', pending: 0 };
  }
  cache.put(key, JSON.stringify(info), 300);
  return info;
}

/** 読み取りフォルダ情報のキャッシュを消す */
function clearFolderCache_() {
  var s = getSettings_();
  var keys = INPUT_FOLDERS.map(function (f) { return 'folderinfo_' + s[f[0]]; });
  try { CacheService.getScriptCache().removeAll(keys); } catch (e) { /* 何もしない */ }
}

/* ---------------- テキスト化 ---------------- */

/**
 * PDFを Googleドキュメントに変換して本文テキストを返す。一時ドキュメントは finally で必ず削除する。
 * @param {Blob} blob PDF
 * @param {string} name ファイル名
 * @param {string} parentId 一時ドキュメントを置くフォルダID（空ならマイドライブ）
 */
function pdfToText_(blob, name, parentId) {
  var meta = { name: '[一時]' + name, mimeType: DOC_MIME_ };
  if (parentId) meta.parents = [parentId];
  var doc = Drive.Files.create(meta, blob, { ocrLanguage: 'ja', supportsAllDrives: true });
  try {
    return DocumentApp.openById(doc.id).getBody().getText();
  } finally {
    removeTempFile_(doc.id);
  }
}

/** 一時ファイルを削除する（失敗したらゴミ箱へ） */
function removeTempFile_(id) {
  try {
    Drive.Files.remove(id, { supportsAllDrives: true });
  } catch (e) {
    try { DriveApp.getFileById(id).setTrashed(true); } catch (e2) { console.warn('一時ファイルを削除できません: ' + id); }
  }
}

/** バイト列の SHA-256（16進） */
function sha256Hex_(bytes) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes).map(function (b) {
    return ('0' + ((b + 256) % 256).toString(16)).slice(-2);
  }).join('');
}

/* ---------------- 取込 ---------------- */

/** ファイル処理に使う時間（自動取込は4分、画面の「今すぐ取込」は2分） */
var IMPORT_FILE_BUDGET_MS_ = 4 * 60 * 1000;
var IMPORT_MANUAL_BUDGET_MS_ = 2 * 60 * 1000;
/** 後処理（帳票再生成・残数判定）に残しておく時間 */
var IMPORT_POST_RESERVE_MS_ = 60 * 1000;
/** 次回に回した帳票再生成の月（スクリプトプロパティ） */
var PENDING_REPORTS_PROP_ = 'pendingReportMonths';
/** 時間切れで飛ばした残数判定（スクリプトプロパティ） */
var PENDING_LOWSTOCK_PROP_ = 'pendingLowStockCheck';
/** フォルダエラー通知の送信記録（スクリプトプロパティ。同じ内容は1日1回） */
var FOLDER_ERROR_PROP_ = 'folderErrorNotified';

/** 時間主導トリガーの入口（利用者のいる実行では管理者のみ） */
function runImport(e) {
  guardEntry_(e);
  actorOverride_ = 'システム';
  try {
    var r = importNow_();
    console.log('取込結果: ' + JSON.stringify(r));
  } catch (e) {
    console.error('取込に失敗しました: ' + (e && e.stack || e));
  }
}

/** 次回に回した帳票再生成の月を読む */
function pendingReportMonths_() {
  try {
    var v = PropertiesService.getScriptProperties().getProperty(PENDING_REPORTS_PROP_);
    var a = v ? JSON.parse(v) : [];
    return Array.isArray(a) ? a.filter(isMonthStr_) : [];
  } catch (e) { return []; }
}

/** 次回に回す帳票再生成の月を保存する（空なら消す） */
function savePendingReportMonths_(months) {
  var props = PropertiesService.getScriptProperties();
  if (months && months.length) props.setProperty(PENDING_REPORTS_PROP_, JSON.stringify(uniq_(months).sort()));
  else props.deleteProperty(PENDING_REPORTS_PROP_);
}

/**
 * フォルダのエラー（読み取りフォルダを開けない等）を管理者に知らせる。同じ内容は1日1回まで。履歴にも残す。
 * @param {{key:string, label:string, reason:string}[]} list
 */
function notifyFolderErrors_(list) {
  if (!list.length) return;
  var props = PropertiesService.getScriptProperties();
  var sent = {};
  try { sent = JSON.parse(props.getProperty(FOLDER_ERROR_PROP_) || '{}') || {}; } catch (e) { sent = {}; }
  var today = todayStr_();
  var fresh = list.filter(function (x) { return sent[x.key + '|' + x.reason] !== today; });
  if (!fresh.length) return;
  auditMany_(fresh.map(function (x) {
    return { action: 'フォルダエラー', target: x.key, field: '', before: '', after: x.reason, note: x.label };
  }));
  try {
    sendNotice_(adminEmails_(), '【' + APP_TITLE + '】読み取りフォルダのエラー',
      '次のフォルダを読み取れませんでした。設定画面でフォルダURLと共有の設定を確認してください。\n' +
      '（同じ内容のお知らせは1日1回までです）\n\n' +
      fresh.map(function (x) { return '・' + x.label + '：' + x.reason; }).join('\n'));
  } catch (e) { console.error('フォルダエラーの通知に失敗しました: ' + e); }
  var keep = {};
  Object.keys(sent).forEach(function (k) { if (sent[k] === today) keep[k] = today; });
  fresh.forEach(function (x) { keep[x.key + '|' + x.reason] = today; });
  props.setProperty(FOLDER_ERROR_PROP_, JSON.stringify(keep));
}

/**
 * 取込の本体（4章の手順）。スクリプトロックが取れなければ何もしない。
 * @param {{budgetMs:number}=} opt budgetMs：ファイル処理に使う時間（既定4分。画面からは2分）
 * @return {{imported:number, skipped:number, review:number, errors:number, remaining:number, busy?:boolean}}
 */
function importNow_(opt) {
  var result = { imported: 0, skipped: 0, review: 0, errors: 0, remaining: 0 };
  var budget = (opt && opt.budgetMs) || IMPORT_FILE_BUDGET_MS_;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) { result.busy = true; return result; }
  var startedAt = Date.now();
  try {
    var s = getSettings_();
    var startYmd = startMonth_() + '-01';
    var master = getAreaMaster_();
    var env = {
      master: master,
      areaNames: Object.keys(master),
      today: todayStr_(),
      tol: isNaN(Number(s['check.dateToleranceDays'])) ? 7 : Number(s['check.dateToleranceDays']),
      folders: ensureOutputFolders_(),
      doneFolders: {},
      records: readAll_(SHEET.RECORDS),
      ctx: null,
      dirty: {},
      months: {},
      closed: closedMonths_(),
      lateNotices: [],
      folderErrors: [],
      errors: []
    };
    env.ctx = evalCtx_([]);
    env.ctx.master = master;
    var processed = {};
    readAll_(SHEET.PROCESSED).forEach(function (p) { processed[p.fileId] = true; });

    INPUT_FOLDERS.forEach(function (def) {
      var folderId = s[def[0]];
      if (!folderId) return;
      var folder;
      try { folder = DriveApp.getFolderById(folderId); } catch (e) {
        env.folderErrors.push({ key: def[0], label: def[1] + 'の読み取りフォルダ', reason: 'フォルダを開けません（' + e.message + '）' });
        return;
      }
      var it = folder.getFilesByType(MimeType.PDF);
      while (it.hasNext()) {
        var file = it.next();
        var fid = file.getId();
        if (processed[fid]) continue;
        if (fmtDate_(file.getDateCreated(), 'yyyy-MM-dd') < startYmd) continue;
        if (Date.now() - startedAt > budget) { result.remaining++; continue; }
        processed[fid] = true;
        try {
          var kind = importOneFile_(file, def, env);
          if (kind === 'skip') result.skipped++;
          else { result.imported++; if (kind === 'review') result.review++; }
        } catch (e) {
          result.errors++;
          var reason = String(e && e.message || e);
          console.error('取込エラー: ' + file.getName() + ' ' + (e && e.stack || e));
          try { file.moveTo(env.folders.error); } catch (e2) { reason += '（エラーフォルダへの移動にも失敗）'; }
          audit_('取込エラー', fid, '', '', reason, file.getName());
          env.errors.push({ fileName: file.getName(), reason: reason });
        }
      }
    });

    var dirty = Object.keys(env.dirty).map(function (id) { return env.dirty[id]; });
    if (dirty.length) updateRows_(SHEET.RECORDS, dirty);
    setSettings_({ 'import.lastRun': nowStr_() });

    if (env.errors.length) {
      try {
        sendNotice_(adminEmails_(), '【' + APP_TITLE + '】取込エラー（' + env.errors.length + '件）',
          '次のPDFを取り込めませんでした。PDFは「エラー」フォルダへ移しています。\n\n' +
          env.errors.map(function (x) { return '・' + x.fileName + '：' + x.reason; }).join('\n'));
      } catch (e) { console.error('エラー通知の送信に失敗しました: ' + e); }
    }
    notifyFolderErrors_(env.folderErrors);
    if (env.lateNotices.length) {
      try {
        sendNotice_(adminEmails_(), '【' + APP_TITLE + '】締め済みの月の記録事項が届きました',
          '次の明細は締め済みの月のものです。要確認として登録し、PDFは「要確認」フォルダへ移しています。\n' +
          '締め済みの月の帳票は締めたときのままです。管理者が締めを解除して確認してください。\n\n' + env.lateNotices.join('\n'));
      } catch (e) { console.error('通知の送信に失敗しました: ' + e); }
    }

    // 後処理：前回に回した分と今回の変更月の帳票を作り直す。時間が足りなければ次回に回す
    var months = uniq_(pendingReportMonths_().concat(Object.keys(env.months)));
    var deadline = startedAt + budget + IMPORT_POST_RESERVE_MS_;
    if (months.length) {
      if (Date.now() > deadline) {
        savePendingReportMonths_(months);
      } else {
        try {
          regenerateReports_(months, { records: env.records });
          savePendingReportMonths_([]);
        } catch (e) {
          console.error('帳票の再生成に失敗しました: ' + (e && e.stack || e));
          savePendingReportMonths_(months);
          audit_('帳票再生成エラー', months.join(','), '', '', String(e && e.message || e), '');
        }
      }
    }
    var props = PropertiesService.getScriptProperties();
    var lowPending = props.getProperty(PENDING_LOWSTOCK_PROP_) === 'TRUE';
    if (result.imported || lowPending) {
      if (Date.now() <= deadline) {
        try {
          checkLowStock_(env.records);
          if (lowPending) props.deleteProperty(PENDING_LOWSTOCK_PROP_);
        } catch (e) { console.error('残数通知の判定に失敗しました: ' + e); }
      } else {
        props.setProperty(PENDING_LOWSTOCK_PROP_, 'TRUE');   // 時間切れ：次回の取込で判定する
      }
    }
    clearFolderCache_();
    return result;
  } finally {
    lock.releaseLock();
  }
}

/**
 * PDFを1件取り込む。
 * @param {File} file PDF
 * @param {Array} def INPUT_FOLDERS の1行 [設定キー, 表示名, ブランド, 新中]
 * @param {Object} env importNow_ の作業領域
 * @return {string} 'skip' | 'review' | 'record'
 */
function importOneFile_(file, def, env) {
  var fid = file.getId();
  var name = file.getName();
  var blob = file.getBlob();
  var hash = sha256Hex_(blob.getBytes());
  var created = fmtDate_(file.getDateCreated(), 'yyyy-MM-dd');
  var text = pdfToText_(blob, name, env.folders.root.getId());
  var ex = extractAll_(text, env.areaNames, { today: env.today, created: created, toleranceDays: env.tol });
  text = null; // 所有者名・住所を含む本文は保持しない
  var brand = def[2];
  var nc = def[3];
  var plate = ex.plate || {};
  var now = nowStr_();

  if (plate.area) {
    var c = classifyUnit_(brand, plate.area, env.master);
    if (c.result === 'skip') {
      appendRows_(SHEET.SKIPLOG, [{
        fileId: fid, fileName: name, brand: brand, nc: nc, plate: platePrint_(plate), regDate: ex.regDate || '',
        reason: c.reason, at: now
      }]);
      appendRows_(SHEET.PROCESSED, [{ fileId: fid, fileName: name, hash: hash, result: '対象外', recordId: '', at: now }]);
      file.moveTo(env.folders.skip);
      return 'skip';
    }
  }

  var rec = {
    id: nextRecordId_('F', env.records), regDate: ex.regDate || '', area: plate.area || '', cls: plate.cls || '',
    kana: plate.kana || '', num: plate.num || '', brand: brand, nc: nc, unit: '', vin: ex.vin || '', status: '',
    checks: [], acked: [], noSeal: false, noSealReason: '', inputType: '自動', manualReason: '', excluded: false,
    excludeReason: '', dateCandidates: ex.dateCandidates || [], fileId: fid, fileName: name, savedDate: created,
    importedAt: now, updatedBy: 'システム', updatedAt: now
  };
  env.records.push(rec);
  var month = monthOfRecord_(rec);

  if (env.closed[month]) {
    // 締め済みの月に後から届いたもの：その月の既存明細は判定し直さず、新しい行だけを要確認として登録する。
    // 帳票は締めたときのまま。締め解除すると reopenMonth_ でふつうの判定に戻る。
    rec.unit = rec.brand && rec.area ? classifyUnit_(rec.brand, rec.area, env.master).unit : '';
    rec.checks = [closedMonthCheck_(month)];
    rec.status = STATUS.PEND;
    appendRows_(SHEET.RECORDS, [rec]);
    appendRows_(SHEET.PROCESSED, [{ fileId: fid, fileName: name, hash: hash, result: rec.status, recordId: rec.id, at: now }]);
    audit_('締め済み月の取込', rec.id, '', '', '', monthLabelLong_(month) + '：' + name);
    env.lateNotices.push('・' + rec.id + '（' + monthLabelLong_(month) + '、' + name + '）');
    file.moveTo(env.folders.review);
    return 'review';
  }

  ensureCtxMonths_(env.ctx, [month]);
  var changed = evaluateRecords_(env.records, env.ctx, [month]);
  appendRows_(SHEET.RECORDS, [rec]);
  changed.forEach(function (r) { if (r !== rec) env.dirty[r.id] = r; });
  env.months[month] = true;
  appendRows_(SHEET.PROCESSED, [{ fileId: fid, fileName: name, hash: hash, result: rec.status, recordId: rec.id, at: now }]);

  if (rec.status === STATUS.PEND) {
    file.moveTo(env.folders.review);
    return 'review';
  }
  if (!env.doneFolders[month]) env.doneFolders[month] = getOrCreateSubFolder_(env.folders.done, month);
  file.moveTo(env.doneFolders[month]);
  return 'record';
}

/** 締め済みの月に後から届いた明細に付けるチェック（要確認レベル） */
function closedMonthCheck_(month) {
  return {
    code: 'closedMonth', level: LEVEL.PEND, title: '締め済みの月の明細です',
    msg: monthLabel_(month) + 'は締め済みです。管理者が締めを解除して確認してください。'
  };
}

/* ---------------- 検証用（フェーズ1。管理者のみ） ---------------- */

/** 本文の先頭だけを注意書きつきで返す */
function textHead_(text) {
  return '※所有者名・住所を含む可能性があるため先頭200文字のみ表示（全文は debugExtract(id, true)）\n' +
    String(text || '').slice(0, 200);
}

/**
 * 1件のPDFを変換して抽出結果を返す（明細には登録しない・ファイルも動かさない）。
 * ログには抽出結果と本文の先頭200文字だけを出す。showFullText=true のときだけ全文をログに出す
 * （所有者名・住所が含まれるので、そのときの実行ログは共有しないこと）。
 * エディタから実行するときは debugExtract('ファイルID') を呼ぶ関数を一時的に作って実行する。
 */
function debugExtract(fileId, showFullText) {
  requireRole_(ROLE.ADMIN);
  var file = DriveApp.getFileById(fileId);
  var created = fmtDate_(file.getDateCreated(), 'yyyy-MM-dd');
  var text = pdfToText_(file.getBlob(), file.getName(), '');
  var ex = extractAll_(text, Object.keys(getAreaMaster_()), {
    today: todayStr_(), created: created, toleranceDays: Number(getSetting_('check.dateToleranceDays')) || 7
  });
  console.log('===== ' + file.getName() + '（作成日 ' + created + '）=====\n' + (showFullText === true ? text : textHead_(text)));
  console.log('----- 抽出結果 -----\n' + JSON.stringify(ex, null, 2));
  return ex;
}

/**
 * 4つの読み取りフォルダのPDF（最大 limit 件、既定20件）を変換して抽出結果だけを一覧でログに出し、配列で返す。
 * 本文は出さない。明細への登録・ファイルの移動はしない。
 */
function debugExtractAll(limit) {
  requireRole_(ROLE.ADMIN);
  var max = Number(limit) || 20;
  var s = getSettings_();
  var names = Object.keys(getAreaMaster_());
  var out = [];
  INPUT_FOLDERS.forEach(function (def) {
    if (!s[def[0]] || out.length >= max) return;
    var it = DriveApp.getFolderById(s[def[0]]).getFilesByType(MimeType.PDF);
    while (it.hasNext() && out.length < max) {
      var file = it.next();
      var created = fmtDate_(file.getDateCreated(), 'yyyy-MM-dd');
      var row = { folder: def[1], fileName: file.getName() };
      try {
        var ex = extractAll_(pdfToText_(file.getBlob(), file.getName(), ''), names,
          { today: todayStr_(), created: created, toleranceDays: Number(s['check.dateToleranceDays']) || 7 });
        row.plate = ex.plate ? platePrint_(ex.plate) : '';
        row.plateCandidates = ex.plateCandidates.length;
        row.regDate = ex.regDate || '';
        row.dateCandidates = ex.dateCandidates;
        row.vin = ex.vin || '';
        row.via = ex.plateVia + '/' + ex.dateVia;
        console.log([row.folder, row.fileName, row.plate || '（登録番号なし：候補' + row.plateCandidates + '件）',
          row.regDate || '（登録日なし：候補 ' + row.dateCandidates.join('/') + '）', row.vin || '（車台番号なし）', row.via].join(' | '));
      } catch (e) {
        row.error = e.message;
        console.log(row.folder + ' | ' + row.fileName + ' | 変換エラー: ' + e.message);
      }
      out.push(row);
    }
  });
  return out;
}
