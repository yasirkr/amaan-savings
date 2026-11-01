import { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/firebase';

export default function AdminLoanHistory() {
  const [history, setHistory] = useState([]);
  const [totalLoans, setTotalLoans] = useState(0);
  const [loading, setLoading] = useState(true);

  // Scroll to top on load
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const txSnap = await getDocs(collection(db, 'transactions'));
        const creditTx = txSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(tx => tx.type === 'credit_request' && tx.status === 'approved')
          .sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
        
        const total = creditTx.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
        
        setTotalLoans(total);
        setHistory(creditTx);
      } catch (err) { console.error(err); } finally { setLoading(false); }
    };
    fetchHistory();
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto', marginTop: '40px' }}>
        <div style={{ height: '200px', backgroundColor: '#e2e8f0', borderRadius: '28px', animation: 'pulse 1.5s infinite' }}></div>
        <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ background: 'linear-gradient(180deg, #f4fdf8 0%, #fffbeb 100%)', minHeight: '100vh', paddingBottom: '130px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      
      {/* Curved Green Header */}
      <div style={{ background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)', padding: '24px 20px 65px 20px', borderBottomLeftRadius: '28px', borderBottomRightRadius: '28px' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '900', color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Loan History</h2>
              <p style={{ margin: '4px 0 0 0', color: '#dcfce7', fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '1px' }}>Global Credit Ledger</p>
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '0 16px', maxWidth: '600px', margin: '0 auto', marginTop: '-45px', position: 'relative', zIndex: 10 }}>
        
        {/* Total Loan Amount Summary Card */}
        <div style={{ backgroundColor: '#ffffff', borderRadius: '24px', padding: '20px', boxShadow: '0 8px 25px -5px rgba(6, 78, 59, 0.1)', border: '1px solid rgba(0,0,0,0.02)', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ margin: '0 0 4px 0', fontSize: '11px', color: '#64748b', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Disbursed</p>
            <h1 style={{ margin: 0, fontSize: '28px', fontWeight: '900', color: '#ef4444', letterSpacing: '-0.5px' }}>₹{totalLoans}</h1>
          </div>
          <div style={{ backgroundColor: '#fef2f2', width: '48px', height: '48px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
            <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          </div>
        </div>

        <h3 style={{ margin: '0 0 12px 4px', fontSize: '13px', color: '#0f172a', fontWeight: '900' }}>HISTORY</h3>

        {/* Compact History List */}
        <div style={{ backgroundColor: '#ffffff', borderRadius: '20px', padding: '6px', boxShadow: '0 4px 15px rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.02)' }}>
          {history.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center' }}>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: '11px', fontWeight: '700' }}>No loans have been issued yet.</p>
            </div>
          ) : (
            history.map((tx, idx) => {
              const dateObj = tx.timestamp?.seconds ? new Date(tx.timestamp.seconds * 1000) : null;
              const dateStr = dateObj ? dateObj.toLocaleDateString('en-GB') : 'Just now';
              
              return (
                <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: idx === history.length - 1 ? 'none' : '1px solid #f1f5f9' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ backgroundColor: '#fef2f2', width: '32px', height: '32px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444', flexShrink: 0 }}>
                      <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path></svg>
                    </div>
                    <div>
                      <p style={{ margin: '0 0 2px 0', fontWeight: '900', fontSize: '12px', color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{tx.userName || 'Member'}</p>
                      <p style={{ margin: 0, fontSize: '9px', color: '#64748b', fontWeight: '700' }}>Loan Issued • {dateStr}</p>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ margin: 0, fontWeight: '900', fontSize: '14px', color: '#ef4444' }}>-₹{tx.amount}</p>
                  </div>
                </div>
              )
            })
          )}
        </div>

      </div>
    </div>
  );
}
