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
 * ホーム画面のモデル写真設定を { model, photoUrl, grades } の配列で返す。
 * モデル名（例: 「Aクラス」）ごとに代表写真を1枚登録し、ホーム画面でクリックすると
 * 在庫リストが絞り込まれる（車両1台ごとではなくモデル単位で管理する。個々の車両は
 * 在庫の入れ替わりが頻繁なため、車両ごとに写真を管理すると都度アップロード・削除が
 * 必要になり運用の手間が大きくなるため）。
 *
 * grades は、在庫リストの「モデル」列に実際に入力される値（例: 「A180」「A35」「A45」。
 * 在庫リストのモデル列にはグレード名のみが入力され、「Aクラス」のようなベース名は
 * 入力されない運用のため）の一覧。ホーム画面ではこれをもとに、ベースモデル1行の中で
 * グレードごとの在庫台数を内訳表示し、クリック時もこのグレード一覧に一致する車両を
 * まとめて絞り込む（JavaScript.htmlのgradeCountsForEntry_ / homeGradeFilter参照）。
 * 未設定（空配列）の場合は、モデル名そのものを在庫リストのモデル列と直接照合する
 * 従来の挙動にフォールバックする。
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
      photoUrl: (entry && entry.photoUrl) || '',
      grades: Array.isArray(entry && entry.grades) ? entry.grades : []
    };
  });
}

/**
 * モデル写真設定の正規化（純粋関数）。モデル名・写真URLがともに入力されている行のみ残し、
 * モデル名で重複除去したうえ、最大件数（MODEL_PHOTOS_MAX）を超えていればエラー。
 * 写真URLが長すぎる場合（data URLを直接貼り付けた場合等）もエラーにする
 * （大きな画像は外部にアップロードしてURLを指定する）。グレード一覧（grades）も
 * 同様に、空文字除去・重複除去・最大件数（MODEL_PHOTO_GRADES_MAX）・1件あたりの
 * 最大文字数（MODEL_PHOTO_GRADE_MAX_LENGTH）をチェックする。
 * さらに、1件あたりの上限内でも件数が多いと合計文字数がScript Propertiesの
 * 実際の保存上限を超えうるため、JSON化した全体の文字数（MODEL_PHOTOS_TOTAL_MAX_LENGTH）
 * も別途チェックする。
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
    var rawGrades = Array.isArray(entry && entry.grades) ? entry.grades : [];
    var seenGrades = {};
    var grades = [];
    rawGrades.forEach(function (g) {
      var grade = String(g || '').trim();
      if (!grade || seenGrades[grade]) return;
      seenGrades[grade] = true;
      if (grade.length > MODEL_PHOTO_GRADE_MAX_LENGTH) {
        throw new Error(
          'モデル「' + model + '」のグレード「' + grade + '」が長すぎます（' + grade.length + '文字）。'
        );
      }
      grades.push(grade);
    });
    if (grades.length > MODEL_PHOTO_GRADES_MAX) {
      throw new Error(
        'モデル「' + model + '」のグレードは最大' + MODEL_PHOTO_GRADES_MAX + '件までです（現在' + grades.length + '件）'
      );
    }
    result.push({ model: model, photoUrl: photoUrl, grades: grades });
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
 * 設定タブの「システムマスタ」（メール通知設定・担当者）にアクセスできる
 * 管理者かどうかを、メールアドレスがSYSTEM_ADMIN_EMAILS（Constants.gs）に
 * 含まれているかで判定する（純粋関数、大文字小文字を無視）。担当者マスタとは
 * 異なり、スプレッドシートや画面からは変更できない、コード上のみの権限管理。
 */
function isSystemAdmin_(email) {
  if (!email) return false;
  var normalized = String(email).trim().toLowerCase();
  return SYSTEM_ADMIN_EMAILS.some(function (adminEmail) {
    return String(adminEmail || '').trim().toLowerCase() === normalized;
  });
}

/**
 * システムマスタ（メール通知設定・担当者）を、管理者以外のブラウザには
 * 送らないようにする（純粋関数）。UI上でカードを隠すだけでなく、非管理者の
 * 端末にそもそもメールアドレス等のデータ自体を渡さないための処理
 * （Api.gs参照）。
 */
function redactSystemMasterSettings_(settings, isAdmin) {
  settings = settings || {};
  if (isAdmin) return settings;
  return {
    themeColor: settings.themeColor,
    textColor: settings.textColor,
    logoUrl: settings.logoUrl,
    notifyHoldMailTo: '',
    notifyOrderMailTo: '',
    notifyErrorMailTo: '',
    staffList: [],
    modelPhotos: settings.modelPhotos
  };
}

/**
 * 保存時、システムマスタ（メール通知設定・担当者）は管理者以外からの変更を
 * 無視し、既存の保存値（current）をそのまま維持する（純粋関数）。管理者判定は
 * コード上のSYSTEM_ADMIN_EMAILSのみで行うため、非管理者のクライアントから
 * 送られてきた値は信用しない（Api.gs参照）。
 */
function applySystemMasterGuard_(incoming, current, isAdmin) {
  incoming = incoming || {};
  current = current || {};
  if (isAdmin) return incoming;
  return {
    themeColor: incoming.themeColor,
    textColor: incoming.textColor,
    logoUrl: incoming.logoUrl,
    notifyHoldMailTo: current.notifyHoldMailTo,
    notifyOrderMailTo: current.notifyOrderMailTo,
    notifyErrorMailTo: current.notifyErrorMailTo,
    staffList: current.staffList,
    modelPhotos: incoming.modelPhotos
  };
}
