import OpenAI from 'openai';
import {getPreviousTrivia, getTrivia} from '../models/quiz/quiz.js';
import {getSubmission, store} from '../models/submission/submission.js';

const openai = new OpenAI({apiKey: process.env.OPENAI_API_KEY});
let correctAnswers = [];
let trivia_topic = '';
let alreadyPlayed = false;

export function playCommand(app) {
  app.command('/play', async ({ack, body, client, logger}) => {
    await ack();

    let trivia;

    if (!body.text) {
      trivia = await getPreviousTrivia();
    } else {
      trivia = await getTrivia(body.text);
    }

    trivia_topic = trivia.topic;

    alreadyPlayed = false;

    const submission = await getSubmission(body.user_id, trivia_topic);

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
  });

  app.view('trivia_view', async ({ack, body, client, logger}) => {
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

    let trivia = await getTrivia(trivia_topic);
    console.log(trivia);

    let questionBlocks = [
      {
        'type': 'section',
        'text': {
          'type': 'mrkdwn',
          'text': `
          Thanks for playing! :tada:   
          `,
        },
      },
    ];
    trivia.questions.forEach((item, index) => {
      console.log(item);
      questionBlocks.push(
          {
            'type': 'section',
            'text': {
              'type': 'mrkdwn',
              'text': `*Question ${index + 1}: ${item.question}*`,
            },
          },
      );

      const correctText = item.options.filter((option) => {
        return option[0] === item.correctAnswer;
      })[0].slice(3);

      let text = 'Correct Answer: ';
      text += userSubmissions[index] === correctAnswers[index] ? `*${correctText}*` : `${correctText}`;

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

    if (!alreadyPlayed) {
      await store({user_id: body.user.id, user_score: score, topic: trivia_topic, time: Date.now()});
    }

    await client.chat.postMessage({
      channel: body.user.id,
      blocks: questionBlocks,
    });
  });
}
