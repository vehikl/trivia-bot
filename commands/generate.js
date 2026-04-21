import OpenAI from 'openai';
import {store} from '../models/quiz/quiz.js';
import {getStartOfDay} from '../services/utils/datetime.js';
import {generateQuestionsForTopic} from '../services/trivia/generateQuiz.js';

const openai = new OpenAI({apiKey: process.env.OPENAI_API_KEY});

let generateMessageResponse;

export function generateCommand(app) {
  app.command('/generate', async ({ack, body, say}) => {
    await ack();

    if (!body.text) {
      await app.client.chat.postEphemeral({
        channel: body.channel_id,
        user: body.user_id,
        text: ':bread: Please pick a topic to generate questions. :bread:',
      });

      return;
    }

    generateMessageResponse = await app.client.chat.postEphemeral({
      channel: body.channel_id,
      user: body.user_id,
      text: 'Generating Questions... :brain:',
    });

    try {
      await executeCommand(app, body, say);
    } catch (error) {
      console.log(error);
      await executeCommand(app, body, say);
    }
  });
}

const executeCommand = async (app, body, say) => {
  const topic = body.text;

  const response = await generateQuestionsForTopic(openai, topic);

  // const response = exampleGenerateResponse;

  let date = null;

  const questionBlocks = [];

  response.questions.forEach((item, index) => {
    const label = item.isBonus ? `*Bonus Question: ${item.question}*` : `*Question ${index + 1}: ${item.question}*`;
    questionBlocks.push({
      'type': 'section',
      'text': {
        'type': 'mrkdwn',
        'text': label,
      },
    });
  });

  app.action('datepicker', async ({ack, body}) => {
    await ack();

    const selected = body.state.values.section.datepicker.selected_date;
    const [year, month, day] = selected.split('-').map(Number);
    date = new Date(year, month - 1, day);

  });

  app.action('regenerate', async ({ack}) => {
    await ack();

    await app.client.chat.update({
      channel: body.channel_id,
      ts: generateMessageResponse.ts,
      text: 'Regenerating Questions... :brain:',
    });

    await app.client.chat.delete({
      channel: body.channel_id,
      ts: messageResponse.ts
    })

    await executeCommand(app, body, say);
  });

  app.action('submit', async ({ack}) => {
    await ack();

    if (!date) {
      await app.client.chat.postEphemeral({
        channel: body.channel_id,
        user: body.user?.id ?? body.user_id,
        text: 'Please select a date first!',
      });
      return;
    }

    const todayStart = getStartOfDay(new Date());
    const selectedDate = date instanceof Date ? date : new Date(date);
    const selectedStart = getStartOfDay(selectedDate);

    if (selectedStart < todayStart) {
      await app.client.chat.postEphemeral({
        channel: body.channel_id,
        user: body.user?.id ?? body.user_id,
        text: 'Please select a valid date!',
      });
      return;
    }

    try {
      const questions = response.questions.map(item => ({
        question: item.question,
        correctAnswer: item.correctAnswer,
        isBonus: item.isBonus,
      }));

      await store({
        topic,
        questions,
        date,
      });

      await app.client.chat.postEphemeral({
        channel: body.channel_id,
        user: body.user?.id ?? body.user_id,
        text: `Your Questions for ${topic} have been submitted! :tada:`,
      });
    } catch (e) {
      console.error(e);
    }
  });

  const messageResponse = await say({
    'text': 'Questions Based on ' + body.text,
    'blocks': [
      {
        'type': 'header',
        'text': {
          'type': 'plain_text',
          'text': 'Hello Friend! Time to generate some questions! :bulb: :brain:',
        },
      },
      ...questionBlocks,
      {
        'type': 'divider',
      },
      {
        'type': 'context',
        'elements': [
          {
            'type': 'mrkdwn',
            'text': 'Make sure to review the answers and questions before submitting! 💡',
          },
        ],
      },
      {
        'type': 'section',
        'block_id': 'section',
        'text': {
          'type': 'mrkdwn',
          'text': 'Pick a date for when the Questions will be for.',
        },
        'accessory': {
          'type': 'datepicker',
          'action_id': 'datepicker',
          'placeholder': {
            'type': 'plain_text',
            'text': 'Select a Date',
          },
        },
      },
      {
        'type': 'actions',
        'elements': [
          {
            'type': 'button',
            'text': {
              'type': 'plain_text',
              'text': 'Submit',
              'emoji': true,
            },
            'value': 'submit_button',
            'action_id': 'submit',
          },
          {
            'type': 'button',
            'text': {
              'type': 'plain_text',
              'text': 'Regenerate',
              'emoji': true,
            },
            'value': 'regenerate_button',
            'action_id': 'regenerate',
          },
        ],
      },
    ],
  });

};
