/**
 * SetupService.gs
 * スプレッドシートの初期セットアップ（在庫リスト・Holdリスト・受注リスト・
 * 変更履歴の4タブを自動生成）。
 *
 * 元データスプレッドシート（xlsx）を手作業でアップロード・貼り付けする代わりに、
 * 任意の空のGoogleスプレッドシートに本プロジェクトをコンテナバインドした状態で
 * setupSpreadsheet_() を一度実行するだけで、必要な4タブ・ヘッダー・入力規則
 * （選択式の列のドロップダウン）・列ヘッダーの説明メモ・コミッション列の書式
 * （先頭0保持）・時間主導トリガーまで一括で整えられる（Constants.gsの
 * INVENTORY_COLUMNS / HOLD_COLUMNS / ORDER_COLUMNS / AUDIT_LOG_COLUMNSの
 * 列定義から自動生成するため、今後アプリ側に列が追加された場合もコード変更は
 * Constants.gs側だけで済む）。
 *
 * 既存のシートがある場合は作り直さない（getOrCreateSheet_ はシートが無いときだけ
 * ヘッダー・入力規則・説明メモを書き込むため、既存データ・書式はそのまま保持される）。
 * 本機能追加より前にセットアップ済みの既存スプレッドシートに、入力規則・説明メモ
 * だけを後から反映したい場合は applySelectValidationsAndNotes_ を使う。
 */

/**
 * 在庫リスト・Holdリスト・受注リスト・変更履歴を作成し、Hold期限チェックの
 * 時間主導トリガーをセットアップする。GASエディタから手動実行するか、
 * スプレッドシートのメニュー「販売可能リスト」→「初期セットアップ」からも
 * 実行できる（onOpen参照）。
 */
function setupSpreadsheet_() {
  getInventorySheet_();
  getHoldsSheet_();
  getOrderSheet_();
  getAuditLogSheet_();
  setupTimeDrivenTriggers_();

  var message = '在庫リスト・Holdリスト・受注リスト・変更履歴の4タブを準備しました' +
    '（既存のシートがあればそのまま利用し、上書きはしていません）。' +
    '選択式の列にはドロップダウンの入力規則を、列見出しには入力形式の説明メモを' +
    '設定済みです。Hold期限チェックの時間主導トリガーも設定済みです。';
  Logger.log(message);
  return message;
}

/**
 * 既存のスプレッドシートの「ステア」列に保存済みの「右」「左」を「R」「L」へ
 * 一括変換する一回限りのメンテナンス関数（formatCommissionColumnsAsText_と同じ
 * 位置づけ）。ステア列を持つ在庫リスト・受注リストが対象。「右」「左」以外の値
 * （空欄・既にR/Lへ変換済み等）はそのまま変更しない。
 */
function migrateSteeringToRL_() {
  var targets = [
    [getInventorySheet_(), INVENTORY_COLUMNS],
    [getOrderSheet_(), ORDER_COLUMNS]
  ];
  var converted = 0;
  targets.forEach(function (pair) {
    var sheet = pair[0];
    var colIndex1 = buildColIndex_(pair[1])['steering'] + 1;
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return;
    var range = sheet.getRange(2, colIndex1, lastRow - 1, 1);
    var values = range.getValues();
    var changed = false;
    for (var i = 0; i < values.length; i++) {
      if (values[i][0] === '右') { values[i][0] = 'R'; changed = true; converted++; }
      else if (values[i][0] === '左') { values[i][0] = 'L'; changed = true; converted++; }
    }
    if (changed) range.setValues(values);
  });

  var message = 'ステア列の「右」「左」を「R」「L」へ' + converted + '件変換しました' +
    '（在庫リスト・受注リストが対象）。';
  Logger.log(message);
  return message;
}

/**
 * 既存のスプレッドシートに対して、選択式の列の入力規則（ドロップダウン）と
 * 列見出しの説明メモを後から反映し直す一回限りのメンテナンス関数
 * （formatCommissionColumnsAsText_と同じ位置づけ）。本機能追加より前に
 * setupSpreadsheet_() を実行済みだったスプレッドシートは、これらが無いまま
 * 作成されているため、スクリプトエディタまたはスプレッドシートのメニューから
 * 一度だけ実行する。既存のシート・データは変更しない（ヘッダー行のメモと、
 * 2行目以降の入力規則のみを追加・上書きする）。
 */
function applySelectValidationsAndNotes_() {
  [
    [getInventorySheet_(), INVENTORY_COLUMNS],
    [getHoldsSheet_(), HOLD_COLUMNS],
    [getOrderSheet_(), ORDER_COLUMNS],
    [getAuditLogSheet_(), AUDIT_LOG_COLUMNS]
  ].forEach(function (pair) {
    applySelectValidations_(pair[0], pair[1]);
    applyHeaderNotes_(pair[0], pair[1]);
  });

  var message = '在庫リスト・Holdリスト・受注リスト・変更履歴の入力規則・列見出しの説明メモを設定しました。';
  Logger.log(message);
  return message;
}

