import slackApp from '@slack/bolt';
import dotenv from 'dotenv';
import {triviaCommand} from './commands/trivia.js';
import {playCommand} from './commands/play.js';
import {getPreviousTrivia} from './models/quiz/quiz.js';
import cron from 'node-cron';

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
  cron.schedule('* * * * * *', async () => {
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
              'text': `Answer: *${item.correctAnswer}*`,
            },
          },
      );
    });
    try {
      console.log('trying to ping the channel ');
      await app.client.chat.postMessage({
        channel: 'C04D6JZ0L67',
        text: `*${quizTitle}*`,
        blocks: questionBlocks,
      });
      console.log('Message sent to Slack channel!');
    } catch (error) {
      console.error('Error sending message:', error);
    }

  });


  console.log('⚡️ Bolt app is running!');
})();
