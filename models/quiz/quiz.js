import {collection, doc, getDocs, query, setDoc, updateDoc, where} from 'firebase/firestore';
import firebaseDatabase from '../../services/firebase/databaseConnection.js';
import { 
  fromFirestoreTimestamp, 
  getNextThursday, 
  getStartOfDay, 
  getEndOfDay, 
} from '../../services/utils/datetime.js';

export async function getAllTopics() {
  const quizzesCol = collection(firebaseDatabase, 'quizzes');
  const quizSnapshot = await getDocs(quizzesCol);

  return quizSnapshot.docs.map(doc => doc.data().topic);
}

export async function getTrivia(quiz) {
  let quizDoc = {};
  // Handle potential Firestore timestamp
  const queryDate = quiz.date?.seconds ? fromFirestoreTimestamp(quiz.date) : quiz.date;
  
  const q = query(collection(firebaseDatabase, "quizzes"),
      where("date", "==", queryDate));
  const getDocQuery = await getDocs(q);
  getDocQuery.forEach((doc) => {
    if (doc) {
      quizDoc = doc.data();
    }
  })
  return quizDoc;
}

export async function getNextTrivia() {
  const nextThursday = getNextThursday();
  const startOfDay = getStartOfDay(nextThursday);
  const endOfDay = getEndOfDay(nextThursday);
  let nextTrivia;

  const triviaRef = collection(firebaseDatabase, 'quizzes');

  const nextTriviaQuery = query(triviaRef, where('date', '<=', endOfDay), where('date', '>=', startOfDay));

  const snapshot = await getDocs(nextTriviaQuery);

  snapshot.forEach(doc => {
    nextTrivia = doc.data();
  });

  return nextTrivia;
}

/** Quiz stored for a specific calendar day (start/end of local day). */
export async function getTriviaForCalendarDay(day) {
  const d = day instanceof Date ? day : new Date(day);
  const start = getStartOfDay(d);
  const end = getEndOfDay(d);
  if (!start || !end) {
    return undefined;
  }

  let trivia;
  const triviaRef = collection(firebaseDatabase, 'quizzes');
  const q = query(
    triviaRef,
    where('date', '>=', start),
    where('date', '<=', end)
  );
  const snapshot = await getDocs(q);
  snapshot.forEach((doc) => {
    trivia = doc.data();
  });
  return trivia;
}

export async function getLastWeeksTrivia() {
  const nextThursday = getNextThursday();

  // Calculate last Thursday (7 days ago from next Thursday)
  const lastThursday = new Date(nextThursday);
  lastThursday.setDate(nextThursday.getDate() - 7);
  
  const lastThursdayStart = getStartOfDay(lastThursday);
  const lastThursdayEnd = getEndOfDay(lastThursday);
  
  let previousTrivia;

  const triviaRef = collection(firebaseDatabase, 'quizzes');

  // Query for trivia specifically on last Thursday
  const previousTriviaQuery = query(
    triviaRef, 
    where('date', '>=', lastThursdayStart),
    where('date', '<=', lastThursdayEnd)
  );

  const snapshot = await getDocs(previousTriviaQuery);

  snapshot.forEach(doc => {
    previousTrivia = doc.data();
  });

  return previousTrivia;
}

export async function store(quiz) {
  try {
    // Create a consistent ID for the quiz document based on its date
    const documentId = quiz.date instanceof Date ? quiz.date.toDateString() : quiz.date.toString();
    await setDoc(doc(firebaseDatabase, 'quizzes', documentId), quiz);
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
}

function getDateFromQuizValue(date) {
  if (date?.seconds) {
    return fromFirestoreTimestamp(date);
  }
  if (date instanceof Date) {
    return date;
  }
  return date ? new Date(date) : null;
}

function getDateFromSlackTimestamp(ts) {
  const seconds = Number(ts);
  return Number.isFinite(seconds) ? new Date(seconds * 1000) : new Date();
}

function getDateFromPostValue(value) {
  if (value?.seconds) {
    return fromFirestoreTimestamp(value);
  }

  if (value instanceof Date) {
    return value;
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return new Date(numeric < 10000000000 ? numeric * 1000 : numeric);
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return new Date(parsed);
    }
  }

  return null;
}

export async function updateTriviaMetadataForDate(date, metadata) {
  try {
    const triviaDate = getDateFromQuizValue(date);
    if (!triviaDate || Number.isNaN(triviaDate.getTime())) {
      return false;
    }

    const start = getStartOfDay(triviaDate);
    const end = getEndOfDay(triviaDate);
    const triviaRef = collection(firebaseDatabase, 'quizzes');
    const q = query(
      triviaRef,
      where('date', '>=', start),
      where('date', '<=', end)
    );
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return false;
    }

    await Promise.all(snapshot.docs.map((quizDoc) => {
      const resolvedMetadata = typeof metadata === 'function'
        ? metadata(quizDoc.data())
        : metadata;

      if (!resolvedMetadata || Object.keys(resolvedMetadata).length === 0) {
        return Promise.resolve();
      }

      return updateDoc(quizDoc.ref, resolvedMetadata);
    }));
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
}

export async function recordTriviaPost(trivia, {channel, ts}) {
  const postDate = getDateFromSlackTimestamp(ts);

  return updateTriviaMetadataForDate(trivia.date, (existingTrivia = {}) => {
    const existingPostDate =
      getDateFromPostValue(existingTrivia.postedAt) ||
      getDateFromPostValue(existingTrivia.postedMessageTs);
    const shouldSetInitialPost =
      !existingPostDate || postDate.getTime() < existingPostDate.getTime();

    return {
      ...(shouldSetInitialPost
        ? {
            postedAt: postDate,
            postedChannel: channel,
            postedMessageTs: ts,
          }
        : {}),
      lastPostedAt: postDate,
      lastPostedChannel: channel,
      lastPostedMessageTs: ts,
    };
  });
}
