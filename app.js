import slackApp from '@slack/bolt';
import dotenv from 'dotenv';
import cron from 'node-cron';
import {playCommand, playTime} from './commands/play.js';
import {getPreviousTrivia} from './models/quiz/quiz.js';
import {allCommand} from "./commands/all.js";
import {answersCommand} from "./commands/answers.js";
import {generateCommand} from "./commands/generate.js";

dotenv.config();

const {App} = slackApp;

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
  port: process.env.PORT || 3000,
});

playCommand(app);
allCommand(app);
answersCommand(app);
generateCommand(app);

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
                'text': `${quizTitle} Trivia :brain:`,
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

  app.event('app_home_opened', async ({ event, client }) => {
    try {
      // Display App Home
      await displayHome(event.user);
    } catch (error) {
      console.error(error);
    }
  });

  const displayHome = async(user) => {
    try {
      await app.client.views.publish({
        user_id: user,
        view: await updateView(user)
      });
    } catch (error) {
      console.error(error);
    }
  };

  const updateView = async(user) => {
    let blocks = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Welcome to Thursday's Trivia!* :brain:\nTest your knowledge and compete with your colleagues in our weekly trivia game. Every Thursday, we'll have exciting new questions on various topics!"
        }
      },
      {
        type: "divider"
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*How to Play:*\n• Wait for the trivia questions to be posted in the channel\n• Click the 'Play' button to participate\n• Answer the questions when prompted\n• See how you rank against your colleagues!"
        }
      },
      {
        type: "divider"
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "Ready to test your knowledge? Use the button below or type `/play` in any channel to join the current trivia game!"
        },
        accessory: {
          type: "button",
          action_id: "play_trivia",
          text: {
            type: "plain_text",
            text: "Play Trivia",
            emoji: true
          },
          value: "play_command"
        }
      }
    ];
    let view = {
      type: 'home',
      title: {
        type: 'plain_text',
        text: 'Thursday\'s Trivia'
      },
      blocks: blocks
    }
    return JSON.stringify(view);
  };

  app.action('play_trivia', async ({ ack, body, client, logger }) => {
    try {
      await ack();
      await playTime(ack, body, client, logger);
    } catch (error) {
      console.error('Error handling play_trivia action:', error);
    }
  });

  app.action(/add_.*/, async ({ ack, body, client }) => {
    await ack();
    await openModal(client, body.trigger_id);
  });

  const openModal = async(client, trigger_id) => {
    const modal = {
      type: 'modal',
      title: {
        type: 'plain_text',
        text: 'Create a stickie note'
      },
      submit: {
        type: 'plain_text',
        text: 'Create'
      },
      blocks: [
        // Text input
        {
          "type": "input",
          "block_id": "note01",
          "label": {
            "type": "plain_text",
            "text": "Note"
          },
          "element": {
            "action_id": "content",
            "type": "plain_text_input",
            "placeholder": {
              "type": "plain_text",
              "text": "Take a note... "
            },
            "multiline": true
          }
        },
        // Drop-down menu
        {
          "type": "input",
          "block_id": "note02",
          "label": {
            "type": "plain_text",
            "text": "Color",
          },
          "element": {
            "type": "static_select",
            "action_id": "color",
            "options": [
              {
                "text": {
                  "type": "plain_text",
                  "text": "yellow"
                },
                "value": "yellow"
              },
              {
                "text": {
                  "type": "plain_text",
                  "text": "blue"
                },
                "value": "blue"
              }
            ]
          }
        }
      ]
    };

    try {
      await client.views.open({
        trigger_id: trigger_id,
        view: modal
      });
    } catch (error) {
      console.error('Error opening modal:', error);
    }
  };

  console.log('⚡️ Bolt app is running!');
})();
