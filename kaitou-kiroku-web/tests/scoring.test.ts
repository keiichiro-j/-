import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateQuestionCount,
  validateChoiceCount,
  choiceLetters,
  buildQuestionConfigs,
  effectiveJudgment,
  computeSetStats,
  JUDGMENTS,
  SET_STATUS,
} from '../lib/scoring.ts';

test('validateQuestionCount: 1〜100はOK、それ以外はNG', () => {
  assert.equal(validateQuestionCount(1), true);
  assert.equal(validateQuestionCount(100), true);
  assert.equal(validateQuestionCount(0), false);
  assert.equal(validateQuestionCount(101), false);
  assert.equal(validateQuestionCount(1.5), false);
  assert.equal(validateQuestionCount('abc'), false);
});

test('validateChoiceCount: 2〜10はOK', () => {
  assert.equal(validateChoiceCount(2), true);
  assert.equal(validateChoiceCount(10), true);
  assert.equal(validateChoiceCount(1), false);
  assert.equal(validateChoiceCount(11), false);
});

test('choiceLetters: 4択は a,b,c,d', () => {
  assert.deepEqual(choiceLetters(4), ['a', 'b', 'c', 'd']);
});

test('buildQuestionConfigs: 一括設定のみは全問同じ形式', () => {
  const configs = buildQuestionConfigs(5, { qType: 'choice', choiceCount: 4 }, []);
  assert.equal(configs.length, 5);
  configs.forEach((c) => {
    assert.equal(c.qType, 'choice');
    assert.equal(c.choiceCount, 4);
  });
});

test('buildQuestionConfigs: 個別上書き（企画書の例: 問41,42のみ記述式）', () => {
  const configs = buildQuestionConfigs(42, { qType: 'choice', choiceCount: 4 }, [
    { from: 41, to: 42, qType: 'text', choiceCount: 4 },
  ]);
  assert.equal(configs[39].qType, 'choice');
  assert.equal(configs[40].qType, 'text');
  assert.equal(configs[41].qType, 'text');
});

test('buildQuestionConfigs: 後の上書きが優先される', () => {
  const configs = buildQuestionConfigs(10, { qType: 'choice', choiceCount: 4 }, [
    { from: 1, to: 10, qType: 'text', choiceCount: 4 },
    { from: 5, to: 6, qType: 'choice', choiceCount: 5 },
  ]);
  assert.equal(configs[0].qType, 'text');
  assert.equal(configs[4].qType, 'choice');
  assert.equal(configs[4].choiceCount, 5);
  assert.equal(configs[6].qType, 'text');
});

test('buildQuestionConfigs: 不正な問題数はエラー', () => {
  assert.throws(() => buildQuestionConfigs(0, { qType: 'choice', choiceCount: 4 }, []));
  assert.throws(() => buildQuestionConfigs(101, { qType: 'choice', choiceCount: 4 }, []));
});

test('effectiveJudgment: 選択式は自動判定（大文字小文字・空白を無視）', () => {
  assert.equal(
    effectiveJudgment({ qType: 'choice', userAnswer: ' A ', correctAnswer: 'a', judgment: '' }),
    JUDGMENTS.CORRECT
  );
  assert.equal(
    effectiveJudgment({ qType: 'choice', userAnswer: 'b', correctAnswer: 'a', judgment: '' }),
    JUDGMENTS.WRONG
  );
  assert.equal(
    effectiveJudgment({ qType: 'choice', userAnswer: '', correctAnswer: 'a', judgment: '' }),
    JUDGMENTS.WRONG
  );
  assert.equal(
    effectiveJudgment({ qType: 'choice', userAnswer: 'a', correctAnswer: '', judgment: '' }),
    JUDGMENTS.NONE
  );
});

test('effectiveJudgment: 記述式は自己申告の判定をそのまま使う', () => {
  assert.equal(effectiveJudgment({ qType: 'text', userAnswer: 'xyz', correctAnswer: '', judgment: '△' }), '△');
  assert.equal(effectiveJudgment({ qType: 'text', userAnswer: 'xyz', correctAnswer: '', judgment: '' }), JUDGMENTS.NONE);
});

test('computeSetStats: 正答率は採点済み問題数に対する割合', () => {
  const rows = [
    { qType: 'choice' as const, userAnswer: 'a', correctAnswer: 'a', judgment: '' as const },
    { qType: 'choice' as const, userAnswer: 'b', correctAnswer: 'a', judgment: '' as const },
    { qType: 'choice' as const, userAnswer: 'a', correctAnswer: '', judgment: '' as const },
    { qType: 'text' as const, userAnswer: 'xyz', correctAnswer: '', judgment: '○' as const },
    { qType: 'text' as const, userAnswer: '', correctAnswer: '', judgment: '' as const },
  ];
  const stats = computeSetStats(rows);
  assert.equal(stats.total, 5);
  assert.equal(stats.answered, 4);
  assert.equal(stats.graded, 3);
  assert.equal(stats.correctCount, 2);
  assert.equal(stats.percentage, Math.round((2 / 3) * 1000) / 10);
  assert.equal(stats.status, SET_STATUS.ANSWERING);
});

test('computeSetStats: 全問採点済みなら status は graded', () => {
  const rows = [
    { qType: 'choice' as const, userAnswer: 'a', correctAnswer: 'a', judgment: '' as const },
    { qType: 'choice' as const, userAnswer: 'b', correctAnswer: 'a', judgment: '' as const },
  ];
  const stats = computeSetStats(rows);
  assert.equal(stats.status, SET_STATUS.GRADED);
  assert.equal(stats.percentage, 50);
});

test('computeSetStats: 0問なら percentage は null', () => {
  const stats = computeSetStats([]);
  assert.equal(stats.percentage, null);
  assert.equal(stats.status, SET_STATUS.ANSWERING);
});
