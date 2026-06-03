import {zodResponseFormat} from 'openai/helpers/zod';
import {z} from 'zod';

const question = z.object({
  question: z.string(),
  correctAnswer: z.string(),
  acceptedAnswers: z.array(z.string()),
  isBonus: z.boolean(),
});

const generateQuestionsSchema = z.object({
  questions: z.array(question).length(6),
});

const repairQuestion = z.object({
  question: z.string(),
});

const repairQuestionsSchema = z.object({
  questions: z.array(repairQuestion).length(6),
});

const answerValidationQuestion = z.object({
  question: z.string(),
  correctAnswer: z.string(),
  acceptedAnswers: z.array(z.string()),
  isBonus: z.boolean(),
  answerWasCorrect: z.boolean(),
  questionWasClear: z.boolean(),
  reason: z.string(),
});

const answerValidationSchema = z.object({
  questions: z.array(answerValidationQuestion).length(6),
});

const independentFactCheckQuestion = z.object({
  independentlySolvedAnswer: z.string(),
  acceptedAnswers: z.array(z.string()),
  questionWasClear: z.boolean(),
  reason: z.string(),
});

const independentFactCheckSchema = z.object({
  questions: z.array(independentFactCheckQuestion).length(6),
});

const GENERATE_MODEL = process.env.OPENAI_TRIVIA_GENERATE_MODEL || 'gpt-4.1-nano';
const REPAIR_MODEL = process.env.OPENAI_TRIVIA_REPAIR_MODEL || GENERATE_MODEL;
const VALIDATE_MODEL = process.env.OPENAI_TRIVIA_VALIDATE_MODEL || 'gpt-4.1-mini';
const FACT_CHECK_MODEL = process.env.OPENAI_TRIVIA_FACT_CHECK_MODEL || VALIDATE_MODEL;
const MAX_GENERATION_ATTEMPTS = 3;
const MAX_REPAIR_ATTEMPTS = 3;
const MAX_ANSWER_VALIDATION_ATTEMPTS = 2;
const MIN_ANSWER_TOKEN_LENGTH = 3;
const MIN_DISTINCTIVE_MULTIWORD_TOKEN_LENGTH = 6;
const SPECIFIC_QUESTION_STYLE_GUIDANCE =
  '- Write each question like a concise clue card: one specific clue sentence with 2 to 4 verifiable details before the ask.\n' +
  '- A strong clue sentence usually identifies the kind of answer expected and includes concrete details such as origin/country, era, genre, premise, setting, format, creator/performer role, award/reception, or historical context.\n' +
  '- Prefer this shape when natural: "This [origin/era/genre] [type of thing] follows/features/introduced..." followed by "What is it called?", "Who is this?", or another direct ask.\n' +
  '- Avoid vague one-fact prompts, broad popularity claims, opinion wording, giveaway phrasing, and clues that could fit many answers.\n' +
  '- Example style for a TV topic: "This German sci-fi mystery drama follows four interconnected families in a small town as they uncover a conspiracy spanning generations. What is it called?"\n';
const GENERIC_ANSWER_TOKENS = new Set([
  'academy',
  'america',
  'american',
  'apple',
  'art',
  'asia',
  'atlas',
  'award',
  'awards',
  'band',
  'bay',
  'beach',
  'book',
  'books',
  'canada',
  'capital',
  'center',
  'centre',
  'city',
  'college',
  'company',
  'country',
  'county',
  'east',
  'eastern',
  'empire',
  'europe',
  'festival',
  'film',
  'fort',
  'game',
  'garden',
  'general',
  'group',
  'hall',
  'high',
  'hill',
  'history',
  'home',
  'house',
  'island',
  'islands',
  'king',
  'kingdom',
  'lake',
  'language',
  'little',
  'los',
  'mount',
  'mountain',
  'mountains',
  'museum',
  'national',
  'new',
  'north',
  'northern',
  'ocean',
  'park',
  'queen',
  'republic',
  'river',
  'run',
  'running',
  'saint',
  'school',
  'sea',
  'south',
  'southern',
  'state',
  'station',
  'street',
  'studio',
  'studios',
  'team',
  'the',
  'town',
  'united',
  'university',
  'valley',
  'west',
  'western',
  'world',
  'york',
]);