/**
 * 「在庫リスト・設定・ログインユーザーが何も表示されない」という問い合わせの多くは、
 * 以下のいずれかが原因：
 *   (1) このスクリプトが、データを貼り付けたスプレッドシートに「コンテナバインド」
 *       されていない（スタンドアロンのスクリプトとして作成したため、
 *       SpreadsheetApp.getActiveSpreadsheet() が対象のスプレッドシートを指せない）。
 *   (2) 「在庫リスト」という名前のタブが無い、またはヘッダー行の列順が
 *       INVENTORY_COLUMNS（Constants.gs）とズレている。
 *   (3) 各行の「ＯＣＮ」列が空欄（readAllRows_はＯＣＮ列が空の行を
 *       「末尾の空行」とみなして無条件にスキップするため、1台も表示されなくなる）。
 *   (4) Session.getActiveUser().getEmail() が空文字（Webアプリのデプロイ設定
 *       「実行するユーザー」「アクセスできるユーザー」が原因）。
 *
 * 2通りの実行方法どちらでも結果を確認できるようにしている:
 *   A. スプレッドシートのメニュー「販売可能リスト」→「在庫データの読み込み状況を確認」
 *      から実行 → ポップアップで結果を表示。
 *   B. Apps Scriptエディタの関数選択プルダウンでこの関数を選んで直接「実行」
 *      （スプレッドシートを開いていなくてもよい）→ ポップアップは出せないため、
 *      エディタ下部の「実行ログ」に結果が出る。
 * どちらの方法で実行したかに関わらず必ずLogger.logと戻り値の両方に結果を残すため、
 * ブラウザの開発者ツールが使えない・見方が分からない場合でも原因を確認できる。
 */
