import {doc, getDoc, setDoc} from 'firebase/firestore';
import firebaseDatabase from '../../services/firebase/databaseConnection.js';
import { 
  fromFirestoreTimestamp, 
  createDateId
} from '../../services/utils/datetime.js';

export async function getSubmission(user_id, quiz) {
  // Convert Firestore timestamp to Date if necessary
  const date = quiz.date?.seconds 
    ? fromFirestoreTimestamp(quiz.date) 
    : (quiz.date instanceof Date ? quiz.date : new Date(quiz.date));
  
  // Create a consistent ID format for submissions
  const submissionId = createDateId(user_id, date);
  const submissionDocumentReference = doc(firebaseDatabase, 'submissions', submissionId);
  
  const submissionSnapshot = await getDoc(submissionDocumentReference);

  if (submissionSnapshot.exists()) {
    return submissionSnapshot.data();
  } else {
    return null;
  }
}

export async function store(submission) {
  try {
    // Normalize date and create a consistent ID based on quiz date
    let dateForId;

    if (submission.date?.seconds) {
      dateForId = fromFirestoreTimestamp(submission.date);
    } else if (submission.date instanceof Date) {
      dateForId = submission.date;
    } else if (typeof submission.date === 'string') {
      // Fallback: attempt to parse string to Date
      const parsed = new Date(submission.date);
      dateForId = parsed instanceof Date && !isNaN(parsed) ? parsed : null;
    }

    const submissionId = dateForId instanceof Date
      ? createDateId(submission.user_id, dateForId)
      : `${submission.user_id}-${submission.date}`;
    
    await setDoc(doc(firebaseDatabase, 'submissions', submissionId), submission);
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
}
