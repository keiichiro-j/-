/**
 * SettingsService.gs
 * 設定機能（テーマ設定、Hold時／受注時のメール・Google Chat通知先設定、担当者マスタ）
 *
 * 担当者マスタは { name, email } の配列。email はログイン中のGoogleアカウント
 * （Session.getActiveUser().getEmail()）と突き合わせて「今操作している担当者」を
 * 自動判定するために使う（resolveStaffNameByEmail_ / getCurrentStaffName_）。
 * これにより、Hold登録・2nd Hold登録・受注確定・Hold解除で担当者を手入力/選択する
 * 必要がなくなる（Api.gs, HoldService.gs, OrderService.gs参照）。
 */

/**
 * 設定値をScript Propertiesから読み出す（内部用・未リダクト）。Apps Scriptは
 * トップレベル関数である以上、名前の末尾に`_`を付けても google.script.run から
 * クライアントが直接呼び出せてしまう（命名規則であって実行時の制限ではない）。
 * そのため、この関数自体は権限チェックを行わない「生データ取得」に留め、
 * クライアントに公開してよい形（管理者判定・リダクト込み）は下のgetSettings()が
 * 別途担う。api_getBootstrapData（Api.gs）など、担当者メール突き合わせのために
 * 非リダクトの全データが必要なサーバー内部処理はこちらを使う。
 */
function getRawSettings_() {
  var props = PropertiesService.getScriptProperties();
  return {
    // テーマのみ、ログイン中のGoogleアカウントごとに独立させるため
    // getUserProperties()（アカウント単位）から読む。サイドバーの色はテーマ
    // プリセット（THEME_PRESETSのsidebarColor）とセットになったため、テーマキー
    // 以外に個別の保存値は持たない。それ以外は全利用者共通のシステムマスタの
    // ため、従来どおりgetScriptProperties()（スクリプト単位）から読む
    // （getCurrentUserThemeKey_参照）。
    themeKey: getCurrentUserThemeKey_(),
    logoUrl: props.getProperty(PROP_KEYS.LOGO_URL) || '',
    loadingSplashDriveId: props.getProperty(PROP_KEYS.LOADING_SPLASH_DRIVE_ID) || '',
    notifyHoldMailTo: getMailList_(PROP_KEYS.NOTIFY_HOLD_MAIL_TO),
    notifyOrderMailTo: getMailList_(PROP_KEYS.NOTIFY_ORDER_MAIL_TO),
    notifyErrorMailTo: getMailList_(PROP_KEYS.NOTIFY_ERROR_MAIL_TO),
    notifyChatWebhookUrl: props.getProperty(PROP_KEYS.NOTIFY_CHAT_WEBHOOK_URL) || '',
    staffList: getStaffList_(),
    modelPhotos: getModelPhotos_(),
    celebrationVariants: getCelebrationVariants_(),
    homeAnnouncement: props.getProperty(PROP_KEYS.HOME_ANNOUNCEMENT) || ''
  };
}

/**
 * メール通知先1項目分（Hold時／受注確定時／システムエラー通知）を、順序を保った
 * メールアドレスの配列で返す。担当者マスタ・モデル写真と同様に、順序変更（ドラッグ
 * &ドロップ）に対応させるため、以前のような「,区切りの1文字列」ではなくJSON化した
 * 配列として保存する。この関数は移行も兼ねており、この変更より前に保存された
 * 「,区切りの1文字列」形式の値（JSON.parseできない、または配列でない）が残っていても、
 * カンマ区切りとして分割して読み取れるようにしている（保存し直さなくても引き続き使える）。
 */
function getMailList_(propKey) {
  var raw = PropertiesService.getScriptProperties().getProperty(propKey);
  if (!raw) return [];
  var list;
  try {
    list = JSON.parse(raw);
  } catch (e) {
    list = null;
  }
  if (!Array.isArray(list)) {
    list = String(raw).split(',');
  }
  return list.map(function (entry) { return String(entry || '').trim(); }).filter(Boolean);
}

/**
 * クライアントから google.script.run.getSettings() のように直接呼び出されても
 * 安全なように、この関数自体の中で管理者判定・リダクトまで完結させる
 * （Api.gsのapi_getSettingsだけに権限チェックを任せない。理由は上のgetRawSettings_
 * のコメント参照）。
 */
