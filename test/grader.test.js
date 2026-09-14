import assert from 'node:assert/strict';
import test from 'node:test';
import {
  gradeTriviaSubmission,
  isCorrectLocalMatch,
  isQuestionRestatementAnswer,
} from '../services/trivia/grader.js';

const priceIsRightQuestion = {
  question: "This iconic American TV game show, premiering in 1956 and revived in the 1970s, features contestants spinning a large wheel and guessing retail prices to win prizes. What is the show's title?",
  correctAnswer: 'The Price Is Right',
  isBonus: false,
};

function aiCompletion(verdict, explanation = '') {
  return {choices: [{message: {content: JSON.stringify({verdict, explanation})}}]};
}

function stubOpenAi(create) {
  return {chat: {completions: {create}}};
}

test('exact canonical titles containing or are accepted even when AI is unavailable', async () => {
  let aiCalls = 0;
  const openai = stubOpenAi(async () => {
    aiCalls++;
    throw new Error('AI unavailable');
  });

  for (const answer of ['Deal or No Deal', '  DEAL OR NO DEAL  ']) {
    const result = await gradeTriviaSubmission(
      openai,
      {questions: [{question: 'Which game show features a banker and briefcases?', correctAnswer: 'Deal or No Deal'}]},
      [answer]
    );

    assert.deepEqual(result, {
      regularScore: 1,
      bonusScore: 0,
      aiVerdicts: ['exact'],
      aiExplanations: [''],
    });
  }
  assert.equal(aiCalls, 0);
});

test('individual alternatives remain accepted locally', async () => {
  const openai = stubOpenAi(async () => { throw new Error('AI unavailable'); });
  for (const answer of ['Sodium chloride', 'Table salt']) {
    const result = await gradeTriviaSubmission(
      openai,
      {questions: [{question: 'What is NaCl called?', correctAnswer: 'Sodium chloride or table salt'}]},
      [answer]
    );
    assert.equal(result.regularScore, 1);
    assert.deepEqual(result.aiVerdicts, ['exact']);
  }
});

test('AI guards Price is Right without an accepted alias before finalizing the score', async () => {
  const requests = [];
  const openai = stubOpenAi(async request => {
    requests.push(request);
    return aiCompletion('correct');
  });

  const result = await gradeTriviaSubmission(
    openai,
    {questions: [priceIsRightQuestion]},
    ['Price is Right']
  );

  assert.deepEqual(result, {regularScore: 1, bonusScore: 0, aiVerdicts: ['correct'], aiExplanations: ['']});
  assert.equal(requests.length, 1);
  assert.match(requests[0].messages[0].content, /Accept omitted articles/);
  assert.ok(requests[0].messages[1].content.includes(priceIsRightQuestion.question));
  assert.match(requests[0].messages[1].content, /Correct answer: The Price Is Right/);
  assert.match(requests[0].messages[1].content, /User answer: Price is Right/);
});

test('AI explanations stay aligned with exact, accepted, and incorrect bonus answers', async () => {
  const explanation = 'Wheel of Fortune is a word puzzle show; The Price Is Right asks contestants to guess retail prices.';
  const completions = [aiCompletion('correct'), aiCompletion('incorrect', explanation)];
  const result = await gradeTriviaSubmission(
    stubOpenAi(async () => completions.shift()),
    {questions: [priceIsRightQuestion, priceIsRightQuestion, {...priceIsRightQuestion, isBonus: true}]},
    ['The Price Is Right', 'Price is Right', 'Wheel of Fortune']
  );

  assert.equal(result.regularScore, 2);
  assert.equal(result.bonusScore, 0);
  assert.deepEqual(result.aiVerdicts, ['exact', 'correct', 'incorrect']);
  assert.deepEqual(result.aiExplanations, ['', '', explanation]);
  assert.equal(completions.length, 0);
});

