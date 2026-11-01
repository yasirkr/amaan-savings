import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

export const firebaseConfig = {
  apiKey: "AIzaSyDtX5E95yw4Zy4EEKAODpnJN8fgaNjsAXk",
  authDomain: "amaan-savings-app.firebaseapp.com",
  projectId: "amaan-savings-app",
  storageBucket: "amaan-savings-app.firebasestorage.app",
  messagingSenderId: "459371669366",
  appId: "1:459371669366:web:47e56bac9971450d893c57"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
