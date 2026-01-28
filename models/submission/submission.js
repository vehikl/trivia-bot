import {doc, getDoc, setDoc} from 'firebase/firestore/lite';
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
    // Ensure we have a properly formatted date-based ID
    let submissionId;
    
    if (submission.date instanceof Date) {
      submissionId = createDateId(submission.user_id, submission.date);
    } else if (typeof submission.date === 'string') {
      // If date is already a formatted string, use it directly
      submissionId = `${submission.user_id}-${submission.date}`;
    } else if (submission.date?.seconds) {
      // If it's a Firestore timestamp
      const jsDate = fromFirestoreTimestamp(submission.date);
      submissionId = createDateId(submission.user_id, jsDate);
    } else {
      // Fallback case
      submissionId = `${submission.user_id}-${submission.date}`;
    }
    
    await setDoc(doc(firebaseDatabase, 'submissions', submissionId), submission);
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
}