test('an AI-approved bonus answer earns a point without an incorrect-answer explanation', async () => {
  const result = await gradeTriviaSubmission(
    stubOpenAi(async () => aiCompletion('correct', 'Identifies the same show.')),
    {questions: [{...priceIsRightQuestion, isBonus: true}]},
    ['Price is Right']
  );
  assert.equal(result.regularScore, 0);
  assert.equal(result.bonusScore, 1);
  assert.deepEqual(result.aiExplanations, ['']);
});

test('an incorrect verdict requires a non-empty explanation', async () => {
  for (const explanation of ['', '   \n']) {
    await assert.rejects(
      gradeTriviaSubmission(
        stubOpenAi(async () => aiCompletion('incorrect', explanation)),
        {questions: [priceIsRightQuestion]},
        ['Wheel of Fortune']
      ),
      error => {
        assert.match(error.cause.message, /did not explain the incorrect verdict/);
        return true;
      }
    );
  }
});

test('missing or unexpected AI verdicts cannot finalize an incorrect score', async () => {
  for (const completion of [
    aiCompletion('maybe', 'Uncertain'),
    aiCompletion('incorrect', null),
    {choices: [{message: {content: JSON.stringify({verdict: 'incorrect'})}}]},
    {choices: []},
    {choices: [{message: {content: null}}]},
    {choices: [{message: {content: ''}}]},
    {choices: [{message: {content: 'perhaps'}}]},
    {choices: [{message: {content: 'correct or incorrect'}}]},
  ]) {
    await assert.rejects(
      gradeTriviaSubmission(
        stubOpenAi(async () => completion),
        {questions: [priceIsRightQuestion]},
        ['Price is Right']
      ),
      error => {
        assert.match(error.message, /AI review failed for question 1/);
        assert.match(error.cause.message, /did not return a valid verdict/);
        return true;
      }
    );
  }
});

test('an AI request failure prevents returning a partial submission score', async () => {
  const failure = new Error('Service unavailable');
  await assert.rejects(
    gradeTriviaSubmission(
      stubOpenAi(async () => { throw failure; }),
      {questions: [priceIsRightQuestion, {...priceIsRightQuestion, isBonus: true}]},
      ['The Price Is Right', 'Price is Right']
    ),
    error => {
      assert.match(error.message, /AI review failed for question 2/);
      assert.equal(error.cause, failure);
      return true;
    }
  );
});

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

test('gradeTriviaSubmission skips AI for a direct known-answer match', async () => {
  let aiCalls = 0;
  const openai = {
    chat: {
      completions: {
        create: async () => {
          aiCalls++;
          return aiCompletion('incorrect', 'This repeats the clue without naming the drink, beer.');
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
          acceptedAnswers: ['HMV'],
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

test('gradeTriviaSubmission asks AI before marking question restatements incorrect', async () => {
  let aiCalls = 0;
  const openai = {
    chat: {
      completions: {
        create: async () => {
          aiCalls++;
          return aiCompletion('incorrect', 'This repeats the clue without naming the drink, beer.');
        },
      },
    },
  };

  const result = await gradeTriviaSubmission(
    openai,
    {
      questions: [
        {
          question: 'This fermented barley drink is common in pubs. What is it?',
          correctAnswer: 'Beer',
          acceptedAnswers: [],
          isBonus: false,
        },
      ],
    },
    ['fermented barley drink']
  );

  assert.equal(result.regularScore, 0);
  assert.deepEqual(result.aiVerdicts, ['incorrect']);
  assert.equal(aiCalls, 1);
});

test('gradeTriviaSubmission sends non-matching answer variants to AI for final approval', async () => {
  let aiCalls = 0;
  const openai = {
    chat: {
      completions: {
        create: async () => {
          aiCalls++;
          return aiCompletion('correct');
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
          acceptedAnswers: [],
          isBonus: false,
        },
      ],
    },
    ['HMV']
  );

  assert.equal(result.regularScore, 1);
  assert.deepEqual(result.aiVerdicts, ['correct']);
  assert.equal(aiCalls, 1);
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
