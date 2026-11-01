import { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../firebase/firebase';
import { useNavigate } from 'react-router-dom';

export default function UserHistory() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    window.scrollTo(0, 0);
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const txSnap = await getDocs(query(collection(db, 'transactions'), where('userId', '==', user.uid)));
          const txs = txSnap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(tx => tx.status === 'approved')
            .sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
          setHistory(txs);
        } catch (err) { console.error(err); } finally { setLoading(false); }
      } else {
        navigate('/login');
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  if (loading) {
    return (
      <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto', marginTop: '40px' }}>
        <div style={{ height: '200px', backgroundColor: '#e2e8f0', borderRadius: '28px', animation: 'pulse 1.5s infinite' }}></div>
      </div>
    );
  }

  return (
    <div style={{ background: 'linear-gradient(180deg, #f4fdf8 0%, #fffbeb 100%)', minHeight: '100vh', paddingBottom: '90px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)', padding: '24px 20px 65px 20px', borderBottomLeftRadius: '28px', borderBottomRightRadius: '28px' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '900', color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.5px' }}>History</h2>
            <p style={{ margin: '4px 0 0 0', color: '#dcfce7', fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '1px' }}>All Transactions</p>
          </div>
          <button onClick={() => navigate(-1)} style={{ backgroundColor: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', padding: '8px 12px', borderRadius: '12px', color: '#ffffff', fontWeight: '900', fontSize: '11px', textTransform: 'uppercase', cursor: 'pointer' }}>
            Back
          </button>
        </div>
      </div>

      <div style={{ padding: '0 16px', maxWidth: '600px', margin: '0 auto', marginTop: '-45px', position: 'relative', zIndex: 10 }}>
        <div style={{ backgroundColor: '#ffffff', borderRadius: '20px', padding: '6px', boxShadow: '0 4px 15px rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.02)' }}>
          {history.length === 0 ? (
            <p style={{ margin: 0, padding: '30px', color: '#94a3b8', fontSize: '12px', fontWeight: '700', textAlign: 'center' }}>No transactions found.</p>
          ) : (
            history.map((tx, idx) => {
              const isCredit = tx.type === 'savings_deposit' || tx.type === 'credit_repayment';
              const dateStr = tx.timestamp?.seconds ? new Date(tx.timestamp.seconds * 1000).toLocaleDateString('en-GB') : 'Recent';
              
              let txLabel = tx.type;
              if (tx.type === 'credit_request') txLabel = 'Loan Taken';
              else if (tx.type === 'savings_deposit') txLabel = 'Savings Deposit';
              else if (tx.type === 'credit_repayment') txLabel = 'Loan Repayment';
              else txLabel = tx.type.replace('_', ' ');

              return (
                <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderBottom: idx === history.length - 1 ? 'none' : '1px solid #f1f5f9' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ backgroundColor: isCredit ? '#f0fdf4' : '#fef2f2', width: '30px', height: '30px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isCredit ? '#10b981' : '#ef4444' }}>
                      <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d={isCredit ? "M5 10l7-7m0 0l7 7m-7-7v18" : "M19 14l-7 7m0 0l-7-7m7 7V3"}></path></svg>
                    </div>
                    <div>
                      <p style={{ margin: '0 0 2px 0', fontSize: '12px', fontWeight: '900', color: '#0f172a', textTransform: 'capitalize' }}>{txLabel}</p>
                      <p style={{ margin: 0, fontSize: '9px', color: '#94a3b8', fontWeight: '800' }}>{dateStr}</p>
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
  );
}
