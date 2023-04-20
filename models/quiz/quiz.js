import { collection, getDocs } from 'firebase/firestore/lite';
import firebaseDatabase from '../../services/firebase/databaseConnection.js';

export async function getAll() {
        const quizzesCol = collection(firebaseDatabase, 'quizzes');
        const quizSnapshot = await getDocs(quizzesCol);
        return quizSnapshot.docs.map(doc => doc.data());
}