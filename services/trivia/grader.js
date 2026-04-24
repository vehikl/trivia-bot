function normalize(s) {
  return stripBracketedText(s)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/['`\u2018\u2019]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function normalizeNoSpaces(s) {
  return normalize(s).replace(/\s+/g, '');
}

const QUESTION_RESTATEMENT_STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'been',
  'being',
  'by',
  'for',
  'from',
  'has',
  'have',
  'he',
  'her',
  'his',
  'how',
  'in',
  'is',
  'it',
  'its',
  'name',
  'of',
  'often',
  'on',
  'one',
  'or',
  'she',
  'that',
  'the',
  'these',
  'this',
  'those',
  'to',
  'used',
  'was',
  'were',
  'what',
  'when',
  'where',
  'which',
  'who',
  'whom',
  'whose',
  'why',
  'with',
]);

function stripBracketedText(text) {
  let cleaned = String(text || '');
  let previous;

  do {
    previous = cleaned;
    cleaned = cleaned
      .replace(/\([^()]*\)/g, ' ')
      .replace(/\[[^\[\]]*\]/g, ' ')
      .replace(/\{[^{}]*\}/g, ' ')
      .replace(/<[^<>]*>/g, ' ');
  } while (cleaned !== previous);

  return cleaned;
}

function stemToken(token) {
  if (token.length > 5 && token.endsWith('ies')) {
    return `${token.slice(0, -3)}y`;
  }

  if (token.length > 5 && token.endsWith('ing')) {
    return token.slice(0, -3);
  }

  if (token.length > 4 && token.endsWith('ed')) {
    return token.slice(0, -2);
  }

  if (token.length > 4 && token.endsWith('es')) {
    return token.slice(0, -2);
  }

  if (token.length > 3 && token.endsWith('s')) {
    return token.slice(0, -1);
  }

  return token;
}

function getSignificantTokens(text) {
  const normalized = normalize(text);
  if (!normalized) {
    return [];
  }

  return normalized
    .split(/\s+/)
    .filter(token => token.length > 1 && !QUESTION_RESTATEMENT_STOPWORDS.has(token))
    .map(stemToken)
    .filter(token => token.length > 1 && !QUESTION_RESTATEMENT_STOPWORDS.has(token));
}

function isSafeNormalizedMatch(left, right) {
  const leftNormalized = normalize(left);
  const rightNormalized = normalize(right);

  if (!leftNormalized || !rightNormalized || leftNormalized !== rightNormalized) {
    return false;
  }

  const compact = normalizeNoSpaces(right);
  const rawMatch = String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase();

  return compact.length > 1 || rawMatch;
}

function answerContainsCorrectAnswer(userAnswer, correctAnswer) {
  const userAnswerNormalized = normalize(userAnswer);
  const userAnswerNormalizedNoSpaces = normalizeNoSpaces(userAnswer);
  const correctOptions = String(correctAnswer || '').split(/\s+or\s+/i).map(option => option.trim());

  for (const option of correctOptions) {
    const optionNormalized = normalize(option);
    const optionNormalizedNoSpaces = normalizeNoSpaces(option);
    if (!optionNormalized) {
      continue;
    }

    if (` ${userAnswerNormalized} `.includes(` ${optionNormalized} `)) {
      return true;
    }

    if (optionNormalizedNoSpaces.length > 2 && userAnswerNormalizedNoSpaces.includes(optionNormalizedNoSpaces)) {
      return true;
    }
  }

  return false;
}

function acronymFromAnswer(text) {
  const cleaned = stripBracketedText(text)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim();

  if (!cleaned) return '';

  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';

  return parts.map((p) => (p[0] ? p[0] : '')).join('').toUpperCase();
}

function isNounVerbVariantMatch(correct, user) {
  const c = normalize(correct);
  const u = normalize(user);
  if (!c || !u) return false;

  const cHasTion = /(tion|sion|cion)$/.test(c);
  const uHasIng = /ing$/.test(u);
  if (cHasTion && uHasIng) {
    const cStem = c.replace(/(tion|sion|cion)$/, '');
    const uStem = u.replace(/ing$/, '');
    return cStem && uStem && cStem === uStem;
  }

  const cHasIng = /ing$/.test(c);
  const uHasTion = /(tion|sion|cion)$/.test(u);
  if (cHasIng && uHasTion) {
    const cStem = c.replace(/ing$/, '');
    const uStem = u.replace(/(tion|sion|cion)$/, '');
    return cStem && uStem && cStem === uStem;
  }

  return false;
}

function levenshteinDistance(left, right, maxDistance) {
  if (left === right) {
    return 0;
  }

  if (Math.abs(left.length - right.length) > maxDistance) {
    return maxDistance + 1;
  }

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let i = 1; i <= left.length; i++) {
    const current = [i];
    let rowMinimum = current[0];

    for (let j = 1; j <= right.length; j++) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      const value = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost
      );

      current[j] = value;
      rowMinimum = Math.min(rowMinimum, value);
    }

    if (rowMinimum > maxDistance) {
      return maxDistance + 1;
    }

    previous = current;
  }

  return previous[right.length];
}

function typoToleranceForLength(length) {
  if (length < 7) {
    return 0;
  }

  if (length <= 12) {
    return 2;
  }

  return 3;
}

function isMinorSpellingVariant(correct, user) {
  const c = normalizeNoSpaces(correct);
  const u = normalizeNoSpaces(user);
  if (!c || !u) return false;

  const shorterLength = Math.min(c.length, u.length);
  const maxDistance = typoToleranceForLength(shorterLength);
  if (maxDistance === 0) {
    return false;
  }

  if (Math.abs(c.length - u.length) > maxDistance) {
    return false;
  }

  return levenshteinDistance(c, u, maxDistance) <= maxDistance;
}

