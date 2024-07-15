import slackApp from '@slack/bolt';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const openai = new OpenAI({apiKey: process.env.OPENAI_API_KEY});
const {App} = slackApp;

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
  port: process.env.PORT || 3000,
});

app.command('/trivia', async ({ack, body, say, client, logger}) => {
  await ack();

  const completion = await openai.chat.completions.create({
    messages: [
      {
        role: 'system', content: 'You will be provided a topic. You will need to create trivia questions from this topic. Make sure that the message given to the User is string' +
            ' format so I can JSON parse it. Please only provide 5 questions. \n' +
            '\n' +
            'Make sure each string has a property of questions with each object having a question, answers as an array with multiple choice of a,b,c, and d in their own objects' +
            ' the right answer. An example of the string format would be: [{question: "question text", answers: ["a) Example answer 1","b) Example answer 2","c) Example' +
            ' answer 3" "d) Example answer 4", correctAnswer: b]},' +
            ' ...] This is the' +
            ' topic:' +
            ' ' + body.text,
      },
    ],
    model: 'gpt-4o',
  });

  const response = JSON.parse(completion.choices[0].message.content);

  let questionBlocks = [];
  response.forEach((item) => {
    console.log(JSON.stringify(item));

    questionBlocks.push(
        {
          'type': 'section',
          'text': {
            'type': 'mrkdwn',
            'text': item.question,
          },
        },
    );

    item.answers.forEach((answer) => {
      questionBlocks.push(
          {
            'type': 'section',
            'text': {
              'type': 'mrkdwn',
              'text': JSON.stringify(answer),
            },
          },
      );
    });

    questionBlocks.push(
        {
          'type': 'section',
          'text': {
            'type': 'mrkdwn',
            'text': JSON.stringify(item.correctAnswer) + ' is the correct answer',
          },
        },
    );
  });

  await say({
    'text': 'Trivia Based on ' + body.text,
    'blocks': [
      {
        'type': 'header',
        'text': {
          'type': 'plain_text',
          'text': 'Hello Friend, Time for Trivia! :wave:',
        },
      },
      ...questionBlocks,
    ],
    'attachments': [
      {
        'blocks':
            [
              {
                "type": "section",
                "text": {
                  "type": "mrkdwn",
                  "text": "Make sure to review the answers and questions before Submitting! :smile:"
                },
                "accessory": {
                  "type": "button",
                  "text": {
                    "type": "plain_text",
                    "text": "Submit",
                    "emoji": true
                  },
                  "value": "view_alternate_1"
                }
              },
            ],
      },
    ],

  });
});

(async () => {
  await app.start();

  console.log('⚡️ Bolt app is running!');
})();
