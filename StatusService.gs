/**
 * StatusService.gs
 * 4.3 販売済タブへの自動移動機能
 *
 * ステータスが「販売済み」に更新されたら、該当行を「販売済」タブへ移動し、
 * 移動元タブから削除することでデータの二重管理を防ぐ。
 * 4.7: 「名義変更済み」への変更時は、UI 側で自社名義車検証のアップロードを促す
 *      （requiresOwnCertUpload フラグで呼び出し元に伝える）。
 */

/**
 * ステータス変更のエントリポイント。
 * @param {string} companyId
 * @param {string} tabName 現在のタブ（輸入車 or 国産車。既に販売済の場合は不可）
 * @param {string} ocn
 * @param {string} newStatus
 * @param {Object} extra 販売済みへ変更する場合は { soldMonth, soldTo } が必須
 * @return {{vehicle:Object, moved:boolean, requiresOwnCertUpload:boolean}}
 */
function changeVehicleStatus(companyId, tabName, ocn, newStatus, extra) {
  if (getEffectiveStatusOptions().indexOf(newStatus) === -1) {
    throw new Error('不正なステータスです: ' + newStatus);
  }
  if (tabName === TAB_NAMES.SOLD) {
    throw new Error('販売済タブの車両のステータスは変更できません');
  }

  var patch = { status: newStatus };

  if (newStatus === STATUS_SOLD) {
    extra = extra || {};
    if (!extra.soldMonth || !extra.soldTo) {
      throw new Error('販売済みへの変更には販売年月・販売先の入力が必要です');
    }
    patch.soldMonth = extra.soldMonth;
    patch.soldTo = extra.soldTo;
  }

  var updated = updateVehicle(companyId, tabName, ocn, patch);

  var moved = false;
  if (newStatus === STATUS_SOLD) {
    moveVehicleToSoldTab_(companyId, tabName, ocn, updated);
    moved = true;
    notifySlackVehicleSold(updated, companyId);
  }

  return {
    vehicle: updated,
    moved: moved,
    requiresOwnCertUpload: newStatus === STATUS_NAME_TRANSFERRED
  };
}

function moveVehicleToSoldTab_(companyId, sourceTabName, ocn, vehicleData) {
  var sourceSheet = getOrCreateSheet(companyId, sourceTabName);
  var rowNumber = findRowByOcn_(sourceSheet, ocn);
  if (!rowNumber) throw new Error('移動元に該当車両が見つかりません（OCN: ' + ocn + '）');

  var soldSheet = getOrCreateSheet(companyId, TAB_NAMES.SOLD);
  soldSheet.appendRow(objectToRow_(vehicleData));
  sourceSheet.deleteRow(rowNumber);
}
