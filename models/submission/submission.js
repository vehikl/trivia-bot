import {doc, getDoc, setDoc} from 'firebase/firestore/lite';
import firebaseDatabase from '../../services/firebase/databaseConnection.js';

export async function getSubmission(user_id, quiz) {
  const date = new Date(quiz.date.seconds * 1000); // Multiply by 1000 to convert seconds to milliseconds
  const options = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
  const formattedDate = date.toLocaleDateString('en-US', options);
  const finalDate = formattedDate.split(',').join();
  const submissionDocumentReference = doc(firebaseDatabase, 'submissions', user_id + '-' + finalDate);
  console.log(submissionDocumentReference, user_id, finalDate);
  const submissionSnapshot = await getDoc(submissionDocumentReference);

  if (submissionSnapshot.exists()) {
    return submissionSnapshot.data();
  } else {
    return null;
  }
}

export async function store(submission) {
  try {
    await setDoc(doc(firebaseDatabase, 'submissions', submission.user_id + '-' + submission.date), submission);
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
}