function getSettings() {
  var email = Session.getActiveUser().getEmail();
  return redactSystemMasterSettings_(getRawSettings_(), isSystemAdmin_(email));
}

/**
 * 設定値をScript Propertiesへ書き込む（内部用・権限チェックなし）。呼び出し側で
 * 権限チェック・システムマスタ項目のガードを済ませたデータを渡すこと。
 */
function saveRawSettings_(settings) {
  var logoUrl = validateLogoUrl_(settings && settings.logoUrl);
  var props = PropertiesService.getScriptProperties();
  // テーマのみ、ログイン中のGoogleアカウントごとに独立して保存する
  // （setCurrentUserThemeKey_参照）。それ以外は全利用者共通のシステムマスタの
  // ため、従来どおりScript Propertiesに保存する。
  setCurrentUserThemeKey_(settings && settings.themeKey);
  props.setProperty(PROP_KEYS.LOGO_URL, logoUrl);
  props.setProperty(PROP_KEYS.LOADING_SPLASH_DRIVE_ID, normalizeLoadingSplashDriveId_(settings && settings.loadingSplashDriveId));
  props.setProperty(PROP_KEYS.NOTIFY_HOLD_MAIL_TO, JSON.stringify(normalizeMailList_(settings.notifyHoldMailTo)));
  props.setProperty(PROP_KEYS.NOTIFY_ORDER_MAIL_TO, JSON.stringify(normalizeMailList_(settings.notifyOrderMailTo)));
  props.setProperty(PROP_KEYS.NOTIFY_ERROR_MAIL_TO, JSON.stringify(normalizeMailList_(settings.notifyErrorMailTo)));
  props.setProperty(PROP_KEYS.NOTIFY_CHAT_WEBHOOK_URL, validateChatWebhookUrl_(settings.notifyChatWebhookUrl));
  props.setProperty(PROP_KEYS.STAFF_LIST, JSON.stringify(normalizeStaffList_(settings.staffList)));
  props.setProperty(PROP_KEYS.MODEL_PHOTOS, JSON.stringify(normalizeModelPhotos_(settings.modelPhotos)));
  props.setProperty(PROP_KEYS.CELEBRATION_VARIANTS, JSON.stringify(normalizeCelebrationVariants_(settings.celebrationVariants)));
  props.setProperty(PROP_KEYS.HOME_ANNOUNCEMENT, validateHomeAnnouncement_(settings.homeAnnouncement));
  return getRawSettings_();
}

/**
 * クライアントから google.script.run.saveSettings(...) のように直接呼び出されても
 * 安全なように、この関数自体の中で管理者判定・システムマスタ項目のガードまで
 * 完結させる（Api.gsのapi_saveSettingsだけに権限チェックを任せない。理由は
 * getRawSettings_のコメント参照）。
 */
function saveSettings(settings) {
  var email = Session.getActiveUser().getEmail();
  var isAdmin = isSystemAdmin_(email);
  var guarded = applySystemMasterGuard_(settings, getRawSettings_(), isAdmin);
  saveRawSettings_(guarded);
  return redactSystemMasterSettings_(getRawSettings_(), isAdmin);
}

/**
 * テーマの着せ替えプリセットキー（純粋関数）。THEME_PRESETS（Constants.gs）の
 * いずれかのキー、または特別な「ランダム（ログインのたび変化）」を表す
 * RANDOM_THEME_KEYのみを有効とし、それ以外（未設定・改ざん・過去バージョンで
 * 保存された値など）は、すべて初期プリセット（DEFAULT_THEME_KEY）に
 * フォールバックする。RANDOM_THEME_KEY自体はTHEME_PRESETSに実体を持たない
 * （実際にどのプリセットを使うかはJS側が毎回ランダムに選ぶ。JavaScript.htmlの
 * resolveThemePresetForSession_参照）。
 */
function normalizeThemeKey_(key) {
  if (key === RANDOM_THEME_KEY) return key;
  var found = THEME_PRESETS.some(function (p) { return p.key === key; });
  return found ? key : DEFAULT_THEME_KEY;
}

