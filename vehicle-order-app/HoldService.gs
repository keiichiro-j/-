/**
 * HoldService.gs
 * Hold（商談確保）機能
 *
 * Hold期間は72時間。Hold中に別の申込みがあれば「2nd Hold」として保持し、
 * 3人目以降のHoldは不可とする。2nd Holdの72時間は、1st Holdの72時間が
 * 終了した時点から起算する（登録時点からではない）。
 * 72時間経過時に2nd Holdが存在すれば、商談者を自動的に2nd Hold申込者へ
 * 切り替える（processExpiredHolds）。
 *
 * Hold中の車両の受注確定は、Holdを行った担当者のみ可能（canConfirmOrder_）。
 * Hold登録・受注確定では共通の入力項目（リード番号／登録月／担当者／顧客／
 * 下取車の有無／OSS登録の可否／保険加入の有無）をすべて入力する必要がある。
 *
 * 車両情報（在庫リスト）とHold詳細（Holdリスト）は別シートで管理し、
 * 一覧取得時に commission をキーに結合する（attachHoldInfo_）。
 *
 * 複数人による同時Hold操作に備え、LockService による排他制御を行う。
 */

/**
 * 現在の在庫データに対して Hold 登録が可能かどうかを判定する（純粋関数）。
 * @return {{ ok: boolean, reason: string }}
 */
function canRegisterHold_(vehicle) {
  if (!vehicle) return { ok: false, reason: '該当車両が見つかりません' };
  if (vehicle.holdStatus !== HOLD_STATUS.HOLD) return { ok: true, reason: '' };
  return { ok: false, reason: 'この車両は既にHold中です' };
}

/**
 * 2nd Hold 登録が可能かどうかを判定する（純粋関数）。
 * 3人目以降のHoldは不可（Holdボタンを非表示／無効化）。
 */
function canRegisterSecondHold_(vehicle, hasSecondHold) {
  if (!vehicle) return { ok: false, reason: '該当車両が見つかりません' };
  if (vehicle.holdStatus !== HOLD_STATUS.HOLD) return { ok: false, reason: 'Hold中の車両ではありません' };
  if (hasSecondHold) return { ok: false, reason: '2nd Holdまで登録済みのため、これ以上のHoldはできません' };
  return { ok: true, reason: '' };
}

/**
 * 受注確定が可能かどうかを判定する（純粋関数）。
 * Hold中の車両は、Holdを行った担当者（現在の1st Hold担当者）のみ受注確定できる。
 * Holdが入っていない車両は誰でも受注確定できる。
 * @param {Object} vehicle
 * @param {Object|null} firstHold 現在の1st Hold行（Holdなしなら null）
 * @param {string} staff 受注確定を行おうとしている担当者
 */
function canConfirmOrder_(vehicle, firstHold, staff) {
  if (!vehicle) return { ok: false, reason: '該当車両が見つかりません' };
  if (vehicle.holdStatus === HOLD_STATUS.HOLD && firstHold && firstHold.staff !== staff) {
    return { ok: false, reason: 'Hold中の車両は、Holdを行った担当者（' + firstHold.staff + '）のみ受注確定できます' };
  }
  return { ok: true, reason: '' };
}

/**
 * 指定した列定義のうち required な項目がすべて入力されているかを判定する（純粋関数）。
 */
function validateRequiredInfo_(columns, info) {
  info = info || {};
  var missing = columns.filter(function (c) {
    return c.required && !(info[c.key] != null && String(info[c.key]).trim());
  });
  if (missing.length) {
    return { ok: false, reason: '次の項目を入力してください: ' + missing.map(function (c) { return c.label; }).join('、') };
  }
  return { ok: true, reason: '' };
}

/**
 * 72時間経過時の処理内容を決定する（純粋関数）。
 * @param {{ holdStatus: string, expiresAt: number, hasSecondHold: boolean }} info
 * @param {number} now エポックミリ秒
 * @return {'none'|'promote'|'release'}
 */
function decideExpiryAction_(info, now) {
  if (!info || info.holdStatus !== HOLD_STATUS.HOLD) return 'none';
  if (!info.expiresAt || now < info.expiresAt) return 'none';
  return info.hasSecondHold ? 'promote' : 'release';
}

/**
 * Hold入力情報から Holdリストの1行分のレコードを組み立てる（純粋関数）。
 */
function buildHoldRecord_(commission, rank, info, createdAt, expiresAt) {
  var record = { commission: commission, rank: rank, createdAt: createdAt, expiresAt: expiresAt };
  HOLD_ORDER_INPUT_COLUMNS.forEach(function (c) { record[c.key] = info[c.key]; });
  return record;
}

/**
 * 在庫データにHold情報（1st/2nd）を合成する。
 */
function attachHoldInfo_(vehicles) {
  var allHolds = readAllRows_(getHoldsSheet_(), HOLD_COLUMNS, 'commission');
  var byCommission = {};
  allHolds.forEach(function (h) {
    byCommission[h.commission] = byCommission[h.commission] || {};
    byCommission[h.commission][h.rank] = h;
  });
  vehicles.forEach(function (v) {
    var holds = byCommission[v.commission] || {};
    applyHoldFieldsToVehicle_(v, holds[HOLD_RANK.FIRST], 'hold');
    applyHoldFieldsToVehicle_(v, holds[HOLD_RANK.SECOND], 'secondHold');
  });
  return vehicles;
}

