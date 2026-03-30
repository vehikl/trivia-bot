import {getNextThursday, getStartOfDay} from '../utils/datetime.js';

const DEFAULT_TOPICS = [
  'world history',
  'science and nature',
  'movies and television',
  'music through the decades',
  'geography',
  'sports',
  'literature',
  'food and drink',
  'technology and computing',
  'art and architecture',
];

function parseTopicsFromEnv() {
  const raw = process.env.TRIVIA_AUTO_TOPICS;
  if (!raw || !raw.trim()) {
    return null;
  }
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Stable topic for a given calendar day (used for daily test cron).
 */
export function pickTopicForCalendarDay(day = new Date()) {
  const topics = parseTopicsFromEnv() ?? DEFAULT_TOPICS;
  const anchor = getStartOfDay(day instanceof Date ? day : new Date(day));
  if (!anchor) {
    return topics[0];
  }
  const idx =
    (anchor.getFullYear() * 366 + anchor.getMonth() * 31 + anchor.getDate()) %
    topics.length;
  return topics[idx];
}

/**
 * Stable topic for the upcoming Thursday quiz when running automated generation.
 */
export function pickWeeklyTopic() {
  return pickTopicForCalendarDay(getNextThursday());
}
