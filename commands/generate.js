import OpenAI from 'openai';
import {store} from '../models/quiz/quiz.js';
import {zodResponseFormat} from 'openai/helpers/zod';
import {z} from 'zod';

const openai = new OpenAI({apiKey: process.env.OPENAI_API_KEY});

let topic = '';
let isValidDateMessage;
let messageResponses = [];

const question = z.object({
  question: z.string(),
  correctAnswer: z.string(),
  options: z.array(z.string()),
});

const generateQuestions = z.object({
  questions: z.array(question),
});

let generateMessageResponse;

export function generateCommand(app) {
  app.command('/generate', async ({ack, body, say}) => {
    await ack();

    if (!body.text) {
      await app.client.chat.postMessage({
        channel: body.channel_id,
        user: body.user_id,
        text: ':bread: Don\'t be an idiot sandwich, please pick a topic to generate questions :bread:',
      });

      return;
    }

    generateMessageResponse = await app.client.chat.postMessage({
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
        role: 'system', content: 'You will be provided a topic. You will need to create questions from this topic. Make sure that the message given to the User is string' +
            ' format so I can JSON parse it. Please only provide 5 questions. Participants will be Adults and the questions should be appropriate for them. \n' +
            '\n' +
            'Make sure each string has a property of questions with each object having a question, answers as an array with multiple choice of a,b,c, and d in their own objects' +
            ' the right answer. An example of the string format must be: [{question: "Which answer is correct?", answers: ["a) Example answer 1","b) Example answer 2","c) Example' +
            ' answer 3" "d) Example answer 4", correctAnswer: b]},' +
            ' ...] This is the' +
            ' topic:' +
            ' ' + topic,
      },
    ],
    model: 'gpt-4o',
    response_format: zodResponseFormat(generateQuestions, 'generate_questions'),
  });

  const response = JSON.parse(completion.choices[0].message.content);

  // const response = exampleGenerateResponse;

  let date = null;

  let questionBlocks = [];

  response.questions.forEach((item, index) => {
    questionBlocks.push(
        {
          'type': 'section',
          'text': {
            'type': 'mrkdwn',
            'text': `*Question ${index + 1}: ${item.question}*`,
          },
        },
    );

    item.options.forEach((option) => {
      questionBlocks.push(
          {
            'type': 'section',
            'text': {
              'type': 'mrkdwn',
              'text': item.correctAnswer === option[0] ? `*${option}* :white_check_mark:` : `${option}`,
            },
          },
      );
    });
  });

  app.action('datepicker', async ({ack, body}) => {
    await ack();

    date = new Date(body['state']['values']['section']['datepicker']['selected_date']);
    date.setHours(0, 0, 0, 0);
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

    if (isValidDateMessage) {
      await app.client.chat.delete({
        channel: body.channel_id,
        ts: isValidDateMessage.ts,
      });
    }

    let validDate = Date.now();

    const selectedDate = new Date(date);

    if (selectedDate < validDate) {
      isValidDateMessage = await app.client.chat.postMessage({
        channel: body.channel_id,
        text: 'Please select a valid date!',
      });
      return;
    }

    try {
      const questions = response.questions.map(item => ({
        question: item.question,
        options: item.options,
        correctAnswer: item.correctAnswer,
      }));

      await store({
        topic,
        questions,
        date,
      });

      for (const message of messageResponses) {
        await app.client.chat.delete({
          channel: body.channel_id,
          ts: message.ts,
        });
      }

      await app.client.chat.update({
        channel: messageResponse.channel,
        ts: messageResponse.ts,
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

const exampleGenerateResponse = [
  {
    question: 'Which fruit is known as the \'King of Fruits\'?',
    options: ['a) Apple', 'b) Mango', 'c) Banana', 'd) Pineapple'],
    correctAnswer: 'b',
  },
  {
    question: 'Which fruit has the highest vitamin C content per 100g?',
    options: ['a) Orange', 'b) Kiwi', 'c) Strawberry', 'd) Guava'],
    correctAnswer: 'd',
  },
  {
    question: 'What is the main ingredient in traditional guacamole?',
    options: ['a) Avocado', 'b) Tomato', 'c) Bell pepper', 'd) Olive'],
    correctAnswer: 'a',
  },
  {
    question: 'Which fruit is botanically classified as a berry?',
    options: ['a) Raspberry', 'b) Strawberry', 'c) Blueberry', 'd) Banana'],
    correctAnswer: 'd',
  },
  {
    question: 'Which fruit is known for having a \'star-shaped\' cross section when cut?',
    options: ['a) Papaya', 'b) Starfruit', 'c) Kiwi', 'd) Dragonfruit'],
    correctAnswer: 'b',
  },
]; 