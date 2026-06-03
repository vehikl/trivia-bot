import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAnswerValidationMessages,
  buildIndependentFactCheckMessages,
  buildQuizSystemPrompt,
  enforceIndependentFactCheck,
  getValidationCorrections,
} from '../services/trivia/generateQuiz.js';

test('quiz generation prompt requires accepted answer variants', () => {
  const prompt = buildQuizSystemPrompt('Famous Beverages');

  assert.match(prompt, /acceptedAnswers: string\[\]/);
  assert.match(prompt, /common abbreviations, acronyms, alternate spellings/);
  assert.match(prompt, /location-only, category-only, overly broad, ambiguous/);
  assert.match(prompt, /6 different real-world answers/);
  assert.match(prompt, /no two answers are aliases or alternate names for the same thing/);
  assert.match(prompt, /semantically distinct from each other/);
  assert.match(prompt, /independently solve each question/);
  assert.match(prompt, /Factual Alignment Rule/);
});

test('answer validation prompt prioritizes factual clue-answer alignment', () => {
  const messages = buildAnswerValidationMessages('Football Moments', {
    questions: [
      {
        question: 'This city hosted the famous "Hand of God" goal scored by Diego Maradona during the 1986 World Cup.',
        correctAnswer: 'Buenos Aires',
        acceptedAnswers: [],
        isBonus: false,
      },
      {
        question: 'Placeholder 2?',
        correctAnswer: 'Answer Two',
        acceptedAnswers: [],
        isBonus: false,
      },
      {
        question: 'Placeholder 3?',
        correctAnswer: 'Answer Three',
        acceptedAnswers: [],
        isBonus: false,
      },
      {
        question: 'Placeholder 4?',
        correctAnswer: 'Answer Four',
        acceptedAnswers: [],
        isBonus: false,
      },
      {
        question: 'Placeholder 5?',
        correctAnswer: 'Answer Five',
        acceptedAnswers: [],
        isBonus: false,
      },
      {
        question: 'Placeholder bonus?',
        correctAnswer: 'Bonus Answer',
        acceptedAnswers: [],
        isBonus: true,
      },
    ],
  });
  const systemPrompt = messages[0].content;

  assert.match(systemPrompt, /solve it from the clue text before comparing it to the proposed answer/);
  assert.match(systemPrompt, /independentlySolvedAnswer conflicts with correctAnswer/);
  assert.match(systemPrompt, /replace correctAnswer with the factually correct answer/);
  assert.match(systemPrompt, /Prefer correcting the answer over changing the question/);
  assert.match(systemPrompt, /Mexico City, not Buenos Aires/);
});

test('independent fact-check prompt does not expose generated answers', () => {
  const messages = buildIndependentFactCheckMessages('Football Moments', {
    questions: [
      {
        question: 'This city hosted the famous "Hand of God" goal scored by Diego Maradona during the 1986 World Cup.',
        correctAnswer: 'Buenos Aires',
        acceptedAnswers: [],
        isBonus: false,
      },
      {
        question: 'Placeholder 2?',
        correctAnswer: 'Answer Two',
        acceptedAnswers: [],
        isBonus: false,
      },
      {
        question: 'Placeholder 3?',
        correctAnswer: 'Answer Three',
        acceptedAnswers: [],
        isBonus: false,
      },
      {
        question: 'Placeholder 4?',
        correctAnswer: 'Answer Four',
        acceptedAnswers: [],
        isBonus: false,
      },
      {
        question: 'Placeholder 5?',
        correctAnswer: 'Answer Five',
        acceptedAnswers: [],
        isBonus: false,
      },
      {
        question: 'Placeholder bonus?',
        correctAnswer: 'Bonus Answer',
        acceptedAnswers: [],
        isBonus: true,
      },
    ],
  });
  const promptText = messages.map(message => message.content).join('\n');

  assert.match(promptText, /NOT given the generated correct answers/);
  assert.match(promptText, /Mexico City, not Buenos Aires/);
  assert.doesNotMatch(messages[1].content, /Buenos Aires/);
  assert.doesNotMatch(messages[1].content, /Answer Two/);
});

test('independent fact-check enforcement corrects factual answer mismatches', () => {
  const result = enforceIndependentFactCheck(
    {
      questions: [
        {
          question: 'This city hosted the famous "Hand of God" goal scored by Diego Maradona during the 1986 World Cup.',
          correctAnswer: 'Buenos Aires',
          acceptedAnswers: [],
          isBonus: false,
        },
      ],
    },
    {
      questions: [
        {
          independentlySolvedAnswer: 'Mexico City',
          acceptedAnswers: ['Ciudad de Mexico'],
          questionWasClear: true,
          reason: 'The 1986 World Cup quarter-final was played at Estadio Azteca in Mexico City.',
        },
      ],
    }
  );

  assert.equal(result.quiz.questions[0].correctAnswer, 'Mexico City');
  assert.deepEqual(result.quiz.questions[0].acceptedAnswers, ['Ciudad de Mexico']);
  assert.equal(result.issues[0].type, 'answer-mismatch');
});

test('independent fact-check enforcement flags unclear questions without inventing an answer', () => {
  const result = enforceIndependentFactCheck(
    {
      questions: [
        {
          question: 'This famous city hosted a famous goal. Which city was it?',
          correctAnswer: 'Buenos Aires',
          acceptedAnswers: [],
          isBonus: false,
        },
      ],
    },
    {
      questions: [
        {
          independentlySolvedAnswer: '',
          acceptedAnswers: [],
          questionWasClear: false,
          reason: 'The clue does not identify a specific event or city.',
        },
      ],
    }
  );

  assert.equal(result.quiz.questions[0].correctAnswer, 'Buenos Aires');
  assert.equal(result.issues[0].type, 'unclear-question');
});

test('validation flags count as corrections even when text is unchanged', () => {
  const corrections = getValidationCorrections(
    [
      {
        question: 'This city hosted the famous "Hand of God" goal scored by Diego Maradona during the 1986 World Cup.',
        correctAnswer: 'Buenos Aires',
        acceptedAnswers: [],
        isBonus: false,
      },
    ],
    [
      {
        question: 'This city hosted the famous "Hand of God" goal scored by Diego Maradona during the 1986 World Cup.',
        correctAnswer: 'Buenos Aires',
        acceptedAnswers: [],
        isBonus: false,
        answerWasCorrect: false,
        questionWasClear: true,
        reason: 'The answer should be Mexico City.',
      },
    ]
  );

  assert.equal(corrections.length, 1);
  assert.deepEqual(corrections[0].issues, ['answer-marked-incorrect-without-correction']);
});
