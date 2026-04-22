function normalize(s) {
  return (s || '').trim().toLowerCase();
}

function normalizeNoSpaces(s) {
  return normalize(s).replace(/\s+/g, '');
}

function acronymFromAnswer(text) {
  const cleaned = (text || '')
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

function scoreCorrectAnswer(isBonus, scores) {
  if (isBonus) {
    scores.bonusScore++;
  } else {
    scores.regularScore++;
  }
}

function isCorrectLocalMatch(userAnswer, correctAnswer) {
  if (normalize(userAnswer) === normalize(correctAnswer)) {
    return true;
  }

  const correctOptions = correctAnswer.split(/\s+or\s+/i).map(option => option.trim());
  const userAnswerNormalized = normalize(userAnswer);
  const userAnswerNormalizedNoSpaces = normalizeNoSpaces(userAnswer);

  for (const option of correctOptions) {
    const optionNormalized = normalize(option);
    const optionNormalizedNoSpaces = normalizeNoSpaces(option);

    if (userAnswerNormalized === optionNormalized) {
      return true;
    }

    const optionAcronym = acronymFromAnswer(option);
    if (optionAcronym && userAnswerNormalizedNoSpaces === optionAcronym.toLowerCase()) {
      return true;
    }

    if (isNounVerbVariantMatch(optionNormalizedNoSpaces, userAnswerNormalizedNoSpaces)) {
      return true;
    }
  }

  return false;
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