function normalizeForLeakCheck(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getAnswerLeakTokens(answer) {
  const normalized = normalizeForLeakCheck(answer);
  if (!normalized) {
    return [];
  }

  const words = normalized
    .split(' ')
    .filter((word) => word.length >= MIN_ANSWER_TOKEN_LENGTH);

  const tokens = new Set();
  if (words.length === 1) {
    tokens.add(words[0]);
    return [...tokens];
  }

  if (normalized.length >= MIN_ANSWER_TOKEN_LENGTH) {
    tokens.add(normalized);
  }

  for (let start = 0; start < words.length; start++) {
    for (let end = start + 2; end <= words.length; end++) {
      tokens.add(words.slice(start, end).join(' '));
    }
  }

  words.forEach((word) => {
    if (
      word.length >= MIN_DISTINCTIVE_MULTIWORD_TOKEN_LENGTH &&
      !GENERIC_ANSWER_TOKENS.has(word)
    ) {
      tokens.add(word);
    }
  });

  return [...tokens];
}

function findAnswerLeak(questionText, answer) {
  const normalizedQuestion = ` ${normalizeForLeakCheck(questionText)} `;
  if (!normalizedQuestion.trim()) {
    return null;
  }

  for (const token of getAnswerLeakTokens(answer)) {
    if (normalizedQuestion.includes(` ${token} `)) {
      return token;
    }
  }

  return null;
}

function getAnswerTextsForLeakCheck(answerItem) {
  return [
    answerItem.correctAnswer,
    ...(Array.isArray(answerItem.acceptedAnswers) ? answerItem.acceptedAnswers : []),
  ].filter(Boolean);
}

export function getQuestionAnswerLeaks(questions) {
  const leaks = [];

  questions.forEach((questionItem, questionIndex) => {
    questions.forEach((answerItem, answerIndex) => {
      getAnswerTextsForLeakCheck(answerItem).forEach((answerText) => {
        const matchedText = findAnswerLeak(questionItem.question, answerText);
        if (matchedText) {
          leaks.push({
            questionIndex,
            answerIndex,
            answer: answerText,
            matchedText,
          });
        }
      });
    });
  });

  return leaks;
}

export function buildQuizSystemPrompt(topic) {
  const calendarHint = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
      `You are an expert trivia writer creating a weekly office trivia quiz. 

      CONTEXT & AUDIENCE:
      - Target: Adults (19 to 40+) with post-secondary education. The tone must be cultured and professional.
      - Safety: Strictly safe-for-work (SFW). No sexual content, slurs, hateful themes, graphic violence, or polarizing political advocacy.
      - Tech Twist: If the theme naturally allows, include one question that appeals to software developers (CS history, tools, tech culture). Do not force this if unrelated.
      - Seasonality: Where natural, weave in framing related to the current season or time of year.
      - Calendar hint: ${calendarHint}
      
      QUIZ ARCHITECTURE:
      - Total Questions: Exactly 6 questions total (5 regular questions, 1 bonus question).
      - Topic: All 6 questions must strictly focus on the following theme: ${topic}
      - Structure: Short-answer format only (no multiple-choice options).
      - Length: Every question must be concise. Use at most 1 clue sentence before the final question sentence. Max 2 sentences total.
      - Answer Uniqueness: All 6 questions must resolve to 6 different real-world answers. Do not create two questions whose correctAnswer or acceptedAnswers identify the same person, place, work, brand, event, concept, object, or entity.
      
      DIFFICULTY & CLUE RULES:
      - Regular Questions (isBonus: false): Medium difficulty. Use layered clues that require connecting two distinct facts. Avoid elementary facts, celebrity-name-only prompts, or instant giveaway clues.
      - Bonus Question (isBonus: true): The hardest question on the list. Requires deeper cultural, historical, technical, or contextual knowledge, but must remain fair and answerable.
      - Factual Alignment Rule: Every clue must factually identify the correctAnswer. Do not invent or guess event locations, hosts, dates, creators, awards, record holders, firsts, or causal relationships.
      - Location/Event Rule: If a question asks for a city, country, venue, host, birthplace, origin, or setting, verify that the named answer is the actual location implied by the clue, not merely a related place.
      - Clue Isolation Rule: Clues must point indirectly to the answer. Do not use surnames, place names, unique titles, or distinctive nouns from the answer inside the question text.
      - Cross-Contamination Rule: The correct answer or any accepted answer for a question must NOT appear verbatim, as a root word, or as a substring inside its own question OR any other question in the entire quiz. Every canonical answer and accepted answer must refer to only one question.
      
      OUTPUT SCHEMA:
      Return ONLY a valid JSON object matching this exact TypeScript interface. Do not wrap the JSON in markdown code blocks, and do not include any conversational preambles or postscripts.
      
      interface QuizOutput {
        questions: Array<{
          question: string;       // Max 2 sentences. Contains no parts of any answer.
          correctAnswer: string;  // Concise, canonical answer. Unique across the quiz.
          acceptedAnswers: string[]; // Obvious variants, abbreviations, alternate names, and meaningful shortened forms. Empty array if none.
          isBonus: boolean;       // True for exactly 1 question, false for the other 5.
        }>;
      }

      ANSWER ACCEPTANCE:
      - correctAnswer must be the concise canonical answer to display after the quiz.
      - acceptedAnswers must include common abbreviations, acronyms, alternate spellings, former/current names, and shortened answers that still uniquely identify the same answer in context.
      - Include a partial answer only when the omitted words are non-essential geographic, legal, corporate, edition, parenthetical, or descriptive qualifiers.
      - Do NOT include location-only, category-only, overly broad, ambiguous, or merely related answers.
      - Do NOT duplicate correctAnswer inside acceptedAnswers.
      - Do NOT reuse another question's correctAnswer, acceptedAnswers, alternate names, abbreviations, or semantic equivalent as an answer or alias.
      
      CRITICAL EXECUTION STEPS FOR THE AI:
      1. Brainstorm 6 unique answers related to the theme, where no two answers are aliases or alternate names for the same thing.
      2. Draft the questions ensuring the max 2-sentence limit.
      3. Add acceptedAnswers for each answer using the answer acceptance rules above.
      4. Strict Verification Step: Review your drafted JSON. First independently solve each question from the clue text and verify that the solution equals correctAnswer. Then verify that the 6 answer sets are semantically distinct from each other. Then check every question string character-by-character against all 6 correct answers and accepted answers. If any answer is factually wrong, duplicated, equivalent, or appears in any question text, replace that answer or rewrite that question completely before generating the final JSON string.
      `);
}

