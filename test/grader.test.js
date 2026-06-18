import assert from 'node:assert/strict';
import test from 'node:test';
import {
  gradeTriviaSubmission,
  isCorrectLocalMatch,
  isQuestionRestatementAnswer,
} from '../services/trivia/grader.js';

test('accepts distinctive shortened answers with non-essential trailing qualifiers', () => {
  assert.equal(isCorrectLocalMatch('HMV', 'HMV Canada'), true);
  assert.equal(isCorrectLocalMatch('Coca Cola', 'The Coca-Cola Company'), true);
});

test('accepts explicit aliases and existing exact/acronym/spelling behavior', () => {
  assert.equal(isCorrectLocalMatch('Coke', 'Coca-Cola', ['Coke']), true);
  assert.equal(isCorrectLocalMatch('HC', 'HMV Canada'), true);
  assert.equal(isCorrectLocalMatch('Coca Cola', 'Coca-Cola'), true);
  assert.equal(isCorrectLocalMatch('Mona Liza', 'Mona Lisa'), true);
});

test('rejects broad or incomplete partial answers', () => {
  assert.equal(isCorrectLocalMatch('Canada', 'HMV Canada'), false);
  assert.equal(isCorrectLocalMatch('Company', 'The Coca-Cola Company'), false);
  assert.equal(isCorrectLocalMatch('Star', 'Star Wars'), false);
  assert.equal(isCorrectLocalMatch('American', 'American Airlines'), false);
});

test('preserves question restatement rejection', () => {
  assert.equal(
    isQuestionRestatementAnswer(
      'This fermented barley drink is common in pubs. What is it?',
      'Beer',
      'fermented barley drink'
    ),
    true
  );
});

test('gradeTriviaSubmission skips AI when local semantic matching succeeds', async () => {
  let aiCalls = 0;
  const openai = {
    chat: {
      completions: {
        create: async () => {
          aiCalls++;
          return {choices: [{message: {content: 'incorrect'}}]};
        },
      },
    },
  };

  const result = await gradeTriviaSubmission(
    openai,
    {
      questions: [
        {
          question: 'This Canadian branch of a music retailer used a three-letter brand name. What was it?',
          correctAnswer: 'HMV Canada',
          isBonus: false,
        },
      ],
    },
    ['HMV']
  );

  assert.equal(result.regularScore, 1);
  assert.deepEqual(result.aiVerdicts, ['exact']);
  assert.equal(aiCalls, 0);
});

test('gradeTriviaSubmission rejects incomplete answer payloads', async () => {
  await assert.rejects(
    gradeTriviaSubmission(
      {},
      {
        questions: [
          {
            question: 'Which country hosted the inaugural World Cup?',
            correctAnswer: 'Uruguay',
            acceptedAnswers: [],
            isBonus: false,
          },
        ],
      },
      ['   ']
    ),
    /one non-empty answer per question/
  );
});
