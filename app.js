import slackApp from '@slack/bolt';
import dotenv from 'dotenv';
import cron from 'node-cron';
import {triviaCommand} from './commands/trivia.js';
import {playCommand, playTime} from './commands/play.js';
import {getPreviousTrivia} from './models/quiz/quiz.js';
import {allCommand} from "./commands/all.js";
import {answersCommand} from "./commands/answers.js";

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
allCommand(app);
answersCommand(app);
const previousTrivia = await getPreviousTrivia();

(async () => {
  await app.start();
  cron.schedule('0 14 * * 4', async () => {
    const quizTitle = previousTrivia.topic;

    let questionBlocks = [];
    previousTrivia.questions.forEach((item, index) => {
      questionBlocks.push(
          {
            'type': 'section',
            'text': {
              'type': 'mrkdwn',
              'text': `*Question ${index + 1}: ${item.question}*`,
            },
          },
      );
      questionBlocks.push(
          {
            'type': 'section',
            'text': {
              'type': 'mrkdwn',
              'text': `${item.options.join('\n')}`,
            },
          },
      );
    });

    app.action('play', async ({ack, body, client, logger}) => {
      await playTime(ack, body,  client, logger);

      console.log(body,  client);
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
                'text': `some topic Trivia :brain:`,
                'emoji': true,
              },
            },
          ],
          submit: {
            type: 'plain_text',
            text: 'Submit',
          },
        },
      });

    });

    try {
      await app.client.chat.postMessage({
        channel: 'C04D6JZ0L67',  // to be replaced with Trivia Channel ID
        text: `*${quizTitle}*`,
        blocks: [
            ...questionBlocks,
          {
            'type': 'actions',
            'elements': [
              {
                'type': 'button',
                'text': {
                  'type': 'plain_text',
                  'text': 'Play',
                  'emoji': true,
                },
                'value': 'play_button',
                'action_id': 'play',
              },
            ],
          },
        ],
      });
    } catch (error) {
      console.error('Error sending message:', error);
    }
  });


  console.log('⚡️ Bolt app is running!');
})();
