/**
 * SettingsService.gs
 * 設定機能（テーマ設定、Hold時／受注時のメール通知先設定、担当者マスタ）
 *
 * 担当者マスタは { name, email } の配列。email はログイン中のGoogleアカウント
 * （Session.getActiveUser().getEmail()）と突き合わせて「今操作している担当者」を
 * 自動判定するために使う（resolveStaffNameByEmail_ / getCurrentStaffName_）。
 * これにより、Hold登録・2nd Hold登録・受注確定・Hold解除で担当者を手入力/選択する
 * 必要がなくなる（Api.gs, HoldService.gs, OrderService.gs参照）。
 */

function getSettings() {
  var props = PropertiesService.getScriptProperties();
  return {
    themeColor: props.getProperty(PROP_KEYS.THEME_COLOR) || DEFAULT_THEME_COLOR,
    notifyHoldMailTo: props.getProperty(PROP_KEYS.NOTIFY_HOLD_MAIL_TO) || '',
    notifyOrderMailTo: props.getProperty(PROP_KEYS.NOTIFY_ORDER_MAIL_TO) || '',
    staffList: getStaffList_()
  };
}

function saveSettings(settings) {
  var props = PropertiesService.getScriptProperties();
  props.setProperty(PROP_KEYS.THEME_COLOR, settings.themeColor || DEFAULT_THEME_COLOR);
  props.setProperty(PROP_KEYS.NOTIFY_HOLD_MAIL_TO, settings.notifyHoldMailTo || '');
  props.setProperty(PROP_KEYS.NOTIFY_ORDER_MAIL_TO, settings.notifyOrderMailTo || '');
  props.setProperty(PROP_KEYS.STAFF_LIST, JSON.stringify(normalizeStaffList_(settings.staffList)));
  return getSettings();
}

/**
 * 担当者マスタを { name, email } の配列で返す。
 * 旧形式（名前の文字列だけの配列）が保存されている場合も読み取れるようにしておく
 * （email は空文字になるため、その担当者はログイン紐付けが効くよう設定画面で
 * メールアドレスを再登録する必要がある）。
 */
function getStaffList_() {
  var raw = PropertiesService.getScriptProperties().getProperty(PROP_KEYS.STAFF_LIST);
  if (!raw) return [];
  var list;
  try {
    list = JSON.parse(raw);
  } catch (e) {
    return [];
  }
  if (!Array.isArray(list)) return [];
  return list.map(function (entry) {
    if (typeof entry === 'string') return { name: entry, email: '' };
    return { name: (entry && entry.name) || '', email: (entry && entry.email) || '' };
  });
}

/**
 * 担当者マスタの正規化（純粋関数）。
 * 名前・メールアドレスがともに空の行は除去し、メールアドレス（大文字小文字を無視）で
 * 重複除去したうえ、最大人数（STAFF_LIST_MAX）を超えていればエラー。
 */
function normalizeStaffList_(list) {
  list = Array.isArray(list) ? list : [];
  var seenEmails = {};
  var result = [];
  list.forEach(function (entry) {
    var name = String((entry && entry.name) || '').trim();
    var email = String((entry && entry.email) || '').trim().toLowerCase();
    if (!name || !email) return;
    if (seenEmails[email]) return;
    seenEmails[email] = true;
    result.push({ name: name, email: email });
  });
  if (result.length > STAFF_LIST_MAX) {
    throw new Error('担当者マスタは最大' + STAFF_LIST_MAX + '人までです（現在' + result.length + '人）');
  }
  return result;
}

/**
 * 担当者マスタからメールアドレス（大文字小文字を無視）で担当者名を検索する（純粋関数）。
 * 見つからない場合は null。
 */
function resolveStaffNameByEmail_(staffList, email) {
  if (!email) return null;
  var normalized = String(email).trim().toLowerCase();
  var match = (staffList || []).find(function (s) {
    return s && s.email && String(s.email).trim().toLowerCase() === normalized;
  });
  return match ? match.name : null;
}

/**
 * 現在ログイン中のGoogleアカウントに対応する担当者名を返す（見つからなければ null）。
 * Hold登録・2nd Hold登録・受注確定・Hold解除は、この値を「担当者」として自動的に使う。
 *
 * 動作条件: Webアプリのデプロイ設定が「実行するユーザー: アプリにアクセスするユーザー」、
 * かつ「アクセスできるユーザー」が同一Google Workspace組織内（またはユーザーを限定）に
 * なっている必要がある。「実行するユーザー: 自分」のまま・「全員（匿名可）」に公開した
 * ままだと Session.getActiveUser().getEmail() が常に空文字を返し、この機能は動作しない。
 */
function getCurrentStaffName_() {
  var email = Session.getActiveUser().getEmail();
  return resolveStaffNameByEmail_(getStaffList_(), email);
}

/**
 * ログイン中のGoogleアカウントに対応する担当者を { name, email } で返す。
 * 見つからなければエラーを投げる。Hold登録・2nd Hold登録・受注確定・Hold解除の
 * 入口で使い、担当者をサーバー側で確定させる（クライアントからの担当者入力は
 * 信用しない）。
 *
 * 権限判定（本人確認）には、必ず email を使うこと。name はあくまで表示用のラベルで、
 * 担当者マスタ側で後から書き換えられる可能性があるため、name同士の比較で本人確認を
 * 行うと、表示名を変更しただけで自分自身のHoldを解除・受注確定できなくなる
 * （もしくは意図せず他人の権限と一致してしまう）不具合の原因になる。
 */
function requireCurrentStaff_() {
  var email = Session.getActiveUser().getEmail();
  var name = resolveStaffNameByEmail_(getStaffList_(), email);
  if (!name) {
    throw new Error(
      '担当者情報を取得できません。ログイン中のGoogleアカウント（' +
      (email || '不明') +
      '）が担当者マスタに登録されているか、設定タブでご確認ください。'
    );
  }
  return { name: name, email: String(email).trim().toLowerCase() };
}
