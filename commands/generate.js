import OpenAI from 'openai';
import {store} from '../models/quiz/quiz.js';
import {zodResponseFormat} from 'openai/helpers/zod';
import {z} from 'zod';
import {getStartOfDay} from '../services/utils/datetime.js';

const openai = new OpenAI({apiKey: process.env.OPENAI_API_KEY});

let topic = '';
let questions = [];
let questionBlocks = [];
let isValidDateMessage;
let messageResponses = [];

const question = z.object({
  question: z.string(),
  correctAnswer: z.string(),
  isBonus: z.boolean(),
});

const generateQuestions = z.object({
  questions: z.array(question).length(6),
});

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

    messageResponses = [];

    generateMessageResponse = await app.client.chat.postEphemeral({
      channel: body.channel_id,
      user: body.user_id,
      text: 'Generating Questions... :brain:',
    });

    messageResponses.push(generateMessageResponse)

    try {
      await executeCommand(app, body, say);
    } catch (error) {
      console.log(error);
      await executeCommand(app, body, say);
    }
  });
}

const executeCommand = async (app, body, say) => {
  topic = body.text;

  const completion = await openai.chat.completions.create({
    messages: [
      {
        role: 'system',
        content:
          'You are writing a weekly office trivia quiz.\n' +
          'Requirements:\n' +
          '- Produce exactly 6 questions total: 5 regular questions and 1 bonus question.\n' +
          '- All questions must match the supplied theme/topic.\n' +
          '- Each question should include 1–3 sentences of helpful clue/context BEFORE the actual ask, similar in style to the Pixar examples.\n' +
          '- Short-answer format (no multiple choice).\n' +
          '- Provide a concise canonical answer for each question.\n' +
          '- Mark the bonus question with isBonus=true; all other questions isBonus=false.\n' +
          'Output format:\n' +
          '- Respond with a JSON string matching: { "questions": [ { "question": string, "correctAnswer": string, "isBonus": boolean }, ... ] }\n' +
          '- The array must contain exactly 6 objects.\n' +
          'Theme/topic: ' + topic,
      },
    ],
    model: 'gpt-4.1-nano',
    response_format: zodResponseFormat(generateQuestions, 'generate_questions'),
  });

  const response = JSON.parse(completion.choices[0].message.content);

  // const response = exampleGenerateResponse;

  let date = null;

  questionBlocks = [];

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
      isValidDateMessage = await app.client.chat.postEphemeral({
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
      isValidDateMessage = await app.client.chat.postEphemeral({
        channel: body.channel_id,
        user: body.user?.id ?? body.user_id,
        text: 'Please select a valid date!',
      });
      return;
    }

    try {
      questions = response.questions.map(item => ({
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

  messageResponses.push(messageResponse);
};