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
  Utilities: {
    getUuid: () => 'test-uuid-' + Math.random().toString(36).slice(2),
  },
};
vm.createContext(sandbox);

const FILES = [
  'constants.js',
  'services.js',
  'settingsService.js',
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
test('未指定時は5種類のウィジェットが既定値で揃う', () => {
  const widgets = sandbox.UserSettingsService.sanitizeWidgets(undefined);
  assert.strictEqual(JSON.stringify(widgets.map((w) => w.id)), JSON.stringify(['calendar', 'today', 'mail', 'links', 'todo']));
  assert.strictEqual(widgets[0].column, 'main');
  assert.strictEqual(widgets[0].size, 'large');
  const todo = widgets.filter((w) => w.id === 'todo')[0];
  assert.strictEqual(todo.column, 'side');
  assert.strictEqual(todo.visible, true);
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
  assert.strictEqual(JSON.stringify(widgets.map((w) => w.id)), JSON.stringify(['mail', 'calendar', 'today', 'links', 'todo']));
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

console.log('== JapaneseHoliday: nameFor（固定日・ハッピーマンデー・振替休日・国民の休日） ==');
test('固定日の祝日を判定できる（元日・建国記念の日）', () => {
  assert.strictEqual(sandbox.JapaneseHoliday.nameFor(new Date(2026, 0, 1)), '元日');
  assert.strictEqual(sandbox.JapaneseHoliday.nameFor(new Date(2026, 1, 11)), '建国記念の日');
  assert.strictEqual(sandbox.JapaneseHoliday.nameFor(new Date(2026, 0, 2)), null);
});
test('ハッピーマンデー（成人の日=1月第2月曜）を独立に計算した日付と照合する', () => {
  // 実装(nthMondayDay)を使わず、JSのDateから独立に「1月の2番目の月曜日」を求めて突き合わせる
  const year = 2026;
  let mondayCount = 0;
  let secondMonday = null;
  for (let day = 1; day <= 31; day++) {
    const d = new Date(year, 0, day);
    if (d.getMonth() !== 0) break;
    if (d.getDay() === 1) {
      mondayCount++;
      if (mondayCount === 2) { secondMonday = day; break; }
    }
  }
  assert.ok(secondMonday !== null);
  assert.strictEqual(sandbox.JapaneseHoliday.nameFor(new Date(year, 0, secondMonday)), '成人の日');
  assert.strictEqual(sandbox.JapaneseHoliday.nameFor(new Date(year, 0, secondMonday - 7)), null);
});
test('振替休日: 固定祝日が日曜と重なる年を独立に探索して検証する', () => {
  let found = false;
  for (let year = 2024; year <= 2040 && !found; year++) {
    const bunkaNoHi = new Date(year, 10, 3); // 文化の日（11/3、固定日）
    if (bunkaNoHi.getDay() === 0) {
      found = true;
      assert.strictEqual(sandbox.JapaneseHoliday.nameFor(bunkaNoHi), '文化の日');
      assert.strictEqual(sandbox.JapaneseHoliday.nameFor(new Date(year, 10, 4)), '振替休日');
    }
  }
  assert.ok(found, 'テスト対象期間内に文化の日が日曜となる年が見つかりませんでした');
});
test('国民の休日: 敬老の日と秋分の日の間が1日だけ空く年を探索して検証する', () => {
  function thirdMondayOfSeptember(year) {
    let mondayCount = 0;
    for (let day = 1; day <= 30; day++) {
      if (new Date(year, 8, day).getDay() === 1) {
        mondayCount++;
        if (mondayCount === 3) return day;
      }
    }
    return null;
  }
  function equinoxDaySeptember(year) {
    for (let day = 20; day <= 25; day++) {
      if (sandbox.JapaneseHoliday.nameFor(new Date(year, 8, day)) === '秋分の日') return day;
    }
    return null;
  }
  let found = false;
  for (let year = 2015; year <= 2045 && !found; year++) {
    const keiro = thirdMondayOfSeptember(year);
    const equinox = equinoxDaySeptember(year);
    if (keiro !== null && equinox !== null && equinox - keiro === 2) {
      found = true;
      assert.strictEqual(sandbox.JapaneseHoliday.nameFor(new Date(year, 8, keiro + 1)), '国民の休日');
    }
  }
  assert.ok(found, 'テスト対象期間内に敬老の日と秋分の日の間が1日空く年が見つかりませんでした');
});

console.log('== RokuyoService: forDate（簡易6日周期の近似ローテーション） ==');
test('6日周期でローテーションする（基準日から1日ずつ進むと順送り、6日で一巡）', () => {
  const base = new Date(2000, 0, 1);
  const first = sandbox.RokuyoService.forDate(base);
  const cycle = ['先勝', '友引', '先負', '仏滅', '大安', '赤口'];
  assert.ok(cycle.indexOf(first) !== -1);
  for (let i = 1; i <= 6; i++) {
    const d = new Date(2000, 0, 1 + i);
    const expectedIdx = (cycle.indexOf(first) + i) % 6;
    assert.strictEqual(sandbox.RokuyoService.forDate(d), cycle[expectedIdx]);
  }
  // 6日後は同じ六曜に戻る
  assert.strictEqual(sandbox.RokuyoService.forDate(new Date(2000, 0, 7)), first);
});

console.log('== UserSettingsService: sanitizeCustomNavItems（個人用カスタムナビ項目） ==');
test('ラベルとhttp(s)のURLが揃っていれば登録される（idが無ければ自動採番）', () => {
  const items = sandbox.UserSettingsService.sanitizeCustomNavItems([
    { label: '社内Wiki', url: 'https://example.com/wiki' }
  ]);
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].label, '社内Wiki');
  assert.strictEqual(items[0].url, 'https://example.com/wiki');
  assert.ok(items[0].id);
});
test('ラベルが空・URLが不正な項目は除外される', () => {
  const items = sandbox.UserSettingsService.sanitizeCustomNavItems([
    { label: '', url: 'https://example.com' },
    { label: '不正URL', url: 'ftp://example.com' },
    { label: 'OK', url: 'https://example.com/ok' }
  ]);
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].label, 'OK');
});
test('配列以外の入力は空配列になる', () => {
  assert.strictEqual(sandbox.UserSettingsService.sanitizeCustomNavItems(undefined).length, 0);
  assert.strictEqual(sandbox.UserSettingsService.sanitizeCustomNavItems(null).length, 0);
});
test('最大件数を超える分は切り詰められる', () => {
  const input = [];
  for (let i = 0; i < 20; i++) input.push({ label: 'item' + i, url: 'https://example.com/' + i });
  const items = sandbox.UserSettingsService.sanitizeCustomNavItems(input);
  assert.ok(items.length <= 12);
});
test('sanitize()にcustomNavItemsが含まれる', () => {
  const result = sandbox.UserSettingsService.sanitize({ customNavItems: [{ label: 'A', url: 'https://example.com' }] });
  assert.strictEqual(result.customNavItems.length, 1);
  assert.strictEqual(sandbox.UserSettingsService.sanitize({}).customNavItems.length, 0);
});

