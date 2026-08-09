/**
 * EmailService.gs
 * 送付書PDFのメール送信。指定した送付日の第１便〜第３便分（取消済みを除く）を
 * まとめて添付し、指定した宛先へ送信する。
 */

var MAIL_RECIPIENTS_PROP_KEY = 'mailRecipients';

/**
 * 前回送信時に使ったメールアドレスを取得する（毎回の入力の手間を減らすため、
 * スクリプト全体で共通の設定として保存する。ユーザーごとの区別はしない）。
 * @return {Array<string>}
 */
function getSavedMailRecipients_() {
  var raw = PropertiesService.getScriptProperties().getProperty(MAIL_RECIPIENTS_PROP_KEY);
  if (!raw) return [];
  try {
    var parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function saveMailRecipients_(recipients) {
  PropertiesService.getScriptProperties().setProperty(MAIL_RECIPIENTS_PROP_KEY, JSON.stringify(recipients));
}

/**
 * file.getUrl() が返すDriveの共有URL("https://drive.google.com/file/d/<ID>/view?...")から
 * ファイルIDを取り出す。html/JavaScript.html側の同名関数と同じロジック
 * （サーバー側でPDFファイル本体を取得するために必要）。
 */
function driveFileIdFromUrl_(url) {
  var m = /\/d\/([^\/]+)/.exec(url || '');
  return m ? m[1] : null;
}

/**
 * 空欄を除去し、簡易的な形式チェックを行った上でメールアドレスの配列を返す。
 * 不正な入力があれば例外を投げる（サーバー側検証、SPEC.md 5章の方針に合わせる）。
 * @return {Array<string>}
 */
function validateMailRecipients_(recipients) {
  var trimmed = (recipients || [])
    .map(function (r) { return String(r || '').trim(); })
    .filter(function (r) { return r !== ''; });

  if (trimmed.length === 0) {
    throw new Error('送信先メールアドレスを1件以上入力してください');
  }

  var invalid = trimmed.filter(function (r) { return !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r); });
  if (invalid.length > 0) {
    throw new Error('メールアドレスの形式が正しくありません: ' + invalid.join(', '));
  }

  return trimmed;
}

/**
 * 指定した送付日に発行された全便(第１便〜第３便、取消済みは除く)の送付書PDFを
 * 添付ファイルとしてまとめ、指定した宛先へメール送信する。
 * @param {Spreadsheet} ss
 * @param {string} sendDate "YYYY-MM-DD"
 * @param {Array<string>} recipients メールアドレスの配列(最大4件を想定)
 * @return {{sentCount: number, recipientCount: number}}
 */
function sendPdfsByEmail_(ss, sendDate, recipients) {
  if (!isValidDateStr_(sendDate)) {
    throw new Error('送付日を正しく指定してください');
  }
  var validRecipients = validateMailRecipients_(recipients);

  var submissions = getPdfsBySendDateRange_(ss, sendDate, sendDate, '')
    .filter(function (s) { return s.status !== SUBMISSION_STATUS_CANCELLED && s.pdfUrl; });

  if (submissions.length === 0) {
    throw new Error('指定した送付日に発行済みの送付書PDFが見つかりませんでした（取消済みを除く）');
  }

  var attachments = [];
  submissions.forEach(function (s) {
    var fileId = driveFileIdFromUrl_(s.pdfUrl);
    if (!fileId) return;
    try {
      attachments.push(DriveApp.getFileById(fileId).getBlob());
    } catch (e) {
      // 削除済み等で取得できないPDFはスキップし、他の分の送信は続行する
    }
  });

  if (attachments.length === 0) {
    throw new Error('添付できる送付書PDFが見つかりませんでした');
  }

  var dateLabel = Utilities.formatDate(parseDateOnly_(sendDate), TIMEZONE, 'yyyy/MM/dd');
  var batchCounts = {};
  submissions.forEach(function (s) {
    var b = s.sendBatch || '未指定';
    batchCounts[b] = (batchCounts[b] || 0) + 1;
  });
  var batchLines = Object.keys(batchCounts).sort().map(function (b) {
    return '・' + b + '：' + batchCounts[b] + '件';
  });

  var subject = dateLabel + ' 送付書PDF（' + attachments.length + '件）';
  var body =
    dateLabel + ' に発行された送付書PDFを添付します。\n\n' +
    batchLines.join('\n') + '\n\n' +
    '※このメールは新車新規登録依頼書 発行システムから自動送信されています。';

  MailApp.sendEmail({
    to: validRecipients.join(','),
    subject: subject,
    body: body,
    attachments: attachments
  });

  saveMailRecipients_(validRecipients);

  return { sentCount: attachments.length, recipientCount: validRecipients.length };
}
