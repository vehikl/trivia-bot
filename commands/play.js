import { getPreviousTrivia, getTrivia } from '../models/quiz/quiz.js';
import { getSubmission, store } from '../models/submission/submission.js';

let correctAnswers = [];
let trivia;
let alreadyPlayed = false;

export async function playTime(ack, body, client, logger) {
  await ack();

  if (!body.text) {
    trivia = await getPreviousTrivia();
  } else {
    trivia = await getTrivia(body.text);
  }

  alreadyPlayed = false;

  const submission = await getSubmission(body.user_id ?? body.user.id, trivia);

  if (submission) {
    alreadyPlayed = true;
  }

  const questionsBlock = [];

  if (alreadyPlayed) {
    questionsBlock.push({
      'type': 'rich_text',
      'elements': [
        {
          'type': 'rich_text_section',
          'elements': [
            {
              'type': 'text',
              'text': 'Note: This submission will not be counted since you\'ve already played.',
              'style': {
                'italic': true,
              },
            },
          ],
        },
      ],
    });
  }

  trivia.questions.forEach((item, index) => {
    correctAnswers.push(item.correctAnswer);
    questionsBlock.push(
      {
        'label': {
          'type': 'plain_text',
          'text': `Question ${index + 1}: ${item.question}`,
          'emoji': true,
        },
        'type': 'input',
        'element': {
          'type': 'radio_buttons',
          'options': [
            {
              'text': {
                'type': 'plain_text',
                'text': `${item.options[0]}`,
                'emoji': true,
              },
              'value': 'a',
            },
            {
              'text': {
                'type': 'plain_text',
                'text': `${item.options[1]}`,
                'emoji': true,
              },
              'value': 'b',
            },
            {
              'text': {
                'type': 'plain_text',
                'text': `${item.options[2]}`,
                'emoji': true,
              },
              'value': 'c',
            },
            {
              'text': {
                'type': 'plain_text',
                'text': `${item.options[3]}`,
                'emoji': true,
              },
              'value': 'd',
            },
          ],
          'action_id': `radio-buttons-${index}`,
        },
      },
    );
  });

  try {
    await client.views.open({
      trigger_id: body.trigger_id,
      channel_id: body.channel_id,
      view: {
        type: 'modal',
        callback_id: 'trivia_view',
        title: {
          type: 'plain_text',
          text: 'Trivia Time',
        },
        'blocks': [
          {
            'type': 'header',
            'text': {
              'type': 'plain_text',
              'text': `${trivia.topic.toUpperCase()} Trivia :brain:`,
              'emoji': true,
            },
          },
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
export function playCommand(app) {
  app.command('/play', async ({ ack, body, client, logger }) => {
    await playTime(ack, body, client, logger);
  });

  app.view('trivia_view', async ({ ack, body, client, logger }) => {
    await ack();
    let index = 0;
    let userSubmissions = [];
    let score = 0;

    for (const property in body.view.state.values) {
      userSubmissions.push(body.view.state.values[property][`radio-buttons-${index}`]['selected_option']['value']);
      index++;
    }

    for (let i = 0; i < userSubmissions.length; i++) {
      if (userSubmissions[i] === correctAnswers[i]) {
        score++;
      }
    }

    let triviaDocument = await getTrivia(trivia);

    const submission = await getSubmission(body.user_id, trivia);

    if (submission) {
      alreadyPlayed = true;
    }

    let questionBlocks = [
      {
        'type': 'section',
        'text': {
          'type': 'mrkdwn',
          'text': `Topic: *${trivia.topic.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ')}*\n`,
        },
      },
    ];
    triviaDocument.questions.forEach((item, index) => {
      questionBlocks.push(
        {
          'type': 'section',
          'text': {
            'type': 'mrkdwn',
            'text': `*Question ${index + 1}: ${item.question}*`,
          },
        },
      );

      const correctOption = item.options.filter((option) => {
        return option[0] === item.correctAnswer;
      })[0].slice(3);

      const userSubmission = item.options.filter((option) => {
        return option[0] === userSubmissions[index];
      })[0].slice(3);

      let text = 'Your Answer: ';

      if (userSubmissions[index] === correctAnswers[index]) {
        text += `*${correctOption}* :white_check_mark:`;
      } else {
        text += `*${userSubmission}* :x: \n\n Correct Answer: *${correctOption}*`
      }

      questionBlocks.push(
        {
          'type': 'section',
          'text': {
            'type': 'mrkdwn',
            'text': text,
          },
        },
      );
    });

    questionBlocks.push({
      'type': 'section',
      'text': {
        'type': 'mrkdwn',
        'text': `
          Your Score is: *${score}/5!*        
          `,
      },
    });

    if (alreadyPlayed) {
      questionBlocks.push({
        'type': 'rich_text',
        'elements': [
          {
            'type': 'rich_text_section',
            'elements': [
              {
                'type': 'text',
                'text': 'Note: This submission will not be counted since you\'ve already played.',
                'style': {
                  'italic': true,
                },
              },
            ],
          },
        ],
      });
    }

    const date = new Date(triviaDocument.date.seconds * 1000); // Multiply by 1000 to convert seconds to milliseconds
    const options = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
    const formattedDate = date.toLocaleDateString('en-US', options);
    const finalDate = formattedDate.split(',').join();

    if (!alreadyPlayed) {
      await store({
        user_id: body.user.id,
        user_score: score,
        topic: triviaDocument.topic,
        date: finalDate,
        time: Date.now()
      });
    }

    await client.chat.postMessage({
      text: 'Thanks for Playing! :tada:',
      channel: body.user.id,
      blocks: questionBlocks,
    });
  });
}
