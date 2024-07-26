import OpenAI from 'openai';
import {getAllTopics, store} from '../models/quiz/quiz.js';

const openai = new OpenAI({apiKey: process.env.OPENAI_API_KEY});

export function playCommand(app) {
  app.command('/play', async ({ack, body, client, logger}) => {
    await ack();

    try {
      const result = await client.views.open({
        trigger_id: body.trigger_id,
        view: {
          type: 'modal',
          callback_id: 'view_1',
          title: {
            type: 'plain_text',
            text: 'Modal title'
          },
            "blocks": [
              {
                "type": "header",
                "text": {
                  "type": "plain_text",
                  "text": "Movies Trivia!",
                  "emoji": true
                }
              },
              {
                "type": "input",
                "element": {
                  "type": "radio_buttons",
                  "options": [
                    {
                      "text": {
                        "type": "plain_text",
                        "text": "a) Titanic",
                        "emoji": true
                      },
                      "value": "value-0"
                    },
                    {
                      "text": {
                        "type": "plain_text",
                        "text": "b) Star Wars: The Force Awakens",
                        "emoji": true
                      },
                      "value": "value-1"
                    },
                    {
                      "text": {
                        "type": "plain_text",
                        "text": "c) Avengers: Endgame",
                        "emoji": true
                      },
                      "value": "value-2"
                    },
                    {
                      "text": {
                        "type": "plain_text",
                        "text": "d) Avatar",
                        "emoji": true
                      },
                      "value": "value-3"
                    }
                  ],
                  "action_id": "radio_buttons-action"
                },
                "label": {
                  "type": "plain_text",
                  "text": "Question 1: What is the highest-grossing film of all time?",
                  "emoji": true
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
  })
}
