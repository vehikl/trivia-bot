import { collection, getDocs, doc,  setDoc} from 'firebase/firestore/lite';
import firebaseDatabase from '../../services/firebase/databaseConnection.js';

export async function getAll() {
        const quizzesCol = collection(firebaseDatabase, 'quizzes');
        const quizSnapshot = await getDocs(quizzesCol);
        return quizSnapshot.docs.map(doc => doc.data());
}

export async function addTrivia(question, answer) {
  // Add a new document in collection "cities"
  try {
    await setDoc(doc(firebaseDatabase, "questions", "tacos"), {
      question,
      answer,
    });
    return true;
  } catch (e) {
    return false;
  }
}
