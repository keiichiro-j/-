/**
 * SearchService.gs
 * 10.2 検索・絞り込み強化
 *
 * 拠点切替表示・3拠点横断表示のどちらでも利用できるよう、対象データ（1拠点分 or 全社分）を
 * 呼び出し側から渡し、条件でフィルタする方式にする。
 */

/**
 * @param {Array<Object>} vehicles 検索対象の車両オブジェクト配列
 * @param {Object} filters {
 *   keyword: string,          // 車種/モデル/車台番号/OCN/登録番号(4項目・結合表記)に部分一致
 *   carType: string,
 *   status: string,
 *   staff: string,
 *   expiryFrom: 'yyyy-MM-dd',
 *   expiryTo: 'yyyy-MM-dd',
 *   sortBy: 'inspectionExpiryDate' | 'purchaseDate' | ...
 *   sortOrder: 'asc' | 'desc'
 * }
 */
function searchVehicles(vehicles, filters) {
  filters = filters || {};
  var result = vehicles.filter(function (v) {
    if (filters.carType && v.carType !== filters.carType) return false;
    if (filters.status && v.status !== filters.status) return false;
    if (filters.staff && v.staff !== filters.staff) return false;
    if (filters.expiryFrom && (!v.inspectionExpiryDate || v.inspectionExpiryDate < filters.expiryFrom)) return false;
    if (filters.expiryTo && (!v.inspectionExpiryDate || v.inspectionExpiryDate > filters.expiryTo)) return false;
    if (filters.keyword && !matchesKeyword(v, filters.keyword)) return false;
    return true;
  });

  if (filters.sortBy) {
    var order = filters.sortOrder === 'desc' ? -1 : 1;
    result.sort(function (a, b) {
      var av = a[filters.sortBy] || '';
      var bv = b[filters.sortBy] || '';
      if (av < bv) return -1 * order;
      if (av > bv) return 1 * order;
      return 0;
    });
  }
  return result;
}

/**
 * キーワードが 車種／モデル／車台番号／OCN／登録番号(4項目 or 結合表記) のいずれかに
 * 部分一致するかを判定する（純粋関数）。
 */
function matchesKeyword(vehicle, keyword) {
  var kw = String(keyword).trim();
  if (!kw) return true;
  var fields = [vehicle.carType, vehicle.model, vehicle.chassisNumber, vehicle.ocn, vehicle.supplier];
  var directHit = fields.some(function (f) { return f && String(f).indexOf(kw) !== -1; });
  if (directHit) return true;
  return matchesRegistrationNumber(vehicle, kw);
}

/**
 * 登録番号（地域／分類番号／ひらがな／一連番号）検索。
 * 4項目のいずれかへの部分一致、または結合表記（例: "岐阜301は2000"、
 * "岐阜 301 は 2000"）への部分一致でヒットする。
 */
function matchesRegistrationNumber(vehicle, keyword) {
  var parts = [vehicle.plateRegion, vehicle.plateClass, vehicle.plateKana, vehicle.plateNumber]
    .map(function (p) { return p ? String(p) : ''; });
  if (parts.some(function (p) { return p && p.indexOf(keyword) !== -1; })) return true;

  var joinedNoSpace = parts.join('');
  var joinedWithSpace = parts.join(' ');
  var kwNoSpace = keyword.replace(/\s/g, '');
  return joinedNoSpace.indexOf(kwNoSpace) !== -1 || joinedWithSpace.indexOf(keyword) !== -1;
}
