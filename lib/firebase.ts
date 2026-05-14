import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// 🔴 Replace these values with your own Firebase project config
// (Firebase Console → Project Settings → Your Apps → SDK setup)
const firebaseConfig = {
  apiKey: "AIzaSyCfejWPGemBKvHJMnuy-kwRrirDK468tcE",
  authDomain: "aquacure-e5971.firebaseapp.com",
  projectId: "aquacure-e5971",
  storageBucket: "aquacure-e5971.firebasestorage.app",
  messagingSenderId: "666078402336",
  appId: "1:666078402336:web:7d272b8f22e335405ee945",
  measurementId: "G-FFC8EGZCB1"
};
// Prevent re-initializing on hot reload
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const db = getFirestore(app);