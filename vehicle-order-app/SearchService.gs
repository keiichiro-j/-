/**
 * SearchService.gs
 * 販売リスト・受注リストの検索・グループ表示ロジック（純粋関数）。
 */

/**
 * 販売リストの検索・絞り込み。
 * @param {Array<Object>} vehicles
 * @param {Object} filters {
 *   keyword: string,       // 車種・モデル・コミッションに部分一致
 *   includeHold: boolean   // false の場合 Hold済み車両を除く
 * }
 */
function searchInventory(vehicles, filters) {
  filters = filters || {};
  return vehicles.filter(function (v) {
    if (filters.includeHold === false && v.holdStatus === HOLD_STATUS.HOLD) return false;
    if (filters.keyword && !matchesAnyField_(v, filters.keyword, ['carType', 'model', 'commission'])) return false;
    return true;
  });
}

/**
 * 受注リストの検索・絞り込み（車種・モデル・顧客名・担当）。
 */
function searchOrders(orders, filters) {
  filters = filters || {};
  return orders.filter(function (o) {
    if (filters.keyword && !matchesAnyField_(o, filters.keyword, ['carType', 'model', 'customer', 'staff'])) return false;
    return true;
  });
}

function matchesAnyField_(item, keyword, fields) {
  var kw = String(keyword).trim();
  if (!kw) return true;
  return fields.some(function (f) { return item[f] && String(item[f]).indexOf(kw) !== -1; });
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
