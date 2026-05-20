import {MAX_SAVED_TOPIC_LENGTH} from './topicSafety.js';

export function normalizeTriviaTopicTitle(topic) {
  const normalized = (topic || '')
    .trim()
    .replace(/[<>`]/g, '')
    .replace(/^["']|["']$/g, '')
    .replace(/\s+/g, ' ');

  if (normalized.length <= MAX_SAVED_TOPIC_LENGTH) {
    return normalized;
  }

  const words = normalized.split(' ');
  let title = '';

  for (const word of words) {
    const candidate = title ? `${title} ${word}` : word;
    if (candidate.length > MAX_SAVED_TOPIC_LENGTH) {
      break;
    }
    title = candidate;
  }

  return title || normalized.slice(0, MAX_SAVED_TOPIC_LENGTH).trim();
}
