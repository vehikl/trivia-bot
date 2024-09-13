import {collection, doc, getDoc, getDocs, query, setDoc, where} from 'firebase/firestore/lite';
import firebaseDatabase from '../../services/firebase/databaseConnection.js';

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

export async function getTrivia(topic) {
  const quizzesDocumentReference = doc(firebaseDatabase, 'quizzes', topic);
  const quizSnapshot = await getDoc(quizzesDocumentReference);

  if (quizSnapshot.exists()) {
    return quizSnapshot.data();
  } else {
    console.log('No such document!');
  }
}

export async function getNextTrivia() {
  const nextThursday = getNextThursday();
  const startOfDay = new Date(nextThursday.setHours(0, 0, 0, 0));
  const endOfDay = new Date(nextThursday.setHours(23, 59, 59, 999));
  let nextTrivia;

  const triviaRef = collection(firebaseDatabase, 'quizzes');

  const nextTriviaQuery = query(triviaRef, where('date', '<=', endOfDay), where('date', '>=', startOfDay));

  const snapshot = await getDocs(nextTriviaQuery);

  snapshot.forEach(doc => {
    nextTrivia = doc.data();
  });

  return nextTrivia;
}

export async function getPreviousTrivia() {
  const nextThursday = getNextThursday();
  const startOfDay = new Date(nextThursday.setHours(0, 0, 0, 0));
  const endOfDay = new Date(nextThursday.setHours(23, 59, 59, 999));
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
    await setDoc(doc(firebaseDatabase, 'quizzes', quiz.topic), quiz);
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
}

function getNextThursday() {
  const today = new Date();
  const dayOfWeek = today.getDay(); // Sunday = 0, Monday = 1, ..., Thursday = 4
  const daysUntilThursday = (4 - dayOfWeek + 7) % 7; // Calculate days until next Thursday
  const nextThursday = new Date(today);

  nextThursday.setDate(today.getDate() + daysUntilThursday);

  return nextThursday;
}