function applyHoldFieldsToVehicle_(vehicle, holdRow, prefix) {
  HOLD_ORDER_INPUT_COLUMNS.forEach(function (c) {
    var key = prefix + c.key.charAt(0).toUpperCase() + c.key.slice(1);
    vehicle[key] = holdRow ? holdRow[c.key] : null;
  });
  vehicle[prefix + 'CreatedAt'] = holdRow ? holdRow.createdAt : null;
  vehicle[prefix + 'ExpiresAt'] = holdRow ? holdRow.expiresAt : null;
}

function findInventoryVehicleWithHolds_(commission) {
  var vehicle = findInventoryVehicle(commission);
  if (!vehicle) return null;
  return attachHoldInfo_([vehicle])[0];
}

/**
 * 1st Hold を登録する。
 * @param {string} commission
 * @param {Object} info { leadNumber, registeredMonth, staff, customer, tradeIn, oss, insurance }
 */
function registerHold(commission, info) {
  var inputCheck = validateRequiredInfo_(HOLD_ORDER_INPUT_COLUMNS, info);
  if (!inputCheck.ok) throw new Error(inputCheck.reason);

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = getInventorySheet_();
    var rowNumber = findInventoryRowNumber_(sheet, commission);
    if (!rowNumber) throw new Error('該当車両が見つかりません（コミッション: ' + commission + '）');
    var vehicle = rowToObject_(
      sheet.getRange(rowNumber, 1, 1, INVENTORY_COLUMNS.length).getValues()[0],
      INVENTORY_COLUMNS,
      rowNumber
    );
    var check = canRegisterHold_(vehicle);
    if (!check.ok) throw new Error(check.reason);

    var now = new Date().getTime();
    createHoldRow_(buildHoldRecord_(commission, HOLD_RANK.FIRST, info, now, now + HOLD_DURATION_MS));
    updateInventoryVehicle_(sheet, rowNumber, { holdStatus: HOLD_STATUS.HOLD });

    var updated = findInventoryVehicleWithHolds_(commission);
    notifyHoldRegistered(updated, false);
    return updated;
  } finally {
    lock.releaseLock();
  }
}

/**
 * 2nd Hold を登録する。72時間は1st Holdの期限が切れた時点から起算する。
 * @param {string} commission
 * @param {Object} info { leadNumber, registeredMonth, staff, customer, tradeIn, oss, insurance }
 */
function registerSecondHold(commission, info) {
  var inputCheck = validateRequiredInfo_(HOLD_ORDER_INPUT_COLUMNS, info);
  if (!inputCheck.ok) throw new Error(inputCheck.reason);

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = getInventorySheet_();
    var rowNumber = findInventoryRowNumber_(sheet, commission);
    if (!rowNumber) throw new Error('該当車両が見つかりません（コミッション: ' + commission + '）');
    var vehicle = rowToObject_(
      sheet.getRange(rowNumber, 1, 1, INVENTORY_COLUMNS.length).getValues()[0],
      INVENTORY_COLUMNS,
      rowNumber
    );
    var holds = getHoldsForCommission_(commission);
    var check = canRegisterSecondHold_(vehicle, !!holds.second);
    if (!check.ok) throw new Error(check.reason);
    if (!holds.first) throw new Error('Hold情報が見つかりません（コミッション: ' + commission + '）');

    // 1st Holdの72時間が終了した時点を起点に、2nd Hold自身の72時間を与える
    var createdAt = holds.first.expiresAt;
    var expiresAt = createdAt + HOLD_DURATION_MS;
    createHoldRow_(buildHoldRecord_(commission, HOLD_RANK.SECOND, info, createdAt, expiresAt));

    var updated = findInventoryVehicleWithHolds_(commission);
    notifyHoldRegistered(updated, true);
    return updated;
  } finally {
    lock.releaseLock();
  }
}

/**
 * 72時間経過したHoldを一括で処理する（時間主導トリガーから呼び出す）。
 * 2nd Holdがあれば昇格（rankを1stへ変更し、旧1st行を削除）、
 * なければHold行を削除して在庫を解放する。
 */
function processExpiredHolds() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var invSheet = getInventorySheet_();
    var holdsSheet = getHoldsSheet_();
    var vehicles = readAllRows_(invSheet, INVENTORY_COLUMNS, 'commission')
      .filter(function (v) { return v.holdStatus === HOLD_STATUS.HOLD; });
    var now = new Date().getTime();
    var processed = [];

    vehicles.forEach(function (vehicle) {
      var holds = getHoldsForCommission_(vehicle.commission);
      if (!holds.first) return;
      var action = decideExpiryAction_(
        { holdStatus: vehicle.holdStatus, expiresAt: holds.first.expiresAt, hasSecondHold: !!holds.second },
        now
      );
      if (action === 'none') return;

      if (action === 'promote') {
        var secondRowNumber = findHoldRowNumber_(holdsSheet, vehicle.commission, HOLD_RANK.SECOND);
        var firstRowNumber = findHoldRowNumber_(holdsSheet, vehicle.commission, HOLD_RANK.FIRST);
        updateHoldRow_(holdsSheet, secondRowNumber, { rank: HOLD_RANK.FIRST });
        deleteHoldRow_(holdsSheet, firstRowNumber);
        notifyHoldRegistered(findInventoryVehicleWithHolds_(vehicle.commission), false);
      } else {
        var onlyRowNumber = findHoldRowNumber_(holdsSheet, vehicle.commission, HOLD_RANK.FIRST);
        deleteHoldRow_(holdsSheet, onlyRowNumber);
        var invRowNumber = findInventoryRowNumber_(invSheet, vehicle.commission);
        updateInventoryVehicle_(invSheet, invRowNumber, { holdStatus: HOLD_STATUS.AVAILABLE });
      }
      processed.push({ commission: vehicle.commission, action: action });
    });

    return processed;
  } finally {
    lock.releaseLock();
  }
}