/**
 * ログイン中のGoogleアカウントに対応するテーマ設定を読み書きする。
 * PropertiesService.getUserProperties() は「このスクリプト × ログイン中の
 * Googleアカウント」単位で独立した保存領域のため、同じアプリを開いていても
 * 利用者ごとに異なるテーマを保存・復元できる（ロゴ・メール通知先・担当者マスタ・
 * モデル写真のような全利用者共通のシステムマスタとは異なり、Script Propertiesは
 * 使わない）。
 *
 * 動作条件: getCurrentStaffName_ 等と同様、Webアプリのデプロイ設定が
 * 「実行するユーザー: アプリにアクセスするユーザー」になっている必要がある。
 * 「自分」のまま・「全員（匿名可）」のままだと、全利用者が同じUser Properties
 * （デプロイしたアカウントのもの）を共有してしまい、実質的に従来と同じ
 * 「全員共通のテーマ」に戻ってしまう点に注意。
 */
function getCurrentUserThemeKey_() {
  return normalizeThemeKey_(PropertiesService.getUserProperties().getProperty(PROP_KEYS.THEME_KEY));
}

function setCurrentUserThemeKey_(themeKey) {
  PropertiesService.getUserProperties().setProperty(PROP_KEYS.THEME_KEY, normalizeThemeKey_(themeKey));
}

/**
 * GoogleドライブのファイルID、または共有リンク／画像配信URLからファイルIDだけを
 * 抜き出す（純粋関数）。起動画面の画像設定とモデル写真URLの変換で共用する。
 * Bare ID（英数字・ハイフン・アンダースコア 20〜128文字）はそのまま返す。
 */
function extractDriveFileId_(value) {
  value = String(value || '').trim();
  if (!value) return '';
  if (/^[a-zA-Z0-9_-]{20,128}$/.test(value)) return value;
  var match = value.match(/\/file\/d\/([a-zA-Z0-9_-]{20,128})/)
    || value.match(/[?&]id=([a-zA-Z0-9_-]{20,128})/)
    || value.match(/lh3\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]{20,128})/);
  return match ? match[1] : '';
}

/**
 * 起動画面画像の設定値（純粋関数）。空なら未設定。ファイルIDまたは
 * Googleドライブの共有リンクを受け取り、保存するのはファイルIDのみ。
 */
function normalizeLoadingSplashDriveId_(value) {
  value = String(value || '').trim();
  if (!value) return '';
  if (value.length > LOADING_SPLASH_DRIVE_ID_MAX_LENGTH) {
    throw new Error(
      '起動画面の画像の指定が長すぎます（' + value.length + '文字）。' +
      'GoogleドライブのファイルIDまたは共有リンクを指定してください。'
    );
  }
  var id = extractDriveFileId_(value);
  if (!id) {
    throw new Error('起動画面の画像は、GoogleドライブのファイルIDまたは共有リンクを指定してください。');
  }
  return id;
}

/**
 * 保存済みのドライブファイルID（または共有リンク）を、<img src>に使える
 * 直接画像URLへ変換する（純粋関数）。未設定なら空文字。
 */
function loadingSplashImageUrlFromDriveId_(value) {
  var id = extractDriveFileId_(value);
  if (!id) return '';
  return 'https://lh3.googleusercontent.com/d/' + id + '=w' + LOADING_SPLASH_DISPLAY_WIDTH;
}

/**
 * 起動画面の背景色（純粋関数）。ログイン中ユーザーのテーマプリセットの
 * sidebarColorを使う。ランダムテーマの場合は初期プリセットにフォールバックする
 * （抽選結果はクライアント側のセッションでのみ決まるため、最初の描画では
 * 既定色を使う）。
 */
function resolveLoadingSplashBgColor_(themeKey) {
  var key = normalizeThemeKey_(themeKey);
  if (key === RANDOM_THEME_KEY) key = DEFAULT_THEME_KEY;
  for (var i = 0; i < THEME_PRESETS.length; i++) {
    if (THEME_PRESETS[i].key === key) return THEME_PRESETS[i].sidebarColor;
  }
  return THEME_PRESETS[0].sidebarColor;
}

/**
 * doGet／Index.htmlの起動画面用。Script Propertiesに保存したドライブIDから
 * 表示用URLを返す。
 */
function loadingSplashDisplayUrl_() {
  var raw = PropertiesService.getScriptProperties().getProperty(PROP_KEYS.LOADING_SPLASH_DRIVE_ID) || '';
  return loadingSplashImageUrlFromDriveId_(raw);
}

