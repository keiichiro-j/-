/**
 * DashboardService.gs
 * 月次ダッシュボード集計。指定した月(登録日ベース)の車両行を、
 * ブランド(MB/AU)・種別(OSS/紙)別に集計し、日別の推移も返す。
 */

/**
 * 指定した月の履歴タブ(+任意で「登録日未定」タブ)を対象に集計する。
 * @param {Spreadsheet} ss
 * @param {string} month "YYYY-MM"
 * @param {Object} filters
 *   @param {string} [filters.brand] "MB"|"AU"|"未設定" を指定すると絞り込む(空文字ならすべて)
 *   @param {string} [filters.type] "OSS"|"紙" を指定すると絞り込む(空文字ならすべて)
 *   @param {boolean} [filters.includeCancelled] 取消済みの行も集計に含めるか(既定false)
 *   @param {boolean} [filters.includePending] 「登録日未定」タブの行も含めるか(既定false)
 * @return {Object} 集計結果
 */
function getDashboardData_(ss, month, filters) {
  filters = filters || {};
  if (!/^\d{4}-\d{2}$/.test(month || '')) {
    throw new Error('対象月を正しく指定してください');
  }

  var header = HISTORY_HEADER_ROW;
  var idx = {
    submissionId: header.indexOf('submissionId'),
    type: header.indexOf('種別'),
    regDate: header.indexOf('登録日'),
    userName: header.indexOf('使用者名'),
    brand: header.indexOf('ブランド'),
    company: header.indexOf('依頼会社名'),
    status: header.indexOf('状態')
  };

  // 月次タブを名前で直接引くのではなく、履歴確認画面と同じロジック(登録日の実際の値で
  // 全タブを横断して絞り込む getHistoryEntriesByDateRange_)を使う。こうすることで、
  // 履歴確認画面に表示される内容と常に一致し、タブ名の想定外のずれの影響も受けない。
  var monthStart = month + '-01';
  var daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  var monthEnd = month + '-' + String(daysInMonth).padStart(2, '0');
  var rows = getHistoryEntriesByDateRange_(ss, monthStart, monthEnd, filters.includePending).rows;

  rows = rows.filter(function (row) {
    if (!filters.includeCancelled && row[idx.status] === SUBMISSION_STATUS_CANCELLED) return false;
    var brand = row[idx.brand] || '未設定';
    if (filters.brand && brand !== filters.brand) return false;
    if (filters.type && row[idx.type] !== filters.type) return false;
    return true;
  });

  var byBrand = { MB: 0, AU: 0, '未設定': 0 };
  var byType = { OSS: 0, '紙': 0 };
  var matrix = {
    OSS: { MB: 0, AU: 0, '未設定': 0 },
    '紙': { MB: 0, AU: 0, '未設定': 0 }
  };
  var submissionIds = {};
  var cancelledVehicles = 0;
  var dailyCountsMap = {};

  rows.forEach(function (row) {
    var brand = row[idx.brand] || '未設定';
    var type = (row[idx.type] === TYPE_PAPER) ? TYPE_PAPER : TYPE_OSS;

    byBrand[brand] = (byBrand[brand] || 0) + 1;
    byType[type] = (byType[type] || 0) + 1;
    matrix[type][brand] = (matrix[type][brand] || 0) + 1;

    if (row[idx.submissionId]) submissionIds[row[idx.submissionId]] = true;
    if (row[idx.status] === SUBMISSION_STATUS_CANCELLED) cancelledVehicles++;

    var regDateStr = row[idx.regDate];
    if (isValidDateStr_(regDateStr)) {
      dailyCountsMap[regDateStr] = (dailyCountsMap[regDateStr] || 0) + 1;
    }
  });

  var dailyCounts = Object.keys(dailyCountsMap).sort().map(function (d) {
    return { date: d, count: dailyCountsMap[d] };
  });

  // 登録者一覧(使用者名・登録日)。登録日が新しい順、登録日未定は末尾にまとめる。
  var entries = rows.map(function (row) {
    var regDateStr = row[idx.regDate];
    return {
      regDate: isValidDateStr_(regDateStr) ? regDateStr : '',
      userName: row[idx.userName] || '',
      brand: row[idx.brand] || '未設定',
      type: (row[idx.type] === TYPE_PAPER) ? TYPE_PAPER : TYPE_OSS,
      company: row[idx.company] || '',
      status: row[idx.status] || SUBMISSION_STATUS_ACTIVE
    };
  }).sort(function (a, b) {
    if (!a.regDate && !b.regDate) return a.userName < b.userName ? -1 : (a.userName > b.userName ? 1 : 0);
    if (!a.regDate) return 1;
    if (!b.regDate) return -1;
    if (a.regDate !== b.regDate) return a.regDate > b.regDate ? -1 : 1;
    return a.userName < b.userName ? -1 : (a.userName > b.userName ? 1 : 0);
  });

  return {
    month: month,
    totalVehicles: rows.length,
    totalSubmissions: Object.keys(submissionIds).length,
    cancelledVehicles: cancelledVehicles,
    byBrand: byBrand,
    byType: byType,
    matrix: matrix,
    dailyCounts: dailyCounts,
    entries: entries
  };
}
