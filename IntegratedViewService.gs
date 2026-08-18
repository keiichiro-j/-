/**
 * IntegratedViewService.gs
 * 「3社統合ビュー」機能。
 * AU/C7/MB の実運用スプレッドシート（各3シート: 輸入車マスタ／国産車マスタ／販売済み）を
 * 横断参照・編集する。既存の「車両在庫管理アプリ」（1社1スプレッドシート・26列の
 * 独自スキーマ）とはデータモデルが異なる実データを扱うため、専用サービスとして分離する。
 *
 * 元になったスクリプト（ユーザー提供）に対して以下を追加している。
 *   - 必須項目・OCN／車台番号の重複チェック（3ファイル×3シート横断）
 *   - LockService による排他制御（同時編集・同時新規登録による競合を防止）
 *   - 編集直前のOCN再照合による行ズレ検知（他ユーザーの削除・並べ替え対策）
 *   - try/catchで握りつぶさず、エラー内容を呼び出し元（画面）へ返す
 */

var INTEGRATED_SPREADSHEETS = [
  { fileKey: 'AU', fileId: '1A4GUFQ5nqUN2ga_gPDXUE4s8Kq4ceVD4BmEDJ7ynAC4', name: 'AU' },
  { fileKey: 'C7', fileId: '1xAvn99O0ReXKXr05qB_QjonbqKDn_qm-Ka8lcQVif98', name: 'C7' },
  { fileKey: 'MB', fileId: '19pwIROSlaeO6i5Zq9l6Pyi0XJitwcgSsKHQQ-pPA5cA', name: 'MB' }
];

var INTEGRATED_SHEET_TYPES = { IMPORTED: '輸入車マスタ', DOMESTIC: '国産車マスタ', SOLD: '販売済み' };
var INTEGRATED_NEW_SHEET_TYPES = [INTEGRATED_SHEET_TYPES.IMPORTED, INTEGRATED_SHEET_TYPES.DOMESTIC];
var INTEGRATED_ALL_SHEET_TYPES = [INTEGRATED_SHEET_TYPES.IMPORTED, INTEGRATED_SHEET_TYPES.DOMESTIC, INTEGRATED_SHEET_TYPES.SOLD];
var INTEGRATED_RANGE_WIDTH = 24;

// 列定義（1-indexed）。OCN・メーカー・モデル・仕入区分・仕入先は3シート共通の位置だが、
// 車台番号・車検満了日・ステータスは「販売済み」シートのみ位置がずれる（元シート仕様）。
var INTEGRATED_COL_COMMON = { ocn: 2, make: 3, model: 4, type: 11, supplier: 13 };
var INTEGRATED_COL_BY_SHEET = {
  '輸入車マスタ': { vin: 5, expiry: 7, status: 20 },
  '国産車マスタ': { vin: 5, expiry: 7, status: 20 },
  '販売済み': { vin: 6, expiry: 8, status: 18 }
};

function integratedColMap_(sheetType) {
  var specific = INTEGRATED_COL_BY_SHEET[sheetType];
  if (!specific) throw new Error('未対応のシート種別です: ' + sheetType);
  return Object.assign({}, INTEGRATED_COL_COMMON, specific);
}

/**
 * 3ファイル × 3シートを横断集計する。1ファイルの取得に失敗しても他ファイルの集計は継続し、
 * 失敗内容は errors として返す（画面側でトースト表示する）。
 */
function listIntegratedVehicles() {
  var allData = [];
  var errors = [];
  INTEGRATED_SPREADSHEETS.forEach(function (file) {
    try {
      var ss = SpreadsheetApp.openById(file.fileId);
      INTEGRATED_ALL_SHEET_TYPES.forEach(function (sheetType) {
        allData = allData.concat(fetchIntegratedFromSheet_(ss.getSheetByName(sheetType), file, sheetType));
      });
    } catch (e) {
      errors.push({ fileKey: file.fileKey, message: e.toString() });
      Logger.log('エラー発生（ファイル: ' + file.fileKey + '）: ' + e.toString());
    }
  });
  return { vehicles: allData, errors: errors };
}

function fetchIntegratedFromSheet_(sheet, file, sheetType) {
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  var col = integratedColMap_(sheetType);
  var values = sheet.getRange(2, 1, lastRow - 1, INTEGRATED_RANGE_WIDTH).getValues();
  var list = [];

  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var ocn = row[col.ocn - 1];
    if (!ocn) continue; // OCNが空の行（末尾の空行等）はスキップ

    list.push({
      id: file.fileKey + '_' + sheetType + '_' + (i + 2),
      fileKey: file.fileKey,
      fileId: file.fileId,
      rowNumber: i + 2,
      sheet: sheetType,
      ocn: ocn,
      make: row[col.make - 1],
      model: row[col.model - 1],
      vin: row[col.vin - 1],
      expiry: formatIntegratedDate_(row[col.expiry - 1]),
      type: row[col.type - 1] || '未設定',
      supplier: row[col.supplier - 1] || '-',
      status: row[col.status - 1] || '未設定'
    });
  }
  return list;
}

function formatIntegratedDate_(value) {
  if (!value) return '';
  try {
    return Utilities.formatDate(new Date(value), 'JST', 'yyyy-MM-dd');
  } catch (e) {
    return value.toString();
  }
}

function integratedDateOrValue_(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'string') {
    var d = new Date(value);
    return isNaN(d.getTime()) ? value : d;
  }
  return value;
}

