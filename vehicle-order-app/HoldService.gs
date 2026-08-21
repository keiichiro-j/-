/**
 * HoldService.gs
 * Hold（商談確保）機能
 *
 * Hold期間は72時間。Hold中に別の申込みがあれば「2nd Hold」として保持し、
 * 3人目以降のHoldは不可とする。72時間経過時に2nd Holdが存在すれば、
 * 商談者を自動的に2nd Hold申込者へ切り替える（processExpiredHolds）。
 *
 * Hold登録・受注確定では共通の入力項目（登録月／担当者／顧客／下取車の有無／
 * OSS登録の可否／保険加入の有無）を受け付ける（HOLD_ORDER_INPUT_COLUMNS）。
 *
 * 複数人による同時Hold操作に備え、LockService による排他制御を行う。
 */

/**
 * HOLD_ORDER_INPUT_COLUMNS のキーを prefix 付きキーへ変換したオブジェクトを組み立てる。
 * 例: buildPrefixedInput_('hold', info) -> { holdRegisteredMonth, holdStaff, ... }
 */
function buildPrefixedInput_(prefix, info) {
  var patch = {};
  HOLD_ORDER_INPUT_COLUMNS.forEach(function (c) {
    var key = prefix + c.key.charAt(0).toUpperCase() + c.key.slice(1);
    patch[key] = info[c.key];
  });
  return patch;
}

/**
 * prefix 付きの Hold 入力項目をすべて null にクリアしたオブジェクトを組み立てる。
 */
function clearPrefixedInput_(prefix) {
  var patch = {};
  HOLD_ORDER_INPUT_COLUMNS.forEach(function (c) {
    var key = prefix + c.key.charAt(0).toUpperCase() + c.key.slice(1);
    patch[key] = null;
  });
  return patch;
}

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
function canRegisterSecondHold_(vehicle) {
  if (!vehicle) return { ok: false, reason: '該当車両が見つかりません' };
  if (vehicle.holdStatus !== HOLD_STATUS.HOLD) return { ok: false, reason: 'Hold中の車両ではありません' };
  if (vehicle.secondHoldCustomer) return { ok: false, reason: '2nd Holdまで登録済みのため、これ以上のHoldはできません' };
  return { ok: true, reason: '' };
}

/**
 * 72時間経過時の処理内容を決定する（純粋関数）。
 * @param {Object} vehicle
 * @param {number} now エポックミリ秒
 * @return {'none'|'promote'|'release'}
 */
function decideExpiryAction_(vehicle, now) {
  if (vehicle.holdStatus !== HOLD_STATUS.HOLD) return 'none';
  if (!vehicle.holdExpiresAt || now < vehicle.holdExpiresAt) return 'none';
  return vehicle.secondHoldCustomer ? 'promote' : 'release';
}

/**
 * 2nd Hold の項目を 1st Hold の項目へ昇格させたオブジェクトを組み立てる（純粋関数）。
 * 昇格した申込者には新規に72時間のHold期間を与える。
 */
function buildPromotedHoldPatch_(vehicle, now) {
  var secondHoldInfo = {};
  HOLD_ORDER_INPUT_COLUMNS.forEach(function (c) {
    var secondKey = 'secondHold' + c.key.charAt(0).toUpperCase() + c.key.slice(1);
    secondHoldInfo[c.key] = vehicle[secondKey];
  });
  var patch = buildPrefixedInput_('hold', secondHoldInfo);
  patch.holdCreatedAt = now;
  patch.holdExpiresAt = now + HOLD_DURATION_MS;
  Object.assign(patch, clearPrefixedInput_('secondHold'));
  patch.secondHoldCreatedAt = null;
  patch.secondHoldExpiresAt = null;
  return patch;
}

/**
 * Hold解除（在庫へ戻す）オブジェクトを組み立てる（純粋関数）。
 */
function buildReleasedHoldPatch_() {
  var patch = clearPrefixedInput_('hold');
  patch.holdStatus = HOLD_STATUS.AVAILABLE;
  patch.holdCreatedAt = null;
  patch.holdExpiresAt = null;
  return patch;
}

/**
 * 1st Hold を登録する。
 * @param {string} commission
 * @param {Object} info { registeredMonth, staff, customer, tradeIn, oss, insurance }
 */
function registerHold(commission, info) {
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
    var patch = buildPrefixedInput_('hold', info);
    patch.holdStatus = HOLD_STATUS.HOLD;
    patch.holdCreatedAt = now;
    patch.holdExpiresAt = now + HOLD_DURATION_MS;
    var updated = updateInventoryVehicle_(sheet, rowNumber, patch);
    notifyHoldRegistered(updated, false);
    return updated;
  } finally {
    lock.releaseLock();
  }
}

/**
 * 2nd Hold を登録する。
 * @param {string} commission
 * @param {Object} info { registeredMonth, staff, customer, tradeIn, oss, insurance }
 */
function registerSecondHold(commission, info) {
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
    var check = canRegisterSecondHold_(vehicle);
    if (!check.ok) throw new Error(check.reason);

    var now = new Date().getTime();
    var patch = buildPrefixedInput_('secondHold', info);
    patch.secondHoldCreatedAt = now;
    patch.secondHoldExpiresAt = now + HOLD_DURATION_MS;
    var updated = updateInventoryVehicle_(sheet, rowNumber, patch);
    notifyHoldRegistered(updated, true);
    return updated;
  } finally {
    lock.releaseLock();
  }
}

/**
 * 72時間経過したHoldを一括で処理する（時間主導トリガーから呼び出す）。
 * 2nd Holdがあれば昇格、なければ在庫へ解放する。
 */
function processExpiredHolds() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = getInventorySheet_();
    var vehicles = readAllRows_(sheet, INVENTORY_COLUMNS, 'commission');
    var now = new Date().getTime();
    var processed = [];
    vehicles.forEach(function (vehicle) {
      var action = decideExpiryAction_(vehicle, now);
      if (action === 'none') return;
      var patch = action === 'promote' ? buildPromotedHoldPatch_(vehicle, now) : buildReleasedHoldPatch_();
      var updated = updateInventoryVehicle_(sheet, vehicle.rowNumber, patch);
      processed.push({ commission: vehicle.commission, action: action });
      if (action === 'promote') notifyHoldRegistered(updated, false);
    });
    return processed;
  } finally {
    lock.releaseLock();
  }
}
