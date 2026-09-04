/**
 * SearchService.gs
 * 在庫リスト・受注リストの検索・グループ表示ロジック（純粋関数）。
 * 画面の検索は html/JavaScript.html が全件取得後に同じ規則でクライアント側絞り込みする。
 * このファイルの関数は API・テスト・（必要なら）サーバー側フィルタ用。
 */

/**
 * 在庫リストの検索・絞り込み。
 * @param {Array<Object>} vehicles
 * @param {Object} filters {
 *   keyword: string,            // モデルは先頭の車種記号で固定（C→C20/C18。CLE/CLAは含まない）。
 *                               // コミッション・外装色・備考は部分一致（英字のみの車種記号はモデルだけ）
 *   includeHold: boolean,       // false の場合 Hold済み車両を除く
 *   exteriorColor: string,      // ボディカラー（外装）の完全一致（前後空白は無視）
 *   registrableMonth: string,   // 正規化後の可能月（YYYY-MM）。過去月は thisMonth に集約した値で比較
 *   thisMonth: string           // 当月（YYYY-MM）。registrableMonth フィルタ時に必要
 * }
 */
function searchInventory(vehicles, filters) {
  filters = filters || {};
  var thisMonth = filters.thisMonth || '';
  var monthFilter = filters.registrableMonth ? normalizeYearMonth_(filters.registrableMonth) : '';
  var colorFilter = String(filters.exteriorColor || '').trim();
  return vehicles.filter(function (v) {
    if (filters.includeHold === false && v.holdStatus === HOLD_STATUS.HOLD) return false;
    if (filters.keyword && !matchesListKeyword_(v, filters.keyword, ['model', 'commission', 'exteriorColor', 'remarks'])) return false;
    if (colorFilter && String(v.exteriorColor || '').trim() !== colorFilter) return false;
    if (monthFilter) {
      var effective = effectiveRegistrableMonth_(v.registrableMonth, thisMonth);
      if (effective !== monthFilter) return false;
    }
    return true;
  });
}

/**
 * 可能月の表記ゆれを YYYY-MM に正規化する（純粋関数）。
 * スプレッドシートが日付セルとして保持した場合、rowToObject_ は yyyy-MM-dd
 * （例: 2026-08-01）に変換する一方、テキストで「2026-08」と入っている行はそのまま
 * 残るため、同じ月がプルダウンに二重表示されていた。日付・スラッシュ・「年/月」
 * 表記も年月だけ取り出して揃える。
 * @param {*} value
 * @return {string} 'YYYY-MM' または空文字
 */
function normalizeYearMonth_(value) {
  if (value === null || value === undefined || value === '') return '';
  var s = String(value).trim();
  if (!s) return '';
  var m = s.match(/^(\d{4})[-/\.年](\d{1,2})(?:[-/\.月日](\d{1,2}))?/);
  if (!m) return '';
  var month = Number(m[2]);
  if (!month || month < 1 || month > 12) return '';
  return m[1] + '-' + (month < 10 ? '0' + month : String(month));
}

/**
 * 表示・並び・絞り込みに使う「実効可能月」。過去月は当月へ集約する
 * （期限の過ぎた車両はいま登録できる、という現場運用）。
 * @param {*} value
 * @param {string} thisMonth YYYY-MM
 * @return {string} YYYY-MM または空文字
 */
function effectiveRegistrableMonth_(value, thisMonth) {
  var normalized = normalizeYearMonth_(value);
  if (!normalized) return '';
  if (thisMonth && normalized < thisMonth) return thisMonth;
  return normalized;
}

/**
 * 可能月プルダウン用の選択肢（当月＋未来月のみ、重複なし・昇順）。
 * 過去月は当月へ集約されるため、ここには出てこない。当月は在庫が無くても常に含める。
 * @param {Array<Object>} items
 * @param {string} thisMonth YYYY-MM
 * @return {Array<string>}
 */
function collectRegistrableMonthOptions_(items, thisMonth) {
  var seen = {};
  var months = [];
  (items || []).forEach(function (v) {
    var m = effectiveRegistrableMonth_(v.registrableMonth, thisMonth);
    if (!m || seen[m]) return;
    seen[m] = true;
    months.push(m);
  });
  if (thisMonth && !seen[thisMonth]) {
    months.push(thisMonth);
  }
  months.sort();
  return months;
}

/**
 * 在庫の外装色（ボディカラー）プルダウン用の選択肢（空欄除外・重複なし・昇順）。
 * @param {Array<Object>} items
 * @return {Array<string>}
 */
function collectExteriorColorOptions_(items) {
  var seen = {};
  var colors = [];
  (items || []).forEach(function (v) {
    var color = String(v.exteriorColor || '').trim();
    if (!color) return;
    var key = color.toLowerCase();
    if (seen[key]) return;
    seen[key] = true;
    colors.push(color);
  });
  colors.sort(function (a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
  });
  return colors;
}

/**
 * 在庫リストを実効可能月でグループ化する（第1階層）。未設定は末尾。
 * グループ内の並びはモデル名の昇順。
 * @param {Array<Object>} items
 * @param {string} thisMonth YYYY-MM
 * @return {Array<{key: string, items: Array<Object>}>}
 */
