import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebase/firebase';

export default function Header() {
  const location = useLocation();
  const [notifications, setNotifications] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const fetchNotifications = async (user) => {
      if (!user) return;
      try {
        const userSnap = await getDoc(doc(db, 'users', user.uid));
        if (!userSnap.exists()) return;
        const userData = userSnap.data();

        if (userData.role === 'admin') {
          const q = query(collection(db, 'transactions'), where('status', '==', 'pending'));
          const txSnap = await getDocs(q);
          if (!txSnap.empty) setNotifications([{ id: 'admin_req', type: 'alert', text: `You have ${txSnap.size} pending request(s) waiting for approval.` }]);
          else setNotifications([]);
        } else {
          const notifs = [];
          if (userData.activeCreditBalance > 0) notifs.push({ id: 'loan_due', type: 'danger', text: `MONTHLY ALERT: EMI repayment for your active loan of ₹${userData.activeCreditBalance} is due.` });

          const setSnap = await getDoc(doc(db, 'settings', 'global'));
          const ms = setSnap.exists() ? (setSnap.data().mandatorySavingsAmount || 0) : 0;
          
          if (ms > 0) {
            const txQ = query(collection(db, 'transactions'), where('userId', '==', user.uid));
            const txSnap = await getDocs(txQ);
            const allTx = txSnap.docs.map(d => d.data());
            const pendingSavingsAmt = allTx.filter(tx => tx.type === 'savings_deposit' && tx.status === 'pending').reduce((sum, tx) => sum + tx.amount, 0);
            
            const paidMonths = Math.floor((userData.totalSavings || 0) / ms);
            const pendingMonths = Math.floor(pendingSavingsAmt / ms);
            const totalAccountedMonths = paidMonths + pendingMonths;

            let expectedMonths = 1;
            if (userData.createdAt?.seconds) {
              const jd = new Date(userData.createdAt.seconds * 1000);
              const now = new Date();
              expectedMonths = (now.getFullYear() - jd.getFullYear()) * 12 + (now.getMonth() - jd.getMonth()) + 1;
            }
            if (totalAccountedMonths < expectedMonths) {
              const dueAmt = (expectedMonths - totalAccountedMonths) * ms;
              notifs.push({ id: 'sav_due', type: 'warning', text: `MONTHLY ALERT: Your savings due is ₹${dueAmt}. Please coordinate with the Admin.` });
            }
          }
          setNotifications(notifs);
        }
      } catch (error) { console.error(error); }
    };

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) fetchNotifications(user);
      else setNotifications([]);
    });
    return () => unsubscribe();
  }, [location.pathname]);

  useEffect(() => {
    const handleClickOutside = (event) => { if (dropdownRef.current && !dropdownRef.current.contains(event.target)) setShowDropdown(false); };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (location.pathname === '/login' || location.pathname === '/') return null;

  return (
    <header style={{ 
      position: 'sticky', 
      top: 0, 
      backgroundColor: 'rgba(255,255,255,0.92)', 
      backdropFilter: 'blur(16px)', 
      WebkitBackdropFilter: 'blur(16px)',
      padding: '12px 20px', 
      display: 'flex', 
      justifyContent: 'space-between', 
      alignItems: 'center', 
      zIndex: 1000, 
      boxShadow: '0 8px 25px -5px rgba(0,0,0,0.05)', 
      borderBottom: '1px solid rgba(0,0,0,0.03)' 
    }}>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline' }}>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '900', color: '#064e3b', letterSpacing: '-0.5px' }}>
            amaan
          </h1>
          <span style={{ fontSize: '30px', fontWeight: '900', color: '#10b981' }}>.</span>
        </div>
        <p style={{ margin: 0, fontSize: '9px', color: '#d97706', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '1.5px' }}>
          Islamic Banking System
        </p>
      </div>

      <div ref={dropdownRef} style={{ position: 'relative' }}>
        <button onClick={() => setShowDropdown(!showDropdown)} style={{ background: '#f8fafc', border: '1px solid #f1f5f9', padding: '10px', borderRadius: '14px', cursor: 'pointer', color: '#064e3b', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
           <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg>
           {notifications.length > 0 && <div style={{ position: 'absolute', top: '8px', right: '8px', width: '10px', height: '10px', backgroundColor: '#ef4444', borderRadius: '50%', border: '2px solid #ffffff' }}></div>}
        </button>
        
        {showDropdown && (
          <div style={{ position: 'absolute', top: '55px', right: '0', width: '280px', backgroundColor: '#ffffff', borderRadius: '24px', boxShadow: '0 15px 40px rgba(0,0,0,0.12)', border: '1px solid #f1f5f9', overflow: 'hidden', zIndex: 1001, animation: 'fadeIn 0.15s ease-out' }}>
            <div style={{ backgroundColor: '#f0fdf4', padding: '16px 20px', color: '#064e3b', borderBottom: '1px solid #dcfce7' }}>
              <h4 style={{ margin: 0, fontSize: '12px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Alerts & Notices</h4>
            </div>
            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
              {notifications.length === 0 ? (
                <div style={{ padding: '24px 16px', textAlign: 'center' }}><p style={{ margin: 0, fontSize: '12px', color: '#64748b', fontWeight: '800' }}>You're all caught up!</p></div>
              ) : (
                notifications.map((notif) => (
                  <div key={notif.id} style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: '12px', alignItems: 'flex-start', backgroundColor: notif.type === 'danger' ? '#fef2f2' : (notif.type === 'warning' ? '#fefce8' : '#ffffff') }}>
                    <div style={{ marginTop: '2px', color: notif.type === 'danger' ? '#ef4444' : (notif.type === 'warning' ? '#eab308' : '#10b981') }}>
                      <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                    </div>
                    <p style={{ margin: 0, fontSize: '13px', color: '#0f172a', lineHeight: '1.5', fontWeight: '700' }}>{notif.text}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </header>
  );
}
