import slackApp from '@slack/bolt';
import dotenv from 'dotenv';
import {triviaCommand} from './commands/trivia.js';
import {playCommand}  from './commands/play.js';
import {getNextTrivia, getPreviousTrivia, getTrivia} from './models/quiz/quiz.js';

dotenv.config();

const {App} = slackApp;

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
  port: process.env.PORT || 3000,
});

triviaCommand(app);
playCommand(app);
const previousTrivia = await getPreviousTrivia();

(async () => {
  await app.start();

  const questionsBlock = [];

  const trivia = await getTrivia(body.text);

  trivia.questions.forEach((item, index) => {
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
          }
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
          ...questionsBlock
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

  console.log('⚡️ Bolt app is running!');
})();
