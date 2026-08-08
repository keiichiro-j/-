/**
 * ValidationService.gs
 * フォーム入力のサーバー側検証（SPEC.md 4.2-1, 5章「入力検証」対応）。
 * スプレッドシート/Drive に依存しない純粋関数として実装し、Node.js からもテストできるようにする。
 */

/**
 * @param {Object} formData
 * @return {Array<string>} エラーメッセージの配列（空配列なら検証OK）
 */
function validateFormData_(formData) {
  var errors = [];

  if (!formData) {
    errors.push('入力データがありません');
    return errors;
  }

  if (formData.type !== TYPE_OSS && formData.type !== TYPE_PAPER) {
    errors.push('出力フォーマットの指定が不正です');
  }
  if (!isNonEmptyString_(formData.company)) {
    errors.push('依頼会社名を入力してください');
  }
  if (!isNonEmptyString_(formData.manager)) {
    errors.push('担当責任者を入力してください');
  }
  if (!isValidDateStr_(formData.sendDate)) {
    errors.push('送付日を正しく入力してください');
  }
  if (SEND_BATCH_OPTIONS.indexOf(formData.sendBatch) === -1) {
    errors.push('送付便を選択してください');
  }
  if (formData.type === TYPE_PAPER && !isValidDateStr_(formData.regDateCommon)) {
    errors.push('登録日（全体）を正しく入力してください（紙登録では必須です）');
  }

  var vehicles = Array.isArray(formData.vehicles) ? formData.vehicles : [];
  var active = getActiveVehicles_(vehicles);

  if (active.length === 0) {
    errors.push('車両データを1台以上入力してください');
  }
  if (active.length > MAX_VEHICLES) {
    errors.push('車両データは' + MAX_VEHICLES + '台以内で入力してください');
  }

  active.forEach(function (car, i) {
    errors.push.apply(errors, validateVehicle_(car, i + 1, formData.type));
  });

  return errors;
}

function validateVehicle_(car, no, type) {
  var errors = [];

  if (!/^\d{4}$/.test(car.chassis || '')) {
    errors.push(no + '台目: 車台番号は数字4桁で入力してください');
  }

  ['autoTax', 'envTax', 'weightTax'].forEach(function (key) {
    var raw = car[key];
    if (raw === '' || raw === undefined || raw === null) return;
    var n = Number(raw);
    if (isNaN(n) || n < 0 || Math.floor(n) !== n) {
      errors.push(no + '台目: ' + TAX_LABELS[key] + 'は0以上の整数で入力してください');
    }
  });

  // OSSの登録日は「登録日未定」タブへの記録を許容するため必須にはしない（SPEC.md 4.3）。
  // 入力されている場合のみ形式を検証する。
  if (type === TYPE_OSS && car.indivRegDate && !isValidDateStr_(car.indivRegDate)) {
    errors.push(no + '台目: 登録日の形式が不正です');
  }

  return errors;
}

/**
 * userName が入力されている行だけを「有効な車両データ」として扱う（空行は無視）。
 */
function getActiveVehicles_(vehicles) {
  return (vehicles || []).filter(function (v) {
    return v && isNonEmptyString_(v.userName);
  });
}

function isNonEmptyString_(v) {
  return typeof v === 'string' && v.trim() !== '';
}

/**
 * <input type="date"> が送出する "YYYY-MM-DD" 形式かどうかだけを見る。
 * 実際の日付への変換は parseDateOnly_ で行う（タイムゾーンのずれを避けるため new Date() は使わない）。
 */
function isValidDateStr_(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  var d = parseDateOnly_(s);
  return !isNaN(d.getTime());
}

/**
 * "YYYY-MM-DD" をローカルタイムゾーンの日付として解釈する。
 * new Date("YYYY-MM-DD") は UTC 0時として解釈されるため、JST 環境では前日にずれることがある。
 */
function parseDateOnly_(isoDateStr) {
  var parts = isoDateStr.split('-');
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}