function scoreCorrectAnswer(isBonus, scores) {
  if (isBonus) {
    scores.bonusScore++;
  } else {
    scores.regularScore++;
  }
}

export function isCorrectLocalMatch(userAnswer, correctAnswer) {
  if (isSafeNormalizedMatch(userAnswer, correctAnswer)) {
    return true;
  }

  const correctOptions = correctAnswer.split(/\s+or\s+/i).map(option => option.trim());
  const userAnswerNormalized = normalize(userAnswer);
  const userAnswerNormalizedNoSpaces = normalizeNoSpaces(userAnswer);

  for (const option of correctOptions) {
    const optionNormalized = normalize(option);
    const optionNormalizedNoSpaces = normalizeNoSpaces(option);

    if (isSafeNormalizedMatch(userAnswer, option)) {
      return true;
    }

    const optionAcronym = acronymFromAnswer(option);
    if (optionAcronym.length > 1 && userAnswerNormalizedNoSpaces === optionAcronym.toLowerCase()) {
      return true;
    }

    if (isNounVerbVariantMatch(optionNormalizedNoSpaces, userAnswerNormalizedNoSpaces)) {
      return true;
    }

    if (isMinorSpellingVariant(option, userAnswer)) {
      return true;
    }
  }

  return false;
}

export function isQuestionRestatementAnswer(questionText, correctAnswer, userAnswer) {
  const questionNormalized = normalize(questionText);
  const userAnswerNormalized = normalize(userAnswer);

  if (!questionNormalized || !userAnswerNormalized) {
    return false;
  }

  if (answerContainsCorrectAnswer(userAnswer, correctAnswer)) {
    return false;
  }

  const userTokens = getSignificantTokens(userAnswer);
  if (userTokens.length === 0) {
    return false;
  }

  if (` ${questionNormalized} `.includes(` ${userAnswerNormalized} `)) {
    return true;
  }

  const questionTokens = new Set(getSignificantTokens(questionText));
  const overlappingTokens = userTokens.filter(token => questionTokens.has(token));
  const overlapRatio = overlappingTokens.length / userTokens.length;

  if (userTokens.length >= 3 && overlapRatio >= 0.65) {
    return true;
  }

  return userTokens.length >= 2 && overlapRatio === 1 && userAnswerNormalized.length >= 12;
}

async function gradeWithAi(openai, question, correctAnswer, userAnswer) {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4.1-nano',
    messages: [
      {
        role: 'system',
        content:
          'You are a strict grader for short-answer trivia. ' +
          'Given a question, the canonical correct answer, and a user answer, decide if the user answer is truly correct.\n' +
          '- If the correct answer contains "or", any of the options listed is acceptable.\n' +
          '- Treat acronyms/initialisms as correct when they match the initial letters of the canonical answer.\n' +
          '- Treat common grammatical variants (e.g., noun vs gerund) as correct when the base meaning is the same.\n' +
          '- Treat minor spelling errors or very small wording differences as CORRECT if they clearly refer to the same factual answer.\n' +
          '- Ignore punctuation, special characters, and extra descriptive text in parentheses/brackets when the factual answer is otherwise the same.\n' +
          '- If the user mostly repeats or paraphrases the question instead of naming the answer, mark it INCORRECT even when the real answer can be inferred from the question.\n' +
          '- Case differences (Medal Collection vs medal collection) should be treated as CORRECT.\n' +
          '- If the user names a different place/person/thing (e.g. "Brazil" as the capital of Brazil) it must be marked INCORRECT.\n' +
          '- Respond with exactly one word: "correct" or "incorrect". No explanations.',
      },
      {
        role: 'user',
        content:
          `Question: ${question}\n` +
          `Correct answer: ${correctAnswer}\n` +
          `User answer: ${userAnswer}`,
      },
    ],
  });

  const verdictRaw = completion.choices[0].message.content.trim().toLowerCase();
  const verdictWord = verdictRaw.split(/\s+/)[0];
  return verdictWord === 'correct' ? 'correct' : 'incorrect';
}

export async function gradeTriviaSubmission(openai, triviaDocument, userSubmissions) {
  const scores = {
    regularScore: 0,
    bonusScore: 0,
  };
  const aiVerdicts = [];

  for (let i = 0; i < userSubmissions.length; i++) {
    const userAnswer = userSubmissions[i];
    const question = triviaDocument.questions[i];
    const correctAnswer = question.correctAnswer;
    const isBonus = question.isBonus === true;

    if (!userAnswer) {
      aiVerdicts.push('no-answer');
      continue;
    }

    if (isCorrectLocalMatch(userAnswer, correctAnswer)) {
      scoreCorrectAnswer(isBonus, scores);
      aiVerdicts.push('exact');
      continue;
    }

    if (isQuestionRestatementAnswer(question.question, correctAnswer, userAnswer)) {
      aiVerdicts.push('question-copy');
      continue;
    }

    try {
      const verdict = await gradeWithAi(openai, question.question, correctAnswer, userAnswer);
      aiVerdicts.push(verdict);

      if (verdict === 'correct') {
        scoreCorrectAnswer(isBonus, scores);
      }
    } catch (e) {
      console.error('Error grading answer with AI', e);
      aiVerdicts.push('error');
    }
  }

  return {
    ...scores,
    aiVerdicts,
  };
}