function buildGenerationMessages(topic, lastLeaks = []) {
  const messages = [
    {
      role: 'system',
      content: buildQuizSystemPrompt(topic),
    },
  ];

  if (lastLeaks.length > 0) {
    const leakSummaries = [...new Set(
      lastLeaks.map(({answer, matchedText}) => `"${matchedText}" from answer "${answer}"`)
    )];

    messages.push({
      role: 'user',
      content:
        'Your previous attempt leaked answer text into the questions. ' +
        `Regenerate the full quiz from scratch and avoid these leaked answer fragments in every question: ${leakSummaries.join(', ')}.`,
    });
  }

  return messages;
}

function summarizeLeaks(leaks) {
  return leaks.map(({questionIndex, answerIndex, answer, matchedText}) =>
    `Question ${questionIndex + 1} leaked "${matchedText}" from answer ${answerIndex + 1} ("${answer}")`
  );
}

function buildRepairMessages(topic, quiz, leaks) {
  return [
    {
      role: 'system',
      content:
        'You repair office trivia questions that leaked answer text.\n' +
        'Rules:\n' +
        '- Keep the quiz topic, question order, answers, and bonus flags exactly the same.\n' +
        '- Rewrite question text only.\n' +
        '- Keep each question concise and short-answer.\n' +
        '- Use at most 1 brief clue sentence before the ask.\n' +
        SPECIFIC_QUESTION_STYLE_GUIDANCE +
        '- A broad or generic component of a multi-word answer can stay if it does not reveal the full answer; for example, "running" is allowed when the answer is "Trail Running".\n' +
        '- Do not use any full answer, surname, title, place name, or any other genuinely revealing fragment from any answer anywhere in any question.\n' +
        '- Return JSON matching: { "questions": [ { "question": string }, ... ] } with exactly 6 entries in the same order.',
    },
    {
      role: 'user',
      content:
        `Theme/topic: ${topic}\n` +
        `Current quiz JSON:\n${JSON.stringify(quiz, null, 2)}\n` +
        `Detected leaks:\n- ${summarizeLeaks(leaks).join('\n- ')}\n` +
        'Rewrite the leaking question text so the quiz stays clear, fair, and answerable without leaking answers. Preserve order.',
    },
  ];
}

