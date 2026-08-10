/**
 * DashboardService.gs
 * 申請ダッシュボード。指定した月に「送付」した送付書PDFを、使用者名とあわせて一覧で返す。
 * 送付日はフォームの必須項目のため（登録日と違い未確定になり得ない）、この一覧には
 * その月に送付した申請が漏れなく含まれる。
 */

/**
 * @param {Spreadsheet} ss
 * @param {string} month "YYYY-MM"
 * @param {Object} filters
 *   @param {string} [filters.brand] "MB"|"AU" を指定すると、該当ブランドの車両を含む申請だけに絞り込む(空文字ならすべて)
 * @return {Object} { month, totalSubmissions, entries }
 */
function getDashboardData_(ss, month, filters) {
  filters = filters || {};
  if (!/^\d{4}-\d{2}$/.test(month || '')) {
    throw new Error('対象月を正しく指定してください');
  }

  var monthStart = month + '-01';
  var daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  var monthEnd = month + '-' + String(daysInMonth).padStart(2, '0');

  var header = HISTORY_HEADER_ROW;
  var idx = {
    submissionId: header.indexOf('submissionId'),
    type: header.indexOf('種別'),
    company: header.indexOf('依頼会社名'),
    sendDate: header.indexOf('送付日'),
    sendBatch: header.indexOf('送付便'),
    userName: header.indexOf('使用者名'),
    brand: header.indexOf('ブランド'),
    pdfUrl: header.indexOf('送付書PDF'),
    status: header.indexOf('状態')
  };

  // 送付日が対象月に入っている行を、全ての履歴タブ(登録日未定タブを含む)から集め、
  // 申請(submissionId)単位にまとめる。送付日は必須項目のため、登録日と違って
  // 「登録日未定」タブの行もここでは漏れなく拾える。
  var bySubmission = {};
  getAllHistoryTabNames_(ss).forEach(function (name) {
    getHistoryEntries_(ss, name).rows.forEach(function (row) {
      var sendDateStr = row[idx.sendDate];
      if (!isValidDateStr_(sendDateStr)) return;
      if (sendDateStr < monthStart || sendDateStr > monthEnd) return;

      var id = row[idx.submissionId];
      if (!bySubmission[id]) {
        bySubmission[id] = {
          submissionId: id,
          sendDate: sendDateStr,
          sendBatch: row[idx.sendBatch] || '',
          type: row[idx.type] || '',
          company: row[idx.company] || '',
          userNames: [],
          brands: {},
          pdfUrl: row[idx.pdfUrl] || '',
          status: row[idx.status] || SUBMISSION_STATUS_ACTIVE
        };
      }
      if (row[idx.userName]) bySubmission[id].userNames.push(row[idx.userName]);
      bySubmission[id].brands[row[idx.brand] || '未設定'] = true;
    });
  });

  var entries = Object.keys(bySubmission).map(function (id) { return bySubmission[id]; });

  if (filters.brand) {
    entries = entries.filter(function (e) { return !!e.brands[filters.brand]; });
  }

  entries.forEach(function (e) {
    e.brandList = Object.keys(e.brands);
    delete e.brands;
  });

  entries.sort(function (a, b) {
    if (a.sendDate !== b.sendDate) return a.sendDate > b.sendDate ? -1 : 1; // 送付日の新しい順
    return a.submissionId < b.submissionId ? -1 : (a.submissionId > b.submissionId ? 1 : 0);
  });

  return {
    month: month,
    totalSubmissions: entries.length,
    entries: entries
  };
}
