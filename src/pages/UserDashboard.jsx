import { useState, useEffect, useRef } from 'react';
import { doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { db, auth } from '../firebase/firebase';
import { useNavigate } from 'react-router-dom';

export default function UserDashboard() {
  const [userData, setUserData] = useState(null);
  const [recentTx, setRecentTx] = useState([]);
  const [pendingDue, setPendingDue] = useState(0);
  const [latestLoanAmount, setLatestLoanAmount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [adminUpiId, setAdminUpiId] = useState('');
  
  const [showFundModal, setShowFundModal] = useState(false);
  const [bankFunds, setBankFunds] = useState(0);
  const [calculatingFunds, setCalculatingFunds] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showOfflinePayModal, setShowOfflinePayModal] = useState(false);
  const backPressCount = useRef(0);
  const [showExitToast, setShowExitToast] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    window.history.pushState(null, null, window.location.pathname);
    const handleBackButton = () => {
      if (backPressCount.current === 0) {
        backPressCount.current = 1; setShowExitToast(true); window.history.pushState(null, null, window.location.pathname);
        setTimeout(() => { backPressCount.current = 0; setShowExitToast(false); }, 2000);
      } else { window.history.back(); }
    };
    window.addEventListener('popstate', handleBackButton); return () => window.removeEventListener('popstate', handleBackButton);
  }, []);

  const fetchUserData = async () => {
    try {
      const user = auth.currentUser; if (!user) { navigate('/login'); return; }
      const setSnap = await getDoc(doc(db, 'settings', 'global'));
      const setData = setSnap.exists() ? setSnap.data() : {};
      setAdminUpiId(setData.adminUpiId || '');
      let rates = setData.rates || [];
      if (rates.length === 0 && setData.mandatorySavingsAmount) rates = [{ month: '2000-01', amount: setData.mandatorySavingsAmount }];
      rates.sort((a, b) => b.month.localeCompare(a.month));

      const userSnap = await getDoc(doc(db, 'users', user.uid));
      let uData = null;
      if (userSnap.exists()) { uData = userSnap.data(); setUserData(uData); }

      const txQuery = query(collection(db, 'transactions'), where('userId', '==', user.uid));
      const txSnap = await getDocs(txQuery);
      const allTx = txSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const visibleTx = allTx.filter(tx => tx.status === 'approved').sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));

      // Get approved loans sorted by newest first
      const approvedLoans = visibleTx.filter(tx => tx.type === 'credit_request').sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
      
      if (approvedLoans.length > 0) {
        setLatestLoanAmount(approvedLoans[0].amount || 0);
      }

      // Intelligent labeling for recent transactions (New Loan Taken vs Loan Closed)
      const activeBalance = uData?.activeCreditBalance || 0;
      let enhancedTx = visibleTx.map(tx => ({ ...tx }));

      if (approvedLoans.length > 0) {
        const latestLoanId = approvedLoans[0].id;
        enhancedTx = enhancedTx.map(tx => {
          if (tx.id === latestLoanId) {
            // If active balance is 0, this latest loan is now closed. Otherwise it's a new/active loan taken.
            return {
              ...tx,
              customLabel: activeBalance === 0 ? 'Loan Closed' : 'New Loan Taken'
            };
          }
          return tx;
        });
      }

      setRecentTx(enhancedTx.slice(0, 3));

      if (uData) {
        const pendingSavingsAmt = allTx.filter(tx => tx.type === 'savings_deposit' && tx.status === 'pending').reduce((sum, tx) => sum + tx.amount, 0);
        let expectedSavings = 0;
        let jd = uData.createdAt?.seconds ? new Date(uData.createdAt.seconds * 1000) : new Date();
        if (!uData.createdAt?.seconds && allTx.length > 0) {
          const earliest = allTx.reduce((min, tx) => ((tx.timestamp?.seconds || Infinity) < (min.timestamp?.seconds || Infinity) ? tx : min), allTx[0]);
          if (earliest?.timestamp?.seconds) jd = new Date(earliest.timestamp.seconds * 1000);
        }
        let curr = new Date(jd.getFullYear(), jd.getMonth(), 1);
        let now = new Date(); let end = new Date(now.getFullYear(), now.getMonth(), 1);
        while (curr <= end) {
          let mStr = `${curr.getFullYear()}-${String(curr.getMonth() + 1).padStart(2, '0')}`;
          let rateObj = rates.find(r => r.month <= mStr);
          let amt = rateObj ? rateObj.amount : (rates.length > 0 ? rates[rates.length - 1].amount : 0);
          expectedSavings += amt; curr.setMonth(curr.getMonth() + 1);
        }
        const totalAccounted = (uData.totalSavings || 0) + pendingSavingsAmt;
        const dueAmt = expectedSavings - totalAccounted;
        setPendingDue(dueAmt > 0 ? dueAmt : 0);
      }
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  useEffect(() => { fetchUserData(); }, [navigate]);

  const handleLogout = async () => { 
    try { 
      await signOut(auth); 
      if ('caches' in window) {
        const names = await caches.keys();
        await Promise.all(names.map(name => caches.delete(name)));
      }
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (let reg of registrations) { await reg.unregister(); }
      }
      window.location.href = '/login'; 
    } catch (err) { alert('Logout failed: ' + err.message); } 
  };

  const handleCheckBankFunds = async () => {
    setCalculatingFunds(true); setShowFundModal(true);
    try {
      const usersSnap = await getDocs(collection(db, 'users'));
      let totalSav = 0, totalCred = 0;
      usersSnap.docs.forEach(d => { const data = d.data(); if (data.role !== 'admin') { totalSav += (data.totalSavings || 0); totalCred += (data.activeCreditBalance || 0); } });
      setBankFunds(totalSav - totalCred);
    } catch (err) { console.error(err); } finally { setCalculatingFunds(false); }
  };

  if (loading) return <div style={{ padding: '16px', maxWidth: '600px', margin: '0 auto' }}><div style={{ height: '140px', backgroundColor: '#e2e8f0', borderRadius: '20px', animation: 'pulse 1.5s infinite' }}></div></div>;

  return (
    <div style={{ background: 'linear-gradient(180deg, #f4fdf8 0%, #fffbeb 100%)', minHeight: '100vh', paddingBottom: '80px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      
      <div style={{ background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)', padding: '16px 16px 65px 16px', borderBottomLeftRadius: '28px', borderBottomRightRadius: '28px' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {userData?.photo ? (
              <img src={userData.photo} alt={userData?.name} style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.3)' }} />
            ) : (
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#064e3b', fontSize: '18px', fontWeight: '900', boxShadow: '0 4px 8px rgba(0,0,0,0.1)' }}>
                {userData?.name?.charAt(0).toUpperCase() || 'U'}
              </div>
            )}
            <div>
              <p style={{ margin: 0, fontSize: '10px', color: '#dcfce7', fontWeight: '700', letterSpacing: '0.5px' }}>Assalamu Alaikum,</p>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: '900', color: '#ffffff' }}>{userData?.name || 'Member'}</h2>
            </div>
          </div>
          <button onClick={() => setShowLogoutModal(true)} style={{ backgroundColor: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', width: '32px', height: '32px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', cursor: 'pointer' }}>
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
          </button>
        </div>
      </div>

      <div style={{ padding: '0 16px', maxWidth: '600px', margin: '0 auto' }}>
        
        <div style={{ background: 'linear-gradient(135deg, #064e3b 0%, #0f766e 100%)', padding: '24px', borderRadius: '28px', boxShadow: '0 12px 25px -5px rgba(6, 78, 59, 0.4)', marginTop: '-45px', marginBottom: '24px', position: 'relative', zIndex: 10, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.15)' }}>
          <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '120px', height: '120px', background: 'radial-gradient(circle, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 70%)', borderRadius: '50%' }}></div>
          <div style={{ position: 'absolute', bottom: '-30px', left: '-20px', width: '140px', height: '140px', background: 'radial-gradient(circle, rgba(16,185,129,0.3) 0%, rgba(255,255,255,0) 70%)', borderRadius: '50%' }}></div>
          
          <div style={{ position: 'relative', zIndex: 2 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '26px', height: '26px', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"></path></svg>
                </div>
                <span style={{ fontSize: '11px', color: '#dcfce7', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.5px' }}>My Portfolio</span>
              </div>
              <span style={{ backgroundColor: 'rgba(0,0,0,0.25)', color: '#fff', padding: '4px 10px', borderRadius: '8px', fontSize: '9px', fontWeight: '800', letterSpacing: '0.5px' }}>A/C: {userData?.accountNumber || 'N/A'}</span>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <p style={{ margin: '0 0 4px 0', fontSize: '10px', color: '#a7f3d0', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Savings</p>
                <h1 style={{ margin: '0 0 8px 0', fontSize: '24px', fontWeight: '900', color: '#ffffff', letterSpacing: '-0.5px' }}>₹{userData?.totalSavings || 0}</h1>
                {pendingDue > 0 ? (
                  <span style={{ backgroundColor: '#fef08a', color: '#854d0e', padding: '4px 8px', borderRadius: '6px', fontSize: '9px', fontWeight: '900', textTransform: 'uppercase', display: 'inline-block' }}>Due ₹{pendingDue}</span>
                ) : (
                  <span style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: '#dcfce7', padding: '4px 8px', borderRadius: '6px', fontSize: '9px', fontWeight: '900', textTransform: 'uppercase', display: 'inline-block' }}>No Dues</span>
                )}
              </div>
              <div style={{ width: '1px', alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.15)', margin: '0 4px' }}></div>
              <div style={{ flex: 1, paddingLeft: '4px' }}>
                <p style={{ margin: '0 0 4px 0', fontSize: '10px', color: '#a7f3d0', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Loan Due</p>
                {userData?.activeCreditBalance > 0 ? (
                   <>
                     <h1 style={{ margin: '0 0 8px 0', fontSize: '24px', fontWeight: '900', color: '#f07474', letterSpacing: '-0.5px' }}>₹{userData.activeCreditBalance}</h1>
                     <span style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: '#dcfce7', padding: '4px 8px', borderRadius: '6px', fontSize: '9px', fontWeight: '900', textTransform: 'uppercase', display: 'inline-block' }}>Loan Taken: ₹{latestLoanAmount}</span>
                   </>
                ) : (
                   <>
                     <h1 style={{ margin: '0 0 8px 0', fontSize: '24px', fontWeight: '900', color: '#ffffff', letterSpacing: '-0.5px' }}>₹0</h1>
                     <span style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: '#dcfce7', padding: '4px 8px', borderRadius: '6px', fontSize: '9px', fontWeight: '900', textTransform: 'uppercase', display: 'inline-block' }}>Clear</span>
                   </>
                )}
              </div>
            </div>
          </div>
        </div>

        <h3 style={{ margin: '0 0 12px 4px', fontSize: '13px', color: '#0f172a', fontWeight: '900' }}>Quick Services</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '24px' }}>
          <div onClick={() => setShowOfflinePayModal(true)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <div style={{ backgroundColor: '#ffffff', width: '48px', height: '48px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#059669', boxShadow: '0 4px 12px rgba(0,0,0,0.04)' }}><svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"></path></svg></div>
            <span style={{ fontSize: '10px', color: '#475569', fontWeight: '800' }}>Pay Due</span>
          </div>
          <div onClick={handleCheckBankFunds} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <div style={{ backgroundColor: '#ffffff', width: '48px', height: '48px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#eab308', boxShadow: '0 4px 12px rgba(0,0,0,0.04)' }}><svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 8h6m-5 0a3 3 0 110 6H9l3 3m-3-6h6m6 1a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg></div>
            <span style={{ fontSize: '10px', color: '#475569', fontWeight: '800' }}>Bank Fund</span>
          </div>
          <div onClick={() => navigate('/passbook')} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <div style={{ backgroundColor: '#ffffff', width: '48px', height: '48px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6', boxShadow: '0 4px 12px rgba(0,0,0,0.04)' }}><svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg></div>
            <span style={{ fontSize: '10px', color: '#475569', fontWeight: '800' }}>Passbook</span>
          </div>
          <div onClick={() => navigate('/settings')} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <div style={{ backgroundColor: '#ffffff', width: '48px', height: '48px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', boxShadow: '0 4px 12px rgba(0,0,0,0.04)' }}><svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path></svg></div>
            <span style={{ fontSize: '10px', color: '#475569', fontWeight: '800' }}>Settings</span>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', padding: '0 4px' }}>
          <h3 style={{ margin: 0, fontSize: '13px', color: '#0f172a', fontWeight: '900' }}>Recent Transactions</h3>
          <span onClick={() => navigate('/history')} style={{ fontSize: '10px', color: '#163eee', fontWeight: '900', cursor: 'pointer', textTransform: 'uppercase' }}>View All</span>
        </div>

        <div style={{ backgroundColor: '#ffffff', borderRadius: '20px', padding: '6px', boxShadow: '0 4px 15px rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.02)' }}>
          {recentTx.length === 0 ? (
            <p style={{ margin: 0, padding: '20px', color: '#94a3b8', fontSize: '11px', fontWeight: '700', textAlign: 'center' }}>No recent activity.</p>
          ) : (
            recentTx.map((tx, idx) => {
              const isCredit = tx.type === 'savings_deposit' || tx.type === 'credit_repayment';
              const dateStr = tx.timestamp?.seconds ? new Date(tx.timestamp.seconds * 1000).toLocaleDateString('en-GB') : 'Recent';
              
              let txLabel = tx.customLabel || tx.type;
              if (tx.customLabel) {
                txLabel = tx.customLabel;
              } else if (tx.type === 'credit_request') {
                txLabel = 'New Loan Taken';
              } else if (tx.type === 'savings_deposit') {
                txLabel = 'Savings Deposit';
              } else if (tx.type === 'credit_repayment') {
                txLabel = 'Loan Repayment';
              } else {
                txLabel = tx.type.replace('_', ' ');
              }

              return (
                <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: idx === recentTx.length - 1 ? 'none' : '1px solid #f1f5f9' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ backgroundColor: isCredit ? '#f0fdf4' : '#fef2f2', width: '32px', height: '32px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isCredit ? '#10b981' : '#ef4444' }}>
                      <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d={isCredit ? "M5 10l7-7m0 0l7 7m-7-7v18" : "M19 14l-7 7m0 0l-7-7m7 7V3"}></path></svg>
                    </div>
                    <div>
                      <p style={{ margin: '0 0 2px 0', fontSize: '12px', fontWeight: '900', color: '#0f172a', textTransform: 'capitalize' }}>
                        {txLabel}
                      </p>
                      <p style={{ margin: 0, fontSize: '9px', color: '#94a3b8', fontWeight: '700' }}>{dateStr} {tx.status === 'pending' && <span style={{ color: '#d97706', marginLeft: '4px', textTransform: 'uppercase', fontSize: '8px' }}>(Pending)</span>}</p>
                    </div>
                  </div>
                  <p style={{ margin: 0, fontSize: '14px', fontWeight: '900', color: isCredit ? '#10b981' : '#ef4444' }}>{isCredit ? '+' : '-'}₹{tx.amount}</p>
                </div>
              );
            })
          )}
        </div>
      </div>

      {showOfflinePayModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,23,42,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', backdropFilter: 'blur(4px)' }}>
          <div style={{ width: '100%', maxWidth: '300px', backgroundColor: '#ffffff', borderRadius: '28px', padding: '24px', textAlign: 'center', animation: 'popIn 0.2s ease-out', boxSizing: 'border-box', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ width: '56px', height: '56px', backgroundColor: '#fefce8', borderRadius: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto', color: '#eab308' }}>
              <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            </div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', color: '#0f172a', fontWeight: '900' }}>Manual Payment</h3>
            <p style={{ margin: '0 0 20px 0', fontSize: '12px', color: '#64748b', lineHeight: '1.5', fontWeight: '600' }}>
              Send your due amount to the admin {adminUpiId ? <strong style={{ color: '#064e3b' }}><br/>(UPI: {adminUpiId})</strong> : ''} and inform them.
            </p>
            <button onClick={() => setShowOfflinePayModal(false)} style={{ width: '100%', padding: '14px', backgroundColor: '#059669', color: '#fff', border: 'none', borderRadius: '16px', fontWeight: '900', fontSize: '13px', cursor: 'pointer', textTransform: 'uppercase' }}>Got it</button>
          </div>
        </div>
      )}

      {showFundModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,23,42,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', backdropFilter: 'blur(4px)' }}>
          <div style={{ width: '100%', maxWidth: '300px', backgroundColor: '#ffffff', borderRadius: '28px', padding: '24px', textAlign: 'center', animation: 'popIn 0.2s ease-out', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ width: '56px', height: '56px', backgroundColor: '#fefce8', borderRadius: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto', color: '#eab308' }}><svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 8h6m-5 0a3 3 0 110 6H9l3 3m-3-6h6m6 1a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg></div>
            <h4 style={{ margin: '0 0 6px 0', fontSize: '18px', color: '#0f172a', fontWeight: '900' }}>Bank Fund</h4>
            <p style={{ margin: '0 0 16px 0', fontSize: '11px', color: '#64748b', fontWeight: '700' }}>Available for Loan</p>
            {calculatingFunds ? (<p style={{ margin: '16px 0', fontSize: '13px', color: '#eab308', fontWeight: '800' }}>Calculating...</p>) : (<h2 style={{ margin: '0 0 24px 0', fontSize: '32px', fontWeight: '900', color: '#0f172a', letterSpacing: '-1px' }}>₹{bankFunds}</h2>)}
            <button onClick={() => setShowFundModal(false)} style={{ width: '100%', padding: '14px', backgroundColor: '#f1f5f9', color: '#0f172a', border: 'none', borderRadius: '16px', fontWeight: '900', fontSize: '13px', cursor: 'pointer', textTransform: 'uppercase' }}>Close</button>
          </div>
        </div>
      )}

      {showLogoutModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,23,42,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', backdropFilter: 'blur(4px)' }}>
          <div style={{ width: '100%', maxWidth: '300px', backgroundColor: '#ffffff', borderRadius: '28px', padding: '24px', textAlign: 'center', animation: 'popIn 0.2s ease-out', boxSizing: 'border-box', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ width: '56px', height: '56px', backgroundColor: '#fef2f2', borderRadius: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto', color: '#dc2626' }}>
              <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
            </div>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '18px', color: '#0f172a', fontWeight: '900' }}>Log Out</h3>
            <p style={{ margin: '0 0 24px 0', fontSize: '12px', color: '#64748b', lineHeight: '1.5', fontWeight: '600' }}>Are you sure you want to log out?</p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setShowLogoutModal(false)} style={{ flex: 1, padding: '14px', backgroundColor: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '16px', fontWeight: '900', fontSize: '13px', cursor: 'pointer', textTransform: 'uppercase' }}>Cancel</button>
              <button onClick={handleLogout} style={{ flex: 1, padding: '14px', backgroundColor: '#ef4444', color: '#ffffff', border: 'none', borderRadius: '16px', fontWeight: '900', fontSize: '13px', cursor: 'pointer', textTransform: 'uppercase' }}>Logout</button>
            </div>
          </div>
        </div>
      )}

      {showExitToast && (
        <div style={{ position: 'fixed', bottom: '90px', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#0f172a', color: '#ffffff', padding: '12px 24px', borderRadius: '24px', fontSize: '12px', fontWeight: '800', zIndex: 10000, boxShadow: '0 10px 20px rgba(0,0,0,0.2)', animation: 'popIn 0.2s ease-out' }}>
          Press back again to exit
        </div>
      )}

      <style>{`@keyframes popIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }`}</style>
    </div>
  );
}