function mergeRepairedQuestions(originalQuestions, repairedQuestions) {
  return originalQuestions.map((item, index) => ({
    ...item,
    question: (repairedQuestions[index]?.question || item.question).trim(),
  }));
}

function normalizeAcceptedAnswers(acceptedAnswers, correctAnswer) {
  const correctNormalized = normalizeForLeakCheck(correctAnswer);

  return [...new Set(
    (Array.isArray(acceptedAnswers) ? acceptedAnswers : [])
      .map(answer => String(answer || '').trim())
      .filter(Boolean)
      .filter(answer => normalizeForLeakCheck(answer) !== correctNormalized)
  )];
}

function getComparableAnswerForms(answer) {
  const normalized = normalizeForLeakCheck(answer);
  if (!normalized) {
    return [];
  }

  return [
    normalized,
    normalized.replace(/^(the|a|an) /, ''),
  ].filter(Boolean);
}

function answerSetIncludesAnswer(question, answer) {
  const answerForms = new Set(getComparableAnswerForms(answer));
  if (answerForms.size === 0) {
    return false;
  }

  return getAnswerTextsForLeakCheck(question)
    .flatMap(getComparableAnswerForms)
    .some(candidate => answerForms.has(candidate));
}

export function enforceIndependentFactCheck(quiz, independentFactCheck) {
  const issues = [];

  const questions = quiz.questions.map((item, index) => {
    const factCheck = independentFactCheck?.questions?.[index];
    if (!factCheck) {
      issues.push({
        questionIndex: index,
        type: 'missing-fact-check',
        reason: 'Independent fact-check result was missing for this question.',
      });
      return item;
    }

    let correctedItem = item;
    const independentlySolvedAnswer = String(factCheck.independentlySolvedAnswer || '').trim();

    if (factCheck.questionWasClear === false) {
      issues.push({
        questionIndex: index,
        type: 'unclear-question',
        reason: factCheck.reason,
      });
    }

    if (
      independentlySolvedAnswer &&
      factCheck.questionWasClear !== false &&
      !answerSetIncludesAnswer(item, independentlySolvedAnswer)
    ) {
      const correctedAcceptedAnswers = normalizeAcceptedAnswers(
        factCheck.acceptedAnswers,
        independentlySolvedAnswer
      );

      correctedItem = {
        ...item,
        correctAnswer: independentlySolvedAnswer,
        acceptedAnswers: correctedAcceptedAnswers,
      };

      issues.push({
        questionIndex: index,
        type: 'answer-mismatch',
        answerFrom: item.correctAnswer,
        answerTo: independentlySolvedAnswer,
        acceptedAnswersFrom: normalizeAcceptedAnswers(item.acceptedAnswers, item.correctAnswer),
        acceptedAnswersTo: correctedAcceptedAnswers,
        reason: factCheck.reason,
      });
    }

    return correctedItem;
  });

  return {
    quiz: {questions},
    issues,
  };
}

function mergeValidatedQuestions(originalQuestions, validatedQuestions) {
  return originalQuestions.map((item, index) => ({
    ...item,
    question: (validatedQuestions[index]?.question || item.question).trim(),
    correctAnswer: (validatedQuestions[index]?.correctAnswer || item.correctAnswer).trim(),
    acceptedAnswers: normalizeAcceptedAnswers(
      validatedQuestions[index]?.acceptedAnswers ?? item.acceptedAnswers,
      validatedQuestions[index]?.correctAnswer || item.correctAnswer
    ),
  }));
}

