import {randomUUID} from 'node:crypto';
import OpenAI from 'openai';
import {getTriviaForCalendarDay, store} from '../models/quiz/quiz.js';
import {formatDate, getStartOfDay} from '../services/utils/datetime.js';
import {generateQuestionsForTopic} from '../services/trivia/generateQuiz.js';

const openai = new OpenAI({apiKey: process.env.OPENAI_API_KEY});
const generateDrafts = new Map();
const DATEPICKER_ACTION_ID = 'generate_datepicker';
const REGENERATE_ACTION_ID = 'generate_regenerate';
const SUBMIT_ACTION_ID = 'generate_submit';
const DATEPICKER_BLOCK_PREFIX = 'generate_datepicker:';

function getUserId(body) {
  return body.user?.id ?? body.user_id;
}

function getChannelId(body) {
  return body.channel?.id ?? body.channel_id;
}

function getDatepickerBlockId(draftId) {
  return `${DATEPICKER_BLOCK_PREFIX}${draftId}`;
}

function getDraftIdFromBlockId(blockId) {
  return blockId?.startsWith(DATEPICKER_BLOCK_PREFIX)
    ? blockId.slice(DATEPICKER_BLOCK_PREFIX.length)
    : null;
}

function normalizeQuestions(questions) {
  return questions.map((item) => ({
    question: item.question,
    correctAnswer: item.correctAnswer,
    isBonus: item.isBonus,
  }));
}

function parseSelectedDate(selectedDate) {
  if (!selectedDate) {
    return null;
  }

  const [year, month, day] = selectedDate.split('-').map(Number);
  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day);
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
  const datepicker = {
    type: 'datepicker',
    action_id: DATEPICKER_ACTION_ID,
    placeholder: {
      type: 'plain_text',
      text: 'Select a Date',
    },
  };

  if (draft.selectedDate) {
    datepicker.initial_date = draft.selectedDate;
  }

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
          text: 'Make sure to review the answers and questions before submitting! 💡',
        },
      ],
    },
    {
      type: 'section',
      block_id: getDatepickerBlockId(draft.id),
      text: {
        type: 'mrkdwn',
        text: 'Pick a date for when the Questions will be for.',
      },
      accessory: datepicker,
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
        text: `*Topic:* ${draft.topic}\n*Date:* ${formatDate(selectedStart)}`,
      },
    },
    ...buildQuestionBlocks(draft.questions),
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: 'This quiz draft has been saved.',
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

async function generateDraft(topic, body) {
  const payload = await generateQuestionsForTopic(openai, topic);
  return {
    id: randomUUID(),
    topic,
    userId: getUserId(body),
    selectedDate: null,
    questions: normalizeQuestions(payload.questions),
  };
}

export function generateCommand(app) {
  app.command('/generate', async ({ack, body, client}) => {
    await ack();

    const topic = (body.text || '').trim();
    if (!topic) {
      await postPrivateMessage(client, body, {
        text: ':bread: Please pick a topic to generate questions. :bread:',
      });
      return;
    }

    await postPrivateMessage(client, body, {
      text: 'Generating Questions... :brain:',
    });

    try {
      const draft = await generateDraft(topic, body);
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

  app.action(DATEPICKER_ACTION_ID, async ({ack, body, client}) => {
    await ack();

    const draftId = getDraftIdFromBlockId(body.actions?.[0]?.block_id);
    const draft = getOwnedDraft(body, draftId);
    if (!draft) {
      await postPrivateMessage(client, body, {
        text: 'That generated quiz draft is no longer available.',
      });
      return;
    }

    draft.selectedDate = body.actions?.[0]?.selected_date || null;
    generateDrafts.set(draft.id, draft);
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

    const selectedDate = parseSelectedDate(draft.selectedDate);
    if (!selectedDate) {
      await postPrivateMessage(client, body, {
        text: 'Please select a date first!',
      });
      return;
    }

    const todayStart = getStartOfDay(new Date());
    const selectedStart = getStartOfDay(selectedDate);

    if (selectedStart < todayStart) {
      await postPrivateMessage(client, body, {
        text: 'Please select a valid date!',
      });
      return;
    }

    try {
      const existingTrivia = await getTriviaForCalendarDay(selectedStart);
      if (existingTrivia) {
        await postPrivateMessage(client, body, {
          text: `A quiz already exists for ${formatDate(selectedStart)}: "${existingTrivia.topic}". I did not replace it.`,
        });
        return;
      }

      const ok = await store({
        topic: draft.topic,
        questions: draft.questions,
        date: selectedStart,
      }, {failIfExists: true});

      if (!ok) {
        await postPrivateMessage(client, body, {
          text: `I could not save this quiz because ${formatDate(selectedStart)} already has a quiz.`,
        });
        return;
      }

      generateDrafts.delete(draft.id);

      try {
        await respond({
          response_type: 'ephemeral',
          replace_original: true,
          text: `Your Questions for ${draft.topic} have been submitted! :tada:`,
          blocks: buildSubmittedBlocks(draft, selectedStart),
        });
      } catch (error) {
        console.error('Error replacing submitted draft message:', error);
        await postPrivateMessage(client, body, {
          text: `Your Questions for ${draft.topic} have been submitted! :tada:`,
          blocks: buildSubmittedBlocks(draft, selectedStart),
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
