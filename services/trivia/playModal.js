import {getTrivia} from '../../models/quiz/quiz.js';
import {getSubmission} from '../../models/submission/submission.js';

export async function openTriviaModal({body, client, logger, getDefaultTriviaForPlay}) {
  const userId = body.user?.id ?? body.user_id;
  const trivia = !body.text
    ? await getDefaultTriviaForPlay()
    : await getTrivia(body.text);

  const submission = await getSubmission(userId, trivia);
  const alreadyPlayed = Boolean(submission);
  const questionsBlock = [];

  trivia.questions.forEach((item, index) => {
    const label = item.isBonus
      ? `Bonus Question: ${item.question}`
      : `Question ${index + 1}: ${item.question}`;
    questionsBlock.push({
      type: 'input',
      block_id: `question-${index}`,
      label: {
        type: 'plain_text',
        text: label,
        emoji: true,
      },
      element: {
        type: 'plain_text_input',
        action_id: `answer-${index}`,
        multiline: false,
      },
    });
  });

  if (alreadyPlayed) {
    questionsBlock.push({
      type: 'rich_text',
      elements: [
        {
          type: 'rich_text_section',
          elements: [
            {
              type: 'text',
              text: 'Note: This submission will not be counted since you\'ve already played.',
              style: {
                italic: true,
              },
            },
          ],
        },
      ],
    });
  }

  try {
    await client.views.open({
      trigger_id: body.trigger_id,
      channel_id: body.channel_id,
      view: {
        type: 'modal',
        callback_id: 'trivia_view',
        private_metadata: JSON.stringify({
          quizDate: trivia.date,
          channelId: body.channel?.id || body.channel_id || 'C04D6JZ0L67',
        }),
        title: {
          type: 'plain_text',
          text: `${trivia.topic.toUpperCase()}`,
        },
        blocks: [
          ...questionsBlock,
        ],
        submit: {
          type: 'plain_text',
          text: 'Submit',
        },
      },
    });
  } catch (error) {
    logger.error(error);
  }
}
