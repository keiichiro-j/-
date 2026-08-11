/**
 * Api.gs
 * HTML Service（クライアント）から google.script.run で呼び出す関数群。
 * サービス層（SheetService / StatusService / ValidationService 等）を
 * 画面のユースケース単位に束ねる薄いレイヤー。
 */

// ===== 初期化 =====
function api_getBootstrapData() {
  var statusOptions = getEffectiveStatusOptions();
  var purchaseTypeOptions = getEffectivePurchaseTypeOptions();
  var columns = COLUMNS.map(function (col) {
    if (col.key === 'status') return Object.assign({}, col, { options: statusOptions });
    if (col.key === 'purchaseType') return Object.assign({}, col, { options: purchaseTypeOptions });
    return col;
  });
  return {
    companies: getCompanies().map(function (c) { return { id: c.id, name: c.name }; }),
    columns: columns,
    statusOptions: statusOptions,
    purchaseTypeOptions: purchaseTypeOptions,
    tabNames: TAB_NAMES,
    stockTabNames: STOCK_TAB_NAMES,
    currentUserEmail: Session.getActiveUser().getEmail(),
    theme: getThemeSettings()
  };
}

/**
 * 本日の登録台数（ヘッダーのライブステータス表示用）
 */
function api_getTodayStats() {
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var all = listVehiclesAcrossCompanies(ALL_TAB_NAMES);
  var todayCount = all.filter(function (v) { return v.purchaseDate === today; }).length;
  return { todayRegisteredCount: todayCount };
}

// ===== 一覧 =====
function api_listVehicles(companyId, tabName) {
  return listVehicles(companyId, tabName);
}

function api_listVehiclesAcross(tabNames) {
  return listVehiclesAcrossCompanies(tabNames);
}

function api_search(scope, filters) {
  var vehicles = scope.mode === 'cross'
    ? listVehiclesAcrossCompanies(scope.tabNames)
    : listVehicles(scope.companyId, scope.tabName);
  return searchVehicles(vehicles, filters);
}

// ===== ダッシュボード（3拠点横断サマリー） =====
function api_getDashboardSummary() {
  var companies = getCompanies();
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var soon = Utilities.formatDate(
    new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000),
    Session.getScriptTimeZone(), 'yyyy-MM-dd'
  );

  var summary = companies.map(function (company) {
    var stock = listVehicles(company.id, TAB_NAMES.IMPORTED).concat(listVehicles(company.id, TAB_NAMES.DOMESTIC));
    var expiringSoon = stock.filter(function (v) {
      return v.inspectionExpiryDate && v.inspectionExpiryDate >= today && v.inspectionExpiryDate <= soon;
    });
    return {
      companyId: company.id,
      companyName: company.name,
      stockCount: stock.length,
      importedCount: listVehicles(company.id, TAB_NAMES.IMPORTED).length,
      domesticCount: listVehicles(company.id, TAB_NAMES.DOMESTIC).length,
      expiringSoonCount: expiringSoon.length
    };
  });

  return {
    byCompany: summary,
    totalStock: summary.reduce(function (sum, s) { return sum + s.stockCount; }, 0),
    totalExpiringSoon: summary.reduce(function (sum, s) { return sum + s.expiringSoonCount; }, 0)
  };
}

// ===== 注文書アップロード（4.5・査定金額と購入者情報） =====
function api_uploadOrderFormPdf(companyId, base64Data, mimeType, fileName) {
  var company = getCompanyById(companyId);
  var folder = DriveApp.getFolderById(company.orderFormFolderId);
  var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, fileName);
  var file = createDriveFileNoConvert_(folder, blob, '_tmp_orderform_' + new Date().getTime());
  var draft = extractOrderFormDraft(file.getId());
  draft.tempFileId = file.getId();
  return draft;
}

