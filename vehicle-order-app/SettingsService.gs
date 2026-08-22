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
    textColor: props.getProperty(PROP_KEYS.TEXT_COLOR) || DEFAULT_TEXT_COLOR,
    logoUrl: props.getProperty(PROP_KEYS.LOGO_URL) || '',
    notifyHoldMailTo: props.getProperty(PROP_KEYS.NOTIFY_HOLD_MAIL_TO) || '',
    notifyOrderMailTo: props.getProperty(PROP_KEYS.NOTIFY_ORDER_MAIL_TO) || '',
    notifyErrorMailTo: props.getProperty(PROP_KEYS.NOTIFY_ERROR_MAIL_TO) || '',
    staffList: getStaffList_(),
    modelPhotos: getModelPhotos_()
  };
}

function saveSettings(settings) {
  var logoUrl = validateLogoUrl_(settings && settings.logoUrl);
  var props = PropertiesService.getScriptProperties();
  props.setProperty(PROP_KEYS.THEME_COLOR, settings.themeColor || DEFAULT_THEME_COLOR);
  props.setProperty(PROP_KEYS.TEXT_COLOR, settings.textColor || DEFAULT_TEXT_COLOR);
  props.setProperty(PROP_KEYS.LOGO_URL, logoUrl);
  props.setProperty(PROP_KEYS.NOTIFY_HOLD_MAIL_TO, settings.notifyHoldMailTo || '');
  props.setProperty(PROP_KEYS.NOTIFY_ORDER_MAIL_TO, settings.notifyOrderMailTo || '');
  props.setProperty(PROP_KEYS.NOTIFY_ERROR_MAIL_TO, settings.notifyErrorMailTo || '');
  props.setProperty(PROP_KEYS.STAFF_LIST, JSON.stringify(normalizeStaffList_(settings.staffList)));
  props.setProperty(PROP_KEYS.MODEL_PHOTOS, JSON.stringify(normalizeModelPhotos_(settings.modelPhotos)));
  return getSettings();
}

/**
 * ロゴ設定値（純粋関数）。画像URL、またはアップロード時に変換されたdata URLの
 * どちらかを想定している。Script Propertiesの1プロパティあたりの上限（9KB）を
 * 超える場合はエラーにする（大きな画像は外部にアップロードしてURLで指定してもらう）。
 */
function validateLogoUrl_(logoUrl) {
  var value = String(logoUrl || '').trim();
  if (value.length > LOGO_URL_MAX_LENGTH) {
    throw new Error(
      'ロゴ画像のデータが大きすぎます（' + value.length + '文字）。' +
      'もっと小さい画像を使うか、画像を外部にアップロードしてそのURLを指定してください。'
    );
  }
  return value;
}

/**
 * 担当者マスタを { name, email, location } の配列で返す。
 * 旧形式（名前の文字列だけの配列、またはlocationを持たない { name, email }）が
 * 保存されている場合も読み取れるようにしておく（email/locationは空文字になる）。
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
    if (typeof entry === 'string') return { name: entry, email: '', location: '' };
    return {
      name: (entry && entry.name) || '',
      email: (entry && entry.email) || '',
      location: (entry && entry.location) || ''
    };
  });
}

/**
 * 担当者マスタの正規化（純粋関数）。
 * 名前・メールアドレスがともに空の行は除去し、メールアドレス（大文字小文字を無視）で
 * 重複除去したうえ、最大人数（STAFF_LIST_MAX）を超えていればエラー。拠点名は未入力でもよい。
 */
function normalizeStaffList_(list) {
  list = Array.isArray(list) ? list : [];
  var seenEmails = {};
  var result = [];
  list.forEach(function (entry) {
    var name = String((entry && entry.name) || '').trim();
    var email = String((entry && entry.email) || '').trim().toLowerCase();
    var location = String((entry && entry.location) || '').trim();
    if (!name || !email) return;
    if (seenEmails[email]) return;
    seenEmails[email] = true;
    result.push({ name: name, email: email, location: location });
  });
  if (result.length > STAFF_LIST_MAX) {
    throw new Error('担当者マスタは最大' + STAFF_LIST_MAX + '人までです（現在' + result.length + '人）');
  }
  return result;
}

/**
 * ホーム画面のモデル写真設定を { model, photoUrl } の配列で返す。
 * モデル名ごとに代表写真を1枚登録し、ホーム画面でクリックすると在庫リストが
 * そのモデル名で絞り込まれる（車両1台ごとではなくモデル単位で管理する。
 * 個々の車両は在庫の入れ替わりが頻繁なため、車両ごとに写真を管理すると
 * 都度アップロード・削除が必要になり運用の手間が大きくなるため）。
 */
function getModelPhotos_() {
  var raw = PropertiesService.getScriptProperties().getProperty(PROP_KEYS.MODEL_PHOTOS);
  if (!raw) return [];
  var list;
  try {
    list = JSON.parse(raw);
  } catch (e) {
    return [];
  }
  if (!Array.isArray(list)) return [];
  return list.map(function (entry) {
    return { model: (entry && entry.model) || '', photoUrl: (entry && entry.photoUrl) || '' };
  });
}

/**
 * モデル写真設定の正規化（純粋関数）。モデル名・写真URLがともに入力されている行のみ残し、
 * モデル名で重複除去したうえ、最大件数（MODEL_PHOTOS_MAX）を超えていればエラー。
 * 写真URLが長すぎる場合（data URLを直接貼り付けた場合等）もエラーにする
 * （Script Propertiesの1プロパティあたりの上限に対し、最大30件分をまとめて
 * 保存するため、ロゴ1枚分より小さい上限にしている。大きな画像は外部にアップロードして
 * URLを指定する）。
 */
function normalizeModelPhotos_(list) {
  list = Array.isArray(list) ? list : [];
  var seenModels = {};
  var result = [];
  list.forEach(function (entry) {
    var model = String((entry && entry.model) || '').trim();
    var photoUrl = String((entry && entry.photoUrl) || '').trim();
    if (!model || !photoUrl) return;
    if (seenModels[model]) return;
    seenModels[model] = true;
    if (photoUrl.length > MODEL_PHOTO_URL_MAX_LENGTH) {
      throw new Error(
        'モデル「' + model + '」の写真URLが長すぎます（' + photoUrl.length + '文字）。' +
        '画像を外部（Googleドライブの共有リンク等）にアップロードしたうえでURLを指定してください。'
      );
    }
    result.push({ model: model, photoUrl: photoUrl });
  });
  if (result.length > MODEL_PHOTOS_MAX) {
    throw new Error('モデル写真は最大' + MODEL_PHOTOS_MAX + '件までです（現在' + result.length + '件）');
  }
  return result;
}

/**
 * 担当者マスタからメールアドレス（大文字小文字を無視）で担当者（{name, email, location}）を
 * 検索する（純粋関数）。見つからない場合は null。
 */
function findStaffByEmail_(staffList, email) {
  if (!email) return null;
  var normalized = String(email).trim().toLowerCase();
  return (staffList || []).find(function (s) {
    return s && s.email && String(s.email).trim().toLowerCase() === normalized;
  }) || null;
}

/**
 * 担当者マスタからメールアドレスで担当者名を検索する（純粋関数）。見つからない場合は null。
 */
function resolveStaffNameByEmail_(staffList, email) {
  var match = findStaffByEmail_(staffList, email);
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
