import assert from 'node:assert/strict';
import test from 'node:test';
import {
  answerFormsAreCompatible,
  buildAnswerValidationMessages,
  buildIndependentFactCheckMessages,
  buildQuizSystemPrompt,
  buildValidationContextIssues,
  enforceIndependentFactCheck,
  generateQuestionsForTopic,
  getBlockingFactCheckIssues,
  getBlockingValidationCorrections,
  getDuplicateAnswerIssues,
  getQuestionAnswerLeaks,
  getValidationCorrections,
} from '../services/trivia/generateQuiz.js';

test('quiz generation prompt requires accepted answer variants', () => {
  const prompt = buildQuizSystemPrompt('Famous Beverages');

  assert.match(prompt, /acceptedAnswers: string\[\]/);
  assert.match(prompt, /common abbreviations, acronyms, alternate spellings/);
  assert.match(prompt, /location-only, category-only, overly broad, ambiguous/);
  assert.match(prompt, /Bonus Topic Fit/);
  assert.match(prompt, /isBonus=true question must stay directly inside the theme/);
  assert.match(prompt, /especially the isBonus=true question/);
  assert.match(prompt, /6 different real-world answers/);
  assert.match(prompt, /no two answers are aliases or alternate names for the same thing/);
  assert.match(prompt, /semantically distinct from each other/);
  assert.match(prompt, /independently solve each question/);
  assert.match(prompt, /Factual Alignment Rule/);
  assert.match(prompt, /Shared-Word Rule/);
  assert.match(prompt, /Clue Isolation Rule/);
  assert.match(prompt, /Non-identifying descriptive language/);
  assert.match(prompt, /ordinary adjectives, demonyms, category nouns/);
  assert.match(prompt, /exact correctAnswer or exact acceptedAnswers/);
  assert.match(prompt, /0-to-10 scale/);
  assert.match(prompt, /Questions under 8 are acceptable/);
});

