/**
 * tests/run.js
 * ScoringService.gs（スプレッドシート等の外部サービスに依存しない純粋ロジック）を
 * Node.js の vm サンドボックスへ読み込み、単体テストする。
 * 外部ライブラリ非依存。実行: npm test / node tests/run.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const sandbox = {};
vm.createContext(sandbox);

// Constants.gs -> ScoringService.gs の順で依存関係あり
const FILES = ['Constants.gs', 'ScoringService.gs'];

FILES.forEach((file) => {
  const code = fs.readFileSync(path.join(ROOT, file), 'utf8');
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

console.log('== validateQuestionCount / validateChoiceCount ==');
test('1〜100はOK', () => {
  assert.strictEqual(sandbox.validateQuestionCount(1), true);
  assert.strictEqual(sandbox.validateQuestionCount(100), true);
});
test('0・101・小数・文字列はNG', () => {
  assert.strictEqual(sandbox.validateQuestionCount(0), false);
  assert.strictEqual(sandbox.validateQuestionCount(101), false);
  assert.strictEqual(sandbox.validateQuestionCount(1.5), false);
  assert.strictEqual(sandbox.validateQuestionCount('abc'), false);
});
test('選択肢数は2〜10がOK', () => {
  assert.strictEqual(sandbox.validateChoiceCount(2), true);
  assert.strictEqual(sandbox.validateChoiceCount(10), true);
  assert.strictEqual(sandbox.validateChoiceCount(1), false);
  assert.strictEqual(sandbox.validateChoiceCount(11), false);
});

console.log('== choiceLetters ==');
test('4択は a,b,c,d', () => assert.deepEqual(sandbox.choiceLetters(4), ['a', 'b', 'c', 'd']));
test('2択は a,b', () => assert.deepEqual(sandbox.choiceLetters(2), ['a', 'b']));

console.log('== buildQuestionConfigs（一括設定＋個別上書き） ==');
test('一括設定のみ: 全問が同じ形式になる', () => {
  const configs = sandbox.buildQuestionConfigs(5, { qType: 'choice', choiceCount: 4 }, []);
  assert.strictEqual(configs.length, 5);
  configs.forEach((c) => {
    assert.strictEqual(c.qType, 'choice');
    assert.strictEqual(c.choiceCount, 4);
  });
});
test('個別上書き: 指定範囲だけ記述式になる（企画書の例: 問41,42のみ記述式）', () => {
  const configs = sandbox.buildQuestionConfigs(
    42,
    { qType: 'choice', choiceCount: 4 },
    [{ from: 41, to: 42, qType: 'text' }]
  );
  assert.strictEqual(configs[39].qType, 'choice'); // 問40
  assert.strictEqual(configs[40].qType, 'text');   // 問41
  assert.strictEqual(configs[41].qType, 'text');   // 問42
});
test('後の上書きが優先される（範囲が重複した場合）', () => {
  const configs = sandbox.buildQuestionConfigs(
    10,
    { qType: 'choice', choiceCount: 4 },
    [
      { from: 1, to: 10, qType: 'text' },
      { from: 5, to: 6, qType: 'choice', choiceCount: 5 }
    ]
  );
  assert.strictEqual(configs[0].qType, 'text');
  assert.strictEqual(configs[4].qType, 'choice');
  assert.strictEqual(configs[4].choiceCount, 5);
  assert.strictEqual(configs[6].qType, 'text');
});
test('不正な問題数はエラー', () => {
  assert.throws(() => sandbox.buildQuestionConfigs(0, { qType: 'choice', choiceCount: 4 }, []));
  assert.throws(() => sandbox.buildQuestionConfigs(101, { qType: 'choice', choiceCount: 4 }, []));
});

console.log('== effectiveJudgment / computeSetStats（自己採点・正答率） ==');
test('選択式は自動判定（正解と一致で○）', () => {
  const j = sandbox.effectiveJudgment({ qType: 'choice', userAnswer: 'a', correctAnswer: 'a' });
  assert.strictEqual(j, sandbox.JUDGMENTS.CORRECT);
});
test('選択式は大文字小文字・前後空白を無視して比較する', () => {
  const j = sandbox.effectiveJudgment({ qType: 'choice', userAnswer: ' A ', correctAnswer: 'a' });
  assert.strictEqual(j, sandbox.JUDGMENTS.CORRECT);
});
test('選択式で不一致は✕', () => {
  const j = sandbox.effectiveJudgment({ qType: 'choice', userAnswer: 'b', correctAnswer: 'a' });
  assert.strictEqual(j, sandbox.JUDGMENTS.WRONG);
});
test('選択式で未回答は✕（正解が入力済みの場合）', () => {
  const j = sandbox.effectiveJudgment({ qType: 'choice', userAnswer: '', correctAnswer: 'a' });
  assert.strictEqual(j, sandbox.JUDGMENTS.WRONG);
});
test('正解が未入力なら未採点（NONE）', () => {
  const j = sandbox.effectiveJudgment({ qType: 'choice', userAnswer: 'a', correctAnswer: '' });
  assert.strictEqual(j, sandbox.JUDGMENTS.NONE);
});
test('記述式は自己申告の判定をそのまま使う（○／△／✕）', () => {
  assert.strictEqual(sandbox.effectiveJudgment({ qType: 'text', judgment: '△' }), '△');
  assert.strictEqual(sandbox.effectiveJudgment({ qType: 'text', judgment: '' }), sandbox.JUDGMENTS.NONE);
});

test('computeSetStats: 正答率は採点済み問題数に対する割合', () => {
  const rows = [
    { qType: 'choice', userAnswer: 'a', correctAnswer: 'a' }, // ○
    { qType: 'choice', userAnswer: 'b', correctAnswer: 'a' }, // ✕
    { qType: 'choice', userAnswer: 'a', correctAnswer: '' },  // 回答済みだが正解未入力のため未採点
    { qType: 'text', userAnswer: 'xyz', judgment: '○' },      // ○
    { qType: 'text', userAnswer: '', judgment: '' }           // 未採点・未回答
  ];
  const stats = sandbox.computeSetStats(rows);
  assert.strictEqual(stats.total, 5);
  assert.strictEqual(stats.answered, 4);
  assert.strictEqual(stats.graded, 3);
  assert.strictEqual(stats.correctCount, 2);
  assert.strictEqual(stats.percentage, Math.round((2 / 3) * 1000) / 10);
  assert.strictEqual(stats.status, sandbox.SET_STATUS.ANSWERING);
});
test('全問採点済みなら status は graded', () => {
  const rows = [
    { qType: 'choice', userAnswer: 'a', correctAnswer: 'a' },
    { qType: 'choice', userAnswer: 'b', correctAnswer: 'a' }
  ];
  const stats = sandbox.computeSetStats(rows);
  assert.strictEqual(stats.status, sandbox.SET_STATUS.GRADED);
  assert.strictEqual(stats.percentage, 50);
});
test('0問なら percentage は null、status は answering', () => {
  const stats = sandbox.computeSetStats([]);
  assert.strictEqual(stats.percentage, null);
  assert.strictEqual(stats.status, sandbox.SET_STATUS.ANSWERING);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
