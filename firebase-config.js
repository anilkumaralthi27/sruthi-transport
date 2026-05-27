// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDE3elN9y9ZAFaVBHm8xGN8HYqp-CI1phg",
  authDomain: "sruthi-transport-4268c.firebaseapp.com",
  projectId: "sruthi-transport-4268c",
  storageBucket: "sruthi-transport-4268c.firebasestorage.app",
  messagingSenderId: "822961060973",
  appId: "1:822961060973:web:6f25a983b27f53c05fd364",
  measurementId: "G-ZFYDNTBC38"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);