export function getValidationCorrections(originalQuestions, validatedQuestions) {
  const corrections = [];

  originalQuestions.forEach((item, index) => {
    const validated = validatedQuestions[index];
    const correctedQuestion = (validated?.question || '').trim();
    const correctedAnswer = (validated?.correctAnswer || '').trim();
    const correctedAcceptedAnswers = normalizeAcceptedAnswers(
      validated?.acceptedAnswers,
      correctedAnswer || item.correctAnswer
    );
    const existingAcceptedAnswers = normalizeAcceptedAnswers(item.acceptedAnswers, item.correctAnswer);
    const questionChanged = correctedQuestion && correctedQuestion !== item.question;
    const answerChanged = correctedAnswer && correctedAnswer !== item.correctAnswer;
    const acceptedAnswersChanged =
      JSON.stringify(correctedAcceptedAnswers) !== JSON.stringify(existingAcceptedAnswers);
    const answerFlaggedIncorrect = validated?.answerWasCorrect === false && !answerChanged;
    const questionFlaggedUnclear = validated?.questionWasClear === false && !questionChanged;

    if (
      !questionChanged &&
      !answerChanged &&
      !acceptedAnswersChanged &&
      !answerFlaggedIncorrect &&
      !questionFlaggedUnclear
    ) {
      return;
    }

    corrections.push({
      questionIndex: index,
      ...(questionChanged
        ? {
            questionFrom: item.question,
            questionTo: correctedQuestion,
          }
        : {}),
      ...(answerChanged
        ? {
            answerFrom: item.correctAnswer,
            answerTo: correctedAnswer,
          }
        : {}),
      ...(acceptedAnswersChanged
        ? {
            acceptedAnswersFrom: existingAcceptedAnswers,
            acceptedAnswersTo: correctedAcceptedAnswers,
          }
        : {}),
      ...(answerFlaggedIncorrect || questionFlaggedUnclear
        ? {
            issues: [
              ...(answerFlaggedIncorrect ? ['answer-marked-incorrect-without-correction'] : []),
              ...(questionFlaggedUnclear ? ['question-marked-unclear-without-rewrite'] : []),
            ],
          }
        : {}),
      reason: validated.reason,
    });
  });

  return corrections;
}

async function repairQuizQuestions(openai, topic, quiz, leaks) {
  const completion = await openai.chat.completions.create({
    messages: buildRepairMessages(topic, quiz, leaks),
    model: REPAIR_MODEL,
    response_format: zodResponseFormat(repairQuestionsSchema, 'repair_questions'),
  });

  const repairedQuiz = JSON.parse(completion.choices[0].message.content);

  return {
    questions: mergeRepairedQuestions(quiz.questions, repairedQuiz.questions),
  };
}

function getQuestionOnlyQuiz(quiz) {
  return {
    questions: quiz.questions.map((item, index) => ({
      index: index + 1,
      question: item.question,
      isBonus: item.isBonus === true,
    })),
  };
}

export function buildIndependentFactCheckMessages(topic, quiz) {
  return [
    {
      role: 'system',
      content:
        'You are an independent factual answer-checking agent for office trivia quizzes.\n' +
        'You are intentionally NOT given the generated correct answers. Solve each question only from the topic and clue text.\n' +
        'Rules:\n' +
        '- For each question, independently determine the concise canonical answer that the clue actually identifies.\n' +
        '- Do not infer from answer order, prior generated answers, or what the quiz writer may have intended.\n' +
        '- If the clue asks for a city, country, venue, host, birthplace, origin, or setting, return the exact location implied by the clue.\n' +
        '- If a clue contains a false premise or points to a different answer than a likely common misconception, return the factually correct answer and explain the issue briefly.\n' +
        '- Example standard: a clue about the "Hand of God" goal in the 1986 World Cup points to Mexico City, not Buenos Aires.\n' +
        '- Provide acceptedAnswers for common abbreviations, alternate names, and meaningful shortened forms that identify the same answer.\n' +
        '- Keep acceptedAnswers conservative: no location-only, category-only, overly broad, ambiguous, or merely related answers.\n' +
        '- Set questionWasClear=false if the clue is ambiguous, internally inconsistent, or under-clued; otherwise true.\n' +
        '- Return JSON matching: { "questions": [ { "independentlySolvedAnswer": string, "acceptedAnswers": string[], "questionWasClear": boolean, "reason": string }, ... ] } with exactly 6 entries in the same order.',
    },
    {
      role: 'user',
      content:
        `Theme/topic: ${topic}\n` +
        `Questions to solve without generated answers:\n${JSON.stringify(getQuestionOnlyQuiz(quiz), null, 2)}\n` +
        'Solve these questions independently from the clue text only.',
    },
  ];
}

