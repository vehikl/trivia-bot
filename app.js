import slackApp from '@slack/bolt';
import dotenv from 'dotenv';
import cron from 'node-cron';
import OpenAI from 'openai';
import {
  getLastWeeksTrivia,
  getTrivia,
  getNextTrivia,
  getTriviaForCalendarDay,
  store as storeQuiz,
} from './models/quiz/quiz.js';
import {allCommand} from "./commands/all.js";
import {answersCommand} from "./commands/answers.js";
import {generateCommand} from "./commands/generate.js";
import {requestCommand} from './commands/request.js';
import {getSubmission, store} from "./models/submission/submission.js";
import {getNextThursday, getStartOfDay} from './services/utils/datetime.js';
import {generateQuestionsForTopic} from './services/trivia/generateQuiz.js';
import {gradeTriviaSubmission} from './services/trivia/grader.js';
import {upsertLeaderboardMessage} from './services/trivia/leaderboard.js';
import {openTriviaModal} from './services/trivia/playModal.js';
import {
  getDefaultTriviaForPlay,
  getTriviaDateForRequest,
  isDailyTestCronEnabled,
} from './services/trivia/runtime.js';
import {
  buildAnswersBlocks,
  buildPlayButtonBlock,
  buildTriviaQuestionBlocks,
  getRequestedByBlocks,
} from './services/trivia/slackBlocks.js';
import {pickWeeklyTopic, pickTopicForCalendarDay} from './services/trivia/weeklyTopic.js';
import {registerHomeView} from './services/slack/home.js';

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
requestCommand(app, openai, {getTriviaDate: getTriviaDateForRequest});
registerHomeView(app);

(async () => {
  await app.start();

  if (isDailyTestCronEnabled()) {
    console.log(
      'TRIVIA_DAILY_TEST_CRON is on: every day at 9:00 — generate & post quiz for today (weekly Thursday cron disabled).'
    );
    cron.schedule('0 9 * * *', async () => {
      try {
        console.log(
          '[daily test cron]',
          new Date().toISOString()
        );
        await ensureTodaysQuizExists();
        await postTodaysTrivia();
        await postTodaysLeaderboard();
      } catch (error) {
        console.error('[daily test cron] error:', error);
      }
    });
  } else {
    cron.schedule('0 9 * * 4', async () => {
      try {
        console.log('Running weekly trivia cron job...', new Date().toISOString());

        await ensureThisWeeksQuizExists();

        const previousTrivia = await getLastWeeksTrivia();

        await postLastWeeksTriviaWithAnswers();

        if (previousTrivia) {
          await postWeeklyLeaderboard(previousTrivia);
        }

        await postCurrentWeeksTrivia();
      } catch (error) {
        console.error('Error in cron job:', error);
      }
    });
  }

  // Function to post last week's trivia with answers
  async function postLastWeeksTriviaWithAnswers() {
    const previousTrivia = await getLastWeeksTrivia();
    
    // Check if previousTrivia exists and has the required properties
    if (!previousTrivia || !previousTrivia.topic || !previousTrivia.questions) {
      console.log('No previous trivia found or missing data');
      return;
    }
    
    const quizTitle = previousTrivia.topic;

    const answersBlocks = buildAnswersBlocks(previousTrivia);

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

  // Add this function after postLastWeeksTriviaWithAnswers
  async function postWeeklyLeaderboard(previousTrivia, options = {}) {
    await upsertLeaderboardMessage(app.client, previousTrivia, {
      fallbackText: `🏆 ${previousTrivia.topic} Leaderboard`,
      headingText: `🏆 **Last Week's Champions** 🏆`,
      noSubmissionsLog: 'No submissions found for leaderboard',
      ...options,
    });
  }

  async function postTodaysLeaderboard() {
    const today = getStartOfDay(new Date());
    const currentTrivia = await getTriviaForCalendarDay(today);

    if (!currentTrivia || !currentTrivia.topic || !currentTrivia.questions) {
      console.log('[daily test] No trivia to post leaderboard for today');
      return;
    }

    await postWeeklyLeaderboard(currentTrivia, {
      fallbackText: `🧪 ${currentTrivia.topic} Test Leaderboard`,
      headingText: `🧪 *Today's Test Leaderboard* 🧪`,
      noSubmissionsLog: '[daily test] No submissions found for test leaderboard',
    });
  }

  async function ensureTodaysQuizExists() {
    const today = getStartOfDay(new Date());
    const existing = await getTriviaForCalendarDay(today);
    if (
      existing?.topic &&
      Array.isArray(existing.questions) &&
      existing.questions.length === 6
    ) {
      console.log('[daily test] Quiz already present for today; skipping generation.');
      return;
    }

    const topic = pickTopicForCalendarDay(today);
    console.log('[daily test] Generating quiz for today, topic:', topic);
    const payload = await generateQuestionsForTopic(openai, topic);
    const questions = payload.questions.map((item) => ({
      question: item.question,
      correctAnswer: item.correctAnswer,
      isBonus: item.isBonus,
    }));
    const ok = await storeQuiz({topic, questions, date: today});
    if (!ok) {
      throw new Error('[daily test] Failed to store quiz');
    }
  }

  async function postTodaysTrivia() {
    const today = getStartOfDay(new Date());
    const currentTrivia = await getTriviaForCalendarDay(today);

    if (!currentTrivia || !currentTrivia.topic || !currentTrivia.questions) {
      console.log('[daily test] No trivia to post for today');
      return;
    }

    const quizTitle = currentTrivia.topic;

    const questionBlocks = buildTriviaQuestionBlocks(currentTrivia);

    await app.client.chat.postMessage({
      channel: 'C04D6JZ0L67',
      text: `*${quizTitle}* (daily test)`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `🧪 *Daily test* — Today's \`${quizTitle.toUpperCase()}\` trivia (${today.toDateString()})`,
          },
        },
        ...getRequestedByBlocks(currentTrivia),
        ...questionBlocks,
        buildPlayButtonBlock(),
      ],
    });
  }

  async function ensureThisWeeksQuizExists() {
    const existing = await getNextTrivia();
    if (
      existing?.topic &&
      Array.isArray(existing.questions) &&
      existing.questions.length === 6
    ) {
      console.log(
        'Weekly quiz already present for this Thursday; skipping auto-generation.'
      );
      return;
    }

    const topic = pickWeeklyTopic();
    console.log('Auto-generating weekly quiz, topic:', topic);
    const payload = await generateQuestionsForTopic(openai, topic);
    const date = getStartOfDay(getNextThursday());
    const questions = payload.questions.map((item) => ({
      question: item.question,
      correctAnswer: item.correctAnswer,
      isBonus: item.isBonus,
    }));
    const ok = await storeQuiz({topic, questions, date});
    if (!ok) {
      throw new Error('Failed to store auto-generated weekly quiz');
    }
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

    const questionBlocks = buildTriviaQuestionBlocks(currentTrivia);

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
        ...getRequestedByBlocks(currentTrivia),
        ...questionBlocks,
        buildPlayButtonBlock(),
      ],
    });
  }

  app.action('play_trivia', async ({ ack, body, client, logger }) => {
    try {
      // Always acknowledge the action first
      await ack();

      await openTriviaModal({body, client, logger, getDefaultTriviaForPlay});
    } catch (error) {
      console.error('Error handling play_trivia action:', error);
    }
  });

  app.action('play', async ({ack, body, client, logger}) => {
    try {
      await ack();
      await openTriviaModal({body, client, logger, getDefaultTriviaForPlay});
    } catch (error) {
      logger.error('Error opening trivia modal:', error);
    }
  });
})();

