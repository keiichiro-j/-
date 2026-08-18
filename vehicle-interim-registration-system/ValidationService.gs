/**
 * ValidationService.gs
 * サーバー側の入力検証。クライアント側(JavaScript.html)にも同じルールをミラーしてあるが、
 * google.script.run はクライアント検証を迂回できるため、ここでも必ず検証する。
 */

/**
 * フォーム全体を検証し、エラーメッセージの配列を返す(空配列なら検証OK)。
 * @param {Object} formData
 * @return {Array<string>}
 */
function validateFormData_(formData) {
  var errors = [];

  if (DOC_TYPE_OPTIONS.indexOf(formData.docType) === -1) {
    errors.push('書類種別が不正です。');
    return errors;
  }

  if (!String(formData.company || '').trim()) errors.push('依頼会社名を入力してください。');
  if (!String(formData.manager || '').trim()) errors.push('担当者名を入力してください。');
  if (!isValidDateStr_(formData.sendDate)) errors.push('送付日を入力してください。');
  if (SEND_BATCH_OPTIONS.indexOf(formData.sendBatch) === -1) errors.push('送付便を選択してください。');
  if (!isValidDateStr_(formData.regDate)) errors.push('登録日を入力してください。');

  var items = getActiveItems_(formData.docType, formData.items);
  if (items.length === 0) {
    errors.push('明細を1件以上入力してください。');
    return errors;
  }

  items.forEach(function (item, i) {
    errors = errors.concat(validateItem_(formData.docType, item, i + 1));
  });

  return errors;
}

/**
 * 明細のうち、実質的に入力されている行だけを返す(空行は無視する)。
 * どのフィールドを見て「入力あり」と判定するかはファミリーごとに異なる。
 */
function getActiveItems_(docType, items) {
  var key = docType === DOC_TYPE_PLATE_CHANGE ? 'oldRegNumber' : 'regNumber';
  return (items || []).filter(function (item) {
    return item && String(item[key] || '').trim() !== '';
  });
}

function validateItem_(docType, item, rowNo) {
  var errors = [];
  var prefix = rowNo + '行目: ';

  if (docType === DOC_TYPE_CERTIFICATE) {
    if (!String(item.regNumber || '').trim()) errors.push(prefix + '登録番号を入力してください。');
    if (CERTIFICATE_CLASS_OPTIONS.indexOf(item.regClass) === -1) errors.push(prefix + '登録区分を選択してください。');
    return errors;
  }

  if (docType === DOC_TYPE_TRANSFER || docType === DOC_TYPE_CANCELLATION) {
    if (!String(item.regNumber || '').trim()) errors.push(prefix + '登録番号を入力してください。');
    if (!/^\d{4}$/.test(item.chassis || '')) errors.push(prefix + '車台番号(下4桁)は数字4桁で入力してください。');

    if (docType === DOC_TYPE_TRANSFER) {
      if (TRANSFER_CLASS_OPTIONS.indexOf(item.transferClass) === -1) errors.push(prefix + '登録区分を選択してください。');
      if (item.correction && TRANSFER_CORRECTION_OPTIONS.indexOf(item.correction) === -1) {
        errors.push(prefix + '記載変更・更正の指定が不正です。');
      }
      errors = errors.concat(validateNonNegativeIntFields_(item, ['stamp', 'plateFee', 'agencyFee', 'envTax', 'keiFee'], prefix));
    } else {
      if (CANCELLATION_CLASS_OPTIONS.indexOf(item.cancelClass) === -1) errors.push(prefix + '登録区分を選択してください。');
      errors = errors.concat(validateNonNegativeIntFields_(item, ['stamp', 'agencyFee', 'keiFee'], prefix));
    }
    return errors;
  }

  if (docType === DOC_TYPE_PLATE_CHANGE) {
    if (!String(item.oldRegNumber || '').trim()) errors.push(prefix + '旧登録番号を入力してください。');
    if (!/^\d{4}$/.test(item.chassis || '')) errors.push(prefix + '下4桁は数字4桁で入力してください。');
    if (!String(item.newRegNumber || '').trim()) errors.push(prefix + '新登録番号を入力してください。');
    return errors;
  }

  return errors;
}

var FEE_LABELS_ = { stamp: '印紙', plateFee: 'ナンバー代', agencyFee: '代書料', envTax: '環境性能割', keiFee: '軽手数料' };

function validateNonNegativeIntFields_(item, keys, prefix) {
  var errors = [];
  keys.forEach(function (key) {
    var raw = item[key];
    if (raw === '' || raw === undefined || raw === null) return;
    var n = Number(raw);
    if (isNaN(n) || n < 0 || Math.floor(n) !== n) {
      errors.push(prefix + (FEE_LABELS_[key] || key) + 'は0以上の整数で入力してください。');
    }
  });
  return errors;
}

function isValidDateStr_(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(parseDateOnly_(s).getTime());
}

function parseDateOnly_(s) {
  var parts = s.split('-');
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

function toNonNegativeInt_(v) {
  var n = Number(v);
  return (v === '' || v === undefined || v === null || isNaN(n)) ? '' : n;
}
