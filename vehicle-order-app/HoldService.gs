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
 * 2nd Holdは、1st Holdと同じ担当者は登録できない（canRegisterSecondHold_）。
 * Holdの解除（顧客都合等での取り下げ）も、Holdを行った担当者のみ可能（canCancelHold_）。
 * 担当者は、クライアントからの入力ではなく、ログイン中のGoogleアカウントから
 * 担当者マスタ（メールアドレス）を突き合わせてサーバー側で確定させる
 * （requireCurrentStaff_、SettingsService.gs参照）。本人確認は必ずメールアドレス
 * （staffEmail）で行い、表示名（staff）は使わない。表示名は担当者マスタで後から
 * 変更され得るため、名前同士の比較だと表示名を変えただけで本人が自分のHoldを
 * 解除・受注確定できなくなる不具合の原因になる。
 * Hold登録・受注確定では共通の入力項目（リード番号／登録月／顧客／
 * 下取車の有無／OSS登録の可否／保険加入の有無）をすべて入力する必要がある
 * （担当者はログインアカウントから自動設定されるため入力不要）。
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
  if (vehicle.holdStatus === HOLD_STATUS.HOLD) return { ok: false, reason: 'この車両は既にHold中です' };
  // holdStatusが空欄（スプレッドシートへ直接貼り付けた行など）の場合も在庫あり扱いとする。
  return { ok: true, reason: '' };
}

/**
 * リード番号は「L-」固定接頭辞＋数字のみで扱う（スプレッドシート上も
 * 「L-11111111」のような表記で保存する）。クライアント側でも数字のみ入力できる
 * UIにしているが、サーバー側でも必ず正規化・検証する（本人以外の経路からの
 * 入力や、将来的なクライアント実装の抜けに備えるため）。
 * @param {string} value 「L-」付き、または数字のみのリード番号
 * @return {string} 正規化された「L-」付きリード番号
 */
function normalizeLeadNumber_(value) {
  var digits = String(value || '').replace(/^L-/i, '').replace(/[^0-9]/g, '');
  if (!digits) throw new Error('リード番号は数字で入力してください');
  return 'L-' + digits;
}

/**
 * 2nd Hold 登録が可能かどうかを判定する（純粋関数）。
 * 3人目以降のHoldは不可（Holdボタンを非表示／無効化）。
 * また、1st Holdと同じ担当者は2nd Holdを登録できない（同一担当者による二重確保の防止）。
 * 同一人物かどうかはメールアドレスで判定する（表示名の変更・表記ゆれに影響されないため）。
 */
function canRegisterSecondHold_(vehicle, hasSecondHold, firstHoldEmail, newEmail) {
  if (!vehicle) return { ok: false, reason: '該当車両が見つかりません' };
  if (vehicle.holdStatus !== HOLD_STATUS.HOLD) return { ok: false, reason: 'Hold中の車両ではありません' };
  if (hasSecondHold) return { ok: false, reason: '2nd Holdまで登録済みのため、これ以上のHoldはできません' };
  if (firstHoldEmail && newEmail && firstHoldEmail === newEmail) {
    return { ok: false, reason: '1st Holdと同じ担当者は2nd Holdを登録できません' };
  }
  return { ok: true, reason: '' };
}

/**
 * 受注確定が可能かどうかを判定する（純粋関数）。
 * Hold中の車両は、Holdを行った担当者（現在の1st Hold担当者）のみ受注確定できる。
 * Holdが入っていない車両は誰でも受注確定できる。
 * holdStatusがHoldなのにfirstHoldが取得できない場合（データ不整合）は、
 * 安全側に倒して受注確定を拒否する（誰でも通ってしまう抜け道を作らない）。
 * 同一人物かどうかはメールアドレスで判定する（表示名の変更・表記ゆれに影響されないため）。
 * @param {Object} vehicle
 * @param {Object|null} firstHold 現在の1st Hold行（Holdなしなら null）
 * @param {string} staffEmail 受注確定を行おうとしている担当者のメールアドレス
 */
