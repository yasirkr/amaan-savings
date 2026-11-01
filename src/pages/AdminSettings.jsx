import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, collection, getDocs, writeBatch } from 'firebase/firestore';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential, signOut } from 'firebase/auth';
import { db, auth } from '../firebase/firebase';
import { useNavigate } from 'react-router-dom';

export default function AdminSettings() {
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const [showParamModal, setShowParamModal] = useState(false);
  const [currentAmount, setCurrentAmount] = useState(0);
  const [newAmount, setNewAmount] = useState('');

  const [showUpiModal, setShowUpiModal] = useState(false);
  const [upiId, setUpiId] = useState('');
  const [newUpi, setNewUpi] = useState('');

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [isUpdatingPwd, setIsUpdatingPwd] = useState(false);

  const [showWipeModal, setShowWipeModal] = useState(false);
  const [wipePassword, setWipePassword] = useState('');
  const [isWiping, setIsWiping] = useState(false);

  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const fetchSettings = async () => {
    try {
      const docSnap = await getDoc(doc(db, 'settings', 'global'));
      if (docSnap.exists()) {
        const data = docSnap.data();
        setCurrentAmount(data.mandatorySavingsAmount || 0);
        setUpiId(data.adminUpiId || '');
      }
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  useEffect(() => { fetchSettings(); }, []);

  const handleLogout = async () => {
    try { await signOut(auth); navigate('/login', { replace: true }); }
    catch (err) { alert('Logout failed: ' + err.message); }
  };

  const handleSaveParam = async (e) => {
    e.preventDefault();
    try {
      const amt = Number(newAmount);
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      const docSnap = await getDoc(doc(db, 'settings', 'global'));
      let existingRates = docSnap.exists() ? (docSnap.data().rates || []) : [];

      let updatedRates = existingRates.filter(r => r.month !== currentMonth);
      updatedRates.push({ month: currentMonth, amount: amt });
      updatedRates.sort((a, b) => b.month.localeCompare(a.month));

      await setDoc(doc(db, 'settings', 'global'), {
        mandatorySavingsAmount: amt,
        rates: updatedRates
      }, { merge: true });

      setCurrentAmount(amt);
      setShowParamModal(false); setNewAmount('');
      alert(`Success! Rate is now ₹${amt} starting from ${currentMonth}`);
    } catch (err) { alert(err.message); }
  };

  const handleSaveUpi = async (e) => {
    e.preventDefault();
    try {
      await setDoc(doc(db, 'settings', 'global'), { adminUpiId: newUpi }, { merge: true });
      setUpiId(newUpi);
      setShowUpiModal(false); setNewUpi('');
    } catch (err) { alert(err.message); }
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    if (newPassword.length < 6) return alert("Password must be at least 6 characters.");
    setIsUpdatingPwd(true);
    try {
      if (!auth.currentUser) throw new Error("No user logged in.");
      await updatePassword(auth.currentUser, newPassword);
      alert("Password successfully updated!");
      setShowPasswordModal(false);
      setNewPassword('');
    } catch (err) {
      if (err.code === 'auth/requires-recent-login') {
        alert("Security requirement: Please log out and log back in to change your password.");
      } else {
        alert(err.message);
      }
    }
    setIsUpdatingPwd(false);
  };

  const confirmWipe = async (e) => {
    e.preventDefault();
    setIsWiping(true);
    try {
      if (!auth.currentUser?.email) throw new Error("No admin email found.");
      
      const credential = EmailAuthProvider.credential(auth.currentUser.email, wipePassword);
      await reauthenticateWithCredential(auth.currentUser, credential);

      const txSnap = await getDocs(collection(db, 'transactions'));
      const usersSnap = await getDocs(collection(db, 'users'));
      const batch = writeBatch(db);

      txSnap.docs.forEach(d => batch.delete(doc(db, 'transactions', d.id)));

      usersSnap.docs.forEach(d => {
        if (d.data().role !== 'admin') {
          batch.update(doc(db, 'users', d.id), { totalSavings: 0, activeCreditBalance: 0 });
        }
      });

      await batch.commit();
      alert("Success! All transactions wiped and member balances reset to zero.");
      setShowWipeModal(false);
      setWipePassword('');
    } catch (err) { 
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        alert("Incorrect admin password. Wipe aborted.");
      } else {
        alert(err.message); 
      }
    }
    setIsWiping(false);
  };

  if (loading) {
    return (
      <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto', marginTop: '40px' }}>
        <div style={{ height: '200px', backgroundColor: '#e2e8f0', borderRadius: '28px', animation: 'pulse 1.5s infinite' }}></div>
        <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ background: 'linear-gradient(180deg, #f4fdf8 0%, #fffbeb 100%)', minHeight: '100vh', paddingBottom: '90px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      
      {/* Curved Green Header */}
      <div style={{ background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)', padding: '16px 16px 65px 16px', borderBottomLeftRadius: '28px', borderBottomRightRadius: '28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '900', color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Settings</h2>
          <p style={{ margin: '4px 0 0 0', color: '#dcfce7', fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '1px' }}>Global Configuration</p>
        </div>
        <button onClick={() => setShowLogoutModal(true)} style={{ backgroundColor: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', width: '32px', height: '32px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', cursor: 'pointer' }}>
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
        </button>
      </div>

      <div style={{ padding: '0 16px', maxWidth: '600px', margin: '0 auto' }}>
        
        {/* Overlapping Configuration Card */}
        <div style={{ backgroundColor: '#ffffff', borderRadius: '28px', padding: '24px', boxShadow: '0 12px 25px -5px rgba(6, 78, 59, 0.1)', marginTop: '-45px', marginBottom: '24px', position: 'relative', zIndex: 10, border: '1px solid rgba(255,255,255,0.15)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px dashed #e2e8f0', paddingBottom: '16px' }}>
              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '800', textTransform: 'uppercase' }}>Monthly Savings Amount</span>
              <span style={{ fontSize: '18px', color: '#0f172a', fontWeight: '900' }}>₹{currentAmount}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '800', textTransform: 'uppercase' }}>Admin UPI ID</span>
              <span style={{ fontSize: '14px', color: '#0f172a', fontWeight: '900' }}>{upiId || 'Not Set'}</span>
            </div>
          </div>
        </div>

        {/* Action Buttons in Dashboard "Quick Services" Format */}
        <h3 style={{ margin: '0 0 12px 4px', fontSize: '13px', color: '#0f172a', fontWeight: '900' }}>Admin Actions</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '24px' }}>
          
          <div onClick={() => { setNewAmount(currentAmount); setShowParamModal(true); }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <div style={{ backgroundColor: '#ffffff', width: '48px', height: '48px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6', boxShadow: '0 4px 12px rgba(0,0,0,0.04)' }}>
              <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
            </div>
            <span style={{ fontSize: '10px', color: '#475569', fontWeight: '800' }}>Set Amount</span>
          </div>

          <div onClick={() => { setNewUpi(upiId); setShowUpiModal(true); }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <div style={{ backgroundColor: '#ffffff', width: '48px', height: '48px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981', boxShadow: '0 4px 12px rgba(0,0,0,0.04)' }}>
              <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"></path></svg>
            </div>
            <span style={{ fontSize: '10px', color: '#475569', fontWeight: '800' }}>Set UPI</span>
          </div>

          <div onClick={() => setShowPasswordModal(true)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <div style={{ backgroundColor: '#ffffff', width: '48px', height: '48px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#eab308', boxShadow: '0 4px 12px rgba(0,0,0,0.04)' }}>
              <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
            </div>
            <span style={{ fontSize: '10px', color: '#475569', fontWeight: '800' }}>Password</span>
          </div>

          <div onClick={() => setShowWipeModal(true)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <div style={{ backgroundColor: '#ffffff', width: '48px', height: '48px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444', boxShadow: '0 4px 12px rgba(0,0,0,0.04)' }}>
              <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            </div>
            <span style={{ fontSize: '10px', color: '#475569', fontWeight: '800' }}>Wipe</span>
          </div>

        </div>
      </div>

      {/* MODALS */}
      {showParamModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,23,42,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', backdropFilter: 'blur(4px)' }}>
          <div style={{ width: '100%', maxWidth: '340px', backgroundColor: '#fff', borderRadius: '28px', padding: '24px', animation: 'popIn 0.2s ease-out', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h4 style={{ margin: 0, fontSize: '18px', fontWeight: '900', color: '#0f172a', textTransform: 'uppercase' }}>Update Amount</h4>
              <button onClick={() => setShowParamModal(false)} style={{ background: '#f1f5f9', border: 'none', width: '32px', height: '32px', borderRadius: '50%', fontWeight: 'bold', cursor: 'pointer', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>
            <form onSubmit={handleSaveParam} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <input type="number" placeholder="Enter Amount (₹)" value={newAmount} onChange={e => setNewAmount(e.target.value)} required min="0" style={{ width: '100%', padding: '14px', borderRadius: '14px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', fontSize: '14px', fontWeight: '700', outline: 'none', boxSizing: 'border-box' }} />
              <button type="submit" style={{ width: '100%', padding: '14px', background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', color: '#fff', border: 'none', borderRadius: '14px', fontWeight: '900', fontSize: '14px', textTransform: 'uppercase', cursor: 'pointer' }}>Save Settings</button>
            </form>
          </div>
        </div>
      )}

      {showUpiModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,23,42,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', backdropFilter: 'blur(4px)' }}>
          <div style={{ width: '100%', maxWidth: '340px', backgroundColor: '#fff', borderRadius: '28px', padding: '24px', animation: 'popIn 0.2s ease-out', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h4 style={{ margin: 0, fontSize: '18px', fontWeight: '900', color: '#0f172a', textTransform: 'uppercase' }}>Update UPI ID</h4>
              <button onClick={() => setShowUpiModal(false)} style={{ background: '#f1f5f9', border: 'none', width: '32px', height: '32px', borderRadius: '50%', fontWeight: 'bold', cursor: 'pointer', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>
            <form onSubmit={handleSaveUpi} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <input type="text" placeholder="username@upi" value={newUpi} onChange={e => setNewUpi(e.target.value)} required style={{ width: '100%', padding: '14px', borderRadius: '14px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', fontSize: '14px', fontWeight: '700', outline: 'none', boxSizing: 'border-box' }} />
              <button type="submit" style={{ width: '100%', padding: '14px', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: '#fff', border: 'none', borderRadius: '14px', fontWeight: '900', fontSize: '14px', textTransform: 'uppercase', cursor: 'pointer' }}>Save Settings</button>
            </form>
          </div>
        </div>
      )}

      {showPasswordModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,23,42,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', backdropFilter: 'blur(4px)' }}>
          <div style={{ width: '100%', maxWidth: '340px', backgroundColor: '#fff', borderRadius: '28px', padding: '24px', animation: 'popIn 0.2s ease-out', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h4 style={{ margin: 0, fontSize: '18px', fontWeight: '900', color: '#0f172a', textTransform: 'uppercase' }}>Change Password</h4>
              <button onClick={() => setShowPasswordModal(false)} style={{ background: '#f1f5f9', border: 'none', width: '32px', height: '32px', borderRadius: '50%', fontWeight: 'bold', cursor: 'pointer', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>
            <form onSubmit={handleUpdatePassword} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <input type="password" placeholder="New Password (min 6 chars)" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength="6" style={{ width: '100%', padding: '14px', borderRadius: '14px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', fontSize: '14px', fontWeight: '700', outline: 'none', boxSizing: 'border-box' }} />
              <button type="submit" disabled={isUpdatingPwd} style={{ width: '100%', padding: '14px', background: 'linear-gradient(135deg, #eab308 0%, #ca8a04 100%)', color: '#fff', border: 'none', borderRadius: '14px', fontWeight: '900', fontSize: '14px', textTransform: 'uppercase', cursor: 'pointer' }}>
                {isUpdatingPwd ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          </div>
        </div>
      )}

      {showWipeModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,23,42,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', backdropFilter: 'blur(4px)' }}>
          <div style={{ width: '100%', maxWidth: '340px', backgroundColor: '#fff', borderRadius: '28px', padding: '24px', textAlign: 'center', animation: 'popIn 0.2s ease-out', boxSizing: 'border-box', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ width: '56px', height: '56px', backgroundColor: '#fef2f2', borderRadius: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto', color: '#dc2626' }}>
              <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
            </div>
            <h3 style={{ margin: '0 0 6px 0', fontSize: '18px', color: '#0f172a', fontWeight: '900', textTransform: 'uppercase' }}>Danger Zone</h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '12px', color: '#64748b', lineHeight: '1.4' }}>This will delete all transactions and reset member balances to zero. Enter your <strong>admin password</strong> to confirm.</p>
            
            <form onSubmit={confirmWipe} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <input type="password" placeholder="Admin Password" value={wipePassword} onChange={(e) => setWipePassword(e.target.value)} required style={{ width: '100%', padding: '14px', borderRadius: '14px', border: '1px solid #fca5a5', fontSize: '14px', fontWeight: '900', textAlign: 'center', outline: 'none', boxSizing: 'border-box', color: '#dc2626', backgroundColor: '#fef2f2' }} />
              
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" onClick={() => { setShowWipeModal(false); setWipePassword(''); }} style={{ flex: 1, padding: '14px', backgroundColor: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '14px', fontWeight: '900', fontSize: '13px', cursor: 'pointer', textTransform: 'uppercase' }}>Cancel</button>
                <button type="submit" disabled={isWiping} style={{ flex: 1, padding: '14px', background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', color: '#fff', border: 'none', borderRadius: '14px', fontWeight: '900', fontSize: '13px', cursor: 'pointer', textTransform: 'uppercase' }}>
                  {isWiping ? 'Wiping...' : 'Wipe Data'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showLogoutModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,23,42,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', backdropFilter: 'blur(4px)' }}>
          <div style={{ width: '100%', maxWidth: '300px', backgroundColor: '#ffffff', borderRadius: '28px', padding: '24px', textAlign: 'center', animation: 'popIn 0.2s ease-out', boxSizing: 'border-box', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ width: '56px', height: '56px', backgroundColor: '#fef2f2', borderRadius: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto', color: '#dc2626' }}>
              <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
            </div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', color: '#0f172a', fontWeight: '900' }}>Log Out</h3>
            <p style={{ margin: '0 0 20px 0', fontSize: '12px', color: '#64748b', lineHeight: '1.5', fontWeight: '600' }}>Are you sure you want to log out?</p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setShowLogoutModal(false)} style={{ flex: 1, padding: '14px', backgroundColor: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '16px', fontWeight: '900', fontSize: '13px', cursor: 'pointer', textTransform: 'uppercase' }}>Cancel</button>
              <button onClick={handleLogout} style={{ flex: 1, padding: '14px', backgroundColor: '#ef4444', color: '#ffffff', border: 'none', borderRadius: '16px', fontWeight: '900', fontSize: '13px', cursor: 'pointer', textTransform: 'uppercase' }}>Logout</button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes popIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }`}</style>
    </div>
  );
}
