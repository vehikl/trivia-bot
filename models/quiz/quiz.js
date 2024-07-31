import {collection, doc, getDocs, getDoc, setDoc} from 'firebase/firestore/lite';
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
    console.log("No such document!");
  }
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
