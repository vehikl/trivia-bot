import {randomUUID} from 'node:crypto';
import OpenAI from 'openai';
import {store} from '../models/quiz/quiz.js';
import {formatDate} from '../services/utils/datetime.js';
import {generateQuestionsForTopic} from '../services/trivia/generateQuiz.js';
import {getNextAvailableTriviaDateForRequest} from '../services/trivia/runtime.js';
import {validateTriviaTopic} from '../services/trivia/topicSafety.js';
import {normalizeTriviaTopicTitle} from '../services/trivia/topicTitle.js';

const openai = new OpenAI({apiKey: process.env.OPENAI_API_KEY});
const generateDrafts = new Map();
const MAX_SUBMITTED_TOPIC_LENGTH = 300;
const MAX_SAVE_DATE_ATTEMPTS = 3;
const REGENERATE_ACTION_ID = 'generate_regenerate';
const SUBMIT_ACTION_ID = 'generate_submit';

function getUserId(body) {
  return body.user?.id ?? body.user_id;
}

function getUserName(body) {
  return body.user?.name ?? body.user?.username ?? body.user_name ?? '';
}

function submittedByPayload(body, originalTopic) {
  return {
    userId: getUserId(body),
    userName: getUserName(body),
    submittedAt: new Date(),
    originalTopic,
  };
}

function getChannelId(body) {
  return body.channel?.id ?? body.channel_id;
}

