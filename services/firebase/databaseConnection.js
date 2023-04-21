// import { initializeApp } from 'firebase/app';
// import  { getFirestore } from 'firebase/firestore/lite';
// import dotenv from 'dotenv';
// dotenv.config();

// following this: https://claritydev.net/blog/testing-firestore-locally-with-firebase-emulators

import { getFirestore } from "firebase/firestore/lite";

const firebaseApp = initializeApp({
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
    measurementId: process.env.FIREBASE_MEASUREMENT_ID
});

let db;

export function getDb(){
    return db;
}

export function setDb(firebaseApp){
    db = getFirestore(firebaseApp)
}

if (process.env.NODE_ENV !== "test") {
    db = getFirestore(firebaseApp);
}

export default db;

// const admin = require("firebase-admin");
 
 
// if (process.env.NODE_ENV !== "test") {
//   db = admin.firestore();
// }
 
// exports.getDb = () => {
//   return db;
// };
 
// exports.setDb = (database) => {
//   db = database;
// };