app.view('trivia_view', async ({ ack, body, client }) => {
  await ack();
  let index = 0;
  let userSubmissions = [];

  const userId = body.user.id;
  const metadata = body.view.private_metadata ? JSON.parse(body.view.private_metadata) : {};
  const responseChannelId = metadata.channelId || 'C04D6JZ0L67';

  // Extract free-text answers from modal state
  for (const property in body.view.state.values) {
    const action = body.view.state.values[property][`answer-${index}`];
    userSubmissions.push(action ? (action.value || '').trim() : '');
    index++;
  }

  const triviaDocument = await getTrivia({ date: metadata.quizDate });
  const {regularScore, bonusScore, aiVerdicts} = await gradeTriviaSubmission(
    openai,
    triviaDocument,
    userSubmissions
  );

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
    const stored = await store({
      user_id: body.user.id,
      user_score: regularScore,
      bonus_score: bonusScore,
      topic: triviaDocument.topic,
      date: quizDate,
      time: Date.now()
    });

    if (stored) {
      try {
        await upsertLeaderboardMessage(client, triviaDocument, {
          channel: responseChannelId,
          fallbackText: `🏆 ${triviaDocument.topic} Leaderboard`,
          headingText: isDailyTestCronEnabled()
            ? `🧪 *Today's Test Leaderboard* 🧪`
            : `🏆 *Leaderboard* 🏆`,
        });
      } catch (error) {
        console.error('Error updating leaderboard after submission:', error);
      }
    }
  }

  await client.chat.postEphemeral({
    text: 'Thanks for Playing! :tada:',
    channel: responseChannelId,
    user: body.user.id,
    blocks: questionBlocks,
  });
});
