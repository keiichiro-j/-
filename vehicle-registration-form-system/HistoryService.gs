/**
 * HistoryService.gs
 * 履歴タブ（月次管理・SPEC.md 4.3）の読み書きと、入力補助用サジェストの収集。
 */

/**
 * 車両1台分の登録日から、記録先タブ名（"YYYY-MM" または「登録日未定」）を決める。
 * @param {string} type TYPE_OSS または TYPE_PAPER
 * @param {Object} car 車両データ（indivRegDate を参照）
 * @param {string} regDateCommon 紙登録の共通登録日（"YYYY-MM-DD"）
 * @return {string}
 */
function resolveHistoryTabName_(type, car, regDateCommon) {
  var dateStr = (type === TYPE_OSS) ? car.indivRegDate : regDateCommon;
  if (!isValidDateStr_(dateStr)) return HISTORY_PENDING_TAB_NAME;
  return formatYearMonth_(parseDateOnly_(dateStr));
}

function formatYearMonth_(date) {
  return Utilities.formatDate(date, TIMEZONE, 'yyyy-MM');
}

/**
 * 指定タブを取得。存在しなければヘッダー行付きで新規作成する。
 * 既存タブでも、ヘッダーが現在の HISTORY_HEADER_ROW と一致しなければ
 * (列追加などスキーマ変更前に作られたタブの場合)ヘッダー行だけ上書きして揃える。
 * 既存のデータ行そのものは書き換えない(古いスキーマの行は列がずれたまま残る)。
 */