test('generation relies on validation agent for direct-answer and difficulty rewrites', async () => {
  const initialQuiz = {
    questions: [
      {
        question: 'This clue says Alpha Answer directly. What is it?',
        correctAnswer: 'Alpha Answer',
        acceptedAnswers: [],
        isBonus: false,
      },
      {
        question: 'This clue points to a second item through two neutral facts. What is it?',
        correctAnswer: 'Beta Answer',
        acceptedAnswers: [],
        isBonus: false,
      },
      {
        question: 'This clue points to a third item through two neutral facts. What is it?',
        correctAnswer: 'Delta Answer',
        acceptedAnswers: [],
        isBonus: false,
      },
      {
        question: 'This clue points to a fourth item through two neutral facts. What is it?',
        correctAnswer: 'Epsilon Answer',
        acceptedAnswers: [],
        isBonus: false,
      },
      {
        question: 'This clue points to a fifth item through two neutral facts. What is it?',
        correctAnswer: 'Zeta Answer',
        acceptedAnswers: [],
        isBonus: false,
      },
      {
        question: 'This harder clue points to a sixth item through layered neutral facts. What is it?',
        correctAnswer: 'Eta Answer',
        acceptedAnswers: [],
        isBonus: true,
      },
    ],
  };

  const correctedQuiz = {
    questions: [
      {
        question: 'This Greek-letter term is used as the first item in phonetic examples and software test fixtures. What answer is it?',
        correctAnswer: 'Alpha Answer',
        acceptedAnswers: [],
        isBonus: false,
      },
      ...initialQuiz.questions.slice(1),
    ],
  };

  let generationCalls = 0;
  let validationCalls = 0;
  const openai = {
    chat: {
      completions: {
        create: async ({messages}) => {
          const systemPrompt = messages[0].content;

          if (systemPrompt.includes('creating a weekly office trivia quiz')) {
            generationCalls++;
            return {choices: [{message: {content: JSON.stringify(initialQuiz)}}]};
          }

          if (systemPrompt.includes('independent factual answer-checking agent')) {
            return {
              choices: [{
                message: {
                  content: JSON.stringify({
                    questions: [
                      'Alpha Answer',
                      'Beta Answer',
                      'Delta Answer',
                      'Epsilon Answer',
                      'Zeta Answer',
                      'Eta Answer',
                    ].map(answer => ({
                      independentlySolvedAnswer: answer,
                      acceptedAnswers: [],
                      questionWasClear: true,
                      reason: 'Matches the supplied test fixture.',
                    })),
                  }),
                },
              }],
            };
          }

          if (systemPrompt.includes('repair office trivia questions')) {
            return {
              choices: [{
                message: {
                  content: JSON.stringify({
                    questions: correctedQuiz.questions.map(item => ({
                      question: item.question,
                    })),
                  }),
                },
              }],
            };
          }

          if (systemPrompt.includes('factual and editorial QA agent')) {
            validationCalls++;

            return {
              choices: [{
                message: {
                  content: JSON.stringify({
                    questions: correctedQuiz.questions.map(item => ({
                      ...item,
                      answerWasCorrect: true,
                      questionWasClear: true,
                      difficultyScore: 5,
                      reason: 'No correction needed.',
                    })),
                  }),
                },
              }],
            };
          }

          throw new Error(`Unexpected prompt: ${systemPrompt}`);
        },
      },
    },
  };

  const originalWarn = console.warn;
  let quiz;

  try {
    console.warn = () => {};
    quiz = await generateQuestionsForTopic(openai, 'test topic');
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(generationCalls, 1);
  assert.equal(validationCalls, 1);
  assert.equal(quiz.questions[0].question, correctedQuiz.questions[0].question);
  assert.equal(quiz.questions[0].correctAnswer, 'Alpha Answer');
  assert.equal(quiz.questions[0].isBonus, false);
  assert.equal(quiz.questions[1].correctAnswer, 'Beta Answer');
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
  assert.match(systemPrompt, /isBonus=true question must stay on topic/);
  assert.match(systemPrompt, /For an off-topic bonus, preserve isBonus=true/);
  assert.match(systemPrompt, /difficultyScore from 0 to 10/);
  assert.match(systemPrompt, /difficultyScore under 8 are acceptable/);
  assert.match(systemPrompt, /difficultyScore 8 or higher/);
  assert.match(systemPrompt, /just because the intended answer is clear/);
  assert.match(systemPrompt, /directly include the exact correctAnswer/);
  assert.match(systemPrompt, /non-identifying descriptive language/);
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
  assert.match(messages[0].content, /off-topic for the provided theme/);
  assert.match(messages[0].content, /especially strict with the isBonus=true question/);
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
  assert.deepEqual(result.issues, []);
  assert.equal(result.corrections[0].type, 'answer-mismatch');
});

test('independent fact-check auto-corrected mismatches are not blocking issues', () => {
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

  assert.deepEqual(getBlockingFactCheckIssues(result.issues), []);
});

test('answer compatibility treats series shorthand as matching a specific installment title', () => {
  assert.equal(
    answerFormsAreCompatible('harry potter', 'harry potter and the philosopher s stone'),
    true
  );
  assert.equal(
    answerFormsAreCompatible('a long long way', 'a portrait of the artist as a young man'),
    false
  );
});

test('independent fact-check accepts compatible answer variants without correction', () => {
  const result = enforceIndependentFactCheck(
    {
      questions: [
        {
          question: 'This debut novel introduced a boy wizard at Hogwarts and was published in 1997. What is it called?',
          correctAnswer: 'Harry Potter',
          acceptedAnswers: ['Harry Potter and the Philosopher\'s Stone'],
          isBonus: false,
        },
      ],
    },
    {
      questions: [
        {
          independentlySolvedAnswer: 'Harry Potter and the Philosopher\'s Stone',
          acceptedAnswers: ['Harry Potter and the Sorcerer\'s Stone'],
          questionWasClear: true,
          reason: 'The clue asks for the first book title.',
        },
      ],
    }
  );

  assert.equal(result.quiz.questions[0].correctAnswer, 'Harry Potter');
  assert.deepEqual(result.corrections, []);
});

test('validation context includes initial unclear-question issues on first attempt', () => {
  const contextIssues = buildValidationContextIssues([
    {
      questionIndex: 2,
      type: 'unclear-question',
      reason: 'The clue conflates unrelated works.',
    },
  ]);

  const messages = buildAnswerValidationMessages(
    'Books',
    {questions: []},
    {questions: []},
    contextIssues
  );

  assert.match(messages[1].content, /unclear-question/);
  assert.match(messages[1].content, /conflates unrelated works/);
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
        difficultyScore: 4,
        reason: 'The answer should be Mexico City.',
      },
    ]
  );

  assert.equal(corrections.length, 1);
  assert.deepEqual(corrections[0].issues, ['answer-marked-incorrect-without-correction']);
});