// ===== 査定書アップロード（4.5・買取金額と車両情報） =====
function api_uploadAppraisalPdf(companyId, base64Data, mimeType, fileName) {
  var company = getCompanyById(companyId);
  var folder = DriveApp.getFolderById(company.appraisalFolderId);
  var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, fileName);
  var file = createDriveFileNoConvert_(folder, blob, '_tmp_appraisal_' + new Date().getTime());
  var draft = extractAppraisalDraft(file.getId());
  draft.tempFileId = file.getId();
  return draft;
}

// ===== 車検証アップロード（前所有者名義・4.6） =====
function api_uploadInspectionCertPdf(companyId, base64Data, mimeType, fileName) {
  var company = getCompanyById(companyId);
  var folder = DriveApp.getFolderById(company.pdfFolderId);
  var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, fileName);
  var file = createDriveFileNoConvert_(folder, blob, '_tmp_inspection_' + new Date().getTime());
  var draft = extractInspectionCertDraft(file.getId());
  draft.tempFileId = file.getId();
  return draft;
}

// ===== 自社名義車検証アップロード（4.7） =====
function api_uploadOwnCertPdf(companyId, ocn, base64Data, mimeType, fileName) {
  var company = getCompanyById(companyId);
  var folder = DriveApp.getFolderById(company.pdfFolderId);
  var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, fileName);
  var file = createDriveFileNoConvert_(folder, blob, ocn + OWN_NAME_SUFFIX);

  var target = locateVehicleByOcn_(ocn);
  if (!target) throw new Error('該当車両が見つかりません（OCN: ' + ocn + '）');
  var sheet = getOrCreateSheet(target.companyId, target.tabName);
  setCellValue_(sheet, target.rowNumber, 'ownCertLink', file.getUrl());

  var processed = getProcessedPdfIds_(companyId);
  processed[file.getId()] = true;
  saveProcessedPdfIds_(companyId, processed);

  return { ownCertLink: file.getUrl() };
}

// ===== 新規登録（4.5 注文書/査定書 〜 4.6 車検証 の一連の確認登録フロー） =====
/**
 * @param {string} companyId
 * @param {string} tabName '輸入車' or '国産車'
 * @param {Object} draft 確認画面で担当者が確定した入力値一式
 *   （orderFormTempFileId / appraisalTempFileId / inspectionTempFileId を含む場合、確定時にOCN名でリネームする）
 */
function api_registerVehicle(companyId, tabName, draft) {
  var vehicle = Object.assign({}, draft);
  vehicle.ocn = generateNextOcn(companyId);
  vehicle.purchaseDate = vehicle.purchaseDate || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  vehicle.staff = vehicle.staff || Session.getActiveUser().getEmail();
  vehicle.status = vehicle.status || STATUS_OPTIONS[0];
  if (vehicle.appraisalAmount != null && vehicle.purchaseAmount != null) {
    vehicle.tradeInLoss = calcTradeInLoss(Number(vehicle.appraisalAmount), Number(vehicle.purchaseAmount));
  }

  if (draft.orderFormTempFileId) {
    DriveApp.getFileById(draft.orderFormTempFileId).setName(vehicle.ocn + '.pdf');
  }
  if (draft.appraisalTempFileId) {
    DriveApp.getFileById(draft.appraisalTempFileId).setName(vehicle.ocn + '.pdf');
  }
  if (draft.inspectionTempFileId) {
    var file = DriveApp.getFileById(draft.inspectionTempFileId).setName(vehicle.ocn + '.pdf');
    vehicle.inspectionCertLink = file.getUrl();
    var processed = getProcessedPdfIds_(companyId);
    processed[draft.inspectionTempFileId] = true;
    saveProcessedPdfIds_(companyId, processed);
  }
  delete vehicle.orderFormTempFileId;
  delete vehicle.appraisalTempFileId;
  delete vehicle.inspectionTempFileId;
  delete vehicle.tempFileId;
  delete vehicle.rawText;
  delete vehicle.sourceFileId;

  var created = createVehicle(companyId, tabName, vehicle);
  appendAuditLog_(companyId, { action: '登録', tabName: tabName, ocn: created.ocn, before: null, after: created });
  notifySlackVehicleRegistered(created, companyId);
  return created;
}

