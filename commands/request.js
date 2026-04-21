import {store as storeQuiz} from '../models/quiz/quiz.js';
import {getNextThursday, getStartOfDay} from '../services/utils/datetime.js';
import {generateQuestionsForTopic} from '../services/trivia/generateQuiz.js';
import {validateTriviaTopic} from '../services/trivia/topicSafety.js';

const MAX_TOPIC_LENGTH = 80;

function normalizeRequestedTopic(topic) {
  return (topic || '')
    .trim()
    .replace(/[<>`]/g, '')
    .replace(/^["']|["']$/g, '')
    .replace(/\s+/g, ' ');
}

function defaultTriviaDate() {
  return getStartOfDay(getNextThursday());
}

function requestedByPayload(body, originalTopic) {
  return {
    userId: body.user_id,
    userName: body.user_name || '',
    requestedAt: new Date(),
    originalTopic,
  };
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

    if (requestedTopic.length > MAX_TOPIC_LENGTH) {
      await app.client.chat.postEphemeral({
        channel: body.channel_id,
        user: body.user_id,
        text: `Please keep trivia topics under ${MAX_TOPIC_LENGTH} characters.`,
      });
      return;
    }

    await app.client.chat.postEphemeral({
      channel: body.channel_id,
      user: body.user_id,
      text: `Reviewing and generating trivia for "${requestedTopic}"...`,
    });

    try {
      const safety = await validateTriviaTopic(openai, requestedTopic);
      if (!safety.isAppropriate) {
        await app.client.chat.postEphemeral({
          channel: body.channel_id,
          user: body.user_id,
          text: `Please choose a different work-appropriate topic. ${safety.reason}`,
        });
        return;
      }

      const topic = normalizeRequestedTopic(safety.topic || requestedTopic);
      const payload = await generateQuestionsForTopic(openai, topic);
      const questions = payload.questions.map((item) => ({
        question: item.question,
        correctAnswer: item.correctAnswer,
        isBonus: item.isBonus,
      }));
      const date = getTriviaDate();
      const ok = await storeQuiz({
        topic,
        questions,
        date,
        requestedBy: requestedByPayload(body, requestedTopic),
      });

      if (!ok) {
        throw new Error('Failed to store requested trivia');
      }

      await app.client.chat.postEphemeral({
        channel: body.channel_id,
        user: body.user_id,
        text: `Your requested topic "${topic}" has been generated for the next trivia.`,
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
