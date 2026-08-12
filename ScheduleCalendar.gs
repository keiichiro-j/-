/**
 * ScheduleCalendar.gs
 * カレンダー描画・イベント集計に関する純粋関数群（外部サービス非依存。Node.js からもテスト可能）。
 */

/**
 * "yyyy-MM-dd" を "ローカル日付" として Date に変換する（UTC変換によるずれを避けるため new Date(str) は使わない）。
 */
function parseDateStr_(dateStr) {
  var parts = dateStr.split('-').map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function formatDateStr_(date) {
  var y = date.getFullYear();
  var m = String(date.getMonth() + 1).padStart(2, '0');
  var d = String(date.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}

/**
 * 指定年月のカレンダーグリッド（日曜始まり・6週42マス）を生成する。
 * @return {Array<{date:string, day:number, inMonth:boolean, isToday:boolean}>}
 */
function buildCalendarGrid_(year, month, todayStr) {
  var first = new Date(year, month - 1, 1);
  var startOffset = first.getDay(); // 0=日曜
  var gridStart = new Date(year, month - 1, 1 - startOffset);

  var cells = [];
  for (var i = 0; i < 42; i++) {
    var d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    var dateStr = formatDateStr_(d);
    cells.push({
      date: dateStr,
      day: d.getDate(),
      inMonth: d.getMonth() === (month - 1) && d.getFullYear() === year,
      isToday: !!todayStr && dateStr === todayStr
    });
  }
  return cells;
}

/**
 * イベント配列を支局フィルタで絞り込む。office 指定のないイベント（弊社休日等）は常に含める。
 */
function filterEventsByOffice_(events, officeFilter) {
  if (!officeFilter) return events;
  return events.filter(function (e) {
    return !e.office || e.office === officeFilter;
  });
}

/**
 * イベント配列を日付ごとにグルーピングし、種別優先度順にソートする。
 * @return {Object<string, Array>} date -> events[]
 */
function groupEventsByDate_(events, typeOrder) {
  var order = typeOrder || SCHEDULE_EVENT_TYPE_ORDER;
  var map = {};
  events.forEach(function (e) {
    if (!map[e.date]) map[e.date] = [];
    map[e.date].push(e);
  });
  Object.keys(map).forEach(function (date) {
    map[date].sort(function (a, b) {
      return order.indexOf(a.type) - order.indexOf(b.type);
    });
  });
  return map;
}

/**
 * 1セルに表示するタグ配列と省略件数を計算する。
 */
function limitCellTags_(events, maxTags) {
  var max = maxTags || SCHEDULE_MAX_TAGS_PER_CELL;
  if (events.length <= max) return { shown: events, overflow: 0 };
  return { shown: events.slice(0, max), overflow: events.length - max };
}
