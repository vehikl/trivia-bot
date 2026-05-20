function titleCaseWords(text) {
  return text
    .split(' ')
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

function getUserDisplay(user) {
  if (!user) {
    return null;
  }

  const userId = typeof user === 'string' ? user : user.userId;
  const userName = typeof user === 'object' ? user.userName : '';
  return userId ? `<@${userId}>` : userName;
}

function getTriviaAttributionText(trivia) {
  const requestedByDisplay = getUserDisplay(trivia?.requestedBy);
  if (requestedByDisplay) {
    return `Trivia Topic Requested by: ${requestedByDisplay}`;
  }

  const submittedByDisplay = getUserDisplay(trivia?.submittedBy);
  if (!submittedByDisplay) {
    return null;
  }

  return `Generated Quiz Submitted by: ${submittedByDisplay}`;
}

export function getRequestedByBlocks(trivia) {
  const attributionText = getTriviaAttributionText(trivia);
  if (!attributionText) {
    return [];
  }

  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: attributionText,
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
