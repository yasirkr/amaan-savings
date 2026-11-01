import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from './src/firebase/firebase.js';

async function setupAdmin() {
  try {
    console.log("1. Creating Admin account in Firebase Auth...");
    const userCred = await createUserWithEmailAndPassword(auth, "admin2@amaan.com", "Admin@1234");
    
    console.log("2. Saving admin role to Firestore for UID: " + userCred.user.uid);
    await setDoc(doc(db, "users", userCred.user.uid), {
      role: "admin",
      totalSavings: 0,
      activeCreditBalance: 0
    });
    
    console.log("✅ Success! New admin is ready.");
    console.log("Login with: admin2@amaan.com / Admin@1234");
    process.exit(0);
  } catch (e) {
    console.error("❌ Failed:", e.message);
    process.exit(1);
  }
}
setupAdmin();
