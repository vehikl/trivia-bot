import {collection, doc, getDoc, getDocs, query, setDoc, where} from 'firebase/firestore';
import firebaseDatabase from '../firebase/databaseConnection.js';
import {fromFirestoreTimestamp} from '../utils/datetime.js';

function getTriviaDate(trivia) {
  if (trivia?.date?.seconds) {
    return fromFirestoreTimestamp(trivia.date);
  }
  if (trivia?.date instanceof Date) {
    return trivia.date;
  }
  return trivia?.date ? new Date(trivia.date) : null;
}

function getLocalDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getLeaderboardMessageId(channel, trivia) {
  const triviaDate = getTriviaDate(trivia);
  const dateKey = triviaDate ? getLocalDateKey(triviaDate) : 'unknown-date';
  return `${channel}-${dateKey}`;
}

function getNumericScore(score) {
  const value = Number(score);
  return Number.isFinite(value) ? value : 0;
}

function getTimestampMillis(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (value?.seconds) {
    return (value.seconds * 1000) + Math.floor((value.nanoseconds || 0) / 1000000);
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (Number.isFinite(Number(value))) {
    const numeric = Number(value);
    return numeric < 10000000000 ? numeric * 1000 : numeric;
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function getCombinedScore(submission) {
  return getNumericScore(submission.user_score) + getNumericScore(submission.bonus_score);
}

function getSubmissionTimeMillis(submission) {
  return getTimestampMillis(submission.time) ?? Number.MAX_SAFE_INTEGER;
}

function getTriviaPostedAtMillis(trivia) {
  return getTimestampMillis(trivia.postedAt ?? trivia.postedMessageTs);
}

export function getTimeToScoreForSubmission(trivia, submittedAt = Date.now()) {
  const postedAt = getTriviaPostedAtMillis(trivia);
  const submittedAtMillis = getTimestampMillis(submittedAt);

  if (!postedAt || !submittedAtMillis) {
    return null;
  }

  const elapsed = submittedAtMillis - postedAt;
  return elapsed >= 0 ? elapsed : null;
}

function getTimeToScoreMillis(submission, trivia) {
  const storedTimeToScore = Number(submission.time_to_score_ms ?? submission.timeToScoreMs);
  if (Number.isFinite(storedTimeToScore) && storedTimeToScore > 0) {
    return storedTimeToScore;
  }

  return getTimeToScoreForSubmission(trivia, getSubmissionTimeMillis(submission));
}

function getComparableTimeToScoreMillis(submission, trivia) {
  return getTimeToScoreMillis(submission, trivia) ?? getSubmissionTimeMillis(submission);
}

function formatDuration(ms) {
  if (!Number.isFinite(ms)) {
    return 'time unavailable';
  }

  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  if (totalSeconds < 1) {
    return '<1s';
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

function buildProgressBar(count, total, width = 12) {
  if (total <= 0) {
    return '▱'.repeat(width);
  }

  const filled = count > 0
    ? Math.max(1, Math.min(width, Math.round((count / total) * width)))
    : 0;
  return `${'▰'.repeat(filled)}${'▱'.repeat(width - filled)}`;
}

function formatUserList(entries, maxUsers = 5) {
  if (entries.length === 0) {
    return '-';
  }

  const users = entries.slice(0, maxUsers).map((entry) => `<@${entry.user_id}>`);
  const remaining = entries.length - maxUsers;
  return remaining > 0 ? `${users.join(', ')} +${remaining} more` : users.join(', ');
}

function formatLeaderboardScore(entry, trivia) {
  const timeToScore = getTimeToScoreMillis(entry, trivia);
  return `${getCombinedScore(entry)}/${entry.total_questions} in ${formatDuration(timeToScore)}`;
}

function buildTopThreeText(leaderboardData, trivia) {
  const medals = ['🥇', '🥈', '🥉'];
  const topThree = leaderboardData.slice(0, 3);

  if (topThree.length === 0) {
    return '_No submissions yet._';
  }

  return topThree
    .map((entry, index) => `${medals[index]} ${index + 1}. <@${entry.user_id}> - ${formatLeaderboardScore(entry, trivia)}`)
    .join('\n');
}

function buildScoreDistributionText(leaderboardData, regularQuestions, bonusQuestions) {
  const totalPlayers = leaderboardData.length;
  const maxPossibleScore = regularQuestions + bonusQuestions;
  const buckets = new Map();

  for (let score = maxPossibleScore; score >= 0; score--) {
    buckets.set(score, []);
  }

  leaderboardData.forEach((entry) => {
    const score = getCombinedScore(entry);
    if (!buckets.has(score)) {
      buckets.set(score, []);
    }
    buckets.get(score).push(entry);
  });

  return [...buckets.entries()]
    .sort(([a], [b]) => b - a)
    .map(([score, entries]) => {
      const percent = totalPlayers > 0 ? Math.round((entries.length / totalPlayers) * 100) : 0;
      const progressBar = buildProgressBar(entries.length, totalPlayers);
      const scoreLabel = `${score}/${regularQuestions}`.padStart(3, ' ');
      const percentLabel = `${percent}%`.padStart(4, ' ');
      const countLabel = `(${entries.length})`.padStart(4, ' ');
      return `\`${scoreLabel}\` \`${percentLabel}\` \`${countLabel}\` \`${progressBar}\` - ${formatUserList(entries)}`;
    })
    .join('\n');
}

function buildLeaderboardBlocks(trivia, leaderboardData, headingText) {
  const regularQuestions = trivia.questions?.filter(q => !q.isBonus).length || leaderboardData[0]?.total_questions || 0;
  const bonusQuestions = trivia.questions?.filter(q => q.isBonus).length || leaderboardData[0]?.bonus_questions || 0;
  const topic = trivia.topic?.toUpperCase() || 'TRIVIA';

  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: headingText,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${topic} - TOP 3*\n${buildTopThreeText(leaderboardData, trivia)}`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Score Distribution*\n${buildScoreDistributionText(leaderboardData, regularQuestions, bonusQuestions)}`,
      },
    },
  ];
}

async function getStoredLeaderboardMessage(channel, trivia) {
  const leaderboardMessageRef = doc(
    firebaseDatabase,
    'leaderboard_messages',
    getLeaderboardMessageId(channel, trivia)
  );
  const snapshot = await getDoc(leaderboardMessageRef);
  return {
    ref: leaderboardMessageRef,
    data: snapshot.exists() ? snapshot.data() : null,
  };
}

export async function upsertLeaderboardMessage(slackClient, trivia, options = {}) {
  if (!trivia || !trivia.date) {
    console.log('No trivia data for leaderboard');
    return;
  }

  const channel = options.channel || 'C04D6JZ0L67';
  const leaderboardData = await getWeeklyLeaderboard(trivia);
  if (!leaderboardData || leaderboardData.length === 0) {
    console.log(options.noSubmissionsLog || 'No submissions found for leaderboard');
    return;
  }

  const storedMessage = await getStoredLeaderboardMessage(channel, trivia);
  const fallbackText = storedMessage.data?.fallbackText || options.fallbackText || `🏆 ${trivia.topic} Leaderboard`;
  const headingText = storedMessage.data?.headingText || options.headingText || `🏆 **Leaderboard** 🏆`;
  const blocks = buildLeaderboardBlocks(trivia, leaderboardData, headingText);

  let messageTs = storedMessage.data?.ts;
  if (messageTs) {
    try {
      await slackClient.chat.update({
        channel,
        ts: messageTs,
        text: fallbackText,
        blocks,
      });
    } catch (error) {
      console.warn('Unable to update stored leaderboard message; posting a new one.', error);
      messageTs = null;
    }
  }

  if (!messageTs) {
    const response = await slackClient.chat.postMessage({
      channel,
      text: fallbackText,
      blocks,
    });
    messageTs = response.ts;
  }

  await setDoc(storedMessage.ref, {
    channel,
    ts: messageTs,
    topic: trivia.topic,
    date: getTriviaDate(trivia),
    fallbackText,
    headingText,
    updatedAt: new Date(),
  }, {merge: true});
}

export async function getWeeklyLeaderboard(trivia) {
  try {
    const triviaDate = getTriviaDate(trivia);
    const startOfDay = new Date(triviaDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(triviaDate);
    endOfDay.setHours(23, 59, 59, 999);

    const submissionsRef = collection(firebaseDatabase, 'submissions');
    const leaderboardQuery = query(
      submissionsRef,
      where('date', '>=', startOfDay),
      where('date', '<=', endOfDay)
    );

    const snapshot = await getDocs(leaderboardQuery);
    const submissions = [];

    snapshot.forEach(doc => {
      submissions.push(doc.data());
    });

    const regularQuestions = trivia.questions?.filter(q => !q.isBonus).length || 0;
    const bonusQuestions = trivia.questions?.filter(q => q.isBonus).length || 0;

    return submissions
      .map(submission => ({
        ...submission,
        total_questions: regularQuestions,
        bonus_questions: bonusQuestions
      }))
      .sort((a, b) => {
        const scoreDifference = getCombinedScore(b) - getCombinedScore(a);
        if (scoreDifference !== 0) {
          return scoreDifference;
        }

        const timeToScoreDifference =
          getComparableTimeToScoreMillis(a, trivia) - getComparableTimeToScoreMillis(b, trivia);
        if (timeToScoreDifference !== 0) {
          return timeToScoreDifference;
        }

        return getSubmissionTimeMillis(a) - getSubmissionTimeMillis(b);
      });
  } catch (error) {
    console.error('Error getting weekly leaderboard:', error);
    return [];
  }
}
