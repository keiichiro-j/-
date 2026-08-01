/**
 * ValidationService.gs
 * 10.1 入力バリデーション（重複チェック等）
 */

/**
 * @param {Object} vehicle 検証対象の車両オブジェクト
 * @param {Object} opts { isNew: boolean, currentRowNumber, companyId, tabName }
 * @throws {Error} バリデーションエラー時（message はユーザー表示用の日本語メッセージ）
 */
function validateVehicle(vehicle, opts) {
  opts = opts || {};
  var errors = [];

  // 必須項目チェック
  COLUMNS.filter(function (c) { return c.required; }).forEach(function (col) {
    var v = vehicle[col.key];
    if (v === undefined || v === null || String(v).trim() === '') {
      errors.push(col.label + 'は必須項目です');
    }
  });

  // OCN 重複チェック（全社横断・全タブ）
  if (vehicle.ocn) {
    var ocnMatches = findVehicleAnywhere_(function (row) {
      return String(row.ocn) === String(vehicle.ocn);
    });
    var ocnConflict = ocnMatches.filter(function (row) {
      return !(opts.currentRowNumber && row.rowNumber === opts.currentRowNumber &&
        row.companyId === opts.companyId && row.tabName === opts.tabName);
    });
    if (ocnConflict.length > 0) {
      errors.push('OCN「' + vehicle.ocn + '」は既に登録されています');
    }
  }

  // 車台番号 重複チェック（全社横断・全タブ）
  if (vehicle.chassisNumber) {
    var chassisMatches = findVehicleAnywhere_(function (row) {
      return String(row.chassisNumber) === String(vehicle.chassisNumber);
    });
    var chassisConflict = chassisMatches.filter(function (row) {
      return String(row.ocn) !== String(vehicle.ocn);
    });
    if (chassisConflict.length > 0) {
      errors.push('車台番号「' + vehicle.chassisNumber + '」は既に登録されています');
    }
  }

  if (errors.length > 0) {
    var err = new Error(errors.join('\n'));
    err.validationErrors = errors;
    throw err;
  }
}
