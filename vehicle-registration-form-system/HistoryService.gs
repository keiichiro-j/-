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
 */
function appendHistoryRow_(ss, type, car, formData, submissionId, vehicleNo, timestamp) {
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
    car.person
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
 * 直近 SUGGESTION_MONTHS_BACK ヶ月分の履歴タブを横断して、
 * 依頼会社名・担当責任者・使用車名・担当者のサジェスト候補を収集する。
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
      if (row[20]) persons[row[20]] = true;
    });
  });

  return {
    companies: Object.keys(companies),
    managers: Object.keys(managers),
    userNames: Object.keys(userNames),
    persons: Object.keys(persons)
  };
}
