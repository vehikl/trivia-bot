import {zodResponseFormat} from 'openai/helpers/zod';
import {z} from 'zod';

const question = z.object({
  question: z.string(),
  correctAnswer: z.string(),
  isBonus: z.boolean(),
});

const generateQuestionsSchema = z.object({
  questions: z.array(question).length(6),
});

export function buildQuizSystemPrompt(topic) {
  const calendarHint = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    'You are writing a weekly office trivia quiz.\n' +
    'Audience and tone:\n' +
    '- Keep everything strictly safe-for-work: professional, inclusive, no sexual content, slurs, hateful themes, or graphic violence; avoid polarizing political advocacy.\n' +
    '- Aim at adults roughly 22+: cultured general trivia, clear wording, no kid-quiz triviality unless the topic calls for it.\n' +
    '- When it fits the theme, include questions that software developers would enjoy (languages, tools, CS history, tech culture); do not force dev content if the topic is unrelated.\n' +
    '- Where natural, tie clues or framing to the current season, holidays, or time of year (use the calendar hint below).\n' +
    `Calendar hint: ${calendarHint}.\n` +
    'Requirements:\n' +
    '- Difficulty: easy-to-medium. Prefer broadly known facts and common terminology; avoid obscure people, obscure dates/events, and hard-to-guess obscure trivia.\n' +
    '- If the topic is technical, stick to widely used tools, mainstream concepts, and practical knowledge (avoid deep internals or niche acronyms unless very common).\n' +
    '- Produce exactly 6 questions total: 5 regular questions and 1 bonus question.\n' +
    '- All questions must match the supplied theme/topic.\n' +
    '- Each question should include 1–3 sentences of helpful clue/context BEFORE the actual ask, similar in style to the Pixar examples.\n' +
    '- Short-answer format (no multiple choice).\n' +
    '- Provide a concise canonical answer for each question.\n' +
    '- Mark the bonus question with isBonus=true; all other questions isBonus=false.\n' +
    'Output format:\n' +
    '- Respond with a JSON string matching: { "questions": [ { "question": string, "correctAnswer": string, "isBonus": boolean }, ... ] }\n' +
    '- The array must contain exactly 6 objects.\n' +
    'Theme/topic: ' +
    topic
  );
}

/**
 * @param {import('openai').default} openai
 * @param {string} topic
 * @returns {Promise<{ questions: Array<{ question: string, correctAnswer: string, isBonus: boolean }> }>}
 */
export async function generateQuestionsForTopic(openai, topic) {
  const completion = await openai.chat.completions.create({
    messages: [
      {
        role: 'system',
        content: buildQuizSystemPrompt(topic),
      },
    ],
    model: 'gpt-4.1-nano',
    response_format: zodResponseFormat(generateQuestionsSchema, 'generate_questions'),
  });

  return JSON.parse(completion.choices[0].message.content);
}
