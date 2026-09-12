/**
 * HoldService.gs
 * Hold（商談確保）機能
 *
 * Hold期間は72時間。1台の車両につきHold中は常に1件のみ保持し、既にHold中の
 * 車両への追加のHoldは行えない（canRegisterHold_）。
 *
 * Hold中の車両の受注確定は、Holdを行った担当者のみ可能（canConfirmOrder_）。
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
 * Hold種別を検証・正規化する（純粋関数ではなく、SYSTEM_ADMIN_EMAILSの判定に
 * isSystemAdmin_を使うため管理者判定に依存する）。業販HOLDは
 * 管理者権限を持つ担当者のみ登録できる（権限チェックはこの関数の中で行い、
 * Api.gsやクライアント側の表示制御に頼らない）。
 * @param {string} holdType 省略時は通常のHold（HOLD_TYPE.NORMAL）として扱う
 * @param {string} staffEmail Hold登録を行おうとしている担当者のメールアドレス
 */
function normalizeHoldType_(holdType, staffEmail) {
  var type = holdType || HOLD_TYPE.NORMAL;
  if (!HOLD_TYPE_LABELS.hasOwnProperty(type)) {
    throw new Error('不正なHold種別です: ' + type);
  }
  if (type !== HOLD_TYPE.NORMAL && !isSystemAdmin_(staffEmail)) {
    throw new Error('業販HOLDは管理者権限を持つ担当者のみ登録できます');
  }
  return type;
}

/**
 * 2つのメールアドレスが同一人物を指すかどうかを判定する（純粋関数）。
 * 前後の空白・大文字小文字の違いを無視する。requireCurrentStaff_は毎回
 * trim・小文字化した値を返すため通常は表記ゆれが生じないはずだが、Holdリストの
 * staffEmail列はスプレッドシート側で直接編集され得る（データ移行・手動修正等）
 * ため、読み出し側の比較でも表記ゆれを吸収できるようにしておく（読み出し専用の
 * rowToObject_はセルの値をそのまま返すだけで、trim・小文字化は行わない）。
 * クライアント側（JavaScript.html）の同名関数と同じロジック。
 */
