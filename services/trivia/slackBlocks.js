function titleCaseWords(text) {
  return text
    .split(' ')
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

function getRequestedByText(trivia) {
  const requestedBy = trivia?.requestedBy;
  if (!requestedBy) {
    return null;
  }

  const userId = typeof requestedBy === 'string' ? requestedBy : requestedBy.userId;
  const userName = typeof requestedBy === 'object' ? requestedBy.userName : '';
  const userDisplay = userId ? `<@${userId}>` : userName;
  if (!userDisplay) {
    return null;
  }

  return `Trivia Topic Requested by: ${userDisplay}`;
}

export function getRequestedByBlocks(trivia) {
  const requestedByText = getRequestedByText(trivia);
  if (!requestedByText) {
    return [];
  }

  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: requestedByText,
      },
    },
  ];
}

export function buildTriviaQuestionBlocks(trivia) {
  const title = titleCaseWords(trivia.topic);
  let questionText = `${title}\n`;

  trivia.questions.forEach((item, index) => {
    const questionLabel = item.isBonus
      ? 'Bonus Question'
      : `Question ${index + 1}`;
    questionText += `\n${questionLabel}: ${item.question}\n`;
  });

  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `\`\`\`\n${questionText}\`\`\``,
      },
    },
  ];
}

export function buildPlayButtonBlock() {
  return {
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: 'Play',
          emoji: true,
        },
        style: 'primary',
        value: 'play_button',
        action_id: 'play',
      },
    ],
  };
}

export function buildAnswersBlocks(trivia) {
  const title = titleCaseWords(trivia.topic);
  let triviaWithAnswersText = `${title} - ANSWERS\n\n`;

  trivia.questions.forEach((item, index) => {
    const questionLabel = item.isBonus ? 'Bonus Question' : `Question ${index + 1}`;
    triviaWithAnswersText += `${questionLabel}: ${item.question}\n`;
    triviaWithAnswersText += `Answer: ${item.correctAnswer}\n\n`;
  });

  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `\`\`\`\n${triviaWithAnswersText}\`\`\``,
      },
    },
  ];
}
