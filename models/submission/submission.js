import {doc, getDoc, setDoc} from 'firebase/firestore/lite';
import firebaseDatabase from '../../services/firebase/databaseConnection.js';

export async function getSubmission(user_id, topic) {
  const submissionDocumentReference = doc(firebaseDatabase, 'submissions', user_id + '-' + topic);
  const submissionSnapshot = await getDoc(submissionDocumentReference);

  if (submissionSnapshot.exists()) {
    return submissionSnapshot.data();
  } else {
    return null;
  }
}

export async function store(submission) {
  try {
    await setDoc(doc(firebaseDatabase, 'submissions', submission.user_id + '-' + submission.topic), submission);
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
}
