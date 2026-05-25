import {
  getLastWeeksTrivia,
  getLatestPlayableTrivia,
  getTriviaForCalendarDay,
} from '../../models/quiz/quiz.js';
import {getNextThursday, getStartOfDay} from '../utils/datetime.js';

const MAX_REQUEST_DATE_SEARCH_ATTEMPTS = 104;

function addDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return getStartOfDay(nextDate);
}

function getNextThursdayOnOrAfter(date) {
  const start = getStartOfDay(date);
  const daysUntilThursday = (4 - start.getDay() + 7) % 7;
  return addDays(start, daysUntilThursday);
}

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

export async function getNextAvailableTriviaDateForRequest() {
  return getNextAvailableTriviaDate(getTriviaDateForRequest());
}

export async function getNextAvailableTriviaDate(startDate) {
  const dailyMode = isDailyTestCronEnabled();
  const incrementDays = dailyMode ? 1 : 7;
  let candidateDate = dailyMode
    ? getStartOfDay(startDate)
    : getNextThursdayOnOrAfter(startDate);

  for (let attempt = 1; attempt <= MAX_REQUEST_DATE_SEARCH_ATTEMPTS; attempt++) {
    const existingTrivia = await getTriviaForCalendarDay(candidateDate);
    if (!existingTrivia) {
      return candidateDate;
    }

    candidateDate = addDays(candidateDate, incrementDays);
  }

  throw new Error(
    `Could not find an available trivia date after ${MAX_REQUEST_DATE_SEARCH_ATTEMPTS} attempts.`
  );
}
