import slackApp from '@slack/bolt';
import dotenv from 'dotenv';
import {addTrivia, getAll} from './models/quiz/quiz.js';

dotenv.config();

const {App} = slackApp;

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
  // Socket Mode doesn't listen on a port, but in case you want your app to respond to OAuth,
  // you still need to listen on some port!
  port: process.env.PORT || 3000,
});

app.view('view_1', async ({ ack, body, view, client, logger }) => {
  await ack();

  const question = view['state']['values']['input_question'].trivia_question.value;
  const answer = view['state']['values']['input_answer'].dreamy_input.value;
  const user = body['user']['id'];
  logger(question);
  logger(answer);
  await addTrivia(question, answer);
});

app.command('/trivia', async ({ack, body, client, logger}) => {
  await ack();

  try {
    const result = await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        type: 'modal',
        callback_id: 'view_1',
        title: {
          type: 'plain_text',
          text: 'Modal title',
        },
        blocks: [
          {
            type: 'input',
            block_id: 'input_question',
            label: {
              type: 'plain_text',
              text: 'Question',
            },
            element: {
              type: 'plain_text_input',
              action_id: 'trivia_question',
              multiline: true,
            },
          },
          {
            type: 'input',
            block_id: 'input_answer',
            label: {
              type: 'plain_text',
              text: 'What are your hopes and dreams?',
            },
            element: {
              type: 'plain_text_input',
              action_id: 'dreamy_input',
              multiline: true,
            },
          },
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

(async () => {
  // Start your app
  await app.start();

  console.log('⚡️ Bolt app is running!');
})();
