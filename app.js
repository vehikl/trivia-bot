import slackApp from '@slack/bolt';
import dotenv from 'dotenv';
import cron from 'node-cron';
import OpenAI from 'openai';
import {getLastWeeksTrivia, getTrivia, getNextTrivia} from './models/quiz/quiz.js';
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

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

allCommand(app);
answersCommand(app);
generateCommand(app);

(async () => {
  await app.start();
  
  // Schedule to run every 30 seconds (FOR TESTING ONLY)
  cron.schedule('0 9 * * 4', async () => {
    try {
      console.log('Running test cron job...', new Date().toISOString());
      
      // First, post last week's trivia with answers
      await postLastWeeksTriviaWithAnswers();
      
      // Then post this week's new trivia questions
      await postCurrentWeeksTrivia();
      
    } catch (error) {
      console.error('Error in cron job:', error);
    }
  });

  // Function to post last week's trivia with answers
  async function postLastWeeksTriviaWithAnswers() {
    const previousTrivia = await getLastWeeksTrivia();
    
    // Check if previousTrivia exists and has the required properties
    if (!previousTrivia || !previousTrivia.topic || !previousTrivia.questions) {
      console.log('No previous trivia found or missing data');
      return;
    }
    
    const quizTitle = previousTrivia.topic;

    const title = quizTitle.split(' ')
        .map(word => word[0].toUpperCase() + word.slice(1))
        .join(' ');

    let triviaWithAnswersText = `${title} - ANSWERS\n\n`;

    previousTrivia.questions.forEach((item, index) => {
      const questionLabel = item.isBonus ? 'Bonus Question' : `Question ${index + 1}`;
      triviaWithAnswersText += `${questionLabel}: ${item.question}\n`;
      triviaWithAnswersText += `Answer: ${item.correctAnswer}\n\n`;
    });

    let answersBlocks = [
      {
        'type': 'section',
        'text': {
          'type': 'mrkdwn',
          'text': `\`\`\`\n${triviaWithAnswersText}\`\`\``,
        },
      },
    ];

    await app.client.chat.postMessage({
      channel: 'C04D6JZ0L67',  // Replace with your Trivia Channel ID
      text: `*${quizTitle} - ANSWERS*`,
      blocks: [
        {
          'type': 'section',
          'text': {
            'type': 'mrkdwn',
            'text': `📝 Last Week's \`${quizTitle.toUpperCase()}\` Trivia - ANSWERS`,
          },
        },
        ...answersBlocks,
      ],
    });
  }

  // Function to post current week's trivia
  async function postCurrentWeeksTrivia() {
    // Use getNextTrivia() instead of getTrivia() without parameters
    const currentTrivia = await getNextTrivia();
    
    // Check if currentTrivia exists and has the required properties
    if (!currentTrivia || !currentTrivia.topic || !currentTrivia.questions) {
      console.log('No current trivia found or missing data');
      return;
    }
    
    const quizTitle = currentTrivia.topic;

    const title = quizTitle.split(' ')
        .map(word => word[0].toUpperCase() + word.slice(1))
        .join(' ');

    let questionText = `${title}\n`;

    currentTrivia.questions.forEach((item, index) => {
      const questionLabel = item.isBonus ? 'Bonus Question' : `Question ${index + 1}`;
      questionText += `\n${questionLabel}: ${item.question}\n`;
    });

    let questionBlocks = [
      {
        'type': 'section',
        'text': {
          'type': 'mrkdwn',
          'text': `\`\`\`\n${questionText}\`\`\``,
        },
      },
    ];

    await app.client.chat.postMessage({
      channel: 'C04D6JZ0L67',  // Replace with your Trivia Channel ID
      text: `*${quizTitle}*`,
      blocks: [
        {
          'type': 'section',
          'text': {
            'type': 'mrkdwn',
            'text': `🧠 This Week's \`${quizTitle.toUpperCase()}\` Trivia`,
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
              "style": "primary",
              'value': 'play_button',
              'action_id': 'play',
            },
          ],
        },
      ],
    });
  }

  // Rest of your existing code...
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

      await playTime(body, client, logger);
    } catch (error) {
      console.error('Error handling play_trivia action:', error);
    }
  });

  app.action('play', async ({ack, body, client, logger}) => {
    try {
      await ack();
      await playTime(body, client, logger);
    } catch (error) {
      logger.error('Error opening trivia modal:', error);
    }
  });

  console.log('⚡️ Bolt app is running!');
})();

