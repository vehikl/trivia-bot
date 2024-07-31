import OpenAI from 'openai';
import {getTrivia} from '../models/quiz/quiz.js';

const openai = new OpenAI({apiKey: process.env.OPENAI_API_KEY});

export function playCommand(app) {
  app.command('/play', async ({ack, body, client, logger}) => {
    await ack();

    const trivia = await getTrivia(body.text);
    const questionsBlock = [];

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
              'action_id': `radio_buttons-${index}`,
            },
          },
      );
    });

    try {
      const result = await client.views.open({
        trigger_id: body.trigger_id,
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
      logger.info(result);
    } catch (error) {
      logger.error(error);
    }
  });
}