function getOrCreateHistoryTab_(ss, tabName) {
  var sheet = ss.getSheetByName(tabName);
  if (!sheet) {
    sheet = ss.insertSheet(tabName);
    sheet.getRange(1, 1, 1, HISTORY_HEADER_ROW.length).setValues([HISTORY_HEADER_ROW]);
    sheet.setFrozenRows(1);
    return sheet;
  }

  var headerRange = sheet.getRange(1, 1, 1, HISTORY_HEADER_ROW.length);
  var currentHeader = headerRange.getValues()[0];
  var isUpToDate = HISTORY_HEADER_ROW.every(function (label, i) { return currentHeader[i] === label; });
  if (!isUpToDate) {
    headerRange.setValues([HISTORY_HEADER_ROW]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * 車両1台分を、登録日が属する年月のタブへ1行追記する。
 * @param {string} pdfUrl この申請で発行されたPDFのURL(送付書PDF一覧・再確認用)
 */
function appendHistoryRow_(ss, type, car, formData, submissionId, vehicleNo, timestamp, pdfUrl) {
  var regDateStr = (type === TYPE_OSS) ? car.indivRegDate : formData.regDateCommon;
  var tabName = resolveHistoryTabName_(type, car, formData.regDateCommon);
  var sheet = getOrCreateHistoryTab_(ss, tabName);

  sheet.appendRow([
    timestamp,
    submissionId,
    type,
    formData.company,
    formData.manager,
    isValidDateStr_(regDateStr) ? parseDateOnly_(regDateStr) : '',
    parseDateOnly_(formData.sendDate),
    formData.sendBatch || '',
    vehicleNo,
    car.userName,
    car.brand || '',
    car.chassis,
    car.model,
    car.classNum,
    toNonNegativeInt_(car.autoTax),
    toNonNegativeInt_(car.envTax),
    toNonNegativeInt_(car.weightTax),
    car.hopeNum,
    car.yobi,
    car.honken,
    car.shinsho,
    car.person,
    formData.hidaRegistration ? '対象' : '',
    pdfUrl || '',
    SUBMISSION_STATUS_ACTIVE,
    ''
  ]);

  return tabName;
}

function toNonNegativeInt_(v) {
  var n = Number(v);
  return (v === '' || v === undefined || v === null || isNaN(n)) ? 0 : n;
}

/**
 * "YYYY-MM" 形式の月次タブ名のうち、直近 monthsBack 件を新しい順に返す（「登録日未定」タブも含む）。
 * 実在するタブだけを対象にするため、存在しない未来月は含まれない。
 */
function getRecentHistoryTabNames_(ss, monthsBack) {
  var monthTabs = ss.getSheets()
    .map(function (s) { return s.getName(); })
    .filter(function (name) { return /^\d{4}-\d{2}$/.test(name); })
    .sort()
    .reverse()
    .slice(0, monthsBack);
  monthTabs.push(HISTORY_PENDING_TAB_NAME);
  return monthTabs;
}

/**
 * 存在する全ての月次履歴タブ名(YYYY-MM)を新しい順に返す（「登録日未定」タブはデータがあれば末尾に追加）。
 * getHistoryEntriesByDateRange_ が対象タブを絞り込む際に使う。サジェスト収集用の
 * getRecentHistoryTabNames_ とは「直近何ヶ月分だけに絞るか」が異なるため、別関数にしている。
 */
function getAllHistoryTabNames_(ss) {
  var monthTabs = ss.getSheets()
    .map(function (s) { return s.getName(); })
    .filter(function (name) { return /^\d{4}-\d{2}$/.test(name); })
    .sort()
    .reverse();

  var pendingSheet = ss.getSheetByName(HISTORY_PENDING_TAB_NAME);
  if (pendingSheet && pendingSheet.getLastRow() >= 2) {
    monthTabs.push(HISTORY_PENDING_TAB_NAME);
  }
  return monthTabs;
}

/**
 * 指定タブのデータ行を、ヘッダー(HISTORY_HEADER_ROW)の列順のまま配列の配列として返す。
 * 新しい登録が先頭に来るよう並び替える。日付/日時セルは表示用の文字列に整形する
 * （google.script.run はDateオブジェクトをそのまま安全に返せないため）。
 * @return {{header: Array<string>, rows: Array<Array<string>>}}
 */
function getHistoryEntries_(ss, tabName) {
  var sheet = ss.getSheetByName(tabName);
  if (!sheet || sheet.getLastRow() < 2) {
    return { header: HISTORY_HEADER_ROW, rows: [] };
  }

  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, HISTORY_HEADER_ROW.length).getValues();
  var rows = values
    .filter(function (row) { return row[1]; }) // submissionIdが無い行(空行)は除外
    .map(function (row) {
      return row.map(function (cell, i) { return formatHistoryCell_(HISTORY_HEADER_ROW[i], cell); });
    })
    .reverse();

  return { header: HISTORY_HEADER_ROW, rows: rows };
}

/**
 * 履歴確認画面での表示用に、日時/日付セルを整形する。
 * 「送信日時」列だけ時刻まで、それ以外の日付列は日付のみを表示する。
 */
function formatHistoryCell_(label, value) {
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return (label === '送信日時')
      ? Utilities.formatDate(value, TIMEZONE, 'yyyy-MM-dd HH:mm')
      : Utilities.formatDate(value, TIMEZONE, 'yyyy-MM-dd');
  }
  return value;
}

/**
 * 「登録日」が fromDate〜toDate（いずれも "YYYY-MM-DD"。空/不正なら片側無制限）の範囲に
 * 入る履歴行を、該当する月次タブすべてを横断して集める（履歴確認画面の期間検索用）。
 * includePendingがtrueなら、登録日が未確定な「登録日未定」タブの行も範囲を問わず含める。
 * 全件を対象の月タブ分だけ読み込むため、範囲が絞られているほど読み込むシート数も少なくなる。
 * @return {{header: Array<string>, rows: Array<Array<string>>}}
 */
function getHistoryEntriesByDateRange_(ss, fromDate, toDate, includePending) {
  var header = HISTORY_HEADER_ROW;
  var regDateColIndex = header.indexOf('登録日');

  var fromD = isValidDateStr_(fromDate) ? parseDateOnly_(fromDate) : null;
  var toD = isValidDateStr_(toDate) ? parseDateOnly_(toDate) : null;
  var fromMonth = fromD ? formatYearMonth_(fromD) : null;
  var toMonth = toD ? formatYearMonth_(toD) : null;

  var monthTabNames = getAllHistoryTabNames_(ss).filter(function (name) {
    if (!/^\d{4}-\d{2}$/.test(name)) return false;
    if (fromMonth && name < fromMonth) return false;
    if (toMonth && name > toMonth) return false;
    return true;
  });

  var rows = [];
  monthTabNames.forEach(function (name) {
    getHistoryEntries_(ss, name).rows.forEach(function (row) {
      var regDateStr = row[regDateColIndex];
      if (!isValidDateStr_(regDateStr)) return;
      var d = parseDateOnly_(regDateStr);
      if (fromD && d < fromD) return;
      if (toD && d > toD) return;
      rows.push(row);
    });
  });

  if (includePending) {
    rows = rows.concat(getHistoryEntries_(ss, HISTORY_PENDING_TAB_NAME).rows);
  }

  // 複数タブをまたいで集めた行を、送信日時(降順)で並べ直す
  rows.sort(function (a, b) {
    if (a[0] === b[0]) return 0;
    return a[0] < b[0] ? 1 : -1;
  });

  return { header: header, rows: rows };
}

/**
 * 指定した submissionId を持つ全ての履歴行(複数車両・複数タブにまたがる場合を含む)を
 * 「取消」状態にする。既存のデータ行そのものは消さず、状態列・取消日時列だけを更新する
 * (OSSは車両ごとに登録日が異なり得るため、1申請の行が複数タブに分かれることがある)。
 * @return {number} 更新した行数(0なら該当するsubmissionIdが見つからなかった)
 */
function cancelSubmission_(ss, submissionId) {
  var submissionIdCol = HISTORY_HEADER_ROW.indexOf('submissionId') + 1;
  var statusCol = HISTORY_HEADER_ROW.indexOf('状態') + 1;
  var cancelledAtCol = HISTORY_HEADER_ROW.indexOf('取消日時') + 1;
  var now = new Date();
  var updatedCount = 0;

  getAllHistoryTabNames_(ss).forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet || sheet.getLastRow() < 2) return;

    var ids = sheet.getRange(2, submissionIdCol, sheet.getLastRow() - 1, 1).getValues();
    ids.forEach(function (row, i) {
      if (row[0] !== submissionId) return;
      var sheetRow = i + 2;
      sheet.getRange(sheetRow, statusCol).setValue(SUBMISSION_STATUS_CANCELLED);
      sheet.getRange(sheetRow, cancelledAtCol).setValue(now);
      updatedCount++;
    });
  });

  return updatedCount;
}