function emailsMatch_(a, b) {
  return !!a && !!b && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

/**
 * 受注確定が可能かどうかを判定する（純粋関数）。
 * Hold中の車両は、Holdを行った担当者のみ受注確定できる。
 * Holdが入っていない車両は誰でも受注確定できる。
 * holdStatusがHoldなのにholdが取得できない場合（データ不整合）は、
 * 安全側に倒して受注確定を拒否する（誰でも通ってしまう抜け道を作らない）。
 * 同一人物かどうかはメールアドレスで判定する（表示名の変更・表記ゆれに影響されないため）。
 * @param {Object} vehicle
 * @param {Object|null} hold 現在のHold行（Holdなしなら null）
 * @param {string} staffEmail 受注確定を行おうとしている担当者のメールアドレス
 */
function canConfirmOrder_(vehicle, hold, staffEmail) {
  if (!vehicle) return { ok: false, reason: '該当車両が見つかりません' };
  if (vehicle.holdStatus === HOLD_STATUS.HOLD) {
    if (!hold) {
      return { ok: false, reason: 'Hold情報が確認できないため受注確定できません。時間をおいて再度お試しください' };
    }
    if (!emailsMatch_(hold.staffEmail, staffEmail)) {
      return { ok: false, reason: 'Hold中の車両は、Holdを行った担当者（' + hold.staff + '）のみ受注確定できます' };
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
 * @param {{ holdStatus: string, expiresAt: number }} info
 * @param {number} now エポックミリ秒
 * @return {'none'|'release'}
 */
function decideExpiryAction_(info, now) {
  if (!info || info.holdStatus !== HOLD_STATUS.HOLD) return 'none';
  if (!info.expiresAt || now < info.expiresAt) return 'none';
  return 'release';
}

/**
 * Hold入力情報から Holdリストの1行分のレコードを組み立てる（純粋関数）。
 * staffEmail は HOLD_ORDER_INPUT_COLUMNS には含まれない（クライアント入力ではなく
 * サーバー側で確定させるため）ため、別途 info.staffEmail から詰める。
 * holdTypeは省略時 HOLD_TYPE.NORMAL とする。salesStoreは業販HOLD専用の項目。
 * rankは常にHOLD_RANK.FIRSTを渡す（2nd Holdは廃止済み。過去データとの互換のため
 * 列自体は残しているが、アプリが新規に書き込む値は常にFIRST）。
 */
function buildHoldRecord_(commission, rank, info, createdAt, expiresAt, holdType) {
  var record = {
    commission: commission, rank: rank, createdAt: createdAt, expiresAt: expiresAt,
    holdType: holdType || HOLD_TYPE.NORMAL
  };
  HOLD_ORDER_INPUT_COLUMNS.forEach(function (c) { record[c.key] = info[c.key]; });
  record.staffEmail = info.staffEmail;
  record.salesStore = info.salesStore || '';
  return record;
}

/**
 * 在庫データにHold情報を合成する。
 */
function attachHoldInfo_(vehicles) {
  var allHolds = readAllRows_(getHoldsSheet_(), HOLD_COLUMNS, 'commission');
  var byCommission = {};
  allHolds.forEach(function (h) {
    // 過去データにまれに残り得る2nd Hold行（廃止済み）は無視し、1st Holdのみを使う。
    if (h.rank === HOLD_RANK.SECOND) return;
    byCommission[h.commission] = h;
  });
  vehicles.forEach(function (v) {
    applyHoldFieldsToVehicle_(v, byCommission[v.commission], 'hold');
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
  vehicle[prefix + 'HoldType'] = holdRow ? (holdRow.holdType || HOLD_TYPE.NORMAL) : null;
  vehicle[prefix + 'SalesStore'] = holdRow ? holdRow.salesStore : null;
}

function findInventoryVehicleWithHolds_(commission) {
  var vehicle = findInventoryVehicle(commission);
  if (!vehicle) return null;
  return attachHoldInfo_([vehicle])[0];
}

/**
 * Hold を登録する。
 * @param {string} commission
 * @param {Object} info { leadNumber, registeredMonth, staff, customer, tradeIn, oss, insurance, salesStore }
 * @param {string} [holdType] HOLD_TYPE.NORMAL(既定)/WHOLESALE。WHOLESALEは
 *   管理者権限を持つ担当者のみ指定できる（normalizeHoldType_参照）。
 */
function registerHold(commission, info, holdType) {
  var currentStaff = requireCurrentStaff_();
  holdType = normalizeHoldType_(holdType, currentStaff.email);
  info = Object.assign({}, info, { staff: currentStaff.name, staffEmail: currentStaff.email });

  if (holdType === HOLD_TYPE.NORMAL) {
    var inputCheck = validateRequiredInfo_(HOLD_ORDER_INPUT_COLUMNS, info);
    if (!inputCheck.ok) throw new Error(inputCheck.reason);
    info.leadNumber = normalizeLeadNumber_(info.leadNumber);
  } else {
    // 業販HOLD（販売先のみ、任意入力）は、通常のHoldの入力項目（顧客・下取車の有無等）を
    // 一切要求しない。
    info.salesStore = info.salesStore || '';
    info.leadNumber = '';
    info.registeredMonth = '';
    info.salesLocation = '';
    info.customer = '';
    info.tradeIn = '';
    info.oss = '';
    info.insurance = '';
    info.paymentMethod = '';
  }

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
    // 業販HOLDはHold期限が無期限（expiresAtがnull）。decideExpiryAction_は
    // expiresAtが偽値の場合は常に'none'を返すため、期限切れ処理側の変更は不要。
    var expiresAt = holdType === HOLD_TYPE.NORMAL ? now + HOLD_DURATION_MS : null;
    var record = buildHoldRecord_(commission, HOLD_RANK.FIRST, info, now, expiresAt, holdType);
    // カレンダーの期限リマインドイベントも、期限がある通常Holdのみ作成する。
    record.calendarEventId = holdType === HOLD_TYPE.NORMAL
      ? createHoldCalendarEvent_(commission, vehicle.model, expiresAt)
      : '';
    createHoldRow_(record);
    updateInventoryVehicle_(sheet, rowNumber, { holdStatus: HOLD_STATUS.HOLD });

    var updated = findInventoryVehicleWithHolds_(commission);
    notifyHoldRegistered(updated);
    var detail = holdType === HOLD_TYPE.NORMAL
      ? 'リード番号 ' + info.leadNumber
      : HOLD_TYPE_LABELS[holdType] + '（販売先: ' + (info.salesStore || '未入力') + '）';
    appendAuditLog_(buildAuditLogEntry_('Hold登録', commission, vehicle.model, currentStaff, detail, now));
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
  if (!emailsMatch_(holdRow.staffEmail, staffEmail)) {
    return { ok: false, reason: 'Holdを行った担当者（' + holdRow.staff + '）のみ解除できます' };
  }
  return { ok: true, reason: '' };
}

/**
 * Holdを手動で解除する（顧客都合等での取り下げ）。
 * @param {string} commission
 */
function cancelHold(commission) {
  var currentStaff = requireCurrentStaff_();
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var holds = getHoldsForCommission_(commission);
    var target = holds.first;
    var check = canCancelHold_(target, currentStaff.email);
    if (!check.ok) throw new Error(check.reason);

    var holdsSheet = getHoldsSheet_();
    var vehicleBefore = findInventoryVehicle(commission);
    // 解除するHold（target）は、解除操作を行った本人（canCancelHold_により本人のみ解除可）が
    // 登録したものなので、そのカレンダーイベントも本人の実行コンテキストから削除できる。
    deleteHoldCalendarEvent_(target.calendarEventId);

    var rowNumber = findHoldRowNumber_(holdsSheet, commission, HOLD_RANK.FIRST);
    deleteHoldRow_(holdsSheet, rowNumber);
    var invSheet = getInventorySheet_();
    var invRowNumber = findInventoryRowNumber_(invSheet, commission);
    updateInventoryVehicle_(invSheet, invRowNumber, { holdStatus: HOLD_STATUS.AVAILABLE });

    appendAuditLog_(buildAuditLogEntry_(
      'Hold解除', commission, vehicleBefore ? vehicleBefore.model : '', currentStaff,
      'Holdを解除', new Date().getTime()
    ));
    return findInventoryVehicleWithHolds_(commission);
  } finally {
    lock.releaseLock();
  }
}

/**
 * 72時間経過したHoldを一括で処理する（時間主導トリガーから呼び出す）。
 * Hold行を削除して在庫を解放する。
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
        { holdStatus: vehicle.holdStatus, expiresAt: holds.first.expiresAt },
        now
      );
      if (action === 'none') return;

      var rowNumber = findHoldRowNumber_(holdsSheet, vehicle.commission, HOLD_RANK.FIRST);
      deleteHoldRow_(holdsSheet, rowNumber);
      var invRowNumber = findInventoryRowNumber_(invSheet, vehicle.commission);
      updateInventoryVehicle_(invSheet, invRowNumber, { holdStatus: HOLD_STATUS.AVAILABLE });
      appendAuditLog_(buildAuditLogEntry_('Hold自動解放', vehicle.commission, vehicle.model, null, 'Hold期限切れのため在庫ありに戻りました', now));
      processed.push({ commission: vehicle.commission, action: action });
    });

    return processed;
  } finally {
    lock.releaseLock();
  }
}
