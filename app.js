import slackApp from '@slack/bolt';
import dotenv from 'dotenv';
import {triviaCommand} from './commands/trivia.js';

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

(async () => {
  await app.start();

  console.log('⚡️ Bolt app is running!');
})();
