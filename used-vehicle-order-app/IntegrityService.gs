/**
 * IntegrityService.gs
 * 在庫リストのデータ整合性チェック機能
 *
 * 在庫の追加・編集はスプレッドシートへ直接行う運用のため、手作業ならではの
 * ミス（コミッションの重複貼り付け、モデル名の記入漏れ、Holdステータス欄への
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

  var seenCommissions = {};
  var duplicateCommissions = {};
  vehicles.forEach(function (v) {
    var key = String(v.commission || '').trim();
    if (!key) return;
    if (seenCommissions[key]) duplicateCommissions[key] = true;
    seenCommissions[key] = true;
  });
  Object.keys(duplicateCommissions).sort().forEach(function (c) {
    issues.push({ type: 'duplicateCommission', ocn: '', message: 'コミッション「' + c + '」が複数の行に重複しています' });
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
