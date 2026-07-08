import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getAutoTopicRepeatWindow,
  pickTopicForCalendarDay,
} from '../services/trivia/weeklyTopic.js';

function withAutoTopics(topics, fn) {
  const originalTopics = process.env.TRIVIA_AUTO_TOPICS;
  const originalRepeatWindow = process.env.TRIVIA_AUTO_TOPIC_REPEAT_WINDOW;

  process.env.TRIVIA_AUTO_TOPICS = topics;
  delete process.env.TRIVIA_AUTO_TOPIC_REPEAT_WINDOW;

  try {
    fn();
  } finally {
    if (originalTopics === undefined) {
      delete process.env.TRIVIA_AUTO_TOPICS;
    } else {
      process.env.TRIVIA_AUTO_TOPICS = originalTopics;
    }

    if (originalRepeatWindow === undefined) {
      delete process.env.TRIVIA_AUTO_TOPIC_REPEAT_WINDOW;
    } else {
      process.env.TRIVIA_AUTO_TOPIC_REPEAT_WINDOW = originalRepeatWindow;
    }
  }
}

test('auto topic picker skips recently used topics in rotation order', () => {
  withAutoTopics('Alpha, Beta, Gamma', () => {
    const day = new Date(2026, 0, 3);

    assert.equal(pickTopicForCalendarDay(day), 'Alpha');
    assert.equal(
      pickTopicForCalendarDay(day, {recentTopics: ['alpha']}),
      'Beta'
    );
    assert.equal(
      pickTopicForCalendarDay(day, {recentTopics: ['Alpha', 'Beta']}),
      'Gamma'
    );
  });
});

test('auto topic picker falls back when all configured topics are recent', () => {
  withAutoTopics('Alpha, Beta, Gamma', () => {
    const day = new Date(2026, 0, 3);

    assert.equal(
      pickTopicForCalendarDay(day, {
        recentTopics: ['Alpha', 'Beta', 'Gamma'],
        repeatWindow: 3,
      }),
      'Alpha'
    );
  });
});

test('default auto topic repeat window leaves one topic available', () => {
  withAutoTopics('Alpha, Beta, Gamma', () => {
    assert.equal(getAutoTopicRepeatWindow(), 2);
  });
});
