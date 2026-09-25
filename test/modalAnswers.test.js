import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractTriviaAnswers,
  getTriviaAnswerErrors,
} from '../services/trivia/modalAnswers.js';

test('extracts answers by block and action index instead of object order', () => {
  const stateValues = {
    'question-1': {
      'answer-1': {value: '  Brazil  '},
    },
    'question-0': {
      'answer-0': {value: 'Uruguay'},
    },
  };

  assert.deepEqual(extractTriviaAnswers(stateValues, 2), ['Uruguay', 'Brazil']);
});

test('allows blank and whitespace-only answers without errors', () => {
  const stateValues = {
    'question-0': {
      'answer-0': {value: '   '},
    },
    'question-1': {
      'answer-1': {value: 'Brazil'},
    },
    'question-2': {
      'answer-2': {value: ''},
    },
  };

  assert.deepEqual(getTriviaAnswerErrors(stateValues, 3), {});
});

test('allows missing expected answer blocks without errors', () => {
  const stateValues = {
    'question-0': {
      'answer-0': {value: 'Uruguay'},
    },
  };

  assert.deepEqual(getTriviaAnswerErrors(stateValues, 2), {});
});
