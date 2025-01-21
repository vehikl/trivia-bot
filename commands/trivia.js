import OpenAI from 'openai';
import { store } from '../models/quiz/quiz.js';

const openai = new OpenAI({apiKey: process.env.OPENAI_API_KEY});
let topic = '';

export function triviaCommand(app) {
  app.command('/trivia', async ({ack, body, say}) => {
    await ack();

    if (!body.text) {
      await app.client.chat.postEphemeral({
        channel: body.channel_id,
        user: body.user_id,
        text: "Don't be an idiot sandwich, please pick a topic for trivia :bread:"
      });

      return;
    }

     await app.client.chat.postEphemeral({
       channel: body.channel_id,
       user: body.user_id,
       text: 'Generating Trivia... :brain:'
     })

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

  // const completion = await openai.chat.completions.create({
  //   messages: [
  //     {
  //       role: 'system', content: 'You will be provided a topic. You will need to create trivia questions from this topic. Make sure that the message given to the User is string' +
  //           ' format so I can JSON parse it. Please only provide 5 questions. \n' +
  //           '\n' +
  //           'Make sure each string has a property of questions with each object having a question, answers as an array with multiple choice of a,b,c, and d in their own objects' +
  //           ' the right answer. An example of the string format would be: [{question: "question text", answers: ["a) Example answer 1","b) Example answer 2","c) Example' +
  //           ' answer 3" "d) Example answer 4", correctAnswer: b]},' +
  //           ' ...] This is the' +
  //           ' topic:' +
  //           ' ' + topic,
  //     },
  //   ],
  //   model: 'gpt-4o',
  // });
  //
  // const response = JSON.parse(completion.choices[0].message.content);

  const response = exampleTriviaResponse;

  let date = null;

  let questionBlocks = [];

  response.forEach((item, index) => {
    questionBlocks.push(
        {
          'type': 'section',
          'text': {
            'type': 'mrkdwn',
            'text': `*Question ${index + 1}: ${item.question}*`,
          },
        },
    );

    item.answers.forEach((answer) => {
      questionBlocks.push(
          {
            'type': 'section',
            'text': {
              'type': 'mrkdwn',
              'text': item.correctAnswer === answer[0] ? `*${answer}* :white_check_mark:` : `${answer}`,
            },
          },
      );
    });
  });

  app.action('submit', async ({ack}) => {
    await ack();

    const questions = response.map(item => ({
      question: item.question,
      options: item.answers,
      correctAnswer: item.correctAnswer,
    }));

    const quiz = {
      topic,
      questions,
      date
    };

    await store(quiz);
  });

  app.action('datepicker', async({ack, body}) => {
    await ack();

    date = new Date(body['state']['values']['section']['datepicker']['selected_date']);
    date.setHours(0, 0, 0, 0);
  });

  app.action('regenerate', async ({ack}) => {
    await ack();

    await app.client.chat.postEphemeral({
      channel: body.channel_id,
      user: body.user_id,
      text: 'Regenerating Trivia... :brain:'
    })

    await executeCommand(app, body, say);
  });

  await say({
    'text': 'Trivia Based on ' + body.text,
    'blocks': [
      {
        'type': 'header',
        'text': {
          'type': 'plain_text',
          'text': 'Hello Friend! It\'s time for Trivia! :bulb: :brain:',
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
        "type": "section",
        "block_id": "section",
        "text": {
          "type": "mrkdwn",
          "text": "Pick a date for when the Trivia will be for."
        },
        "accessory": {
          "type": "datepicker",
          "action_id": "datepicker",
          "placeholder": {
            "type": "plain_text",
            "text": "Select a Date"
          }
        }
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
}

const exampleTriviaResponse = [
  {
    question: "Which fruit is known as the 'King of Fruits'?",
    answers: [ 'a) Apple', 'b) Mango', 'c) Banana', 'd) Pineapple' ],
    correctAnswer: 'b'
  },
  {
    question: 'Which fruit has the highest vitamin C content per 100g?',
    answers: [ 'a) Orange', 'b) Kiwi', 'c) Strawberry', 'd) Guava' ],
    correctAnswer: 'd'
  },
  {
    question: 'What is the main ingredient in traditional guacamole?',
    answers: [ 'a) Avocado', 'b) Tomato', 'c) Bell pepper', 'd) Olive' ],
    correctAnswer: 'a'
  },
  {
    question: 'Which fruit is botanically classified as a berry?',
    answers: [ 'a) Raspberry', 'b) Strawberry', 'c) Blueberry', 'd) Banana' ],
    correctAnswer: 'd'
  },
  {
    question: "Which fruit is known for having a 'star-shaped' cross section when cut?",
    answers: [ 'a) Papaya', 'b) Starfruit', 'c) Kiwi', 'd) Dragonfruit' ],
    correctAnswer: 'b'
  }
];
