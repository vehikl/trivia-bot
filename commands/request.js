import {getTriviaForCalendarDay, store as storeQuiz} from '../models/quiz/quiz.js';
import {formatDate, getNextThursday, getStartOfDay} from '../services/utils/datetime.js';
import {generateQuestionsForTopic} from '../services/trivia/generateQuiz.js';
import {validateTriviaTopic} from '../services/trivia/topicSafety.js';
import {normalizeTriviaTopicTitle} from '../services/trivia/topicTitle.js';

const MAX_SUBMITTED_TOPIC_LENGTH = 300;
const MAX_DEFAULT_DATE_SEARCH_ATTEMPTS = 104;
const MAX_SAVE_DATE_ATTEMPTS = 3;

function normalizeRequestedTopic(topic) {
  return (topic || '')
    .trim()
    .replace(/[<>`]/g, '')
    .replace(/^["']|["']$/g, '')
    .replace(/\s+/g, ' ');
}

async function defaultTriviaDate() {
  let candidateDate = getStartOfDay(getNextThursday());

  for (let attempt = 1; attempt <= MAX_DEFAULT_DATE_SEARCH_ATTEMPTS; attempt++) {
    const existingTrivia = await getTriviaForCalendarDay(candidateDate);
    if (!existingTrivia) {
      return candidateDate;
    }

    candidateDate.setDate(candidateDate.getDate() + 7);
  }

  throw new Error(
    `Could not find an available trivia date after ${MAX_DEFAULT_DATE_SEARCH_ATTEMPTS} attempts.`
  );
}

function requestedByPayload(body, originalTopic) {
  return {
    userId: body.user_id,
    userName: body.user_name || '',
    requestedAt: new Date(),
    originalTopic,
  };
}

async function storeRequestedQuizForNextAvailableDate(getTriviaDate, quiz) {
  let lastAttemptedDate = null;

  for (let attempt = 1; attempt <= MAX_SAVE_DATE_ATTEMPTS; attempt++) {
    const date = await getTriviaDate();
    lastAttemptedDate = date;
    const ok = await storeQuiz({
      ...quiz,
      date,
    }, {failIfExists: true});

    if (ok) {
      return date;
    }

    console.warn(
      `Requested quiz save attempt ${attempt} failed for ${formatDate(date)}; retrying with next available date.`
    );
  }

  throw new Error(
    `Failed to store requested trivia after ${MAX_SAVE_DATE_ATTEMPTS} attempts. Last attempted date: ${formatDate(lastAttemptedDate)}`
  );
}

export function requestCommand(app, openai, options = {}) {
  const getTriviaDate = options.getTriviaDate || defaultTriviaDate;

  app.command('/request', async ({ack, body}) => {
    await ack();

    const requestedTopic = normalizeRequestedTopic(body.text);

    if (!requestedTopic) {
      await app.client.chat.postEphemeral({
        channel: body.channel_id,
        user: body.user_id,
        text: 'Please include a work-appropriate topic. Example: `/request Canadian inventions`',
      });
      return;
    }

    if (requestedTopic.length > MAX_SUBMITTED_TOPIC_LENGTH) {
      await app.client.chat.postEphemeral({
        channel: body.channel_id,
        user: body.user_id,
        text: `Please keep trivia topic requests under ${MAX_SUBMITTED_TOPIC_LENGTH} characters.`,
      });
      return;
    }

    try {
      await app.client.chat.postEphemeral({
        channel: body.channel_id,
        user: body.user_id,
        text: `Reviewing and generating trivia for "${requestedTopic}"...`,
      });

      const safety = await validateTriviaTopic(openai, requestedTopic);
      if (!safety.isAppropriate) {
        await app.client.chat.postEphemeral({
          channel: body.channel_id,
          user: body.user_id,
          text: `Please choose a different work-appropriate topic. ${safety.reason}`,
        });
        return;
      }

      const topic = normalizeTriviaTopicTitle(safety.topic || requestedTopic);
      const payload = await generateQuestionsForTopic(openai, topic);
      const questions = payload.questions.map((item) => ({
        question: item.question,
        correctAnswer: item.correctAnswer,
        isBonus: item.isBonus,
      }));

      const date = await storeRequestedQuizForNextAvailableDate(getTriviaDate, {
        topic,
        questions,
        requestedBy: requestedByPayload(body, requestedTopic),
      });

      await app.client.chat.postEphemeral({
        channel: body.channel_id,
        user: body.user_id,
        text: `Your requested topic "${topic}" has been generated for ${formatDate(date)}.`,
      });
    } catch (error) {
      console.error('Error handling /request command:', error);
      await app.client.chat.postEphemeral({
        channel: body.channel_id,
        user: body.user_id,
        text: 'Sorry, I could not generate that requested trivia topic. Please try again.',
      });
    }
  });
}
