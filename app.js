import slackApp from '@slack/bolt';
import dotenv from 'dotenv';
import cron from 'node-cron';
import {getLastWeeksTrivia, getTrivia} from './models/quiz/quiz.js';
import {allCommand} from "./commands/all.js";
import {answersCommand} from "./commands/answers.js";
import {generateCommand} from "./commands/generate.js";
import {getSubmission, store} from "./models/submission/submission.js";

dotenv.config();

const {App} = slackApp;

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
  port: process.env.PORT || 3000,
});

allCommand(app);
answersCommand(app);
generateCommand(app);

const previousTrivia = await getLastWeeksTrivia();

(async () => {
  await app.start();
  cron.schedule('* */1 * * *', async () => {
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
    });

    app.action('play', async ({ack, body, client, logger}) => {
      // Always acknowledge the action first
      await ack();
      try {
        await playTime(ack, body, client, logger);
      } catch (error) {
        logger.error('Error opening trivia modal:', error);
      }
    });

    try {
      await app.client.chat.postMessage({
        channel: 'C04D6JZ0L67',  // to be replaced with Trivia Channel ID
        text: `*${quizTitle}*`,
        blocks: [
          {
            'type': 'section',
            'text': {
              'type': 'mrkdwn',
              'text': `*Your ${quizTitle} Trivia *`,
            },
          },
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
          text: "Ready to test your knowledge? Use the button below to join the current trivia game!"
        },
      },
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
      // Always acknowledge the action first
      await ack();

      await playTime(ack, body, client, logger);
    } catch (error) {
      console.error('Error handling play_trivia action:', error);
    }
  });

  console.log('⚡️ Bolt app is running!');
})();

let correctAnswers = [];
let trivia;
let alreadyPlayed = false;

async function playTime(ack, body, client, logger) {
  await ack();

  if (!body.text) {
    trivia = await getLastWeeksTrivia();
  } else {
    trivia = await getTrivia(body.text);
  }

  alreadyPlayed = false;

  const submission = await getSubmission(body.user_id ?? body.user.id, trivia);

  if (submission) {
    alreadyPlayed = true;
  }

  const questionsBlock = [];

  if (alreadyPlayed) {
    questionsBlock.push({
      'type': 'rich_text',
      'elements': [
        {
          'type': 'rich_text_section',
          'elements': [
            {
              'type': 'text',
              'text': 'Note: This submission will not be counted since you\'ve already played.',
              'style': {
                'italic': true,
              },
            },
          ],
        },
      ],
    });
  }

  trivia.questions.forEach((item, index) => {
    correctAnswers.push(item.correctAnswer);
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
            'action_id': `radio-buttons-${index}`,
          },
        },
    );
  });

  try {
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
  } catch (error) {
    logger.error(error);
  }
}

app.view('trivia_view', async ({ ack, body, client }) => {
  await ack();
  let index = 0;
  let userSubmissions = [];
  let score = 0;
  if (!body.text) {
    trivia = await getLastWeeksTrivia();
  } else {
    trivia = await getTrivia(body.text);
  }

  for (const property in body.view.state.values) {
    userSubmissions.push(body.view.state.values[property][`radio-buttons-${index}`]['selected_option']['value']);
    index++;
  }

  for (let i = 0; i < userSubmissions.length; i++) {
    if (userSubmissions[i] === correctAnswers[i]) {
      score++;
    }
  }

  let triviaDocument = await getTrivia(trivia);

  const submission = await getSubmission(body.user_id, trivia);

  if (submission) {
    alreadyPlayed = true;
  }

  let questionBlocks = [
    {
      'type': 'section',
      'text': {
        'type': 'mrkdwn',
        'text': `Topic: *${trivia.topic.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ')}*\n`,
      },
    },
  ];
  triviaDocument.questions.forEach((item, index) => {
    questionBlocks.push(
        {
          'type': 'section',
          'text': {
            'type': 'mrkdwn',
            'text': `*Question ${index + 1}: ${item.question}*`,
          },
        },
    );

    const correctOption = item.options.filter((option) => {
      return option[0] === item.correctAnswer;
    })[0].slice(3);

    const userSubmission = item.options.filter((option) => {
      return option[0] === userSubmissions[index];
    })[0].slice(3);

    let text = 'Your Answer: ';

    if (userSubmissions[index] === correctAnswers[index]) {
      text += `*${correctOption}* :white_check_mark:`;
    } else {
      text += `*${userSubmission}* :x: \n\n Correct Answer: *${correctOption}*`
    }

    questionBlocks.push(
        {
          'type': 'section',
          'text': {
            'type': 'mrkdwn',
            'text': text,
          },
        },
    );
  });

  questionBlocks.push({
    'type': 'section',
    'text': {
      'type': 'mrkdwn',
      'text': `
          Your Score is: *${score}/5!*        
          `,
    },
  });

  if (alreadyPlayed) {
    questionBlocks.push({
      'type': 'rich_text',
      'elements': [
        {
          'type': 'rich_text_section',
          'elements': [
            {
              'type': 'text',
              'text': 'Note: This submission will not be counted since you\'ve already played.',
              'style': {
                'italic': true,
              },
            },
          ],
        },
      ],
    });
  }

  const date = new Date(triviaDocument.date.seconds * 1000); // Multiply by 1000 to convert seconds to milliseconds
  const options = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
  const formattedDate = date.toLocaleDateString('en-US', options);
  const finalDate = formattedDate.split(',').join();

  if (!alreadyPlayed) {
    await store({
      user_id: body.user.id,
      user_score: score,
      topic: triviaDocument.topic,
      date: finalDate,
      time: Date.now()
    });
  }

  await client.chat.postMessage({
    text: 'Thanks for Playing! :tada:',
    channel: body.user.id,
    blocks: questionBlocks,
  });
});