test('validation accepts clear questions below difficulty threshold', () => {
  const corrections = getValidationCorrections(
    [
      {
        question: 'This Seattle coffee chain popularized the Frappuccino and uses a siren logo. What company is it?',
        correctAnswer: 'Starbucks',
        acceptedAnswers: [],
        isBonus: false,
      },
    ],
    [
      {
        question: 'This Seattle coffee chain popularized the Frappuccino and uses a siren logo. What company is it?',
        correctAnswer: 'Starbucks',
        acceptedAnswers: [],
        isBonus: false,
        answerWasCorrect: true,
        questionWasClear: true,
        difficultyScore: 7,
        reason: 'The intended answer is clear, but the exact answer is not in the question and the difficulty is below the rewrite threshold.',
      },
    ]
  );

  assert.deepEqual(corrections, []);
});

test('successful validation rewrites do not block quiz acceptance', () => {
  const corrections = getValidationCorrections(
    [
      {
        question: 'This British Nobel laureate authored a collection of seasonal-themed essays on poetry, published around 2000. Who is this poet?',
        correctAnswer: 'Seamus Heaney',
        acceptedAnswers: [],
        isBonus: false,
      },
      {
        question: 'This 1980s comic book by Alan Moore and Dave Gibbons features morally complex super-heroes. What is it called?',
        correctAnswer: 'Watchmen',
        acceptedAnswers: [],
        isBonus: false,
      },
    ],
    [
      {
        question: 'This Irish Nobel laureate poet authored a collection of seasonal-themed essays on poetry, published around 2000. Who is this poet?',
        correctAnswer: 'Seamus Heaney',
        acceptedAnswers: [],
        isBonus: false,
        answerWasCorrect: true,
        questionWasClear: true,
        difficultyScore: 8,
        reason: 'The question was slightly inaccurate calling Heaney British; he was Irish.',
      },
      {
        question: 'This 1980s comic book by Alan Moore and Dave Gibbons features morally complex superheroes. What is it called?',
        correctAnswer: 'Watchmen',
        acceptedAnswers: [],
        isBonus: false,
        answerWasCorrect: true,
        questionWasClear: true,
        difficultyScore: 7,
        reason: "The clue identifies 'Watchmen' correctly.",
      },
    ]
  );

  assert.equal(corrections.length, 2);
  assert.deepEqual(getBlockingValidationCorrections(corrections), []);
});

test('validation flags questions at difficulty threshold', () => {
  const corrections = getValidationCorrections(
    [
      {
        question: 'This Seattle coffee chain uses a siren logo. What company is it?',
        correctAnswer: 'Starbucks',
        acceptedAnswers: [],
        isBonus: false,
      },
    ],
    [
      {
        question: 'This Seattle coffee chain uses a siren logo. What company is it?',
        correctAnswer: 'Starbucks',
        acceptedAnswers: [],
        isBonus: false,
        answerWasCorrect: true,
        questionWasClear: true,
        difficultyScore: 8,
        reason: 'This is too easy for the requested quiz.',
      },
    ]
  );

  assert.equal(corrections.length, 1);
  assert.deepEqual(corrections[0].issues, ['question-difficulty-score-too-high']);
});

test('answer leak scan flags exact answer text inside question text', () => {
  const leaks = getQuestionAnswerLeaks([
    {
      question: 'This clue says Alpha Answer directly. What is it?',
      correctAnswer: 'Alpha Answer',
      acceptedAnswers: [],
      isBonus: false,
    },
    {
      question: 'This clue points to a second item through two neutral facts. What is it?',
      correctAnswer: 'Beta Answer',
      acceptedAnswers: [],
      isBonus: false,
    },
  ]);

  assert.equal(leaks.length, 1);
  assert.equal(leaks[0].questionIndex, 0);
  assert.equal(leaks[0].matchedText, 'alpha answer');
});

test('answer leak scan ignores non-identifying descriptive words from multi-word answers', () => {
  const leaks = getQuestionAnswerLeaks([
    {
      question: 'This 1950 authoritarian-focused social psychology study by Adorno and others analyzed prejudice and rigid thinking. What is the title of this work?',
      correctAnswer: 'The Authoritarian Personality',
      acceptedAnswers: [],
      isBonus: false,
    },
    {
      question: 'This foundational science fiction saga by Isaac Asimov spans millennia through psychohistory and a galactic empire. What is this famous series called?',
      correctAnswer: 'The Foundation Series',
      acceptedAnswers: [],
      isBonus: false,
    },
  ], {ownQuestionOnly: true});

  assert.deepEqual(leaks, []);
});

