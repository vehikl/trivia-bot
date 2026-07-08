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

function normalizeTopic(topic) {
  return String(topic || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function parseTopicsFromEnv() {
  const raw = process.env.TRIVIA_AUTO_TOPICS;
  if (!raw || !raw.trim()) {
    return null;
  }
  const topics = raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  return topics.length > 0 ? topics : null;
}

function getConfiguredTopics() {
  return parseTopicsFromEnv() ?? DEFAULT_TOPICS;
}

export function getAutoTopicRepeatWindow() {
  const topics = getConfiguredTopics();
  const configuredWindow = Number.parseInt(process.env.TRIVIA_AUTO_TOPIC_REPEAT_WINDOW || '', 10);

  if (Number.isInteger(configuredWindow) && configuredWindow >= 0) {
    return configuredWindow;
  }

  return Math.max(0, topics.length - 1);
}

function getStableTopicIndex(day, topicCount) {
  const anchor = getStartOfDay(day instanceof Date ? day : new Date(day));
  if (!anchor) {
    return 0;
  }

  return (
    anchor.getFullYear() * 366 + anchor.getMonth() * 31 + anchor.getDate()
  ) % topicCount;
}

/**
 * Stable topic for a given calendar day (used for daily test cron).
 */
export function pickTopicForCalendarDay(day = new Date(), options = {}) {
  const topics = getConfiguredTopics();
  const repeatWindow = Number.isInteger(options.repeatWindow)
    ? Math.max(0, options.repeatWindow)
    : getAutoTopicRepeatWindow();
  const recentTopicKeys = new Set(
    (options.recentTopics || [])
      .slice(0, repeatWindow)
      .map(normalizeTopic)
      .filter(Boolean)
  );
  const startIndex = getStableTopicIndex(day, topics.length);

  for (let offset = 0; offset < topics.length; offset++) {
    const topic = topics[(startIndex + offset) % topics.length];
    if (!recentTopicKeys.has(normalizeTopic(topic))) {
      return topic;
    }
  }

  return topics[startIndex];
}

/**
 * Stable topic for the upcoming Thursday quiz when running automated generation.
 */
export function pickWeeklyTopic(options = {}) {
  return pickTopicForCalendarDay(getNextThursday(), options);
}