function groupInventoryByRegistrableMonth_(items, thisMonth) {
  var map = {};
  var order = [];
  (items || []).forEach(function (item) {
    var key = effectiveRegistrableMonth_(item.registrableMonth, thisMonth) || '未設定';
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
  return order.map(function (key) {
    var grouped = map[key].slice().sort(function (a, b) {
      var am = String(a.model || '');
      var bm = String(b.model || '');
      if (am !== bm) return am < bm ? -1 : 1;
      return String(a.commission || '') < String(b.commission || '') ? -1 : 1;
    });
    return { key: key, items: grouped };
  });
}

/**
 * 備考に「完成検査切」が含まれるか（純粋関数）。在庫カードの薄いグレー背景に使う。
 * @param {*} remarks
 * @return {boolean}
 */
function hasInspectionCutRemark_(remarks) {
  return String(remarks || '').indexOf(INSPECTION_CUT_REMARK) !== -1;
}

/**
 * 可能月グループ見出し用のラベル。
 * @param {string} key YYYY-MM または '未設定'
 * @param {string} thisMonth YYYY-MM
 * @return {string}
 */
function registrableMonthGroupTitle_(key, thisMonth) {
  if (!key || key === '未設定') return '可能月 未設定';
  if (thisMonth && key === thisMonth) return '可能月 ' + key + '（当月登録可能）';
  return '可能月 ' + key;
}

/**
 * 受注リストの検索・絞り込み。
 * @param {Array<Object>} orders
 * @param {Object} filters {
 *   keyword: string,        // 自由検索。モデルは在庫と同じ車種記号の先頭一致
 *   salesLocation: string,  // 販売拠点に部分一致（拠点ごとの検索）
 *   staff: string           // 担当者に完全一致（担当者マスタから選択。担当者ごとの検索）
 * }
 */
function searchOrders(orders, filters) {
  filters = filters || {};
  return orders.filter(function (o) {
    if (filters.keyword && !matchesListKeyword_(o, filters.keyword, ['model', 'commission', 'customer', 'staff', 'salesLocation'])) return false;
    if (filters.salesLocation && !fieldContains_(o.salesLocation, filters.salesLocation)) return false;
    if (filters.staff && String(o.staff || '').trim() !== String(filters.staff).trim()) return false;
    return true;
  });
}

/**
 * 受注リストの「登録月」を YYYY-MM に揃える。
 * スプレッドシートが日付セルだと rowToObject_ が yyyy-MM-dd にするため、
 * 「2026-08」と「2026-08-01」が別グループに分かれないようにする。
 * 正規化できない値（空・自由記述）はそのまま残し、空はグループ化時に「未設定」になる。
 */
function normalizeOrdersRegisteredMonth_(orders) {
  return (orders || []).map(function (o) {
    var normalized = normalizeYearMonth_(o.registeredMonth);
    if (normalized) o.registeredMonth = normalized;
    return o;
  });
}

/**
 * Gクラス予約リストの検索・絞り込み（閲覧専用リストのため、キーワード検索のみ）。
 * @param {Array<Object>} items
 * @param {Object} filters { keyword: string } // モデルは車種記号の先頭一致。コミッション・リード番号・顧客・担当者は部分一致
 */
function searchGClassReservations_(items, filters) {
  filters = filters || {};
  return items.filter(function (v) {
    if (filters.keyword && !matchesListKeyword_(v, filters.keyword, ['model', 'commission', 'leadNumber', 'customer', 'staff'])) return false;
    return true;
  });
}

/**
 * 在庫のモデル名から先頭の英字車種記号を切り出す（C20T→C、CLE53→CLE、G400d→G）。
 * 数字の前までが系列。日本語モデル名は空文字。
 */
function modelSeriesLetters_(model) {
  var m = String(model || '').trim().toUpperCase().replace(/\s+/g, '');
  var match = m.match(/^([A-Z]+)/);
  return match ? match[1] : '';
}

/**
 * 「C」は C20 / C18 / C20T に当て、CLE / CLA には当てない。
 * キーワードが数字を含む（C20）ときは C20・C20T・C200 など接頭辞一致。
 */
function modelSeriesPrefixMatches_(model, keyword) {
  var m = String(model || '').trim().toUpperCase().replace(/\s+/g, '');
  var kw = String(keyword || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!m || !kw) return false;
  if (m.indexOf(kw) !== 0) return false;
  var rest = m.slice(kw.length);
  if (!rest) return true;
  if (/\d/.test(kw)) return true;
  return /^[0-9]/.test(rest);
}

function isLatinModelCodeKeyword_(keyword) {
  return /^[A-Za-z][A-Za-z0-9]*$/.test(String(keyword || '').trim());
}

function isLettersOnlyLatinKeyword_(keyword) {
  return /^[A-Za-z]+$/.test(String(keyword || '').trim());
}

function fieldContainsInsensitive_(value, needle) {
  var n = String(needle || '').trim().toLowerCase();
  if (!n) return true;
  return String(value || '').toLowerCase().indexOf(n) !== -1;
}

/**
 * リストのキーワード一致。英字の車種記号（C / CLE / C20）はモデルの先頭系列で固定し、
 * 「C」が CLE やコミッション C001 に部分一致しないようにする。
 * それ以外（色・備考・日本語モデル名）は大文字小文字を無視した部分一致。
 */
function matchesListKeyword_(item, keyword, fields) {
  var kw = String(keyword || '').trim();
  if (!kw) return true;
  fields = fields || [];
  var hasModel = fields.indexOf('model') !== -1;
  if (isLatinModelCodeKeyword_(kw)) {
    if (hasModel && modelSeriesPrefixMatches_(item.model, kw)) return true;
    if (isLettersOnlyLatinKeyword_(kw)) return false;
    return fields.some(function (f) {
      if (f === 'model') return false;
      return fieldContainsInsensitive_(item[f], kw);
    });
  }
  return fields.some(function (f) { return fieldContainsInsensitive_(item[f], kw); });
}

function matchesAnyField_(item, keyword, fields) {
  return matchesListKeyword_(item, keyword, fields);
}

function fieldContains_(value, needle) {
  var n = String(needle).trim();
  if (!n) return true;
  return fieldContainsInsensitive_(value, n);
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