test('answer leak scan still flags full answer phrases in the question', () => {
  const leaks = getQuestionAnswerLeaks([
    {
      question: 'This clue says Alpha Answer directly. What is it?',
      correctAnswer: 'Alpha Answer',
      acceptedAnswers: [],
      isBonus: false,
    },
  ], {ownQuestionOnly: true});

  assert.equal(leaks.length, 1);
  assert.equal(leaks[0].matchedText, 'alpha answer');
});

test('answer leak scan can limit checks to each question own answers', () => {
  const leaks = getQuestionAnswerLeaks([
    {
      question: 'This novel follows a whale-obsessed captain. What is it called?',
      correctAnswer: 'Moby-Dick',
      acceptedAnswers: [],
      isBonus: false,
    },
    {
      question: 'This epic poem features a hero named Odysseus. What is it called?',
      correctAnswer: 'The Odyssey',
      acceptedAnswers: ['Odyssey'],
      isBonus: false,
    },
  ], {ownQuestionOnly: true});

  assert.deepEqual(leaks, []);
});

test('duplicate answer scan flags repeated answer sets across questions', () => {
  const issues = getDuplicateAnswerIssues([
    {
      correctAnswer: 'Great Expectations',
      acceptedAnswers: [],
    },
    {
      correctAnswer: 'Jane Eyre',
      acceptedAnswers: ['Great Expectations'],
    },
  ]);

  assert.equal(issues.length, 1);
  assert.equal(issues[0].type, 'duplicate-answer');
  assert.equal(issues[0].questionIndex, 1);
  assert.equal(issues[0].duplicateOfQuestionIndex, 0);
});

test('validation retry prompt includes prior unresolved issues', () => {
  const priorIssues = [{
    questionIndex: 1,
    issues: ['answer-marked-incorrect-without-correction'],
    reason: 'The answer should be Jane Eyre.',
  }];
  const messages = buildAnswerValidationMessages(
    'Books',
    {questions: []},
    {questions: []},
    priorIssues
  );

  assert.match(messages[1].content, /Previous pass left these unresolved issues/);
  assert.match(messages[1].content, /answer-marked-incorrect-without-correction/);
  assert.match(messages[1].content, /Fix all of them in this response/);
});

