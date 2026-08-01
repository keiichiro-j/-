/**
 * NotificationService.gs
 * 4.4 車検満了日 メール通知機能
 * 10.3 チャット通知連携（Slack等）
 */

/**
 * 車検満了日が EXPIRY_NOTICE_DAYS（30日前・7日前）に該当する車両を全社横断でチェックし、
 * 該当があればメール通知する。日次バッチトリガーから呼び出す。
 */
function checkInspectionExpiryAndNotify() {
  var today = stripTime_(new Date());
  var targets = listVehiclesAcrossCompanies(STOCK_TAB_NAMES).filter(function (v) {
    return v.inspectionExpiryDate;
  });

  var grouped = {}; // daysLeft -> [vehicle]
  targets.forEach(function (v) {
    var expiry = stripTime_(new Date(v.inspectionExpiryDate));
    var daysLeft = Math.round((expiry - today) / (24 * 60 * 60 * 1000));
    if (EXPIRY_NOTICE_DAYS.indexOf(daysLeft) !== -1) {
      grouped[daysLeft] = grouped[daysLeft] || [];
      grouped[daysLeft].push(v);
    }
  });

  var hasTargets = Object.keys(grouped).length > 0;
  if (!hasTargets) return { notified: false };

  var body = buildExpiryMailBody_(grouped);
  var to = PropertiesService.getScriptProperties().getProperty(PROP_KEYS.NOTIFY_MAIL_TO);
  if (to) {
    MailApp.sendEmail({
      to: to,
      subject: '【車両在庫管理】車検満了日が近い車両のお知らせ',
      body: body
    });
  }
  return { notified: !!to, body: body };
}

function stripTime_(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function buildExpiryMailBody_(grouped) {
  var lines = ['車検満了日が近づいている車両は以下の通りです。', ''];
  Object.keys(grouped).sort(function (a, b) { return a - b; }).forEach(function (daysLeft) {
    lines.push('■ 残り' + daysLeft + '日');
    grouped[daysLeft].forEach(function (v) {
      lines.push('  ・[' + v.companyId + '/' + v.tabName + '] OCN:' + v.ocn +
        ' ' + v.carType + ' ' + v.model + ' 車検満了日:' + v.inspectionExpiryDate +
        ' 担当:' + v.staff);
    });
    lines.push('');
  });
  return lines.join('\n');
}

/**
 * Slack Webhook 通知（共通）
 */
function postSlackMessage_(text) {
  var url = PropertiesService.getScriptProperties().getProperty(PROP_KEYS.SLACK_WEBHOOK_URL);
  if (!url) return false;
  UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ text: text }),
    muteHttpExceptions: true
  });
  return true;
}

/**
 * 新規仕入登録時の通知
 */
function notifySlackVehicleRegistered(vehicle, companyId) {
  var company = getCompanyById(companyId);
  return postSlackMessage_(
    ':car: 新規仕入登録\n' +
    '拠点: ' + company.name + '\n' +
    'OCN: ' + vehicle.ocn + '\n' +
    '車種/モデル: ' + vehicle.carType + ' ' + vehicle.model + '\n' +
    '担当者: ' + vehicle.staff
  );
}

/**
 * 販売確定時の通知
 */
function notifySlackVehicleSold(vehicle, companyId) {
  var company = getCompanyById(companyId);
  return postSlackMessage_(
    ':moneybag: 販売確定\n' +
    '拠点: ' + company.name + '\n' +
    'OCN: ' + vehicle.ocn + '\n' +
    '車種/モデル: ' + vehicle.carType + ' ' + vehicle.model + '\n' +
    '販売年月: ' + vehicle.soldMonth + '\n' +
    '販売先: ' + vehicle.soldTo
  );
}
