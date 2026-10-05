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

  if (formData.type !== TYPE_OSS && formData.type !== TYPE_PAPER && formData.type !== TYPE_GYOSEI) {
    errors.push('出力フォーマットの指定が不正です');
  }
  if (!isNonEmptyString_(formData.company)) {
    errors.push('依頼会社名を入力してください');
  }
  if (!isNonEmptyString_(formData.manager)) {
    errors.push('担当責任者を入力してください');
  }
  if (!isValidDateStr_(formData.sendDate)) {
    errors.push(formData.type === TYPE_GYOSEI ? '依頼日を正しく入力してください' : '送付日を正しく入力してください');
  }
  // 行政書士登録には「送付便」の概念が無い(テンプレートに印字欄が無く、複数便に分けて
  // まとめ送付する運用も想定していない)ため、この種別だけ送付便の選択を必須にしない。
  if (formData.type !== TYPE_GYOSEI && SEND_BATCH_OPTIONS.indexOf(formData.sendBatch) === -1) {
    errors.push('送付便を選択してください');
  }
  if ((formData.type === TYPE_PAPER || formData.type === TYPE_GYOSEI) && !isValidDateStr_(formData.regDateCommon)) {
    errors.push('登録日（全体）を正しく入力してください');
  }

  if (formData.type === TYPE_GYOSEI) {
    if (GYOSEI_CLASS_OPTIONS.indexOf(formData.gyoseiClass) === -1) {
      errors.push('依頼事項を選択してください');
    }
    if (!isNonEmptyString_(formData.gyoseiLocation)) {
      errors.push('依頼拠点を入力してください');
    }
    if (formData.sealDate && !isValidDateStr_(formData.sealDate)) {
      errors.push('封印取付日の形式が不正です');
    }
  }

  var vehicles = Array.isArray(formData.vehicles) ? formData.vehicles : [];
  var active = getActiveVehicles_(vehicles);

  if (active.length === 0) {
    errors.push(formData.type === TYPE_GYOSEI ? '顧客名を入力してください' : '車両データを1台以上入力してください');
  }
  if (formData.type === TYPE_GYOSEI && active.length > 1) {
    errors.push('行政書士登録は1件のみ入力してください（複数件登録する場合は申請を分けてください）');
  }
  if (formData.type !== TYPE_GYOSEI && active.length > MAX_VEHICLES) {
    errors.push('車両データは' + MAX_VEHICLES + '台以内で入力してください');
  }

  active.forEach(function (car, i) {
    errors.push.apply(errors, validateVehicle_(car, i + 1, formData.type));
  });

  return errors;
}

function validateVehicle_(car, no, type) {
  var errors = [];

  // 行政書士登録は車両テーブルを持たず、顧客名(使用者名)とブランドだけを扱う
  // (車台番号・税額・各種チェック欄は対象外)。
  if (type === TYPE_GYOSEI) {
    if (car.brand && getBrandOptions_().indexOf(car.brand) === -1) {
      errors.push('ブランドの指定が不正です');
    }
    return errors;
  }

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

  // ブランド区分は任意項目。入力されている場合のみ選択肢内かを検証する。
  if (car.brand && getBrandOptions_().indexOf(car.brand) === -1) {
    errors.push(no + '台目: ブランドの指定が不正です');
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