/**
 * 編集・新規登録データの必須項目チェック（純粋関数：テスト容易化のためGASサービスに依存しない）。
 */
function integratedRequiredFieldErrors_(data) {
  var errors = [];
  if (!data.make || !String(data.make).trim()) errors.push('メーカーは必須項目です');
  if (!data.model || !String(data.model).trim()) errors.push('モデルは必須項目です');
  if (!data.vin || !String(data.vin).trim()) errors.push('車台番号は必須項目です');
  return errors;
}

function findIntegratedVehiclesAnywhere_(predicate) {
  return listIntegratedVehicles().vehicles.filter(predicate);
}

/**
 * OCN自動採番。全ファイル・全シートを走査して既存OCNの最大値を求め、+1する。
 * OcnService.gs の parseOcnSequence（純粋関数）を再利用する。
 */
function generateNextIntegratedOcn_() {
  var maxSeq = 0;
  listIntegratedVehicles().vehicles.forEach(function (v) {
    var seq = parseOcnSequence(v.ocn);
    if (seq !== null && seq > maxSeq) maxSeq = seq;
  });
  return String(maxSeq + 1);
}

function validateIntegratedVehicle_(data) {
  var errors = integratedRequiredFieldErrors_(data);

  if (data.rowNumber && data.ocn) {
    var ocnConflicts = findIntegratedVehiclesAnywhere_(function (v) {
      return String(v.ocn) === String(data.ocn) &&
        !(v.fileKey === data.fileKey && v.sheet === data.sheet && v.rowNumber === data.rowNumber);
    });
    if (ocnConflicts.length > 0) errors.push('OCN「' + data.ocn + '」は既に登録されています');
  }

  if (data.vin) {
    var vinConflicts = findIntegratedVehiclesAnywhere_(function (v) {
      if (!v.vin || String(v.vin) !== String(data.vin)) return false;
      if (data.rowNumber) {
        return !(v.fileKey === data.fileKey && v.sheet === data.sheet && v.rowNumber === data.rowNumber);
      }
      return true;
    });
    if (vinConflicts.length > 0) {
      errors.push('車台番号「' + data.vin + '」は既に登録されています（' + vinConflicts[0].fileKey + '/' + vinConflicts[0].sheet + '）');
    }
  }

  if (errors.length > 0) {
    var err = new Error(errors.join('\n'));
    err.validationErrors = errors;
    throw err;
  }
}

/**
 * 編集・追加データを、該当するスプレッドシートの正しいシート・行へリアルタイム書き込みする。
 * LockService で全体を排他制御し、複数担当者の同時編集・同時新規登録による競合を防ぐ。
 */
function saveIntegratedVehicle(data) {
  var file = INTEGRATED_SPREADSHEETS.filter(function (f) { return f.fileKey === data.fileKey; })[0];
  if (!file) throw new Error('未登録の拠点キーです: ' + data.fileKey);
  if (INTEGRATED_ALL_SHEET_TYPES.indexOf(data.sheet) === -1) {
    throw new Error('未対応のシート種別です: ' + data.sheet);
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw new Error('他の担当者が編集中です。しばらくしてから再度お試しください。');
  }
  try {
    validateIntegratedVehicle_(data);

    var ss = SpreadsheetApp.openById(file.fileId);
    var sheet = ss.getSheetByName(data.sheet);
    if (!sheet) throw new Error('シートが見つかりません: ' + data.sheet);
    var col = integratedColMap_(data.sheet);

    if (data.rowNumber) {
      // 既存行の編集：保存直前にOCNを再照合し、他ユーザーによる削除・行ズレを検知する
      var currentOcn = sheet.getRange(data.rowNumber, col.ocn).getValue();
      if (!currentOcn || String(currentOcn) !== String(data.ocn)) {
        throw new Error('この車両は他の担当者によって変更・削除された可能性があります。画面を再読み込みしてください。');
      }
      sheet.getRange(data.rowNumber, col.make).setValue(data.make);
      sheet.getRange(data.rowNumber, col.model).setValue(data.model);
      sheet.getRange(data.rowNumber, col.type).setValue(data.type);
      sheet.getRange(data.rowNumber, col.supplier).setValue(data.supplier);
      sheet.getRange(data.rowNumber, col.vin).setValue(data.vin);
      sheet.getRange(data.rowNumber, col.expiry).setValue(integratedDateOrValue_(data.expiry));
      sheet.getRange(data.rowNumber, col.status).setValue(data.status);
      return { success: true, ocn: data.ocn };
    }

    if (INTEGRATED_NEW_SHEET_TYPES.indexOf(data.sheet) === -1) {
      throw new Error('新規登録は「輸入車マスタ」または「国産車マスタ」のみ可能です');
    }
    var newRow = new Array(INTEGRATED_RANGE_WIDTH).fill('');
    var ocn = generateNextIntegratedOcn_();
    newRow[col.ocn - 1] = ocn;
    newRow[col.make - 1] = data.make;
    newRow[col.model - 1] = data.model;
    newRow[col.type - 1] = data.type;
    newRow[col.supplier - 1] = data.supplier;
    newRow[col.vin - 1] = data.vin;
    newRow[col.expiry - 1] = integratedDateOrValue_(data.expiry);
    newRow[col.status - 1] = data.status;
    sheet.appendRow(newRow);
    return { success: true, ocn: ocn };
  } finally {
    lock.releaseLock();
  }
}
