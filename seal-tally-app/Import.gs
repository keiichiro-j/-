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
 * 読み取りフォルダの名前と未処理PDF件数（5分キャッシュ）。
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
    var it = f.getFilesByType(MimeType.PDF);
    while (it.hasNext()) { it.next(); n++; }
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
  var doc = Drive.Files.create(meta, blob, { ocrLanguage: 'ja' });
  try {
    return DocumentApp.openById(doc.id).getBody().getText();
  } finally {
    removeTempFile_(doc.id);
  }
}

/** 一時ファイルを削除する（失敗したらゴミ箱へ） */
function removeTempFile_(id) {
  try {
    Drive.Files.remove(id);
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

/** 時間主導トリガーの入口 */
function runImport() {
  actorOverride_ = 'システム';
  try {
    var r = importNow_();
    console.log('取込結果: ' + JSON.stringify(r));
  } catch (e) {
    console.error('取込に失敗しました: ' + (e && e.stack || e));
  }
}

/**
 * 取込の本体（4章の手順）。スクリプトロックが取れなければ何もしない。
 * @return {{imported:number, skipped:number, review:number, errors:number, remaining:number, busy?:boolean}}
 */
function importNow_() {
  var result = { imported: 0, skipped: 0, review: 0, errors: 0, remaining: 0 };
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
        env.errors.push({ fileName: def[1] + 'の読み取りフォルダ', reason: 'フォルダを開けません（' + e.message + '）' });
        return;
      }
      var it = folder.getFilesByType(MimeType.PDF);
      while (it.hasNext()) {
        var file = it.next();
        var fid = file.getId();
        if (processed[fid]) continue;
        if (fmtDate_(file.getDateCreated(), 'yyyy-MM-dd') < startYmd) continue;
        if (Date.now() - startedAt > IMPORT_TIME_LIMIT_MS) { result.remaining++; continue; }
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
    if (env.lateNotices.length) {
      try {
        sendNotice_(adminEmails_(), '【' + APP_TITLE + '】締め済みの月の記録事項が届きました',
          '次の明細は締め済みの月のものです。PDFは「要確認」フォルダへ移しています。\n' +
          '締め解除して内容を確認し、必要なら除外してから締め直してください。\n\n' + env.lateNotices.join('\n'));
      } catch (e) { console.error('通知の送信に失敗しました: ' + e); }
    }
    var months = Object.keys(env.months).filter(function (m) { return !env.closed[m]; });
    if (months.length) {
      try { regenerateReports_(months, { records: env.records }); } catch (e) {
        console.error('帳票の再生成に失敗しました: ' + (e && e.stack || e));
        audit_('帳票再生成エラー', months.join(','), '', '', String(e && e.message || e), '');
      }
    }
    if (result.imported) {
      try { checkLowStock_(env.records); } catch (e) { console.error('残数通知の判定に失敗しました: ' + e); }
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
  ensureCtxMonths_(env.ctx, [month]);
  var changed = evaluateRecords_(env.records, env.ctx, [month]);
  appendRows_(SHEET.RECORDS, [rec]);
  changed.forEach(function (r) { if (r !== rec) env.dirty[r.id] = r; });
  env.months[month] = true;
  appendRows_(SHEET.PROCESSED, [{ fileId: fid, fileName: name, hash: hash, result: rec.status, recordId: rec.id, at: now }]);

  if (env.closed[month]) {
    // 締め済みの月に後から届いたもの：記録は残し、管理者に知らせる（帳票は締めたときのまま）
    audit_('締め済み月の取込', rec.id, '', '', '', monthLabelLong_(month) + '：' + name);
    env.lateNotices.push('・' + rec.id + '（' + monthLabelLong_(month) + '、' + name + '）');
    file.moveTo(env.folders.review);
    return 'review';
  }
  if (rec.status === STATUS.PEND) {
    file.moveTo(env.folders.review);
    return 'review';
  }
  if (!env.doneFolders[month]) env.doneFolders[month] = getOrCreateSubFolder_(env.folders.done, month);
  file.moveTo(env.doneFolders[month]);
  return 'record';
}

/* ---------------- 検証用（フェーズ1） ---------------- */

/**
 * 1件のPDFを変換し、テキストと抽出結果をログに出す（明細には登録しない・ファイルも動かさない）。
 * 注意：ログには所有者名・住所を含む本文がそのまま出る。検証が終わったら実行ログを共有しないこと。
 * エディタから実行するときは debugExtract('ファイルID') を呼ぶ関数を一時的に作って実行する。
 */
function debugExtract(fileId) {
  var file = DriveApp.getFileById(fileId);
  var created = fmtDate_(file.getDateCreated(), 'yyyy-MM-dd');
  var text = pdfToText_(file.getBlob(), file.getName(), '');
  var ex = extractAll_(text, Object.keys(getAreaMaster_()), {
    today: todayStr_(), created: created, toleranceDays: Number(getSetting_('check.dateToleranceDays')) || 7
  });
  console.log('===== ' + file.getName() + '（作成日 ' + created + '）=====\n' + text);
  console.log('----- 抽出結果 -----\n' + JSON.stringify(ex, null, 2));
  return ex;
}

/**
 * 4つの読み取りフォルダのPDF（最大 limit 件、既定20件）を変換して抽出結果だけを一覧でログに出す。
 * 本文は出さない。明細への登録・ファイルの移動はしない。
 */
function debugExtractAll(limit) {
  var max = Number(limit) || 20;
  var s = getSettings_();
  var names = Object.keys(getAreaMaster_());
  var n = 0;
  INPUT_FOLDERS.forEach(function (def) {
    if (!s[def[0]] || n >= max) return;
    var it = DriveApp.getFolderById(s[def[0]]).getFilesByType(MimeType.PDF);
    while (it.hasNext() && n < max) {
      var file = it.next();
      n++;
      var created = fmtDate_(file.getDateCreated(), 'yyyy-MM-dd');
      try {
        var ex = extractAll_(pdfToText_(file.getBlob(), file.getName(), ''), names,
          { today: todayStr_(), created: created, toleranceDays: Number(s['check.dateToleranceDays']) || 7 });
        console.log([def[1], file.getName(), ex.plate ? platePrint_(ex.plate) : '（登録番号なし：候補' + ex.plateCandidates.length + '件）',
          ex.regDate || '（登録日なし：候補 ' + ex.dateCandidates.join('/') + '）', ex.vin || '（車台番号なし）',
          ex.plateVia + '/' + ex.dateVia].join(' | '));
      } catch (e) {
        console.log(def[1] + ' | ' + file.getName() + ' | 変換エラー: ' + e.message);
      }
    }
  });
}