function diagnoseInventoryData_() {
  var lines = [];

  // ----- (4) ログイン中のGoogleアカウント -----
  var email = '';
  try {
    email = Session.getActiveUser().getEmail() || '';
  } catch (e) {
    lines.push('❌ Session.getActiveUser() の呼び出し自体でエラー: ' + e.message);
  }
  if (email) {
    lines.push('✅ ログイン中のGoogleアカウント: ' + email);
    lines.push('　　管理者（SYSTEM_ADMIN_EMAILS）: ' + (isSystemAdmin_(email) ? 'はい' : 'いいえ'));
  } else {
    lines.push('❌ ログイン中のGoogleアカウントのメールアドレスを取得できません（空文字）。');
    lines.push('　　Webアプリのデプロイ設定を確認してください: 「実行するユーザー」を');
    lines.push('　　「アプリにアクセスするユーザー」にし、「アクセスできるユーザー」を');
    lines.push('　　個人のGoogleアカウントなら「Googleアカウントを持つ全員」、');
    lines.push('　　Google Workspaceなら「組織内のユーザー」にする必要があります');
    lines.push('　　（「全員（匿名ユーザーを含む）」だとログイン自体が発生しないため空になります）。');
    lines.push('　　※ この関数をApps Scriptエディタから直接実行した場合も同様に空になります');
    lines.push('　　　（エディタ実行は常にスクリプト所有者自身として動くため）。これは異常では');
    lines.push('　　　ありません。実際のWebアプリ（.../exec のURL）で確認してください。');
  }
  lines.push('');

  // ----- (1)〜(3) 在庫リスト -----
  var ss;
  try {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  } catch (e) {
    ss = null;
  }
  if (!ss) {
    lines.push('❌ このスクリプトは、いま開いているスプレッドシートに紐づいていません。');
    lines.push('対処: データを貼り付けたスプレッドシートを開き、「拡張機能」→「Apps Script」から');
    lines.push('このプロジェクトのファイル一式を配置し直してください（スタンドアロンで作成した');
    lines.push('プロジェクトをそのまま使うことはできません）。');
    return finishDiagnosis_(lines);
  }
  lines.push('✅ スプレッドシート「' + ss.getName() + '」に紐づいています。');

  var sheet = ss.getSheetByName(SHEET_NAMES.INVENTORY);
  if (!sheet) {
    lines.push('');
    lines.push('❌ 「' + SHEET_NAMES.INVENTORY + '」という名前のタブが見つかりません。');
    lines.push('タブ名が完全に一致している必要があります（前後の空白・全角半角の違いも不可）。');
    lines.push('スプレッドシートのメニュー「販売可能リスト」→「初期セットアップ」を実行すると');
    lines.push('正しい名前・列見出しのタブを自動作成できます。');
    return finishDiagnosis_(lines);
  }
  lines.push('✅ 「' + SHEET_NAMES.INVENTORY + '」タブが見つかりました。');

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  var expectedHeaders = INVENTORY_COLUMNS.map(function (c) { return c.label; });
  var actualHeaders = lastCol > 0 ? sheet.getRange(1, 1, 1, Math.min(lastCol, expectedHeaders.length)).getValues()[0] : [];
  var headerMismatches = [];
  expectedHeaders.forEach(function (label, i) {
    if (String(actualHeaders[i] || '').trim() !== label) {
      headerMismatches.push('列' + (i + 1) + ': 期待値「' + label + '」 / 実際「' + (actualHeaders[i] || '(空欄)') + '」');
    }
  });
  if (headerMismatches.length) {
    lines.push('');
    lines.push('❌ 1行目の見出し（ヘッダー）が、コード側の列定義（Constants.gsのINVENTORY_COLUMNS）と');
    lines.push('ズレています。アプリは列の「位置（何列目か）」でデータを読み書きするため、');
    lines.push('見出しの並び順がズレていると値が正しく読み込めません。');
    headerMismatches.slice(0, 8).forEach(function (m) { lines.push('　・' + m); });
    if (headerMismatches.length > 8) lines.push('　・他 ' + (headerMismatches.length - 8) + '件');
    lines.push('');
    lines.push('対処: 既存のタブを削除し、スプレッドシートのメニュー「販売可能リスト」→');
    lines.push('「初期セットアップ」で正しい列順のタブを作り直してから、データを貼り付け直して');
    lines.push('ください（1行目の見出し行はそのままに、2行目以降にデータだけ貼り付けます）。');
    return finishDiagnosis_(lines);
  }
  lines.push('✅ 1行目の見出しは列定義どおりです。');

  if (lastRow < 2) {
    lines.push('');
    lines.push('❌ 2行目以降にデータがありません（見出し行のみです）。');
    lines.push('2行目から実際の車両データを貼り付けてください。');
    return finishDiagnosis_(lines);
  }

  var ocnCol1 = inventoryColIndex1('ocn');
  var ocnValues = sheet.getRange(2, ocnCol1, lastRow - 1, 1).getValues();
  var filled = ocnValues.filter(function (row) { return String(row[0] || '').trim() !== ''; }).length;
  lines.push('✅ データ行数（見出しを除く）: ' + (lastRow - 1) + '行');
  lines.push('');
  if (filled === 0) {
    lines.push('❌ 「ＯＣＮ」列（' + ocnCol1 + '列目）がすべての行で空欄です。');
    lines.push('この列はアプリが在庫の有無を判定するための必須キーで、空欄の行は「データが無い行」として');
    lines.push('自動的に除外されるため、1台も表示されません（コミッションは任意入力のため、この判定には');
    lines.push('使いません）。各行に一意のＯＣＮを入力してください。');
  } else if (filled < lastRow - 1) {
    lines.push('⚠️ 「ＯＣＮ」列が入力されている行は ' + filled + ' / ' + (lastRow - 1) + ' 行です。');
    lines.push('空欄の行はアプリの一覧に表示されません。表示されない行があれば、その行の');
    lines.push('ＯＣＮ欄を確認してください。');
  } else {
    lines.push('✅ 全' + filled + '行に「ＯＣＮ」が入力されています。この内容であれば');
    lines.push('在庫リストに表示されるはずです。それでも表示されない場合は、ブラウザの');
    lines.push('開発者ツールのConsoleタブに赤いエラーが出ていないかご確認ください。');
  }
  return finishDiagnosis_(lines);
}

/**
 * diagnoseInventoryData_の結果をLogger.log（実行ログ）と戻り値の両方に残したうえで、
 * 可能であればポップアップでも表示する（スプレッドシートのメニューから実行した場合）。
 * Apps Scriptエディタから直接実行した場合はUIが無くSpreadsheetApp.getUi()が例外を
 * 投げるため、その場合は静かに無視してLogger.log／戻り値だけで確認できるようにする。
 */
function finishDiagnosis_(lines) {
  var message = lines.join('\n');
  Logger.log(message);
  try {
    SpreadsheetApp.getUi().alert('読み込み状況の診断結果', message, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    // Apps Scriptエディタから直接実行した場合はUIが無いため、ここには来るが無視してよい。
    // 結果はLogger.log済み・戻り値としても返しているため、実行ログか戻り値で確認できる。
  }
  return message;
}

/**
 * コンテナバインドのスプレッドシートを開いたときに、セットアップ用のメニューを追加する
 * （単純トリガー）。スタンドアロン運用の場合は動作しないため、GASエディタから
 * setupSpreadsheet_() を直接実行すればよい。
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('販売可能リスト')
    .addItem('初期セットアップ（4タブを作成）', 'setupSpreadsheet_')
    .addItem('在庫データの読み込み状況を確認', 'diagnoseInventoryData_')
    .addItem('入力規則・列見出しの説明メモを再設定', 'applySelectValidationsAndNotes_')
    .addItem('ＯＣＮ・コミッション列を書式なしテキストに再設定', 'formatCommissionColumnsAsText_')
    .addItem('ステア列の「右/左」を「R/L」へ一括変換', 'migrateSteeringToRL_')
    .addToUi();
}
