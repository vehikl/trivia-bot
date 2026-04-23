import {
  getLastWeeksTrivia,
  getLatestPlayableTrivia,
  getTriviaForCalendarDay,
} from '../../models/quiz/quiz.js';
import {getNextThursday, getStartOfDay} from '../utils/datetime.js';

export function isDailyTestCronEnabled() {
  return (
    process.env.TRIVIA_DAILY_TEST_CRON === 'true' ||
    process.env.TRIVIA_DAILY_TEST_CRON === '1'
  );
}

export async function getDefaultTriviaForPlay() {
  if (isDailyTestCronEnabled()) {
    return getTriviaForCalendarDay(new Date());
  }
  return getLastWeeksTrivia();
}

export async function getLatestTriviaForPlay() {
  return getLatestPlayableTrivia(new Date());
}

export function getTriviaDateForRequest() {
  if (isDailyTestCronEnabled()) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return getStartOfDay(tomorrow);
  }

  const requestDate = getStartOfDay(getNextThursday());
  const today = getStartOfDay(new Date());
  if (requestDate <= today) {
    requestDate.setDate(requestDate.getDate() + 7);
  }

  return requestDate;
}
