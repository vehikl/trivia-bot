/**
 * Utility functions for handling datetime operations throughout the application
 */

/**
 * Convert a Firestore timestamp to a JavaScript Date object
 * @param {Object} firestoreTimestamp - Firestore timestamp object with seconds and nanoseconds
 * @returns {Date} JavaScript Date object
 */
export function fromFirestoreTimestamp(firestoreTimestamp) {
  if (!firestoreTimestamp || !firestoreTimestamp.seconds) {
    return null;
  }
  return new Date(firestoreTimestamp.seconds * 1000);
}

/**
 * Format a date object to a consistent string format for display
 * @param {Date} date - JavaScript Date object
 * @param {Object} options - Formatting options (defaults to standard format)
 * @returns {string} Formatted date string
 */
export function formatDate(date, options = null) {
  if (!date || !(date instanceof Date)) {
    return '';
  }
  
  const defaultOptions = { 
    weekday: 'short', 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric'
  };
  
  return date.toLocaleDateString('en-US', options || defaultOptions);
}

/**
 * Create a unique ID for date-based entities
 * @param {string} prefix - Prefix to add to the date (e.g., user ID)
 * @param {Date} date - JavaScript Date object
 * @returns {string} Formatted string for use as an ID
 */
export function createDateId(prefix, date) {
  if (!date || !(date instanceof Date)) {
    return '';
  }
  
  const formattedDate = formatDate(date);
  // Remove commas for consistency in IDs
  const cleanDate = formattedDate.split(',').join('');
  
  return prefix ? `${prefix}-${cleanDate}` : cleanDate;
}

/**
 * Get the start of day for a date
 * @param {Date} date - JavaScript Date object
 * @returns {Date} Date object set to start of day (00:00:00)
 */
export function getStartOfDay(date) {
  if (!date || !(date instanceof Date)) {
    return null;
  }
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Get the end of day for a date
 * @param {Date} date - JavaScript Date object
 * @returns {Date} Date object set to end of day (23:59:59.999)
 */
export function getEndOfDay(date) {
  if (!date || !(date instanceof Date)) {
    return null;
  }
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

/**
 * Get the next occurrence of a specific day of the week
 * @param {number} dayOfWeek - Day of week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
 * @returns {Date} Date object for the next occurrence of that day
 */
export function getNextDayOfWeek(dayOfWeek) {
  if (dayOfWeek < 0 || dayOfWeek > 6) {
    throw new Error('Day of week must be between 0 (Sunday) and 6 (Saturday)');
  }
  
  const today = new Date();
  const currentDayOfWeek = today.getDay();
  const daysUntilTargetDay = (dayOfWeek - currentDayOfWeek + 7) % 7;
  
  const nextTargetDay = new Date(today);
  nextTargetDay.setDate(today.getDate() + daysUntilTargetDay);
  
  return nextTargetDay;
}

/**
 * Get the next Thursday (common for weekly trivia)
 * @returns {Date} Date object for the next Thursday
 */
export function getNextThursday() {
  // Thursday is day 4 (0-indexed, where 0 is Sunday)
  return getNextDayOfWeek(4);
}

/**
 * Compare two dates to check if they are the same day
 * @param {Date} date1 - First date to compare
 * @param {Date} date2 - Second date to compare
 * @returns {boolean} True if dates are the same day
 */
export function isSameDay(date1, date2) {
  if (!date1 || !date2 || !(date1 instanceof Date) || !(date2 instanceof Date)) {
    return false;
  }
  
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}
