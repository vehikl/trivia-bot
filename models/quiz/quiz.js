import {collection, doc, getDoc, getDocs, query, setDoc, where} from 'firebase/firestore/lite';
import firebaseDatabase from '../../services/firebase/databaseConnection.js';
import { 
  fromFirestoreTimestamp, 
  getNextThursday, 
  getStartOfDay, 
  getEndOfDay, 
} from '../../services/utils/datetime.js';

export async function getAll() {
  const quizzesCol = collection(firebaseDatabase, 'quizzes');
  const quizSnapshot = await getDocs(quizzesCol);

  return quizSnapshot.docs.map(doc => doc.data());
}

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

export async function getLastWeeksTrivia() {
  const nextThursday = getNextThursday();
  const startOfDay = getStartOfDay(nextThursday);
  let previousTrivia;

  const triviaRef = collection(firebaseDatabase, 'quizzes');

  const nextTriviaQuery = query(triviaRef, where('date', '<=', startOfDay));

  const snapshot = await getDocs(nextTriviaQuery);

  snapshot.forEach(doc => {
    previousTrivia = doc.data();
    return previousTrivia;
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