function canConfirmOrder_(vehicle, firstHold, staffEmail) {
  if (!vehicle) return { ok: false, reason: '該当車両が見つかりません' };
  if (vehicle.holdStatus === HOLD_STATUS.HOLD) {
    if (!firstHold) {
      return { ok: false, reason: 'Hold情報が確認できないため受注確定できません。時間をおいて再度お試しください' };
    }
    if (firstHold.staffEmail !== staffEmail) {
      return { ok: false, reason: 'Hold中の車両は、Holdを行った担当者（' + firstHold.staff + '）のみ受注確定できます' };
    }
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
 * staffEmail は HOLD_ORDER_INPUT_COLUMNS には含まれない（クライアント入力ではなく
 * サーバー側で確定させるため）ため、別途 info.staffEmail から詰める。
 */
function buildHoldRecord_(commission, rank, info, createdAt, expiresAt) {
  var record = { commission: commission, rank: rank, createdAt: createdAt, expiresAt: expiresAt };
  HOLD_ORDER_INPUT_COLUMNS.forEach(function (c) { record[c.key] = info[c.key]; });
  record.staffEmail = info.staffEmail;
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
  vehicle[prefix + 'StaffEmail'] = holdRow ? holdRow.staffEmail : null;
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
  var currentStaff = requireCurrentStaff_();
  info = Object.assign({}, info, { staff: currentStaff.name, staffEmail: currentStaff.email });
  var inputCheck = validateRequiredInfo_(HOLD_ORDER_INPUT_COLUMNS, info);
  if (!inputCheck.ok) throw new Error(inputCheck.reason);
  info.leadNumber = normalizeLeadNumber_(info.leadNumber);

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
    appendAuditLog_(buildAuditLogEntry_('Hold登録', commission, vehicle.model, currentStaff, 'リード番号 ' + info.leadNumber, now));
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
  var currentStaff = requireCurrentStaff_();
  info = Object.assign({}, info, { staff: currentStaff.name, staffEmail: currentStaff.email });
  var inputCheck = validateRequiredInfo_(HOLD_ORDER_INPUT_COLUMNS, info);
  if (!inputCheck.ok) throw new Error(inputCheck.reason);
  info.leadNumber = normalizeLeadNumber_(info.leadNumber);

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
    if (!holds.first) throw new Error('Hold情報が見つかりません（コミッション: ' + commission + '）');
    var check = canRegisterSecondHold_(vehicle, !!holds.second, holds.first.staffEmail, currentStaff.email);
    if (!check.ok) throw new Error(check.reason);

    // 1st Holdの72時間が終了した時点を起点に、2nd Hold自身の72時間を与える
    var createdAt = holds.first.expiresAt;
    var expiresAt = createdAt + HOLD_DURATION_MS;
    createHoldRow_(buildHoldRecord_(commission, HOLD_RANK.SECOND, info, createdAt, expiresAt));

    var updated = findInventoryVehicleWithHolds_(commission);
    notifyHoldRegistered(updated, true);
    appendAuditLog_(buildAuditLogEntry_('2nd Hold登録', commission, vehicle.model, currentStaff, 'リード番号 ' + info.leadNumber, new Date().getTime()));
    return updated;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Hold解除が可能かどうかを判定する（純粋関数）。
 * ログイン中のGoogleアカウントのメールアドレス（requireCurrentStaff_）と、
 * そのHoldの登録担当者のメールアドレスが一致するかで判定する
 * （表示名同士の比較ではない。担当者マスタの表示名を後から変更しても、
 * 本人がHoldを解除できなくなることはない）。
 */
function canCancelHold_(holdRow, staffEmail) {
  if (!holdRow) return { ok: false, reason: '該当のHoldが見つかりません' };
  if (holdRow.staffEmail !== staffEmail) {
    return { ok: false, reason: 'Holdを行った担当者（' + holdRow.staff + '）のみ解除できます' };
  }
  return { ok: true, reason: '' };
}

/**
 * Hold解除時、対象のrankに応じてどう処理すべきかを決定する（純粋関数）。
 * 1st Holdを解除した際に2nd Holdが存在すれば、2nd Holdを1stへ繰り上げる
 * （1st Holdの期間が今終了したものとして、2nd Hold自身の72時間を今から与え直す）。
 * 2nd Holdを解除した場合は、その行を削除するのみで1st Holdには影響しない。
 * @return {'release'|'promote'|'removeSecond'}
 */
function decideCancelAction_(rank, hasSecondHold) {
  if (rank === HOLD_RANK.SECOND) return 'removeSecond';
  return hasSecondHold ? 'promote' : 'release';
}

/**
 * Holdを手動で解除する（顧客都合等での取り下げ）。
 * @param {string} commission
 * @param {string} rank HOLD_RANK.FIRST または HOLD_RANK.SECOND
 */
function cancelHold(commission, rank) {
  var currentStaff = requireCurrentStaff_();
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var holds = getHoldsForCommission_(commission);
    var target = rank === HOLD_RANK.SECOND ? holds.second : holds.first;
    var check = canCancelHold_(target, currentStaff.email);
    if (!check.ok) throw new Error(check.reason);

    var holdsSheet = getHoldsSheet_();
    var action = decideCancelAction_(rank, !!holds.second);
    var vehicleBefore = findInventoryVehicle(commission);

    if (action === 'promote') {
      var secondRowNumber = findHoldRowNumber_(holdsSheet, commission, HOLD_RANK.SECOND);
      var firstRowNumber = findHoldRowNumber_(holdsSheet, commission, HOLD_RANK.FIRST);
      var now = new Date().getTime();
      updateHoldRow_(holdsSheet, secondRowNumber, { rank: HOLD_RANK.FIRST, createdAt: now, expiresAt: now + HOLD_DURATION_MS });
      deleteHoldRow_(holdsSheet, firstRowNumber);
    } else if (action === 'release') {
      var onlyRowNumber = findHoldRowNumber_(holdsSheet, commission, HOLD_RANK.FIRST);
      deleteHoldRow_(holdsSheet, onlyRowNumber);
      var invSheet = getInventorySheet_();
      var invRowNumber = findInventoryRowNumber_(invSheet, commission);
      updateInventoryVehicle_(invSheet, invRowNumber, { holdStatus: HOLD_STATUS.AVAILABLE });
    } else {
      var secondOnlyRowNumber = findHoldRowNumber_(holdsSheet, commission, HOLD_RANK.SECOND);
      deleteHoldRow_(holdsSheet, secondOnlyRowNumber);
    }

    var rankLabel = rank === HOLD_RANK.SECOND ? '2nd Hold' : '1st Hold';
    appendAuditLog_(buildAuditLogEntry_(
      'Hold解除', commission, vehicleBefore ? vehicleBefore.model : '', currentStaff,
      rankLabel + 'を解除（' + action + '）', new Date().getTime()
    ));
    return findInventoryVehicleWithHolds_(commission);
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
        appendAuditLog_(buildAuditLogEntry_('Hold自動昇格', vehicle.commission, vehicle.model, null, '2nd Holdが1st Holdへ繰り上がりました', now));
      } else {
        var onlyRowNumber = findHoldRowNumber_(holdsSheet, vehicle.commission, HOLD_RANK.FIRST);
        deleteHoldRow_(holdsSheet, onlyRowNumber);
        var invRowNumber = findInventoryRowNumber_(invSheet, vehicle.commission);
        updateInventoryVehicle_(invSheet, invRowNumber, { holdStatus: HOLD_STATUS.AVAILABLE });
        appendAuditLog_(buildAuditLogEntry_('Hold自動解放', vehicle.commission, vehicle.model, null, 'Hold期限切れのため在庫ありに戻りました', now));
      }
      processed.push({ commission: vehicle.commission, action: action });
    });

    return processed;
  } finally {
    lock.releaseLock();
  }
}