/**
 * doGet／Index.htmlの起動画面用。ログイン中ユーザーのテーマに合わせた背景色。
 */
function loadingSplashBgColor_() {
  return resolveLoadingSplashBgColor_(getCurrentUserThemeKey_());
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
 * Google Chatの受信Webhook URL設定値（純粋関数）。Hold登録・受注確定のたびに
 * このURLへ通知メッセージをPOSTする（NotificationService.gsのsendChatNotification_
 * 参照）。空文字であれば単にGoogle Chat通知をスキップする（メール通知とは独立した
 * 任意設定）。誤ったURL（コピペミス等）をそのまま保存してしまうと通知が届かない
 * ことに気づきにくいため、空でない場合は "https://" で始まることだけ最低限
 * チェックする（Google ChatのWebhook URLはchat.googleapis.com配下だが、
 * 将来的なドメイン変更・プロキシ経由等を想定し、ドメインまでは固定しない）。
 */
function validateChatWebhookUrl_(url) {
  var value = String(url || '').trim();
  if (!value) return '';
  if (value.length > CHAT_WEBHOOK_URL_MAX_LENGTH) {
    throw new Error('Google ChatのWebhook URLが長すぎます（' + value.length + '文字）。');
  }
  if (!/^https:\/\//.test(value)) {
    throw new Error('Google ChatのWebhook URLは https:// から始まるURLを指定してください。');
  }
  return value;
}

/**
 * お知らせ設定値（純粋関数）。ホーム画面の「販売可能リスト」の文字の上に
 * 全利用者向けに表示する、管理者が入力する自由記述の案内文
 * （例:「限定車在庫3台あり」）。1行で目立たせて表示する想定のため、
 * 最大文字数（HOME_ANNOUNCEMENT_MAX_LENGTH）を超える場合はエラーにする。
 * 空文字であれば単に表示しない（JavaScript.htmlのrenderHomeAnnouncement_参照）。
 */
function validateHomeAnnouncement_(text) {
  var value = String(text || '').trim();
  if (value.length > HOME_ANNOUNCEMENT_MAX_LENGTH) {
    throw new Error('お知らせが長すぎます（' + value.length + '文字）。' + HOME_ANNOUNCEMENT_MAX_LENGTH + '文字以内で入力してください。');
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
 * メール通知先1項目分（Hold時／受注確定時／システムエラー通知のいずれか）の正規化
 * （純粋関数）。空文字は除去し、大文字小文字を無視して重複除去したうえ、最大件数
 * （NOTIFY_MAIL_LIST_MAX）・1件あたりの最大文字数（NOTIFY_MAIL_MAX_LENGTH）を超えて
 * いればエラー。担当者マスタ・モデル写真と同じ「配列（順序を保つ）」形式で扱うことで、
 * 設定画面側でリスト形式の追加・削除・ドラッグによる並び替えに対応できるようにしている。
 */
function normalizeMailList_(list) {
  list = Array.isArray(list) ? list : [];
  var seen = {};
  var result = [];
  list.forEach(function (entry) {
    var email = String(entry || '').trim();
    if (!email) return;
    var key = email.toLowerCase();
    if (seen[key]) return;
    seen[key] = true;
    if (email.length > NOTIFY_MAIL_MAX_LENGTH) {
      throw new Error('メールアドレスが長すぎます（' + email.length + '文字）: ' + email);
    }
    result.push(email);
  });
  if (result.length > NOTIFY_MAIL_LIST_MAX) {
    throw new Error('メール通知先は最大' + NOTIFY_MAIL_LIST_MAX + '件までです（現在' + result.length + '件）');
  }
  return result;
}

/**
 * ホーム画面のモデル写真設定を { model, photoUrl, gradePrefix, gradeMarker, bodyType }
 * の配列で返す。モデル名（例: 「CLA Coupe」）ごとに代表写真を1枚登録し、ホーム画面で
 * クリックすると在庫リストが絞り込まれる（車両1台ごとではなくモデル単位で管理する。
 * 個々の車両は在庫の入れ替わりが頻繁なため、車両ごとに写真を管理すると都度
 * アップロード・削除が必要になり運用の手間が大きくなるため）。
 *
 * gradePrefix・gradeMarker は、在庫リストの「モデル」列に実際に入力される値
 * （例: 「CLA18」「CLA18T」。在庫リストのモデル列にはグレード名のみが入力され、
 * 「CLA Coupe」のようなベース名は入力されない運用のため）を自動判定するための条件。
 * グレードを一件ずつ手入力で列挙する代わりに、「①gradePrefixで始まる」「②設定
 * されていればgradeMarkerを、先頭部分を除いた残りに含む」の2条件だけで、ホーム
 * 画面がその場で在庫リストと突き合わせてグレード内訳を計算する
 * （JavaScript.htmlのgradeCountsForEntry_・matchesGradeRule_ / homeGradeFilter参照）。
 * gradeMarkerが未設定の行は、gradePrefixにさえ一致すれば残り全部を拾う「受け皿」に
 * なる（例: 「CLA Coupe」はプレフィックス「CLA」・マーカー空欄で、マーカー「T」を
 * 設定した「CLA Shooting Brake」が横取りしなかった残りをすべて拾う）。
 * gradePrefixが未設定（空文字）の場合は、モデル名そのものを在庫リストのモデル列と
 * 直接照合する従来の挙動にフォールバックする。
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
    return {
      model: (entry && entry.model) || '',
      // 保存済みの値がGoogleドライブの共有リンクのままだった場合（この変換機能が
      // 無かった頃に登録されたものなど）でも、保存し直さなくても表示できるよう、
      // 読み出し時にも変換する（normalizeModelPhotoUrl_はドライブの共有リンク
      // 以外の値には何もしない純粋関数のため、既に直接画像URLの場合や他の
      // ホスティングサービスのURLの場合はそのまま返る）。
      photoUrl: normalizeModelPhotoUrl_((entry && entry.photoUrl) || ''),
      gradePrefix: (entry && entry.gradePrefix) || '',
      gradeMarker: (entry && entry.gradeMarker) || '',
      // ボディタイプ（MODEL_BODY_TYPE_OPTIONSのいずれか）。ホーム画面で
      // 型ごとにグループ表示するために使う（未設定可。normalizeModelPhotos_参照）。
      bodyType: (entry && entry.bodyType) || ''
    };
  });
}

/**
 * Googleドライブの共有リンク（ファイルを右クリック→「リンクを取得」で得られる、
 * ブラウザ用のHTMLビューアページのURL）を、<img>タグでそのまま表示できる直接画像
 * URLに変換する（純粋関数）。共有リンクは以下のような形式：
 *   https://drive.google.com/file/d/{ファイルID}/view?usp=sharing
 *   https://drive.google.com/open?id={ファイルID}
 * これらをそのまま<img src>に指定してもHTMLページが読み込まれるだけで画像としては
 * 表示されないため、ファイルIDを抜き出し、Googleの画像配信ドメイン
 * （lh3.googleusercontent.com）のURLに変換する。末尾に`=w{MODEL_PHOTO_DISPLAY_WIDTH}`
 * を付けることで、Google側のサーバーがその幅にリサイズ済みの画像を返してくれるため、
 * 管理者が写真を登録する際に画像のサイズ・アスペクト比を気にして事前に加工する
 * 必要がない（ホーム画面側は`object-fit: cover`で表示するため、正方形以外の
 * 画像でも問題なくタイルに収まる）。ドライブの共有リンクでない値（他の画像
 * ホスティングサービスのURLや、data URL等）はそのまま返す（変換しない）。
 */
function normalizeModelPhotoUrl_(url) {
  url = String(url || '').trim();
  if (!url || !/drive\.google\.com|docs\.google\.com/.test(url)) return url;
  var match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (!match) return url;
  return 'https://lh3.googleusercontent.com/d/' + match[1] + '=w' + MODEL_PHOTO_DISPLAY_WIDTH;
}

/**
 * モデル写真設定の正規化（純粋関数）。モデル名・写真URLがともに入力されている行のみ残し、
 * モデル名で重複除去したうえ、最大件数（MODEL_PHOTOS_MAX）を超えていればエラー。
 * 写真URLはGoogleドライブの共有リンクであれば直接画像URLに変換する
 * （normalizeModelPhotoUrl_参照）。変換後も長すぎる場合（data URLを直接貼り付けた
 * 場合等）はエラーにする（大きな画像は外部にアップロードしてURLを指定する）。
 * gradePrefix・gradeMarkerも同様にトリムし、1件あたりの最大文字数
 * （MODEL_PHOTO_GRADE_RULE_MAX_LENGTH）をチェックする。gradePrefixが空文字の場合は
 * gradeMarkerも意味を持たないため空文字にそろえる。さらに、件数が多いと合計文字数が
 * Script Propertiesの実際の保存上限を超えうるため、JSON化した全体の文字数
 * （MODEL_PHOTOS_TOTAL_MAX_LENGTH）も別途チェックする。
 */
function normalizeModelPhotos_(list) {
  list = Array.isArray(list) ? list : [];
  var seenModels = {};
  var result = [];
  list.forEach(function (entry) {
    var model = String((entry && entry.model) || '').trim();
    var photoUrl = normalizeModelPhotoUrl_((entry && entry.photoUrl) || '');
    if (!model || !photoUrl) return;
    if (seenModels[model]) return;
    seenModels[model] = true;
    if (photoUrl.length > MODEL_PHOTO_URL_MAX_LENGTH) {
      throw new Error(
        'モデル「' + model + '」の写真URLが長すぎます（' + photoUrl.length + '文字）。' +
        '画像を外部（Googleドライブの共有リンク等）にアップロードしたうえでURLを指定してください。'
      );
    }
    var gradePrefix = String((entry && entry.gradePrefix) || '').trim();
    var gradeMarker = gradePrefix ? String((entry && entry.gradeMarker) || '').trim() : '';
    [
      { label: '先頭の文字列', value: gradePrefix },
      { label: '対象の文字列', value: gradeMarker }
    ].forEach(function (field) {
      if (field.value.length > MODEL_PHOTO_GRADE_RULE_MAX_LENGTH) {
        throw new Error(
          'モデル「' + model + '」の' + field.label + '「' + field.value + '」が長すぎます（' + field.value.length + '文字）。'
        );
      }
    });
    // ボディタイプは選択式（MODEL_BODY_TYPE_OPTIONS）のプルダウンからの入力を想定して
    // いるため、未知の値（改ざん・過去バージョンで保存された値等）は例外にせず、
    // 単に未設定（空文字）として扱う（normalizeThemeKey_と同じ「不正な値は
    // フォールバックする」考え方。型を割り当てていないモデルは、ホーム画面では
    // 「未設定」グループにまとめて表示される）。
    var bodyType = MODEL_BODY_TYPE_OPTIONS.indexOf((entry && entry.bodyType) || '') !== -1 ? entry.bodyType : '';
    result.push({ model: model, photoUrl: photoUrl, gradePrefix: gradePrefix, gradeMarker: gradeMarker, bodyType: bodyType });
  });
  if (result.length > MODEL_PHOTOS_MAX) {
    throw new Error('モデル写真は最大' + MODEL_PHOTOS_MAX + '件までです（現在' + result.length + '件）');
  }
  var totalLength = JSON.stringify(result).length;
  if (totalLength > MODEL_PHOTOS_TOTAL_MAX_LENGTH) {
    throw new Error(
      'モデル写真の登録内容が大きすぎて保存できません（合計' + totalLength + '文字）。' +
      '件数を減らすか、写真URLをより短いもの（短縮URL等）に変更してください。'
    );
  }
  return result;
}

/**
 * Hold登録・2nd Hold登録・受注確定それぞれの完了時に表示する演出（絵柄の
 * アクション）の選択中バリエーション（{ hold, secondHold, order }、各値は
 * CELEBRATION_VARIANT_OPTIONSのいずれか）を返す。未設定・改ざん・過去バージョンで
 * 保存された値は、normalizeThemeKey_と同じ考え方ですべてDEFAULT_CELEBRATION_VARIANTS
 * にフォールバックする。
 */
function getCelebrationVariants_() {
  var raw = PropertiesService.getScriptProperties().getProperty(PROP_KEYS.CELEBRATION_VARIANTS);
  if (!raw) return Object.assign({}, DEFAULT_CELEBRATION_VARIANTS);
  var parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return Object.assign({}, DEFAULT_CELEBRATION_VARIANTS);
  }
  return normalizeCelebrationVariants_(parsed);
}

/**
 * 演出バリエーション設定の正規化（純粋関数）。キーごとに
 * CELEBRATION_VARIANT_OPTIONSに存在しない値は既定値にフォールバックする。
 */
function normalizeCelebrationVariants_(variants) {
  variants = variants || {};
  var result = {};
  Object.keys(DEFAULT_CELEBRATION_VARIANTS).forEach(function (key) {
    var value = variants[key];
    result[key] = CELEBRATION_VARIANT_OPTIONS.indexOf(value) !== -1 ? value : DEFAULT_CELEBRATION_VARIANTS[key];
  });
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

/**
 * 設定タブの「システムマスタ」（ロゴ・モデル写真・メール通知設定・担当者）に
 * アクセスできる管理者かどうかを、メールアドレスがSYSTEM_ADMIN_EMAILS
 * （Constants.gs）に含まれているかで判定する（純粋関数、大文字小文字を無視）。
 * 担当者マスタとは異なり、スプレッドシートや画面からは変更できない、
 * コード上のみの権限管理。
 */
function isSystemAdmin_(email) {
  if (!email) return false;
  var normalized = String(email).trim().toLowerCase();
  return SYSTEM_ADMIN_EMAILS.some(function (adminEmail) {
    return String(adminEmail || '').trim().toLowerCase() === normalized;
  });
}

/**
 * システムマスタ（ロゴ・モデル写真・メール通知設定・担当者）を、管理者以外の
 * ブラウザには送らないようにする（純粋関数）……という処理だが、ロゴ・モデル写真は
 * 例外で、非管理者にも実際の値をそのまま渡す。ロゴはトップバー、モデル写真は
 * ホーム画面のギャラリーとして「全利用者に表示される」データであり、編集画面を
 * 管理者限定にしても表示自体は全員に必要なため（メール通知先・担当者一覧のような
 * 非公開データとは性質が異なる）。UI上でカードを隠すだけでなく、非管理者の
 * 端末にそもそもメールアドレス等のデータ自体を渡さないための処理
 * （Api.gs参照）。
 */
function redactSystemMasterSettings_(settings, isAdmin) {
  settings = settings || {};
  if (isAdmin) return settings;
  return {
    themeKey: settings.themeKey,
    logoUrl: settings.logoUrl,
    loadingSplashDriveId: settings.loadingSplashDriveId,
    notifyHoldMailTo: [],
    notifyOrderMailTo: [],
    notifyErrorMailTo: [],
    notifyChatWebhookUrl: '',
    staffList: [],
    modelPhotos: settings.modelPhotos,
    // Hold登録等の演出バリエーションは、ロゴ・モデル写真と同様に全利用者の
    // 画面で使う（演出を実際に表示するのは操作した本人のブラウザのため）。
    // 編集画面（設定タブ）自体は管理者限定にするが、値自体は非管理者にも渡す。
    celebrationVariants: settings.celebrationVariants,
    // お知らせも、ロゴ・モデル写真・演出バリエーションと同様に全利用者の
    // ホーム画面に表示する値のため、編集画面は管理者限定にしつつ値自体は
    // 非管理者にも渡す。
    homeAnnouncement: settings.homeAnnouncement
  };
}

/**
 * 保存時、システムマスタ（ロゴ・モデル写真・メール通知設定・担当者）は管理者以外
 * からの変更を無視し、既存の保存値（current）をそのまま維持する（純粋関数）。
 * テーマ（着せ替えプリセット）は管理者限定にしていないため、非管理者からの
 * 変更もそのまま反映する。管理者判定はコード上のSYSTEM_ADMIN_EMAILSのみで
 * 行うため、非管理者のクライアントから送られてきたシステムマスタ項目は
 * 信用しない（Api.gs参照）。
 */
function applySystemMasterGuard_(incoming, current, isAdmin) {
  incoming = incoming || {};
  current = current || {};
  if (isAdmin) return incoming;
  return {
    themeKey: incoming.themeKey,
    logoUrl: current.logoUrl,
    loadingSplashDriveId: current.loadingSplashDriveId,
    notifyHoldMailTo: current.notifyHoldMailTo,
    notifyOrderMailTo: current.notifyOrderMailTo,
    notifyErrorMailTo: current.notifyErrorMailTo,
    notifyChatWebhookUrl: current.notifyChatWebhookUrl,
    staffList: current.staffList,
    modelPhotos: current.modelPhotos,
    celebrationVariants: current.celebrationVariants,
    homeAnnouncement: current.homeAnnouncement
  };
}
