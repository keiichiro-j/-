/**
 * NotificationService.gs
 * 3.5 メール通知機能
 * Hold発生時・受注確定時に、設定画面（3.6）で指定した宛先へ自動でメール通知する。
 */

function notifyHoldRegistered(vehicle, isSecondHold) {
  var to = PropertiesService.getScriptProperties().getProperty(PROP_KEYS.NOTIFY_HOLD_MAIL_TO);
  if (!to) return false;

  var label = isSecondHold ? '2nd Hold' : 'Hold';
  var prefix = isSecondHold ? 'secondHold' : 'hold';
  var input = {};
  HOLD_ORDER_INPUT_COLUMNS.forEach(function (c) {
    var key = prefix + c.key.charAt(0).toUpperCase() + c.key.slice(1);
    input[c.key] = vehicle[key];
  });
  var expiresAt = isSecondHold ? vehicle.secondHoldExpiresAt : vehicle.holdExpiresAt;

  MailApp.sendEmail({
    to: to,
    subject: '【販売可能リスト】' + label + '登録のお知らせ',
    body: [
      label + 'が登録されました。',
      '',
      'コミッション: ' + vehicle.commission,
      'モデル: ' + vehicle.model,
      'リード番号: ' + input.leadNumber,
      '登録月: ' + input.registeredMonth,
      '担当者: ' + input.staff,
      '顧客: ' + input.customer,
      '下取車の有無: ' + input.tradeIn,
      'OSS登録の可否: ' + input.oss,
      '保険加入の有無: ' + input.insurance,
      'Hold期限: ' + formatDateTime_(expiresAt)
    ].join('\n')
  });
  return true;
}

function notifyOrderConfirmed(order) {
  var to = PropertiesService.getScriptProperties().getProperty(PROP_KEYS.NOTIFY_ORDER_MAIL_TO);
  if (!to) return false;

  MailApp.sendEmail({
    to: to,
    subject: '【販売可能リスト】受注確定のお知らせ',
    body: [
      '受注が確定しました。',
      '',
      'コミッション: ' + order.commission,
      'モデル: ' + order.model,
      '販売拠点: ' + order.salesLocation,
      'リード番号: ' + order.leadNumber,
      '登録月: ' + order.registeredMonth,
      '担当者: ' + order.staff,
      '顧客: ' + order.customer,
      '下取車の有無: ' + order.tradeIn,
      'OSS登録の可否: ' + order.oss,
      '保険加入の有無: ' + order.insurance,
      '受注確定日時: ' + formatDateTime_(order.orderedAt)
    ].join('\n')
  });
  return true;
}

/**
 * システムエラー通知。時間主導トリガー（Hold期限切れ処理）がリトライしても
 * 失敗し続けた場合など、運用担当者が気づけないまま放置されることを防ぐために使う。
 * 設定タブで「システムエラー通知先」が未設定の場合は何もしない。
 */
function notifySystemError_(context, error) {
  var to = PropertiesService.getScriptProperties().getProperty(PROP_KEYS.NOTIFY_ERROR_MAIL_TO);
  if (!to) return false;

  MailApp.sendEmail({
    to: to,
    subject: '【販売可能リスト】エラー通知: ' + context,
    body: [
      context + ' の処理でエラーが発生し、リトライしても解消しませんでした。',
      '',
      'エラー内容: ' + (error && error.message ? error.message : String(error)),
      '発生日時: ' + formatDateTime_(new Date().getTime())
    ].join('\n')
  });
  return true;
}

function formatDateTime_(epochMs) {
  if (!epochMs) return '-';
  return Utilities.formatDate(new Date(epochMs), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
}
