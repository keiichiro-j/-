/**
 * CarTrackingService.gs
 * デモカーリスト／サービス代車リスト機能
 *
 * デモカーリスト・サービス代車リストは、在庫リストとは完全に独立した専用シート。
 * 以前は在庫リストの区分（category）が「デモカー」「サービス」の車両を自動的に
 * 転記していたが、区分という自由記述のテキスト値をキーにした自動反映は廃止した
 * （不具合修正: 区分の表記ゆれ・入力ミスで反映漏れが起きやすく、またどのシートに
 * 載るかが区分の値だけで決まるため分かりにくいという指摘があった）。
 *
 * 現在は「スプレッドシートのどのタブに行を入力するか」がそのままアプリ側での
 * 一覧の振り分けになる。担当者がデモカーリスト・サービス代車リストの各シートへ
 * 直接、車両情報を手入力・編集する（CAR_TRACKING_COLUMNS、Constants.gs参照）。
 *
 * 不具合修正（現場からの要望「デモカー、サービス代車も売り物（在庫）なので、
 * 販売された場合は受注リストに移動するでいい」）: 在庫リストと同じくHold登録・
 * 受注確定ができる（HoldService.gs・OrderService.gs参照。アプリの「受注」ボタン
 * から顧客情報を入力して受注確定すると、その場で受注リストへ移動する）。
 * これとは別に、スプレッドシート上で直接「販売状況」を「販売済み」に変更した
 * 場合も、時間主導トリガー（Triggers.gs、migrateSoldCarTrackingToOrders_参照）が
 * 定期的に検知し、受注リストへ移動する（顧客情報はスプレッドシート上の操作だけ
 * では入力されないため空欄のまま記録される）。
 *
 * 在庫リストの区分「デモカー」「サービス」の車両自体は、この変更の前後で
 * 表示・Hold・受注のいずれも変わらず、これまでどおり在庫リストに表示され続ける
 * （在庫リストとデモカーリスト・サービス代車リストは、同じ車両を指す行が
 * 両方に存在してもよい、互いに独立したシートという位置づけ）。
 */

/**
 * デモカーリスト／サービス代車リストの一覧取得。シートの内容をそのまま返す
 * （在庫リストとの自動同期は行わない）。
 */
function listCarTrackingList_(sheet) {
  return listCarTracking_(sheet);
}

/**
 * 指定した車両が、スプレッドシート上の手動操作による「販売済みへの自動移動」
 * （migrateSoldCarTrackingToOrders_）の対象かどうかを判定する（純粋関数）。
 * - 販売状況（saleStatus）が「販売済み」であること。
 * - Hold中（holdStatus === 'hold'）ではないこと（アプリのHold・受注確定を
 *   経由した受注は、confirmOrder自身がその場で受注リストへ移動させるため、
 *   この自動移動とは対象が重ならない）。
 * - コミッションが入力されていること。受注リスト（ORDER_COLUMNS）はcommissionを
 *   キー列として一覧取得する（listOrders参照）ため、コミッションが空欄のまま
 *   移動すると、その行は一覧にもキャンセル機能にも出てこない「迷子」の行に
 *   なってしまう。コミッション未入力の車両は対象外とし、スプレッドシートで
 *   コミッションを入力してから次回の実行を待つ（アプリの「受注」ボタンと同じ
 *   制約。requireActionCommission_、JavaScript.html参照）。
 */
function shouldMigrateSoldCarTrackingVehicle_(v) {
  return !!v && v.saleStatus === CAR_TRACKING_STATUS.SOLD && v.holdStatus !== HOLD_STATUS.HOLD && !!v.commission;
}

/**
 * デモカーリスト・サービス代車リストで、スプレッドシート上で直接「販売状況」を
 * 「販売済み」に変更した車両を受注リストへ移動する（時間主導トリガーから呼び出す、
 * Triggers.gs参照）。対象の判定はshouldMigrateSoldCarTrackingVehicle_を参照。
 * 顧客名・リード番号・登録月等の契約情報は、スプレッドシート上の手動操作だけでは
 * 入力されないため、受注リストには空欄のまま記録される（必要であれば、現場で
 * 受注リスト側に直接入力して補ってください）。担当者情報が無い自動処理のため、
 * 変更履歴にはシステムによる処理として記録する（buildAuditLogEntry_のstaff=null、
 * processExpiredHoldsの「Hold自動解放」と同じ扱い）。
 */
function migrateSoldCarTrackingToOrders_() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var moved = [];
    [
      { name: SHEET_NAMES.DEMO_CAR_LIST, sheet: getDemoCarListSheet_() },
      { name: SHEET_NAMES.SERVICE_CAR_LIST, sheet: getServiceCarListSheet_() }
    ].forEach(function (source) {
      var vehicles = readAllRows_(source.sheet, CAR_TRACKING_COLUMNS, 'ocn')
        .filter(shouldMigrateSoldCarTrackingVehicle_);

      vehicles.forEach(function (vehicle) {
        var rowNumber = findRowByKey_(source.sheet, CAR_TRACKING_COLUMNS, 'ocn', vehicle.ocn);
        if (!rowNumber) return;

        var now = new Date().getTime();
        var order = { orderedAt: now, sourceSheet: source.name };
        HOLD_ORDER_INPUT_COLUMNS.forEach(function (c) { order[c.key] = ''; });
        order.staffEmail = '';
        VEHICLE_COLUMNS.forEach(function (col) { order[col.key] = vehicle[col.key]; });
        order.mp = vehicle.mp;

        appendOrder_(order);
        deleteInventoryRow_(source.sheet, rowNumber);
        appendAuditLog_(buildAuditLogEntry_(
          '受注確定（自動）', vehicle.commission, vehicle.model, null,
          source.name + 'で「販売済み」に変更されたため受注リストへ自動的に移動しました（契約情報は未入力）',
          now
        ));
        moved.push({ commission: vehicle.commission, model: vehicle.model, source: source.name });
      });
    });
    return moved;
  } finally {
    lock.releaseLock();
  }
}
