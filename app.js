import slackApp from '@slack/bolt';
import dotenv from 'dotenv';
dotenv.config();
import { getAll } from './models/quiz/quiz.js';
const { App } = slackApp;

const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    socketMode: true,
    appToken: process.env.SLACK_APP_TOKEN,
    // Socket Mode doesn't listen on a port, but in case you want your app to respond to OAuth,
    // you still need to listen on some port!
    port: process.env.PORT || 3000
  });
  
  // Listens to incoming messages that contain "hello"
  app.message('hello', async ({ message, say }) => {
    // say() sends a message to the channel where the event was triggered
    await say({
        "blocks": [
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": "Hello Friend :wave:"
                }
            },
            {
                "type": "input",
                "element": {
                    "type": "plain_text_input",
                    "multiline": true,
                    "action_id": "plain_text_input-action"
                },
                "label": {
                    "type": "plain_text",
                    "text": "Question #1",
                    "emoji": true
                }
            },
            {
                "type": "input",
                "element": {
                    "type": "plain_text_input",
                    "action_id": "plain_text_input-action"
                },
                "label": {
                    "type": "plain_text",
                    "text": "Answer to question #1",
                    "emoji": true
                }
            },
            {
                "type": "actions",
                "elements": [
                    {
                        "type": "button",
                        "text": {
                            "type": "plain_text",
                            "text": "Submit",
                            "emoji": true
                        },
                        "action_id": "button_click",
                        "value": "submit_trivia"
                    }
                ]
            }
        ]
    });
  });

  app.action('button_click', async ({ body, ack, say }) => {
    // Acknowledge the action
    await ack();
    await say(`<@${body.user.id}> clicked the button`);
      console.log(body)
    await say(`<@${body.user.id}> ${
        await getAll()
    }`);
  });

app.command('/trivia', async ({ ack, body, client, logger }) => {
    // Acknowledge the command request
    await ack();

    try {
        // Call views.open with the built-in client
        const result = await client.views.open({
            // Pass a valid trigger_id within 3 seconds of receiving it
            trigger_id: body.trigger_id,
            // View payload
            view: {
                type: 'modal',
                // View identifier
                callback_id: 'view_1',
                title: {
                    type: 'plain_text',
                    text: 'Modal title'
                },
                blocks: [
                    {
                        type: 'section',
                        text: {
                            type: 'mrkdwn',
                            text: 'Welcome to a modal with _blocks_'
                        },
                        accessory: {
                            type: 'button',
                            text: {
                                type: 'plain_text',
                                text: 'Click me!'
                            },
                            action_id: 'button_abc'
                        }
                    },
                    {
                        type: 'input',
                        block_id: 'input_c',
                        label: {
                            type: 'plain_text',
                            text: 'What are your hopes and dreams?'
                        },
                        element: {
                            type: 'plain_text_input',
                            action_id: 'dreamy_input',
                            multiline: true
                        }
                    }
                ],
                submit: {
                    type: 'plain_text',
                    text: 'Submit'
                }
            }
        });
        logger.info(result);
    }
    catch (error) {
        logger.error(error);
    }
});

  (async () => {
    // Start your app
    await app.start();
  
    console.log('⚡️ Bolt app is running!');
  })();
  