async function independentlyFactCheckQuiz(openai, topic, quiz) {
  const completion = await openai.chat.completions.create({
    messages: buildIndependentFactCheckMessages(topic, quiz),
    model: FACT_CHECK_MODEL,
    response_format: zodResponseFormat(independentFactCheckSchema, 'independent_fact_check'),
  });

  return JSON.parse(completion.choices[0].message.content);
}

export function buildAnswerValidationMessages(topic, quiz, independentFactCheck = null) {
  return [
    {
      role: 'system',
      content:
        'You are a factual and editorial QA agent for office trivia quizzes.\n' +
        'Your job is to verify that each canonical answer actually answers its own question and that each question is specific, fair, and answerable.\n' +
        'Rules:\n' +
        '- Factual verification is primary. Check each question independently and solve it from the clue text before comparing it to the proposed answer.\n' +
        '- Do not assume the current answer is attached to the right question, and do not preserve a generated answer when the clue points somewhere else.\n' +
        '- An independent answer-checking agent may provide independentlySolvedAnswer values. Treat them as a second opinion that was generated without seeing proposed answers.\n' +
        '- When independentlySolvedAnswer conflicts with correctAnswer, resolve the conflict using the clue facts. Do not keep correctAnswer unless it is factually better supported than the independent answer.\n' +
        '- If the independent checker marks a question unclear, either rewrite the question to point to one answer or replace the answer with the clearest factually supported answer.\n' +
        '- If the clue facts imply a different answer, replace correctAnswer with the factually correct answer and set answerWasCorrect=false.\n' +
        '- Do not rewrite a factually sound question merely to fit a wrong generated answer. Prefer correcting the answer over changing the question when the question is clear and factual.\n' +
        '- For city, country, venue, host, birthplace, origin, and setting clues, verify the exact location implied by the event or fact.\n' +
        '- Example standard: a clue about the "Hand of God" goal in the 1986 World Cup points to Mexico City, not Buenos Aires.\n' +
        '- Rewrite weak question text when it is vague, too broad, ambiguous, opinion-based, under-clued, or could reasonably point to multiple answers.\n' +
        '- Rewrite questions that are too easy for post-secondary educated adults, such as elementary facts, obvious first-association clues, or simple name-this prompts with a single giveaway detail.\n' +
        '- When rewriting, use the same specific clue-card style as the generator: one concise clue sentence with 2 to 4 verifiable details, followed by a direct ask.\n' +
        SPECIFIC_QUESTION_STYLE_GUIDANCE +
        '- Prefer preserving the existing canonical answer only when it is factually supported by the existing clue or the existing clue is too vague to identify a different answer.\n' +
        '- If answers appear shifted, swapped, or one index off, correct each answer in place without reordering questions.\n' +
        '- If an answer is wrong, replace it with the concise canonical answer for that exact question.\n' +
        '- If an answer is already correct, keep the answer text exactly unless a tiny cleanup is needed.\n' +
        '- Ensure all 6 answer sets are semantically unique: no correctAnswer or acceptedAnswers entry may identify the same person, place, work, brand, event, concept, object, or entity as another question.\n' +
        '- If two questions point to the same answer or aliases of the same answer, keep the stronger question-answer pair and replace the duplicate answer with a different topic-matching canonical answer for that question.\n' +
        '- Ensure acceptedAnswers contains obvious variants, abbreviations, alternate names, and meaningful shortened forms that identify the same answer in context.\n' +
        '- Keep acceptedAnswers conservative: remove broad partial answers, category-only answers, location-only answers, and merely related answers.\n' +
        '- Acceptable shortened answers may omit non-essential geographic, legal, corporate, edition, parenthetical, or descriptive qualifiers only when the remaining text is distinctive.\n' +
        '- Do not duplicate correctAnswer inside acceptedAnswers, and do not add an accepted answer that belongs to a different question.\n' +
        '- Correct duplicate answers when one duplicate clearly belongs to another question, the clue points to a different canonical answer, or two entries are aliases for the same thing.\n' +
        '- Do not include the correct answer, surname, title, place name, or any other genuinely revealing answer fragment in any rewritten question.\n' +
        '- Preserve the original question order and isBonus flags exactly.\n' +
        '- Keep all answers safe-for-work and broadly accepted.\n' +
        '- Return the final question text in the question field, even when it did not need rewriting.\n' +
        '- Set questionWasClear=false if you rewrote the question for clarity, specificity, or answerability; otherwise true.\n' +
        '- Return JSON matching: { "questions": [ { "question": string, "correctAnswer": string, "acceptedAnswers": string[], "isBonus": boolean, "answerWasCorrect": boolean, "questionWasClear": boolean, "reason": string }, ... ] } with exactly 6 entries.',
    },
    {
      role: 'user',
      content:
        `Theme/topic: ${topic}\n` +
        `Quiz JSON to verify:\n${JSON.stringify(quiz, null, 2)}\n` +
        `Independent answer-checker results:\n${JSON.stringify(independentFactCheck || {questions: []}, null, 2)}\n` +
        'Verify each answer against its question, correct any wrong or shifted answers, rewrite vague questions into specific clue-card questions, and validate accepted answer variants.',
    },
  ];
}