// ===== 更新・ステータス変更・削除 =====
function api_updateVehicle(companyId, tabName, ocn, patch) {
  var before = findVehicle(companyId, tabName, ocn);
  if (patch.appraisalAmount != null && patch.purchaseAmount != null) {
    patch.tradeInLoss = calcTradeInLoss(Number(patch.appraisalAmount), Number(patch.purchaseAmount));
  }
  var updated = updateVehicle(companyId, tabName, ocn, patch);
  appendAuditLog_(companyId, { action: '編集', tabName: tabName, ocn: ocn, before: before, after: updated });
  return updated;
}

function api_changeStatus(companyId, tabName, ocn, newStatus, extra) {
  var before = findVehicle(companyId, tabName, ocn);
  var result = changeVehicleStatus(companyId, tabName, ocn, newStatus, extra);
  appendAuditLog_(companyId, { action: 'ステータス変更', tabName: tabName, ocn: ocn, before: before, after: result.vehicle });
  return result;
}

/**
 * 車両の削除（誤登録の取消用）。削除内容は変更履歴に記録され、直後であれば「元に戻す」で復元できる。
 */
function api_deleteVehicle(companyId, tabName, ocn, reason) {
  var before = deleteVehicleRow_(companyId, tabName, ocn);
  appendAuditLog_(companyId, { action: '削除', tabName: tabName, ocn: ocn, before: before, after: null, note: reason || '' });
  return { deleted: true };
}

// ===== 変更履歴（監査ログ） =====
function api_listAuditLog(companyId, limit) {
  return listAuditLog(companyId, limit);
}

function api_undoAuditLogEntry(companyId, rowNumber) {
  return undoAuditLogEntry(companyId, rowNumber);
}

// ===== PDF帳票出力（10.4） =====
function api_exportPdf(scope, dateFrom, dateTo) {
  var vehicles = scope.mode === 'cross'
    ? listVehiclesAcrossCompanies(scope.tabNames)
    : listVehicles(scope.companyId, scope.tabName);
  return exportVehiclesToPdf(vehicles, dateFrom, dateTo, buildReportTitle_(scope));
}

function buildReportTitle_(scope) {
  if (scope.mode === 'cross') return '車両在庫データ（3拠点横断）';
  var company = getCompanyById(scope.companyId);
  return '車両在庫データ（' + company.name + '）';
}

// ===== PDF自動反映の手動実行（4.1） =====
function api_syncPdfLinksNow(companyId) {
  return companyId ? syncInspectionCertLinks(companyId) : syncInspectionCertLinksAllCompanies();
}

// ===== 設定画面 =====
function api_getSettings() {
  return getAppSettings();
}

function api_saveCompanySettings(companies) {
  if (!companies || !companies.length) throw new Error('拠点設定が1件もありません');
  companies.forEach(function (c) {
    if (!c.id || !c.name || !c.sheetId) {
      throw new Error('拠点ID・拠点名・スプレッドシートIDは必須です（' + (c.name || c.id || '未入力の拠点') + '）');
    }
  });
  saveCompanies(companies);
  return { saved: true };
}

function api_saveNotificationSettings(settings) {
  saveNotificationSettings(settings);
  return { saved: true };
}

function api_saveOcrLabelSettings(overrideMaps) {
  saveOcrLabelOverrides(overrideMaps);
  return { saved: true };
}

function api_saveOptionSettings(settings) {
  saveOptionSettings(settings);
  return { saved: true };
}

function api_saveThemeSettings(theme) {
  saveThemeSettings(theme);
  return { saved: true, theme: getThemeSettings() };
}