test('auto-corrected final fact-check mismatch does not fail generation', async () => {
  const initialQuiz = {
    questions: [
      {
        question: 'This city hosted the famous "Hand of God" goal scored by Diego Maradona during the 1986 World Cup.',
        correctAnswer: 'Buenos Aires',
        acceptedAnswers: [],
        isBonus: false,
      },
      {
        question: 'This clue points to a second item through two neutral facts. What is it?',
        correctAnswer: 'Beta Answer',
        acceptedAnswers: [],
        isBonus: false,
      },
      {
        question: 'This clue points to a third item through two neutral facts. What is it?',
        correctAnswer: 'Delta Answer',
        acceptedAnswers: [],
        isBonus: false,
      },
      {
        question: 'This clue points to a fourth item through two neutral facts. What is it?',
        correctAnswer: 'Epsilon Answer',
        acceptedAnswers: [],
        isBonus: false,
      },
      {
        question: 'This clue points to a fifth item through two neutral facts. What is it?',
        correctAnswer: 'Zeta Answer',
        acceptedAnswers: [],
        isBonus: false,
      },
      {
        question: 'This harder clue points to a sixth item through layered neutral facts. What is it?',
        correctAnswer: 'Eta Answer',
        acceptedAnswers: [],
        isBonus: true,
      },
    ],
  };

  let factCheckCalls = 0;
  const openai = {
    chat: {
      completions: {
        create: async ({messages}) => {
          const systemPrompt = messages[0].content;

          if (systemPrompt.includes('creating a weekly office trivia quiz')) {
            return {choices: [{message: {content: JSON.stringify(initialQuiz)}}]};
          }

          if (systemPrompt.includes('independent factual answer-checking agent')) {
            factCheckCalls++;
            const solvedAnswers = factCheckCalls === 2
              ? ['Mexico City', 'Beta Answer', 'Delta Answer', 'Epsilon Answer', 'Zeta Answer', 'Eta Answer']
              : ['Buenos Aires', 'Beta Answer', 'Delta Answer', 'Epsilon Answer', 'Zeta Answer', 'Eta Answer'];

            return {
              choices: [{
                message: {
                  content: JSON.stringify({
                    questions: solvedAnswers.map((answer, index) => ({
                      independentlySolvedAnswer: answer,
                      acceptedAnswers: index === 0 && factCheckCalls === 2 ? ['Ciudad de Mexico'] : [],
                      questionWasClear: true,
                      reason: index === 0 && factCheckCalls === 2
                        ? 'The 1986 World Cup quarter-final was played at Estadio Azteca in Mexico City.'
                        : 'Matches the supplied test fixture.',
                    })),
                  }),
                },
              }],
            };
          }

          if (systemPrompt.includes('factual and editorial QA agent')) {
            return {
              choices: [{
                message: {
                  content: JSON.stringify({
                    questions: initialQuiz.questions.map(item => ({
                      ...item,
                      answerWasCorrect: true,
                      questionWasClear: true,
                      difficultyScore: 5,
                      reason: 'No correction needed.',
                    })),
                  }),
                },
              }],
            };
          }

          throw new Error(`Unexpected prompt: ${systemPrompt}`);
        },
      },
    },
  };

  const originalWarn = console.warn;
  let quiz;

  try {
    console.warn = () => {};
    quiz = await generateQuestionsForTopic(openai, 'Football Moments');
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(quiz.questions[0].correctAnswer, 'Mexico City');
  assert.deepEqual(quiz.questions[0].acceptedAnswers, ['Ciudad de Mexico']);
});

test('generation retries from scratch when validation fails on first candidate', async () => {
  const badQuiz = {
    questions: [
      {
        question: 'This famous city hosted a famous goal. Which city was it?',
        correctAnswer: 'Buenos Aires',
        acceptedAnswers: [],
        isBonus: false,
      },
      {
        question: 'This clue points to a second item through two neutral facts. What is it?',
        correctAnswer: 'Beta Answer',
        acceptedAnswers: [],
        isBonus: false,
      },
      {
        question: 'This clue points to a third item through two neutral facts. What is it?',
        correctAnswer: 'Delta Answer',
        acceptedAnswers: [],
        isBonus: false,
      },
      {
        question: 'This clue points to a fourth item through two neutral facts. What is it?',
        correctAnswer: 'Epsilon Answer',
        acceptedAnswers: [],
        isBonus: false,
      },
      {
        question: 'This clue points to a fifth item through two neutral facts. What is it?',
        correctAnswer: 'Zeta Answer',
        acceptedAnswers: [],
        isBonus: false,
      },
      {
        question: 'This harder clue points to a sixth item through layered neutral facts. What is it?',
        correctAnswer: 'Eta Answer',
        acceptedAnswers: [],
        isBonus: true,
      },
    ],
  };
  const goodQuiz = {
    questions: badQuiz.questions.map((item, index) => ({
      ...item,
      question: index === 0
        ? 'This city hosted the famous "Hand of God" goal scored by Diego Maradona during the 1986 World Cup.'
        : item.question,
      correctAnswer: index === 0 ? 'Mexico City' : item.correctAnswer,
    })),
  };

  let generationCalls = 0;
  const openai = {
    chat: {
      completions: {
        create: async ({messages}) => {
          const systemPrompt = messages[0].content;

          if (systemPrompt.includes('creating a weekly office trivia quiz')) {
            generationCalls++;
            const quiz = generationCalls === 1 ? badQuiz : goodQuiz;
            return {choices: [{message: {content: JSON.stringify(quiz)}}]};
          }

          if (systemPrompt.includes('independent factual answer-checking agent')) {
            const quiz = generationCalls === 1 ? badQuiz : goodQuiz;
            return {
              choices: [{
                message: {
                  content: JSON.stringify({
                    questions: quiz.questions.map(item => ({
                      independentlySolvedAnswer: item.correctAnswer,
                      acceptedAnswers: [],
                      questionWasClear: generationCalls === 1 ? false : true,
                      reason: generationCalls === 1
                        ? 'The clue does not identify a specific event or city.'
                        : 'Matches the supplied test fixture.',
                    })),
                  }),
                },
              }],
            };
          }

          if (systemPrompt.includes('factual and editorial QA agent')) {
            const quiz = generationCalls === 1 ? badQuiz : goodQuiz;
            return {
              choices: [{
                message: {
                  content: JSON.stringify({
                    questions: quiz.questions.map(item => ({
                      ...item,
                      answerWasCorrect: true,
                      questionWasClear: true,
                      difficultyScore: 5,
                      reason: 'No correction needed.',
                    })),
                  }),
                },
              }],
            };
          }

          throw new Error(`Unexpected prompt: ${systemPrompt}`);
        },
      },
    },
  };

  const originalWarn = console.warn;
  let quiz;

  try {
    console.warn = () => {};
    quiz = await generateQuestionsForTopic(openai, 'Football Moments');
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(generationCalls, 2);
  assert.equal(quiz.questions[0].correctAnswer, 'Mexico City');
});
