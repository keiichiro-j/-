/**
 * SearchService.gs
 * 在庫リスト・受注リストの検索・グループ表示ロジック（純粋関数）。
 */

/**
 * 在庫リストの検索・絞り込み。
 * @param {Array<Object>} vehicles
 * @param {Object} filters {
 *   keyword: string,       // モデル・コミッション・OCN・車台番号・下4桁・登録番号に部分一致
 *                           // （モデルはアルファベットのみのキーワードの場合、先頭の
 *                           // アルファベット部分との完全一致に限定。「C」で「C63」「C43T」は
 *                           // ヒットするが「CLA」「GLC」はヒットしない）
 *   includeHold: boolean   // false の場合 Hold済み車両を除く
 * }
 */
function searchInventory(vehicles, filters) {
  filters = filters || {};
  return vehicles.filter(function (v) {
    if (filters.includeHold === false && v.holdStatus === HOLD_STATUS.HOLD) return false;
    if (filters.keyword && !inventoryMatchesKeyword_(v, filters.keyword)) return false;
    return true;
  });
}

/**
 * 在庫のキーワード検索用マッチ判定。コミッション・OCN・車台番号・下4桁・登録番号は
 * 従来どおり部分一致。モデルは「CLA」「GLC」等のクラス名が「C」等の部分文字列を
 * 含んでしまう問題を避けるため、アルファベットのみのキーワード（グレード名の先頭、
 * 例: 「C」「E」「GLC」）に限りモデル名先頭のアルファベット部分との完全一致とする
 * （現場からの要望）。数字を含むキーワード（「C63」等）や日本語キーワードは
 * 従来どおり部分一致にフォールバックする。
 * @param {Object} v
 * @param {string} keyword
 * @return {boolean}
 */
function inventoryMatchesKeyword_(v, keyword) {
  var kw = String(keyword || '').trim();
  if (!kw) return true;
  if (modelMatchesKeyword_(v.model, kw)) return true;
  return matchesAnyField_(v, kw, ['commission', 'ocn', 'chassisNumberLast4', 'plateRegion', 'plateClass', 'plateKana', 'plateNumber']);
}

function modelMatchesKeyword_(model, keyword) {
  var modelStr = String(model || '');
  if (/^[A-Za-z]+$/.test(keyword)) {
    var m = modelStr.match(/^[A-Za-z]+/);
    var prefix = m ? m[0] : '';
    return prefix.toLowerCase() === keyword.toLowerCase();
  }
  return modelStr.indexOf(keyword) !== -1;
}

/**
 * 受注リストの検索・絞り込み。
 * @param {Array<Object>} orders
 * @param {Object} filters {
 *   keyword: string,        // モデル・コミッション・顧客名・担当・販売拠点に部分一致（自由検索）
 *   salesLocation: string,  // 販売拠点に部分一致（拠点ごとの検索）
 *   staff: string           // 担当者に完全一致（担当者マスタから選択。担当者ごとの検索）
 * }
 */
function searchOrders(orders, filters) {
  filters = filters || {};
  return orders.filter(function (o) {
    if (filters.keyword && !matchesAnyField_(o, filters.keyword, ['model', 'commission', 'customer', 'staff', 'salesLocation'])) return false;
    if (filters.salesLocation && !fieldContains_(o.salesLocation, filters.salesLocation)) return false;
    if (filters.staff && o.staff !== filters.staff) return false;
    return true;
  });
}

function matchesAnyField_(item, keyword, fields) {
  var kw = String(keyword).trim();
  if (!kw) return true;
  return fields.some(function (f) { return item[f] && String(item[f]).indexOf(kw) !== -1; });
}

function fieldContains_(value, needle) {
  var n = String(needle).trim();
  if (!n) return true;
  return !!value && String(value).indexOf(n) !== -1;
}

/**
 * groupKey（arrivalExpectedDate / model / salesLocation 等）ごとにグループ化する。
 * グループキーの昇順（未設定は末尾）で並べた [{ key, items }] を返す。
 */
function groupByField_(items, groupKey) {
  var map = {};
  var order = [];
  items.forEach(function (item) {
    var key = item[groupKey] || '未設定';
    if (!map[key]) {
      map[key] = [];
      order.push(key);
    }
    map[key].push(item);
  });
  order.sort(function (a, b) {
    if (a === '未設定') return 1;
    if (b === '未設定') return -1;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  return order.map(function (key) { return { key: key, items: map[key] }; });
}
