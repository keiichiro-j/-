/**
 * tests/run.js
 * ビルド済み(dist/*.js)の中から、外部サービス（Calendar/Drive/Gmail/Spreadsheet等）に
 * 依存しない純粋ロジックのみを Node.js の vm サンドボックスへ読み込み、単体テストする。
 * 実行前に `npm run build` が必要。実行: npm test
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const DIST = path.join(__dirname, '..', 'dist');

if (!fs.existsSync(DIST)) {
  console.error('dist/ が見つかりません。先に `npm run build` を実行してください。');
  process.exit(1);
}

// DriveService の ACCESS_MAP/PERMISSION_MAP は namespace 直下（IIFE実行時）で
// DriveApp.Access / DriveApp.Permission を参照するため、テスト対象外の値だけ最小限スタブする。
const sandbox = {
  DriveApp: {
    Access: { ANYONE: 'A', ANYONE_WITH_LINK: 'AL', DOMAIN: 'D', DOMAIN_WITH_LINK: 'DL', PRIVATE: 'P' },
    Permission: { VIEW: 'V', EDIT: 'E', COMMENT: 'C', NONE: 'N' },
  },
};
vm.createContext(sandbox);

const FILES = [
  'theme.js',
  'eventCategory.js',
  'services/dateUtils.js',
  'services/userSettingsService.js',
  'services/globalSettingsService.js',
  'services/calendarService.js',
  'services/mailService.js',
  'services/appLedger.js',
  'services/driveService.js',
];

FILES.forEach((file) => {
  const code = fs.readFileSync(path.join(DIST, file), 'utf8');
  vm.runInContext(code, sandbox, { filename: file });
});

let pass = 0;
let fail = 0;
function test(name, fn) {
  try {
    fn();
    pass++;
    console.log('  ok - ' + name);
  } catch (e) {
    fail++;
    console.error('  NG - ' + name);
    console.error('       ' + e.message);
  }
}

console.log('== Theme: yiqLuminance / pickTextColor ==');
test('白は明るい(YIQ高)', () => assert.ok(sandbox.Theme.yiqLuminance('#ffffff') > 250));
test('黒は暗い(YIQ低)', () => assert.ok(sandbox.Theme.yiqLuminance('#000000') < 5));
test('アンティークゴールド(#FDD835)は暗い文字色', () => assert.strictEqual(sandbox.Theme.pickTextColor('#FDD835'), '#1a1a1a'));
test('インクネイビー(#3949AB)は明るい文字色', () => assert.strictEqual(sandbox.Theme.pickTextColor('#3949AB'), '#ffffff'));

console.log('== Theme: pickTheme（擬似乱数固定） ==');
test('候補12色(11+ランダム1)から決定的に選べる', () => {
  // randomFn は [ボーナス色抽選, テーマ抽選] の順で2回呼ばれる
  let call = 0;
  const values = [0.0, 0.999]; // ボーナス色は先頭、テーマは12候補の最後(ボーナス色自身)
  const theme = sandbox.Theme.pickTheme(() => values[call++]);
  assert.strictEqual(theme.hex, sandbox.Theme.RANDOM_POOL[0].hex);
});
test('候補数は常に11色パレット+1(ボーナス)の12通りの中から選ばれる', () => {
  const theme = sandbox.Theme.pickTheme(() => 0.5);
  const allHex = sandbox.Theme.PALETTE_11.map((c) => c.hex).concat(sandbox.Theme.RANDOM_POOL.map((c) => c.hex));
  assert.ok(allHex.indexOf(theme.hex) !== -1);
});

console.log('== Theme: listChoices / resolveTheme（設定画面の12択） ==');
test('選択肢は11色 + ランダムの合計12件', () => {
  const choices = sandbox.Theme.listChoices();
  assert.strictEqual(choices.length, 12);
  assert.strictEqual(choices.filter((c) => c.hex === null).length, 1);
});
test('固定色を選ぶとその色がそのまま適用される', () => {
  const theme = sandbox.Theme.resolveTheme('インクネイビー');
  assert.strictEqual(theme.hex, '#3949AB');
  assert.strictEqual(theme.textColor, '#ffffff');
});
test('"random"または未知の値はランダム抽選にフォールバックする', () => {
  const theme = sandbox.Theme.resolveTheme('random', () => 0.5);
  const allHex = sandbox.Theme.PALETTE_11.map((c) => c.hex).concat(sandbox.Theme.RANDOM_POOL.map((c) => c.hex));
  assert.ok(allHex.indexOf(theme.hex) !== -1);
});

console.log('== UserSettingsService: sanitizeWidgets（ウィジェットの配置・サイズ設定） ==');
test('未指定時は4種類のウィジェットが既定値で揃う', () => {
  const widgets = sandbox.UserSettingsService.sanitizeWidgets(undefined);
  assert.strictEqual(JSON.stringify(widgets.map((w) => w.id)), JSON.stringify(['calendar', 'today', 'mail', 'links']));
  assert.strictEqual(widgets[0].column, 'main');
  assert.strictEqual(widgets[0].size, 'large');
});
test('不正なid・重複したidは無視される', () => {
  const widgets = sandbox.UserSettingsService.sanitizeWidgets([
    { id: 'calendar', column: 'side', size: 'small', visible: false },
    { id: 'calendar', column: 'main', size: 'large', visible: true },
    { id: 'unknown', column: 'main', size: 'large', visible: true }
  ]);
  assert.strictEqual(widgets.filter((w) => w.id === 'calendar').length, 1);
  assert.strictEqual(widgets[0].column, 'side');
  assert.strictEqual(widgets[0].visible, false);
});
test('欠けているウィジェットは末尾に既定値で補完される', () => {
  const widgets = sandbox.UserSettingsService.sanitizeWidgets([
    { id: 'mail', column: 'main', size: 'small', visible: true }
  ]);
  assert.strictEqual(JSON.stringify(widgets.map((w) => w.id)), JSON.stringify(['mail', 'calendar', 'today', 'links']));
});
test('不正なcolumn/sizeは既定値にフォールバック', () => {
  const widgets = sandbox.UserSettingsService.sanitizeWidgets([
    { id: 'links', column: 'nonsense', size: 'huge', visible: true }
  ]);
  const links = widgets.filter((w) => w.id === 'links')[0];
  assert.strictEqual(links.column, 'side');
  assert.strictEqual(links.size, 'medium');
});

console.log('== UserSettingsService: sanitize ==');
test('themeChoiceは有効な色名かrandomのみ許可、それ以外はrandomにフォールバック', () => {
  assert.strictEqual(sandbox.UserSettingsService.sanitize({ themeChoice: 'ボヤージュブルー' }).themeChoice, 'ボヤージュブルー');
  assert.strictEqual(sandbox.UserSettingsService.sanitize({ themeChoice: 'nonsense' }).themeChoice, 'random');
  assert.strictEqual(sandbox.UserSettingsService.sanitize({}).themeChoice, 'random');
});
test('mailCountは1〜20にクランプされる', () => {
  assert.strictEqual(sandbox.UserSettingsService.sanitize({ mailCount: 999 }).mailCount, 20);
  assert.strictEqual(sandbox.UserSettingsService.sanitize({ mailCount: -5 }).mailCount, 1);
});

console.log('== GlobalSettingsService: sanitize ==');
test('空配列のsyncCalendarIdsはデフォルトにフォールバック', () => {
  const s = sandbox.GlobalSettingsService.sanitize({ syncCalendarIds: [] });
  assert.strictEqual(JSON.stringify(s.syncCalendarIds), JSON.stringify(['primary']));
});
test('mailLabel未指定はINBOX', () => {
  assert.strictEqual(sandbox.GlobalSettingsService.sanitize({}).mailLabel, 'INBOX');
});

console.log('== CalendarService: parseGuestsCsv ==');
test('カンマ区切り・前後空白・重複を正規化', () => {
  const guests = sandbox.CalendarService.parseGuestsCsv(' a@example.com ,b@example.com, a@example.com,');
  assert.strictEqual(JSON.stringify(guests), JSON.stringify(['a@example.com', 'b@example.com']));
});
test('空文字は空配列', () => assert.strictEqual(sandbox.CalendarService.parseGuestsCsv('').length, 0));

console.log('== MailService: clampCount ==');
test('範囲外は1〜20にクランプ', () => {
  assert.strictEqual(sandbox.MailService.clampCount(0), 1);
  assert.strictEqual(sandbox.MailService.clampCount(100), 20);
  assert.strictEqual(sandbox.MailService.clampCount(NaN), 5);
});

console.log('== AppLedger: statusFromHttpCode ==');
test('2xx/3xxはok', () => {
  assert.strictEqual(sandbox.AppLedger.statusFromHttpCode(200), 'ok');
  assert.strictEqual(sandbox.AppLedger.statusFromHttpCode(302), 'ok');
});
test('4xx/5xxはerror', () => {
  assert.strictEqual(sandbox.AppLedger.statusFromHttpCode(404), 'error');
  assert.strictEqual(sandbox.AppLedger.statusFromHttpCode(500), 'error');
});

console.log('== AppLedger: isValidHttpUrl / extractTitle（リンク貼り付けのみで登録） ==');
test('http/httpsのURLのみ有効', () => {
  assert.strictEqual(sandbox.AppLedger.isValidHttpUrl('https://example.com'), true);
  assert.strictEqual(sandbox.AppLedger.isValidHttpUrl('http://example.com/path'), true);
  assert.strictEqual(sandbox.AppLedger.isValidHttpUrl('ftp://example.com'), false);
  assert.strictEqual(sandbox.AppLedger.isValidHttpUrl('example.com'), false);
});
test('<title>タグの中身を抽出しHTMLエンティティをデコードする', () => {
  const html = '<html><head><title>在庫管理 &amp; 発注</title></head></html>';
  assert.strictEqual(sandbox.AppLedger.extractTitle(html), '在庫管理 & 発注');
});
test('<title>が無ければnull', () => {
  assert.strictEqual(sandbox.AppLedger.extractTitle('<html><head></head></html>'), null);
});

console.log('== EventCategory: listChoices / labelFor / hexFor（予定の種類の色分け） ==');
test('未設定を含め8種類の候補がある', () => {
  assert.strictEqual(sandbox.EventCategory.CATEGORIES.length, 8);
  assert.strictEqual(sandbox.EventCategory.CATEGORIES[0].id, '');
});
test('colorIdからラベル・色を逆引きできる', () => {
  assert.strictEqual(sandbox.EventCategory.labelFor('10'), '有給');
  assert.strictEqual(sandbox.EventCategory.hexFor('9'), '#5484ed');
});
test('未知のcolorIdは未設定にフォールバック', () => {
  assert.strictEqual(sandbox.EventCategory.labelFor('99'), '未設定');
});

console.log('== DriveService: iconUrlForMimeType / sortItems ==');
test('フォルダは専用アイコンURL', () => {
  assert.ok(sandbox.DriveService.iconUrlForMimeType('application/vnd.google-apps.folder', true).indexOf('folder') !== -1);
});
test('名前の昇順ソート', () => {
  const items = [{ name: 'b', lastUpdated: '', sizeBytes: 1 }, { name: 'a', lastUpdated: '', sizeBytes: 2 }];
  const sorted = sandbox.DriveService.sortItems(items, 'name', true);
  assert.deepStrictEqual(sorted.map((i) => i.name), ['a', 'b']);
});
test('サイズの降順ソート', () => {
  const items = [{ name: 'a', lastUpdated: '', sizeBytes: 1 }, { name: 'b', lastUpdated: '', sizeBytes: 5 }];
  const sorted = sandbox.DriveService.sortItems(items, 'size', false);
  assert.deepStrictEqual(sorted.map((i) => i.name), ['b', 'a']);
});

console.log('== DateUtils: getMonthRange ==');
test('12月は翌年1月始まりまでの範囲になる', () => {
  const range = sandbox.DateUtils.getMonthRange(2025, 11); // 11 = 12月
  const start = new Date(range.startIso);
  const end = new Date(range.endIso);
  assert.strictEqual(start.getMonth(), 11);
  assert.strictEqual(end.getFullYear() > start.getFullYear() || end.getMonth() === 0, true);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail > 0 ? 1 : 0);
