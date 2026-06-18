function getQuestionCount(stateValues, configuredCount) {
  if (Number.isInteger(configuredCount) && configuredCount >= 0) {
    return configuredCount;
  }

  const indexes = Object.keys(stateValues || {})
    .map(blockId => blockId.match(/^question-(\d+)$/))
    .filter(Boolean)
    .map(match => Number(match[1]));

  return indexes.length > 0 ? Math.max(...indexes) + 1 : 0;
}

export function extractTriviaAnswers(stateValues, configuredCount) {
  const questionCount = getQuestionCount(stateValues, configuredCount);

  return Array.from({length: questionCount}, (_, index) => {
    const action = stateValues?.[`question-${index}`]?.[`answer-${index}`];
    return String(action?.value || '').trim();
  });
}

export function getTriviaAnswerErrors(stateValues, configuredCount) {
  const errors = {};

  extractTriviaAnswers(stateValues, configuredCount).forEach((answer, index) => {
    if (!answer) {
      errors[`question-${index}`] = 'Please provide an answer.';
    }
  });

  return errors;
}
