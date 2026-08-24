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
    themeKey: normalizeThemeKey_(props.getProperty(PROP_KEYS.THEME_KEY)),
    logoUrl: props.getProperty(PROP_KEYS.LOGO_URL) || '',
    notifyHoldMailTo: getMailList_(PROP_KEYS.NOTIFY_HOLD_MAIL_TO),
    notifyOrderMailTo: getMailList_(PROP_KEYS.NOTIFY_ORDER_MAIL_TO),
    notifyErrorMailTo: getMailList_(PROP_KEYS.NOTIFY_ERROR_MAIL_TO),
    staffList: getStaffList_(),
    modelPhotos: getModelPhotos_()
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
  props.setProperty(PROP_KEYS.THEME_KEY, normalizeThemeKey_(settings && settings.themeKey));
  props.setProperty(PROP_KEYS.LOGO_URL, logoUrl);
  props.setProperty(PROP_KEYS.NOTIFY_HOLD_MAIL_TO, JSON.stringify(normalizeMailList_(settings.notifyHoldMailTo)));
  props.setProperty(PROP_KEYS.NOTIFY_ORDER_MAIL_TO, JSON.stringify(normalizeMailList_(settings.notifyOrderMailTo)));
  props.setProperty(PROP_KEYS.NOTIFY_ERROR_MAIL_TO, JSON.stringify(normalizeMailList_(settings.notifyErrorMailTo)));
  props.setProperty(PROP_KEYS.STAFF_LIST, JSON.stringify(normalizeStaffList_(settings.staffList)));
  props.setProperty(PROP_KEYS.MODEL_PHOTOS, JSON.stringify(normalizeModelPhotos_(settings.modelPhotos)));
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
 * テーマの着せ替えプリセットキー（純粋関数）。THEME_PRESETS（Constants.gs）に
 * 存在しないキー（未設定・改ざん・過去バージョンで保存された値など）は、
 * すべて初期プリセット（DEFAULT_THEME_KEY）にフォールバックする。
 */
function normalizeThemeKey_(key) {
  var found = THEME_PRESETS.some(function (p) { return p.key === key; });
  return found ? key : DEFAULT_THEME_KEY;
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
      // 保存済みの値がGoogleドライブの共有リンクのままだった場合（この変換機能が
      // 無かった頃に登録されたものなど）でも、保存し直さなくても表示できるよう、
      // 読み出し時にも変換する（normalizeModelPhotoUrl_はドライブの共有リンク
      // 以外の値には何もしない純粋関数のため、既に直接画像URLの場合や他の
      // ホスティングサービスのURLの場合はそのまま返る）。
      photoUrl: normalizeModelPhotoUrl_((entry && entry.photoUrl) || ''),
      grades: Array.isArray(entry && entry.grades) ? entry.grades : [],
      // ボディタイプ（Sedan/SUV/Station Wagon/Compact/Coupeのいずれか）。ホーム画面で
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
 * グレード一覧（grades）も同様に、空文字除去・重複除去・最大件数
 * （MODEL_PHOTO_GRADES_MAX）・1件あたりの最大文字数（MODEL_PHOTO_GRADE_MAX_LENGTH）
 * をチェックする。さらに、1件あたりの上限内でも件数が多いと合計文字数がScript
 * Propertiesの実際の保存上限を超えうるため、JSON化した全体の文字数
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
    // ボディタイプは選択式（MODEL_BODY_TYPE_OPTIONS）のプルダウンからの入力を想定して
    // いるため、未知の値（改ざん・過去バージョンで保存された値等）は例外にせず、
    // 単に未設定（空文字）として扱う（normalizeThemeKey_と同じ「不正な値は
    // フォールバックする」考え方。型を割り当てていないモデルは、ホーム画面では
    // 「未設定」グループにまとめて表示される）。
    var bodyType = MODEL_BODY_TYPE_OPTIONS.indexOf((entry && entry.bodyType) || '') !== -1 ? entry.bodyType : '';
    result.push({ model: model, photoUrl: photoUrl, grades: grades, bodyType: bodyType });
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
    notifyHoldMailTo: [],
    notifyOrderMailTo: [],
    notifyErrorMailTo: [],
    staffList: [],
    modelPhotos: settings.modelPhotos
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
    notifyHoldMailTo: current.notifyHoldMailTo,
    notifyOrderMailTo: current.notifyOrderMailTo,
    notifyErrorMailTo: current.notifyErrorMailTo,
    staffList: current.staffList,
    modelPhotos: current.modelPhotos
  };
}