console.log('== UserSettingsService: sanitizePinnedFolders（Driveのよく使うフォルダのピン留め） ==');
test('id・nameが揃っていれば登録される', () => {
  const folders = sandbox.UserSettingsService.sanitizePinnedFolders([
    { id: 'f1', name: '経理資料' }
  ]);
  assert.strictEqual(folders.length, 1);
  assert.strictEqual(folders[0].id, 'f1');
  assert.strictEqual(folders[0].name, '経理資料');
});
test('idまたはnameが空の項目は除外される', () => {
  const folders = sandbox.UserSettingsService.sanitizePinnedFolders([
    { id: '', name: '経理資料' },
    { id: 'f2', name: '' },
    { id: 'f3', name: 'OK' }
  ]);
  assert.strictEqual(folders.length, 1);
  assert.strictEqual(folders[0].id, 'f3');
});
test('同じidの重複は1件にまとめられる', () => {
  const folders = sandbox.UserSettingsService.sanitizePinnedFolders([
    { id: 'f1', name: '旧名' },
    { id: 'f1', name: '新名' }
  ]);
  assert.strictEqual(folders.length, 1);
  assert.strictEqual(folders[0].name, '旧名');
});
test('配列以外の入力は空配列になる', () => {
  assert.strictEqual(sandbox.UserSettingsService.sanitizePinnedFolders(undefined).length, 0);
  assert.strictEqual(sandbox.UserSettingsService.sanitizePinnedFolders(null).length, 0);
});
test('最大件数を超える分は切り詰められる', () => {
  const input = [];
  for (let i = 0; i < 30; i++) input.push({ id: 'f' + i, name: 'フォルダ' + i });
  const folders = sandbox.UserSettingsService.sanitizePinnedFolders(input);
  assert.ok(folders.length <= 20);
});
test('sanitize()にpinnedFolders/driveViewMode/calendarViewMode/darkModeが含まれる', () => {
  const result = sandbox.UserSettingsService.sanitize({
    pinnedFolders: [{ id: 'f1', name: 'A' }],
    driveViewMode: 'grid',
    calendarViewMode: 'week',
    darkMode: 'dark'
  });
  assert.strictEqual(result.pinnedFolders.length, 1);
  assert.strictEqual(result.driveViewMode, 'grid');
  assert.strictEqual(result.calendarViewMode, 'week');
  assert.strictEqual(result.darkMode, 'dark');
  const defaults = sandbox.UserSettingsService.sanitize({});
  assert.strictEqual(defaults.driveViewMode, 'list');
  assert.strictEqual(defaults.calendarViewMode, 'month');
  assert.strictEqual(defaults.darkMode, 'system');
});
test('不正なdriveViewMode/calendarViewMode/darkModeは既定値にフォールバック', () => {
  const result = sandbox.UserSettingsService.sanitize({
    driveViewMode: 'nonsense',
    calendarViewMode: 'nonsense',
    darkMode: 'nonsense'
  });
  assert.strictEqual(result.driveViewMode, 'list');
  assert.strictEqual(result.calendarViewMode, 'month');
  assert.strictEqual(result.darkMode, 'system');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail > 0 ? 1 : 0);