async function playTime(body, client, logger) {
  const userId = body.user?.id ?? body.user_id;

  const trivia = !body.text
    ? await getLastWeeksTrivia()
    : await getTrivia(body.text);

  let alreadyPlayed = false;

  const submission = await getSubmission(userId, trivia);

  if (submission) {
    alreadyPlayed = true;
  }

  const questionsBlock = [];

  trivia.questions.forEach((item, index) => {
    const label = item.isBonus ? `Bonus Question: ${item.question}` : `Question ${index + 1}: ${item.question}`;
    questionsBlock.push({
      'type': 'input',
      'block_id': `question-${index}`,
      'label': {
        'type': 'plain_text',
        'text': label,
        'emoji': true,
      },
      'element': {
        'type': 'plain_text_input',
        'action_id': `answer-${index}`,
        'multiline': false,
      },
    });
  });

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

  try {
    await client.views.open({
      trigger_id: body.trigger_id,
      channel_id: body.channel_id,
      view: {
        type: 'modal',
        callback_id: 'trivia_view',
        private_metadata: JSON.stringify({
          quizDate: trivia.date,
          channelId: body.channel?.id || body.channel_id || 'C04D6JZ0L67',
        }),
        title: {
          type: 'plain_text',
          text: `${trivia.topic.toUpperCase()}`,
        },
        'blocks': [
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
  let regularScore = 0;
  let bonusScore = 0;
  let aiVerdicts = [];

  const userId = body.user.id;
  const metadata = body.view.private_metadata ? JSON.parse(body.view.private_metadata) : {};

  // Extract free-text answers from modal state
  for (const property in body.view.state.values) {
    const action = body.view.state.values[property][`answer-${index}`];
    userSubmissions.push(action ? (action.value || '').trim() : '');
    index++;
  }

  const triviaDocument = await getTrivia({ date: metadata.quizDate });
  const normalize = (s) => (s || '').trim().toLowerCase();

  for (let i = 0; i < userSubmissions.length; i++) {
    const userAnswer = userSubmissions[i];
    const correctAnswer = triviaDocument.questions[i].correctAnswer;
    const isBonus = triviaDocument.questions[i].isBonus === true;

    if (!userAnswer) {
      aiVerdicts.push('no-answer');
      continue;
    }

    // First try simple normalized string match
    if (normalize(userAnswer) === normalize(correctAnswer)) {
      if (isBonus) {
        bonusScore++;
      } else {
        regularScore++;
      }
      aiVerdicts.push('exact');
      continue;
    }

    // Check if correct answer contains multiple options separated by "or"
    const correctOptions = correctAnswer.split(/\s+or\s+/i).map(option => option.trim());
    const userAnswerNormalized = normalize(userAnswer);

    let isCorrectOption = false;
    for (const option of correctOptions) {
      if (userAnswerNormalized === normalize(option)) {
        isCorrectOption = true;
        break;
      }
    }

    if (isCorrectOption) {
      if (isBonus) {
        bonusScore++;
      } else {
        regularScore++;
      }
      aiVerdicts.push('exact');
      continue;
    }

    // Use AI to judge if the answer is correct (allowing minor spelling errors, but not wrong facts)
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4.1-nano',
        messages: [
          {
            role: 'system',
            content:
              'You are a strict grader for short-answer trivia. ' +
              'Given a question, the canonical correct answer, and a user answer, decide if the user answer is truly correct.\n' +
              '- If the correct answer contains "or", any of the options listed is acceptable.\n' +
              '- Treat minor spelling errors or very small wording differences as CORRECT if they clearly refer to the same factual answer.\n' +
              '- Case differences (Medal Collection vs medal collection) should be treated as CORRECT.\n' +
              '- If the user names a different place/person/thing (e.g. "Brazil" as the capital of Brazil) it must be marked INCORRECT.\n' +
              '- Respond with exactly one word: "correct" or "incorrect". No explanations.',
          },
          {
            role: 'user',
            content:
              `Question: ${triviaDocument.questions[i].question}\n` +
              `Correct answer: ${correctAnswer}\n` +
              `User answer: ${userAnswer}`,
          },
        ],
      });

      const verdictRaw = completion.choices[0].message.content.trim().toLowerCase();
      const verdictWord = verdictRaw.split(/\s+/)[0]; // use the first token only
      let verdict = 'incorrect';
      if (verdictWord === 'correct') {
        verdict = 'correct';
      }

      aiVerdicts.push(verdict);

      if (verdict === 'correct') {
        if (isBonus) {
          bonusScore++;
        } else {
          regularScore++;
        }
      }
    } catch (e) {
      console.error('Error grading answer with AI', e);
      aiVerdicts.push('error');
    }
  }

  const submission = await getSubmission(userId, triviaDocument);
  const alreadyPlayed = Boolean(submission);

  let questionText = `Topic: ${triviaDocument.topic
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')}\n\n`;

  const regularCount = triviaDocument.questions.filter(q => q.isBonus !== true).length;
  const bonusCount = triviaDocument.questions.filter(q => q.isBonus === true).length;

  triviaDocument.questions.forEach((item, index) => {
    const userAnswer = (userSubmissions[index] || '').trim() || 'No answer provided';
    const correctAnswer = triviaDocument.questions[index].correctAnswer;
    const verdict = aiVerdicts[index];
    const label = item.isBonus ? 'Bonus Question' : `Question ${index + 1}`;

    let answerFeedback = '';
    if (verdict === 'exact' || verdict === 'correct') {
      answerFeedback = `Your Answer: ${userAnswer} ✅\n`;
    } else {
      answerFeedback = `Your Answer: ${userAnswer} ❌\nCorrect Answer: ${correctAnswer}\n`;
    }

    questionText += `*${label}: ${item.question}*\n${answerFeedback}\n`;
  });

  if (bonusCount > 0) {
    questionText += `Your Score is: ${regularScore}/${regularCount} (Bonus: ${bonusScore}/${bonusCount})\n`;
  } else {
    questionText += `Your Score is: ${regularScore}/${regularCount}\n`;
  }

  if (alreadyPlayed) {
    questionText += `\nNote: This submission will not be counted since you've already played.\n`;
  }

  let questionBlocks = [
    {
      'type': 'section',
      'text': {
        'type': 'mrkdwn',
        'text': `\`\`\`${questionText}\`\`\``, // Wrap all text in one code block
      },
    },
  ];

  const quizDate = new Date(triviaDocument.date.seconds * 1000); // Quiz date as Date object

  if (!alreadyPlayed) {
    await store({
      user_id: body.user.id,
      user_score: regularScore,
      bonus_score: bonusScore,
      topic: triviaDocument.topic,
      date: quizDate,
      time: Date.now()
    });
  }

  await client.chat.postEphemeral({
    text: 'Thanks for Playing! :tada:',
    channel: body.view.private_metadata ? JSON.parse(body.view.private_metadata).channelId || 'C04D6JZ0L67' : 'C04D6JZ0L67',
    user: body.user.id,
    blocks: questionBlocks,
  });
});