/**
 * 指定した送付日の範囲(・送付便)に該当する履歴行を全タブから集め、submissionIdごとに
 * 1件へ集約して返す(1申請=1PDFのため、車両ごとに分かれた行を申請単位にまとめる)。
 * 使用者名はsubmissionId内の全車両分を配列で持たせ、クライアント側の使用者名検索に使う。
 * 送付日は登録日と異なりタブの月で絞り込めないため、存在する全タブを走査する。
 * @param {string} fromDate "YYYY-MM-DD"（空/不正なら下限なし）
 * @param {string} toDate "YYYY-MM-DD"（空/不正なら上限なし）
 * @param {string} sendBatch 例:"第１便"。空文字ならすべての便を対象にする
 * @return {Array<Object>} 送信日時の新しい順
 */
function getPdfsBySendDateRange_(ss, fromDate, toDate, sendBatch) {
  var fromD = isValidDateStr_(fromDate) ? parseDateOnly_(fromDate) : null;
  var toD = isValidDateStr_(toDate) ? parseDateOnly_(toDate) : null;

  var header = HISTORY_HEADER_ROW;
  var idx = {
    sentAt: header.indexOf('送信日時'),
    submissionId: header.indexOf('submissionId'),
    type: header.indexOf('種別'),
    company: header.indexOf('依頼会社名'),
    manager: header.indexOf('担当責任者'),
    sendDate: header.indexOf('送付日'),
    sendBatch: header.indexOf('送付便'),
    userName: header.indexOf('使用者名'),
    pdfUrl: header.indexOf('送付書PDF'),
    status: header.indexOf('状態')
  };

  var bySubmission = {};
  getAllHistoryTabNames_(ss).forEach(function (name) {
    getHistoryEntries_(ss, name).rows.forEach(function (row) {
      var sendDateStr = row[idx.sendDate];
      if (!isValidDateStr_(sendDateStr)) return;
      var d = parseDateOnly_(sendDateStr);
      if (fromD && d < fromD) return;
      if (toD && d > toD) return;
      if (sendBatch && row[idx.sendBatch] !== sendBatch) return;

      var id = row[idx.submissionId];
      if (!bySubmission[id]) {
        bySubmission[id] = {
          submissionId: id,
          sentAt: row[idx.sentAt],
          type: row[idx.type],
          company: row[idx.company],
          manager: row[idx.manager],
          sendBatch: row[idx.sendBatch],
          vehicleCount: 0,
          userNames: [],
          pdfUrl: row[idx.pdfUrl] || '',
          status: row[idx.status] || SUBMISSION_STATUS_ACTIVE
        };
      }
      bySubmission[id].vehicleCount++;
      if (row[idx.userName]) bySubmission[id].userNames.push(row[idx.userName]);
    });
  });

  return Object.keys(bySubmission)
    .map(function (id) { return bySubmission[id]; })
    .sort(function (a, b) {
      if (a.sentAt === b.sentAt) return 0;
      return a.sentAt < b.sentAt ? 1 : -1;
    });
}

/**
 * 直近 SUGGESTION_MONTHS_BACK ヶ月分の履歴タブを横断して、
 * 依頼会社名・担当責任者・使用者名・担当者のサジェスト候補を収集する。
 */
function collectSuggestions_(ss) {
  var tabNames = getRecentHistoryTabNames_(ss, SUGGESTION_MONTHS_BACK);
  var companies = {};
  var managers = {};
  var userNames = {};
  var persons = {};

  tabNames.forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet || sheet.getLastRow() < 2) return;
    var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, HISTORY_HEADER_ROW.length).getValues();
    values.forEach(function (row) {
      if (row[3]) companies[row[3]] = true;
      if (row[4]) managers[row[4]] = true;
      if (row[9]) userNames[row[9]] = true;
      if (row[21]) persons[row[21]] = true;
    });
  });

  return {
    companies: Object.keys(companies),
    managers: Object.keys(managers),
    userNames: Object.keys(userNames),
    persons: Object.keys(persons)
  };
}

/**
 * 画面上部の常時アクティビティ表示用。本日を送付日とする申請件数と、
 * 直近1件の依頼会社名・送信時刻を返す(取消済みも件数に含める。あくまで
 * 「動いている感」の演出用の軽量スナップショットであり、集計・分析用途ではない)。
 * @return {{todayCount: number, latestCompany: string, latestSentAt: string}}
 */
function getActivitySnapshot_(ss) {
  var today = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');
  var submissions = getPdfsBySendDateRange_(ss, today, today, '');
  var latest = submissions[0];
  return {
    todayCount: submissions.length,
    latestCompany: latest ? latest.company : '',
    latestSentAt: latest ? String(latest.sentAt) : ''
  };
}
