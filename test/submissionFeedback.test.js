import assert from 'node:assert/strict';
import test from 'node:test';
import {buildAnswerFeedback, buildSubmissionFeedbackBlocks} from '../services/trivia/slackBlocks.js';

test('incorrect answer feedback includes the AI explanation and accepted answers', () => {
  const feedback = buildAnswerFeedback(
    {correctAnswer: 'Beer', acceptedAnswers: ['Ale']},
    'fermented barley drink',
    'incorrect',
    'This repeats the clue without naming the drink, beer.'
  );
  assert.equal(feedback,
    'Your Answer: fermented barley drink ❌\nCorrect Answer: Beer\nAlso accepted: Ale\n' +
    'Why: This repeats the clue without naming the drink, beer.\n');
});

test('correct and exact answers do not show rejection explanations', () => {
  for (const verdict of ['exact', 'correct']) {
    assert.equal(
      buildAnswerFeedback({correctAnswer: 'The Price Is Right'}, 'Price is Right', verdict, 'Unused reason'),
      'Your Answer: Price is Right ✅\n'
    );
  }
});

test('AI explanations cannot insert code fences, new lines, or Slack mentions', () => {
  const feedback = buildAnswerFeedback(
    {correctAnswer: 'Beer'}, 'drink', 'incorrect', '```\n<!channel> & drink\n```'
  );
  assert.ok(feedback.endsWith('Why: &lt;!channel&gt; &amp; drink\n'));
  assert.ok(!feedback.includes('```'));
});

test('long submission feedback is split into Slack sections without losing text', () => {
  for (const text of ['Question and explanation.\n'.repeat(250), 'x'.repeat(6500)]) {
    const blocks = buildSubmissionFeedbackBlocks(text);
    assert.ok(blocks.length > 1);
    assert.ok(blocks.every(block => block.text.text.length <= 3000));
    assert.equal(blocks.map(block => block.text.text.slice(3, -3)).join(''), text);
  }
});
