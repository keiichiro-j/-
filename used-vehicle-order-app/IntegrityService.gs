/**
 * IntegrityService.gs
 * 在庫リストのデータ整合性チェック機能
 *
 * 在庫の追加・編集はスプレッドシートへ直接行う運用のため、手作業ならではの
 * ミス（登録番号の重複貼り付け、モデル名の記入漏れ、Holdステータス欄への
 * 想定外の値の入力等）がアプリ側の検知なしに紛れ込む可能性がある。
 * アプリ起動時（api_checkInventoryIntegrity）にチェックし、問題があれば
 * 画面上部にバナーで警告する（JavaScript.html参照）。あくまで警告であり、
 * 操作自体をブロックすることはない。
 */

/**
 * 在庫データの整合性をチェックする（純粋関数）。在庫の有無はＯＣＮ列で判定する
 * ため（listInventory参照）、ここに渡ってくる車両は必ずＯＣＮが入力済みであり、
 * 各行の識別表示にはコミッション（任意入力で空欄になり得る）ではなくＯＣＮを使う。
 * @param {Array<Object>} vehicles
 * @return {Array<{type: string, ocn: string, message: string}>}
 */
function checkInventoryIntegrity_(vehicles) {
  vehicles = vehicles || [];
  var issues = [];

  var seenOcns = {};
  var duplicateOcns = {};
  vehicles.forEach(function (v) {
    var key = String(v.ocn || '').trim();
    if (!key) return;
    if (seenOcns[key]) duplicateOcns[key] = true;
    seenOcns[key] = true;
  });
  Object.keys(duplicateOcns).sort().forEach(function (o) {
    issues.push({ type: 'duplicateOcn', ocn: o, message: 'ＯＣＮ「' + o + '」が複数の行に重複しています' });
  });

  // コミッションは任意入力の内部IDで、車両によっては同じ値になり得るため
  // 重複チェックの対象にしない（現場からの要望）。代わりに、車両を一意に
  // 特定できる登録番号（地域＋分類番号＋ひらがな＋一連番号）の重複を検出する。
  var seenPlates = {};
  var duplicatePlates = {};
  vehicles.forEach(function (v) {
    var key = plateKey_(v);
    if (!key) return;
    if (seenPlates[key]) duplicatePlates[key] = true;
    seenPlates[key] = true;
  });
  Object.keys(duplicatePlates).sort().forEach(function (key) {
    issues.push({
      type: 'duplicatePlateNumber', ocn: '',
      message: '登録番号「' + key.split('|').join(' ') + '」が複数の行に重複しています'
    });
  });

  var validHoldStatuses = [HOLD_STATUS.AVAILABLE, HOLD_STATUS.HOLD, '', null, undefined];
  vehicles.forEach(function (v) {
    if (!v.model || !String(v.model).trim()) {
      issues.push({ type: 'missingModel', ocn: v.ocn || '', message: 'ＯＣＮ「' + (v.ocn || '(空欄)') + '」の行にモデル名がありません' });
    }
    if (validHoldStatuses.indexOf(v.holdStatus) === -1) {
      issues.push({ type: 'unknownHoldStatus', ocn: v.ocn || '', message: 'ＯＣＮ「' + (v.ocn || '(空欄)') + '」のHoldステータス「' + v.holdStatus + '」は不明な値です' });
    }
  });

  return issues;
}

/**
 * 登録番号（地域／分類番号／ひらがな／一連番号）を重複チェック用のキーへ変換する
 * （純粋関数）。4マスすべてが空欄の行（未入力）は対象外として空文字を返す。
 */
function plateKey_(v) {
  var parts = [v.plateRegion, v.plateClass, v.plateKana, v.plateNumber].map(function (p) {
    return String(p || '').trim();
  });
  if (!parts.some(function (p) { return p; })) return '';
  return parts.join('|');
}
