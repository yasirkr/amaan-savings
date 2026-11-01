import { useState, useEffect, useRef } from 'react';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { db, auth } from '../firebase/firebase';
import { useNavigate } from 'react-router-dom';
import html2canvas from 'html2canvas';

export default function AdminDashboard() {
  const [pendingRequests, setPendingRequests] = useState([]);
  const [groupStats, setGroupStats] = useState({ savings: 0, available: 0, credit: 0, savingsDue: 0, totalMembers: 0 });
  const [loading, setLoading] = useState(true);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  
  const [members, setMembers] = useState([]);
  const [duesCount, setDuesCount] = useState(0);
  
  const [showCumulativeModal, setShowCumulativeModal] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  const backPressCount = useRef(0);
  const [showExitToast, setShowExitToast] = useState(false);
  const navigate = useNavigate();
  const [recentTx, setRecentTx] = useState([]);
  const reportRef = useRef(null);

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

  const fetchData = async () => {
    try {
      const setSnap = await getDoc(doc(db, 'settings', 'global'));
      const setData = setSnap.exists() ? setSnap.data() : {};
      let rates = setData.rates || [];
      if (rates.length === 0 && setData.mandatorySavingsAmount) { rates = [{ month: '2026-01', amount: setData.mandatorySavingsAmount }]; }
      rates.sort((a, b) => b.month.localeCompare(a.month));

      const usersSnap = await getDocs(collection(db, 'users'));
      const membersList = usersSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.role !== 'admin');
      const txSnap = await getDocs(collection(db, 'transactions'));
      const allTx = txSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      let totalSav = 0, totalCred = 0, totalSavDue = 0;
      const membersWithDues = membersList.map(member => {
        totalSav += (member.totalSavings || 0); totalCred += (member.activeCreditBalance || 0);
        const userTx = allTx.filter(tx => tx.userId === member.id);
        const userPendingTx = userTx.filter(tx => tx.type === 'savings_deposit' && tx.status === 'pending');
        const pendingSavingsAmt = userPendingTx.reduce((sum, tx) => sum + tx.amount, 0);
        
        const loanAmt = userTx.filter(tx => tx.type === 'credit_request' && tx.status === 'approved').reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);

        let expectedSavings = 0;
        let jd = member.createdAt?.seconds ? new Date(member.createdAt.seconds * 1000) : new Date();
        if (!member.createdAt?.seconds && userTx.length > 0) {
          const earliest = userTx.reduce((min, tx) => ((tx.timestamp?.seconds || Infinity) < (min.timestamp?.seconds || Infinity) ? tx : min), userTx[0]);
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
        
        const totalAccounted = (member.totalSavings || 0) + pendingSavingsAmt;
        const dueAmt = expectedSavings - totalAccounted;
        const finalDue = dueAmt > 0 ? dueAmt : 0;
        totalSavDue += finalDue;
        return { ...member, dueAmount: finalDue, loanAmt: loanAmt };
      });

      membersWithDues.sort((a, b) => a.name.localeCompare(b.name));
      setMembers(membersWithDues);
      
      // Calculate how many members have dues
      const activeDuesCount = membersWithDues.filter(m => m.dueAmount > 0 || (m.activeCreditBalance || 0) > 0).length;
      setDuesCount(activeDuesCount);

      setGroupStats({ savings: totalSav, available: totalSav - totalCred, credit: totalCred, savingsDue: totalSavDue, totalMembers: membersList.length });
      setPendingRequests(allTx.filter(tx => tx.status === 'pending').sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0)));
      
      // Fetch ONLY approved transactions for the recent list
      setRecentTx(allTx.filter(tx => tx.status === 'approved').sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0)).slice(0, 5));
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

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

  if (loading) {
    return (
      <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto', marginTop: '40px' }}>
        <div style={{ height: '200px', backgroundColor: '#e2e8f0', borderRadius: '28px', animation: 'pulse 1.5s infinite' }}></div>
        <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }`}</style>
      </div>
    );
  }

  // Calculate Cumulative Table Totals
  const totalSavAmt = members.reduce((sum, m) => sum + (m.totalSavings || 0), 0);
  const totalSavDue = members.reduce((sum, m) => sum + (m.dueAmount || 0), 0);
  const totalLoanAmt = members.reduce((sum, m) => sum + (m.loanAmt || 0), 0);
  const totalLoanDue = members.reduce((sum, m) => sum + (m.activeCreditBalance || 0), 0);

  // TRUE HD Image Generation & Native Sharing
  const handleShareImage = async () => {
    if (!reportRef.current) return;
    setIsSharing(true);
    try {
      const canvas = await html2canvas(reportRef.current, { 
        scale: 5, 
        backgroundColor: '#ffffff', 
        useCORS: true,
        logging: false
      });
      
      canvas.toBlob(async (blob) => {
        if (!blob) throw new Error('Blob generation failed');
        const file = new File([blob], 'amaan_report.png', { type: 'image/png' });
        
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: 'Amaan Financial Report',
            files: [file]
          });
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = 'amaan_report.png'; a.click();
          URL.revokeObjectURL(url);
          alert("Image saved in HD! Your browser doesn't support direct sharing, so the file was downloaded.");
        }
      }, 'image/png', 1.0);
    } catch (err) {
      console.error(err);
      alert('Failed to generate image.');
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <div style={{ background: 'linear-gradient(180deg, #f4fdf8 0%, #fffbeb 100%)', minHeight: '100vh', paddingBottom: '90px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      
      {/* Forest Green Header */}
      <div style={{ background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)', padding: '16px 16px 65px 16px', borderBottomLeftRadius: '28px', borderBottomRightRadius: '28px' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ margin: '0 0 2px 0', fontSize: '10px', color: '#dcfce7', fontWeight: '800', letterSpacing: '1px', textTransform: 'uppercase' }}>Control Center</p>
            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: '900', color: '#fcf9f9' }}>ADMIN DASHBOARD</h2>
          </div>
          <button onClick={() => setShowLogoutModal(true)} style={{ backgroundColor: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', width: '32px', height: '32px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', cursor: 'pointer' }}>
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
          </button>
        </div>
      </div>

      <div style={{ padding: '0 16px', maxWidth: '600px', margin: '0 auto' }}>
        
        {/* Admin Asset Pool Card */}
        <div style={{ background: 'linear-gradient(135deg, #0f766e 0%, #064e3b 100%)', padding: '24px', borderRadius: '28px', boxShadow: '0 12px 25px -5px rgba(6, 78, 59, 0.4)', marginTop: '-45px', marginBottom: '24px', position: 'relative', zIndex: 10, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.15)' }}>
          <div style={{ position: 'absolute', top: '-20px', left: '-20px', width: '120px', height: '120px', background: 'radial-gradient(circle, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 70%)', borderRadius: '50%' }}></div>
          <div style={{ position: 'absolute', bottom: '-30px', right: '-20px', width: '140px', height: '140px', background: 'radial-gradient(circle, rgba(16,185,129,0.3) 0%, rgba(255,255,255,0) 70%)', borderRadius: '50%' }}></div>
          
          <div style={{ position: 'relative', zIndex: 2 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '11px', color: '#a7f3d0', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.5px' }}>BANK FUND</span>
              </div>
              
              <div onClick={() => setShowCumulativeModal(true)} style={{ backgroundColor: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', width: '32px', height: '32px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', cursor: 'pointer' }}>
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
              </div>
            </div>
            
            <h1 style={{ margin: '0 0 4px 0', fontSize: '30px', fontWeight: '900', color: '#e1eb58', letterSpacing: '-1px' }}>₹{groupStats.available}</h1>
            <p style={{ margin: '0 0 24px 0', fontSize: '10px', color: '#a7f3d0', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Available For Loan</p>
            
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <p style={{ margin: '0 0 4px 0', fontSize: '10px', color: '#dcfce7', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Group Savings</p>
                <h2 style={{ margin: '0 0 8px 0', fontSize: '20px', fontWeight: '900', color: '#fff', letterSpacing: '-0.5px' }}>₹{groupStats.savings}</h2>
                <span style={{ backgroundColor: groupStats.savingsDue > 0 ? '#fef08a' : 'rgba(255,255,255,0.15)', color: groupStats.savingsDue > 0 ? '#854d0e' : '#dcfce7', padding: '4px 8px', borderRadius: '6px', fontSize: '9px', fontWeight: '900', display: 'inline-block', textTransform: 'uppercase' }}>{groupStats.savingsDue > 0 ? `Dues ₹${groupStats.savingsDue}` : 'No Dues'}</span>
              </div>
              <div style={{ width: '1px', alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.15)', margin: '0 4px' }}></div>
              <div style={{ flex: 1, paddingLeft: '4px' }}>
                <p style={{ margin: '0 0 4px 0', fontSize: '10px', color: '#dcfce7', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Active Loans</p>
                <h2 style={{ margin: '0 0 8px 0', fontSize: '20px', fontWeight: '900', color: groupStats.credit > 0 ? '#e03e3e' : '#fff', letterSpacing: '-0.5px' }}>₹{groupStats.credit}</h2>
                <span style={{ backgroundColor: groupStats.credit > 0 ? '#fecaca' : 'rgba(255,255,255,0.15)', color: groupStats.credit > 0 ? '#991b1b' : '#dcfce7', padding: '4px 8px', borderRadius: '6px', fontSize: '9px', fontWeight: '900', display: 'inline-block', textTransform: 'uppercase' }}>{groupStats.credit > 0 ? 'Active' : 'Clear'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Management Section (4 Columns) */}
        <h3 style={{ margin: '0 0 12px 4px', fontSize: '13px', color: '#0f172a', fontWeight: '900' }}>Quick Action</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '24px' }}>
          
          <div onClick={() => navigate('/admin/loans')} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <div style={{ backgroundColor: '#ffffff', width: '48px', height: '48px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366f1', boxShadow: '0 4px 12px rgba(0,0,0,0.04)' }}>
              <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
            </div>
            <span style={{ fontSize: '10px', color: '#475569', fontWeight: '800' }}>Loan History</span>
          </div>

          <div onClick={() => navigate('/admin/members')} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <div style={{ backgroundColor: '#ffffff', width: '48px', height: '48px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981', boxShadow: '0 4px 12px rgba(0,0,0,0.04)' }}>
              <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
            </div>
            <span style={{ fontSize: '10px', color: '#475569', fontWeight: '800' }}>Members</span>
          </div>

          <div onClick={() => navigate('/admin/dues')} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <div style={{ position: 'relative' }}>
              {duesCount > 0 && <span style={{ position: 'absolute', top: '-6px', right: '-6px', backgroundColor: '#ef4444', color: '#fff', width: '18px', height: '18px', borderRadius: '50%', fontSize: '10px', fontWeight: '900', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #f8fafc', zIndex: 2 }}>{duesCount}</span>}
              <div style={{ backgroundColor: '#ffffff', width: '48px', height: '48px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444', boxShadow: '0 4px 12px rgba(0,0,0,0.04)' }}>
                <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
              </div>
            </div>
            <span style={{ fontSize: '10px', color: '#475569', fontWeight: '800' }}>Pending Dues</span>
          </div>

          <div onClick={() => navigate('/admin/queue')} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <div style={{ position: 'relative' }}>
              {pendingRequests.length > 0 && <span style={{ position: 'absolute', top: '-6px', right: '-6px', backgroundColor: '#ef4444', color: '#fff', width: '18px', height: '18px', borderRadius: '50%', fontSize: '10px', fontWeight: '900', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #f8fafc', zIndex: 2 }}>{pendingRequests.length}</span>}
              <div style={{ backgroundColor: '#ffffff', width: '48px', height: '48px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#eab308', boxShadow: '0 4px 12px rgba(0,0,0,0.04)' }}>
                <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              </div>
            </div>
            <span style={{ fontSize: '10px', color: '#475569', fontWeight: '800' }}>Loan Queue</span>
          </div>

          

        </div>

        {/* Recent Transactions Section (Approved Only) */}
        <div style={{ marginTop: '24px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', padding: '0 4px' }}>
            <h3 style={{ margin: 0, fontSize: '13px', color: '#0f172a', fontWeight: '900' }}>Recent Transactions</h3>
          </div>
          <div style={{ backgroundColor: '#ffffff', borderRadius: '20px', padding: '6px', boxShadow: '0 4px 15px rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.02)' }}>
            {recentTx.length === 0 ? (
              <p style={{ margin: 0, padding: '20px', color: '#94a3b8', fontSize: '11px', fontWeight: '700', textAlign: 'center' }}>No recent transactions.</p>
            ) : (
              recentTx.map((tx, idx) => {
                const isCredit = tx.type === 'savings_deposit' || tx.type === 'credit_repayment';
                const dateStr = tx.timestamp?.seconds ? new Date(tx.timestamp.seconds * 1000).toLocaleDateString('en-GB') : 'Recent';
                let txLabel = tx.type;
                if (tx.type === 'credit_request') txLabel = 'Loan Taken';
                else if (tx.type === 'savings_deposit') txLabel = 'Savings Deposit';
                else if (tx.type === 'credit_repayment') txLabel = 'Loan Repayment';
                else txLabel = tx.type.replace('_', ' ');

                return (
                  <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: idx === recentTx.length - 1 ? 'none' : '1px solid #f1f5f9' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ backgroundColor: isCredit ? '#f0fdf4' : '#fef2f2', width: '32px', height: '32px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isCredit ? '#10b981' : '#ef4444' }}>
                        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d={isCredit ? "M5 10l7-7m0 0l7 7m-7-7v18" : "M19 14l-7 7m0 0l-7-7m7 7V3"}></path></svg>
                      </div>
                      <div>
                        <p style={{ margin: '0 0 2px 0', fontSize: '12px', fontWeight: '900', color: '#0f172a' }}>{tx.userName || 'Member'}</p>
                        <p style={{ margin: 0, fontSize: '9px', color: '#64748b', fontWeight: '700' }}>{txLabel} {dateStr}</p>
                      </div>
                    </div>
                    <p style={{ margin: 0, fontSize: '14px', fontWeight: '900', color: isCredit ? '#10b981' : '#ef4444' }}>{isCredit ? '+' : '-'}₹{tx.amount}</p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* MODERN ELEGANT CUMULATIVE MODAL WITH HD IMAGE EXPORT */}
      {showCumulativeModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,23,42,0.85)', zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '20px 10px', overflowY: 'auto' }}>
          
          <div style={{ width: '100%', maxWidth: '800px', backgroundColor: 'transparent', animation: 'popIn 0.2s ease-out', boxSizing: 'border-box' }}>
            
            {/* CLEAN FLOATING ACTION BAR (Will NOT appear in the image snapshot) */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '12px', gap: '12px' }}>
              <button onClick={handleShareImage} disabled={isSharing} style={{ background: '#10b981', border: 'none', padding: '8px 16px', borderRadius: '20px', cursor: isSharing ? 'wait' : 'pointer', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '800', fontSize: '12px', boxShadow: '0 4px 10px rgba(16,185,129,0.3)', opacity: isSharing ? 0.7 : 1 }}>
                {isSharing ? 'Capturing HD...' : (
                  <>
                    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"></path></svg>
                    Share
                  </>
                )}
              </button>
              <button onClick={() => setShowCumulativeModal(false)} style={{ background: '#ffffff', border: 'none', width: '34px', height: '34px', borderRadius: '50%', cursor: 'pointer', color: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}>✕</button>
            </div>
            
            {/* PRISTINE REPORT FRAME FOR SNAPSHOT WITH TEXT RENDERING IMPROVEMENTS */}
            <div ref={reportRef} style={{ backgroundColor: '#ffffff', padding: '24px', borderRadius: '16px', boxShadow: '0 10px 40px rgba(0,0,0,0.2)', boxSizing: 'border-box', WebkitFontSmoothing: 'antialiased', textRendering: 'optimizeLegibility' }}>
              
              {/* Report Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '900', color: '#064e3b', letterSpacing: '-0.5px' }}>amaan.</h2>
                  <p style={{ margin: 0, fontSize: '9px', color: '#d97706', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '1px' }}>Islamic Banking System</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ margin: 0, fontSize: '9px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Cumulative Report</p>
                  <p style={{ margin: '2px 0 0 0', fontSize: '11px', fontWeight: '900', color: '#0f172a' }}>{new Date().toLocaleDateString('en-GB')}</p>
                </div>
              </div>
              
              {/* Elegant Modern Table */}
              <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead style={{ backgroundColor: '#f8fafc' }}>
                  <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <th rowSpan="2" style={{ width: '32%', padding: '6px 4px', fontSize: '9px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', verticalAlign: 'bottom', borderBottom: '2px solid #e2e8f0' }}>Member</th>
                    <th colSpan="2" style={{ padding: '6px 0', fontSize: '10px', fontWeight: '900', color: '#064e3b', textTransform: 'uppercase', textAlign: 'center', borderBottom: '2px solid #10b981' }}>Savings</th>
                    <th colSpan="2" style={{ padding: '6px 0', fontSize: '10px', fontWeight: '900', color: '#7f1d1d', textTransform: 'uppercase', textAlign: 'center', borderBottom: '2px solid #ef4444' }}>Loan</th>
                  </tr>
                  <tr>
                    <th style={{ padding: '6px 4px', fontSize: '8px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', textAlign: 'right', borderBottom: '2px solid #e2e8f0' }}>Deposit</th>
                    <th style={{ padding: '6px 4px', fontSize: '8px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', textAlign: 'right', borderBottom: '2px solid #e2e8f0' }}>Due</th>
                    <th style={{ padding: '6px 4px', fontSize: '8px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', textAlign: 'right', borderBottom: '2px solid #e2e8f0' }}>Taken</th>
                    <th style={{ padding: '6px 4px', fontSize: '8px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', textAlign: 'right', borderBottom: '2px solid #e2e8f0' }}>Due</th>
                  </tr>
                </thead>
                <tbody>
                  {members.length === 0 ? (
                    <tr><td colSpan="5" style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '11px', fontWeight: '700' }}>No members found.</td></tr>
                  ) : (
                    members.map((m, i) => (
                      <tr key={m.id} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: i % 2 === 0 ? '#ffffff' : '#fafafa' }}>
                        <td style={{ padding: '6px 4px', fontSize: '9px', fontWeight: '800', color: '#0f172a', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</td>
                        <td style={{ padding: '6px 4px', fontSize: '9px', fontWeight: '800', color: m.totalSavings > 0 ? '#10b981' : '#cbd5e1', textAlign: 'right' }}>₹{m.totalSavings || 0}</td>
                        <td style={{ padding: '6px 4px', fontSize: '9px', fontWeight: '800', color: m.dueAmount > 0 ? '#d97706' : '#cbd5e1', textAlign: 'right' }}>₹{m.dueAmount || 0}</td>
                        <td style={{ padding: '6px 4px', fontSize: '9px', fontWeight: '800', color: m.loanAmt > 0 ? '#ef4444' : '#cbd5e1', textAlign: 'right' }}>₹{m.loanAmt || 0}</td>
                        <td style={{ padding: '6px 4px', fontSize: '9px', fontWeight: '800', color: m.activeCreditBalance > 0 ? '#ef4444' : '#cbd5e1', textAlign: 'right' }}>₹{m.activeCreditBalance || 0}</td>
                      </tr>
                    ))
                  )}
                  {/* CLEAN TOTALS ROW */}
                  <tr style={{ backgroundColor: '#0f172a' }}>
                    <td style={{ padding: '8px 4px', fontSize: '9px', fontWeight: '900', color: '#ffffff', textTransform: 'uppercase' }}>Totals</td>
                    <td style={{ padding: '8px 4px', fontSize: '9px', fontWeight: '900', color: '#34d399', textAlign: 'right' }}>₹{totalSavAmt}</td>
                    <td style={{ padding: '8px 4px', fontSize: '9px', fontWeight: '900', color: totalSavDue > 0 ? '#fde047' : '#94a3b8', textAlign: 'right' }}>₹{totalSavDue}</td>
                    <td style={{ padding: '8px 4px', fontSize: '9px', fontWeight: '900', color: totalLoanAmt > 0 ? '#fca5a5' : '#94a3b8', textAlign: 'right' }}>₹{totalLoanAmt}</td>
                    <td style={{ padding: '8px 4px', fontSize: '9px', fontWeight: '900', color: totalLoanDue > 0 ? '#fca5a5' : '#94a3b8', textAlign: 'right' }}>₹{totalLoanDue}</td>
                  </tr>
                </tbody>
              </table>

              {/* AVAILABLE FUNDS FOOTER */}
              <div style={{ marginTop: '20px', padding: '14px 16px', backgroundColor: '#ecfdf5', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: '800', color: '#065f46', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Available Fund In Bank</span>
                <span style={{ fontSize: '20px', fontWeight: '900', color: '#10b981', letterSpacing: '-0.5px' }}>₹{groupStats.available}</span>
              </div>

            </div>
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

      {showExitToast && (
        <div style={{ position: 'fixed', bottom: '90px', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#0f172a', color: '#ffffff', padding: '12px 24px', borderRadius: '24px', fontSize: '12px', fontWeight: '800', zIndex: 10000, boxShadow: '0 10px 20px rgba(0,0,0,0.2)', animation: 'popIn 0.2s ease-out' }}>
          Press back again to exit
        </div>
      )}
      <style>{`@keyframes popIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }`}</style>
    </div>
  );
}