async function validateQuizAnswers(openai, topic, quiz, independentFactCheck = null) {
  const completion = await openai.chat.completions.create({
    messages: buildAnswerValidationMessages(topic, quiz, independentFactCheck),
    model: VALIDATE_MODEL,
    response_format: zodResponseFormat(answerValidationSchema, 'validate_answers'),
  });

  const validatedQuiz = JSON.parse(completion.choices[0].message.content);
  const corrections = getValidationCorrections(quiz.questions, validatedQuiz.questions);

  if (corrections.length > 0) {
    console.warn(
      `Quiz validation corrected quiz "${topic}".`,
      corrections
    );
  }

  return {
    questions: mergeValidatedQuestions(quiz.questions, validatedQuiz.questions),
    corrections,
  };
}

async function repairLeaksIfNeeded(openai, topic, quiz) {
  let candidateQuiz = quiz;
  let leaks = getQuestionAnswerLeaks(candidateQuiz.questions);

  for (let repairAttempt = 1; leaks.length > 0 && repairAttempt <= MAX_REPAIR_ATTEMPTS; repairAttempt++) {
    try {
      candidateQuiz = await repairQuizQuestions(openai, topic, candidateQuiz, leaks);
    } catch (error) {
      console.warn(
        `Repair attempt ${repairAttempt} failed for quiz "${topic}".`,
        error
      );
      break;
    }

    leaks = getQuestionAnswerLeaks(candidateQuiz.questions);
    if (leaks.length > 0) {
      console.warn(
        `Repaired quiz for "${topic}" still leaked answers on repair attempt ${repairAttempt}.`,
        leaks
      );
    }
  }

  return {
    quiz: candidateQuiz,
    leaks,
  };
}