function normalizeSubmittedTopic(topic) {
  return (topic || '')
    .trim()
    .replace(/[<>`]/g, '')
    .replace(/^["']|["']$/g, '')
    .replace(/\s+/g, ' ');
}

function normalizeQuestions(questions) {
  return questions.map((item) => ({
    question: item.question,
    correctAnswer: item.correctAnswer,
    isBonus: item.isBonus,
  }));
}

function buildQuestionBlocks(questions) {
  return questions.map((item, index) => ({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: item.isBonus
        ? `*Bonus Question: ${item.question}*`
        : `*Question ${index + 1}: ${item.question}*`,
    },
  }));
}

function buildDraftBlocks(draft) {
  return [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: 'Hello Friend! Time to generate some questions! :bulb: :brain:',
      },
    },
    ...buildQuestionBlocks(draft.questions),
    {
      type: 'divider',
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: 'Make sure to review the questions before submitting. The quiz will be saved for the next available trivia date.',
        },
      ],
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'Submit',
            emoji: true,
          },
          value: draft.id,
          action_id: SUBMIT_ACTION_ID,
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'Regenerate',
            emoji: true,
          },
          value: draft.id,
          action_id: REGENERATE_ACTION_ID,
        },
      ],
    },
  ];
}

function buildSubmittedBlocks(draft, selectedStart) {
  return [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: 'Questions Submitted! :tada:',
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: [
          `*Topic:* ${draft.topic}`,
          `*Date:* ${formatDate(selectedStart)}`
        ].filter(Boolean).join('\n'),
      },
    },
    ...buildQuestionBlocks(draft.questions),
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: 'This quiz draft has been saved for the next available trivia date.',
        },
      ],
    },
  ];
}

function getDraftText(topic) {
  return `Questions Based on ${topic}`;
}

function getOwnedDraft(body, draftId) {
  const draft = generateDrafts.get(draftId);
  if (!draft) {
    return null;
  }

  return draft.userId === getUserId(body) ? draft : null;
}

async function postPrivateMessage(client, body, payload) {
  await client.chat.postEphemeral({
    channel: getChannelId(body),
    user: getUserId(body),
    ...payload,
  });
}

async function replaceDraftMessage({respond, client, body, draft}) {
  const payload = {
    response_type: 'ephemeral',
    replace_original: true,
    text: getDraftText(draft.topic),
    blocks: buildDraftBlocks(draft),
  };

  try {
    await respond(payload);
  } catch (error) {
    console.error('Error replacing generated draft message:', error);
    await postPrivateMessage(client, body, {
      text: payload.text,
      blocks: payload.blocks,
    });
  }
}

async function generateDraft(topic, body, originalTopic) {
  const payload = await generateQuestionsForTopic(openai, topic);
  return {
    id: randomUUID(),
    topic,
    originalTopic,
    userId: getUserId(body),
    questions: normalizeQuestions(payload.questions),
  };
}

async function storeDraftForNextAvailableDate(draft, submittedBy) {
  let lastAttemptedDate = null;

  for (let attempt = 1; attempt <= MAX_SAVE_DATE_ATTEMPTS; attempt++) {
    const date = await getNextAvailableTriviaDateForRequest();
    lastAttemptedDate = date;
    const ok = await store({
      topic: draft.topic,
      questions: draft.questions,
      date,
      submittedBy,
    }, {failIfExists: true});

    if (ok) {
      return date;
    }

    console.warn(
      `Generated quiz save attempt ${attempt} failed for ${formatDate(date)}; retrying with next available date.`
    );
  }

  throw new Error(
    `Failed to store generated trivia after ${MAX_SAVE_DATE_ATTEMPTS} attempts. Last attempted date: ${formatDate(lastAttemptedDate)}`
  );
}

export function generateCommand(app) {
  app.command('/generate', async ({ack, body, client}) => {
    await ack();

    const submittedTopic = normalizeSubmittedTopic(body.text);
    if (!submittedTopic) {
      await postPrivateMessage(client, body, {
        text: ':bread: Please pick a topic to generate questions. :bread:',
      });
      return;
    }

    if (submittedTopic.length > MAX_SUBMITTED_TOPIC_LENGTH) {
      await postPrivateMessage(client, body, {
        text: `Please keep trivia topic requests under ${MAX_SUBMITTED_TOPIC_LENGTH} characters.`,
      });
      return;
    }

    await postPrivateMessage(client, body, {
      text: 'Reviewing and generating questions... :brain:',
    });

    try {
      const safety = await validateTriviaTopic(openai, submittedTopic);
      if (!safety.isAppropriate) {
        await postPrivateMessage(client, body, {
          text: `Please choose a different work-appropriate topic. ${safety.reason}`,
        });
        return;
      }

      const topic = normalizeTriviaTopicTitle(safety.topic || submittedTopic);
      const draft = await generateDraft(topic, body, submittedTopic);
      generateDrafts.set(draft.id, draft);

      await postPrivateMessage(client, body, {
        text: getDraftText(draft.topic),
        blocks: buildDraftBlocks(draft),
      });
    } catch (error) {
      console.error('Error handling /generate command:', error);
      await postPrivateMessage(client, body, {
        text: 'Sorry, I could not generate questions. Please try again.',
      });
    }
  });

  app.action(REGENERATE_ACTION_ID, async ({ack, body, client, respond}) => {
    await ack();

    const draftId = body.actions?.[0]?.value;
    const draft = getOwnedDraft(body, draftId);
    if (!draft) {
      await postPrivateMessage(client, body, {
        text: 'That generated quiz draft is no longer available.',
      });
      return;
    }

    await postPrivateMessage(client, body, {
      text: 'Regenerating Questions... :brain:',
    });

    try {
      const payload = await generateQuestionsForTopic(openai, draft.topic);
      draft.questions = normalizeQuestions(payload.questions);
      generateDrafts.set(draft.id, draft);

      await replaceDraftMessage({respond, client, body, draft});
    } catch (error) {
      console.error('Error regenerating questions:', error);
      await postPrivateMessage(client, body, {
        text: 'Sorry, I could not regenerate questions. Please try again.',
      });
    }
  });

  app.action(SUBMIT_ACTION_ID, async ({ack, body, client, respond}) => {
    await ack();

    const draftId = body.actions?.[0]?.value;
    const draft = getOwnedDraft(body, draftId);
    if (!draft) {
      await postPrivateMessage(client, body, {
        text: 'That generated quiz draft is no longer available.',
      });
      return;
    }

    try {
      const submittedBy = submittedByPayload(body, draft.originalTopic);
      const availableStart = await storeDraftForNextAvailableDate(draft, submittedBy);

      generateDrafts.delete(draft.id);
      draft.submittedBy = submittedBy;

      const submittedText = `Your Questions for ${draft.topic} have been submitted for ${formatDate(availableStart)}.`;

      try {
        await respond({
          response_type: 'ephemeral',
          replace_original: true,
          text: submittedText,
          blocks: buildSubmittedBlocks(draft, availableStart),
        });
      } catch (error) {
        console.error('Error replacing submitted draft message:', error);
        await postPrivateMessage(client, body, {
          text: submittedText,
          blocks: buildSubmittedBlocks(draft, availableStart),
        });
      }
    } catch (error) {
      console.error('Error submitting generated questions:', error);
      await postPrivateMessage(client, body, {
        text: 'Sorry, I could not save that generated quiz. Please try again.',
      });
    }
  });
}
