import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from './src/firebase/firebase.js';

async function setupAdmin() {
  const emails = ['admin3@amaan.com', 'admin4@amaan.com', 'test@amaan.com'];
  
  for (const email of emails) {
    try {
      console.log(`\nTrying: ${email}`);
      const userCred = await createUserWithEmailAndPassword(auth, email, 'Temp@1234');
      await setDoc(doc(db, "users", userCred.user.uid), {
        role: "admin",
        totalSavings: 0,
        activeCreditBalance: 0
      });
      console.log(`✅ Success: ${email} / Temp@1234`);
      console.log(`UID: ${userCred.user.uid}`);
      // Don't continue - just return the first success
      return email;
    } catch (e) {
      console.error(`❌ ${email}:`, e.message.substring(0, 80));
    }
  }
  return null;
}
const result = await setupAdmin();
console.log('\nResult:', result);
