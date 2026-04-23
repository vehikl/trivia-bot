import {zodResponseFormat} from 'openai/helpers/zod';
import {z} from 'zod';

const question = z.object({
  question: z.string(),
  correctAnswer: z.string(),
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

const GENERATE_MODEL = process.env.OPENAI_TRIVIA_GENERATE_MODEL || 'gpt-4.1-nano';
const REPAIR_MODEL = process.env.OPENAI_TRIVIA_REPAIR_MODEL || GENERATE_MODEL;
const MAX_GENERATION_ATTEMPTS = 3;
const MAX_REPAIR_ATTEMPTS = 3;
const MIN_ANSWER_TOKEN_LENGTH = 3;
const MIN_DISTINCTIVE_MULTIWORD_TOKEN_LENGTH = 6;
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

export function getQuestionAnswerLeaks(questions) {
  const leaks = [];

  questions.forEach((questionItem, questionIndex) => {
    questions.forEach((answerItem, answerIndex) => {
      const matchedText = findAnswerLeak(questionItem.question, answerItem.correctAnswer);
      if (matchedText) {
        leaks.push({
          questionIndex,
          answerIndex,
          answer: answerItem.correctAnswer,
          matchedText,
        });
      }
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
    'You are writing a weekly office trivia quiz.\n' +
    'Audience and tone:\n' +
    '- Keep everything strictly safe-for-work: professional, inclusive, no sexual content, slurs, hateful themes, or graphic violence; avoid polarizing political advocacy.\n' +
    '- Aim at adults roughly 22+: cultured general trivia, clear wording, no kid-quiz triviality unless the topic calls for it.\n' +
    '- When it fits the theme, include questions that software developers would enjoy (languages, tools, CS history, tech culture); do not force dev content if the topic is unrelated.\n' +
    '- Where natural, tie clues or framing to the current season, holidays, or time of year (use the calendar hint below).\n' +
    `Calendar hint: ${calendarHint}.\n` +
    'Requirements:\n' +
    '- Difficulty: easy-to-medium. Prefer broadly known facts and common terminology; avoid obscure people, obscure dates/events, and hard-to-guess obscure trivia.\n' +
    '- If the topic is technical, stick to widely used tools, mainstream concepts, and practical knowledge (avoid deep internals or niche acronyms unless very common).\n' +
    '- Produce exactly 6 questions total: 5 regular questions and 1 bonus question.\n' +
    '- All questions must match the supplied theme/topic.\n' +
    '- Each question should be concise: use at most 1 short clue sentence before the actual ask, and never exceed 2 sentences total.\n' +
    '- Short-answer format (no multiple choice).\n' +
    '- Provide a concise canonical answer for each question.\n' +
    '- Prefer clues that point indirectly to the answer; do not repeat titles, surnames, place names, quoted titles, or distinctive revealing nouns from the answer.\n' +
    '- It is acceptable to mention a broad or generic component of a multi-word answer when that alone does not reveal the full answer; for example, "running" is fine if the answer is "Trail Running".\n' +
    '- Choose answerable questions whose clues do not require naming any part of the answer.\n' +
    '- Do not include the correct answer for any question in that question text.\n' +
    '- Do not include any answer from the quiz in any other question text.\n' +
    '- Before responding, verify that none of the 6 correct answers appear verbatim, as a meaningful word, or as a phrase inside any question.\n' +
    '- Mark the bonus question with isBonus=true; all other questions isBonus=false.\n' +
    'Output format:\n' +
    '- Respond with a JSON string matching: { "questions": [ { "question": string, "correctAnswer": string, "isBonus": boolean }, ... ] }\n' +
    '- The array must contain exactly 6 objects.\n' +
    'Theme/topic: ' +
    topic
  );
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

/**
 * @param {import('openai').default} openai
 * @param {string} topic
 * @returns {Promise<{ questions: Array<{ question: string, correctAnswer: string, isBonus: boolean }> }>}
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
      return candidateQuiz;
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
        return candidateQuiz;
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