async function validateAndRepairQuiz(openai, topic, quiz) {
  let candidateQuiz = quiz;
  let corrections = [];
  let leaks = [];
  let unresolvedIssues = [];

  for (let attempt = 1; attempt <= MAX_ANSWER_VALIDATION_ATTEMPTS; attempt++) {
    const independentFactCheck = await independentlyFactCheckQuiz(openai, topic, candidateQuiz);
    const initialFactCheck = enforceIndependentFactCheck(candidateQuiz, independentFactCheck);
    candidateQuiz = initialFactCheck.quiz;

    const validation = await validateQuizAnswers(openai, topic, candidateQuiz, independentFactCheck);
    candidateQuiz = {
      questions: validation.questions,
    };
    corrections = [
      ...initialFactCheck.issues,
      ...validation.corrections,
    ];

    const repairResult = await repairLeaksIfNeeded(openai, topic, candidateQuiz);
    candidateQuiz = repairResult.quiz;
    leaks = repairResult.leaks;

    const finalIndependentFactCheck = await independentlyFactCheckQuiz(openai, topic, candidateQuiz);
    const finalFactCheck = enforceIndependentFactCheck(candidateQuiz, finalIndependentFactCheck);
    candidateQuiz = finalFactCheck.quiz;
    corrections = [
      ...corrections,
      ...finalFactCheck.issues,
    ];

    if (finalFactCheck.issues.length > 0) {
      const postFactCheckRepair = await repairLeaksIfNeeded(openai, topic, candidateQuiz);
      candidateQuiz = postFactCheckRepair.quiz;
      leaks = postFactCheckRepair.leaks;
    }

    unresolvedIssues = corrections;

    if (leaks.length === 0 && corrections.length === 0) {
      return candidateQuiz;
    }

    if (leaks.length > 0) {
      console.warn(
        `Validated quiz for "${topic}" leaked answers after answer validation attempt ${attempt}.`,
        leaks
      );
    }
  }

  if (leaks.length > 0) {
    throw new Error(
      `Failed to repair answer leaks after answer validation for "${topic}". Leaks: ${JSON.stringify(leaks)}`
    );
  }

  throw new Error(
    `Failed to validate quiz for "${topic}" after ${MAX_ANSWER_VALIDATION_ATTEMPTS} attempts. ` +
    `Unresolved validation issues: ${JSON.stringify(unresolvedIssues)}`
  );
}

/**
 * @param {import('openai').default} openai
 * @param {string} topic
 * @returns {Promise<{ questions: Array<{ question: string, correctAnswer: string, acceptedAnswers: string[], isBonus: boolean }> }>}
 */
export async function generateQuestionsForTopic(openai, topic) {
  let lastLeaks = [];

  for (let generationAttempt = 1; generationAttempt <= MAX_GENERATION_ATTEMPTS; generationAttempt++) {
    const completion = await openai.chat.completions.create({
      messages: buildGenerationMessages(topic, generationAttempt > 1 ? lastLeaks : []),
      model: GENERATE_MODEL,
      response_format: zodResponseFormat(generateQuestionsSchema, 'generate_questions'),
    });

    let candidateQuiz = JSON.parse(completion.choices[0].message.content);
    lastLeaks = getQuestionAnswerLeaks(candidateQuiz.questions);
    if (lastLeaks.length === 0) {
      return validateAndRepairQuiz(openai, topic, candidateQuiz);
    }

    console.warn(
      `Generated quiz for "${topic}" leaked answers on generation attempt ${generationAttempt}.`,
      lastLeaks
    );

    for (let repairAttempt = 1; repairAttempt <= MAX_REPAIR_ATTEMPTS; repairAttempt++) {
      try {
        candidateQuiz = await repairQuizQuestions(openai, topic, candidateQuiz, lastLeaks);
      } catch (error) {
        console.warn(
          `Repair attempt ${repairAttempt} failed for quiz "${topic}".`,
          error
        );
        break;
      }

      lastLeaks = getQuestionAnswerLeaks(candidateQuiz.questions);
      if (lastLeaks.length === 0) {
        return validateAndRepairQuiz(openai, topic, candidateQuiz);
      }

      console.warn(
        `Repaired quiz for "${topic}" still leaked answers on repair attempt ${repairAttempt}.`,
        lastLeaks
      );
    }
  }

  throw new Error(
    `Failed to generate quiz for "${topic}" without answer leaks after ${MAX_GENERATION_ATTEMPTS} generation attempts and ${MAX_REPAIR_ATTEMPTS} repair attempts per generation. ` +
    `Leaks: ${JSON.stringify(lastLeaks)}`
  );
}
