import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../firebase/firebase';

export default function UserCredit() {
  const [userData, setUserData] = useState(null);
  const [currentHistory, setCurrentHistory] = useState([]);
  const [closedLoansList, setClosedLoansList] = useState([]);
  const [latestLoanAmount, setLatestLoanAmount] = useState(0);
  const [latestLoanDate, setLatestLoanDate] = useState('');
  const [loading, setLoading] = useState(true);
  
  const [selectedTx, setSelectedTx] = useState(null);
  const [showModal, setShowModal] = useState(false);

  // Closed Loans Modal States
  const [showClosedModal, setShowClosedModal] = useState(false);
  const [selectedClosedLoan, setSelectedClosedLoan] = useState(null);
  
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const uSnap = await getDoc(doc(db, 'users', user.uid));
          let uData = null;
          if (uSnap.exists()) {
            uData = { id: uSnap.id, ...uSnap.data() };
            setUserData(uData);
          }

          // 1. Fetch Global Settings for Monthly Collection Rate
          const setSnap = await getDoc(doc(db, 'settings', 'global'));
          const setData = setSnap.exists() ? setSnap.data() : {};
          let activeRate = 1500;
          if (setData.rates && setData.rates.length > 0) {
            const sortedRates = [...setData.rates].sort((a, b) => a.month.localeCompare(b.month));
            activeRate = sortedRates[sortedRates.length - 1].amount || 1500;
          } else if (setData.mandatorySavingsAmount) {
            activeRate = setData.mandatorySavingsAmount;
          }

          // 2. Fetch Active Members Count to calculate Total Monthly Pool
          const usersSnap = await getDocs(collection(db, 'users'));
          const membersCount = usersSnap.docs.filter(d => d.data().role !== 'admin').length;
          const monthlyPool = activeRate * membersCount;

          // 3. Fetch Global Pending Queue to calculate position and wait time
          const pendingSnap = await getDocs(query(collection(db, 'transactions'), where('type', '==', 'credit_request'), where('status', '==', 'pending')));
          const globalQueue = pendingSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));

          // 4. Fetch User Transactions
          const txSnap = await getDocs(query(collection(db, 'transactions'), where('userId', '==', user.uid)));
          const allTxs = txSnap.docs
            .map(d => {
              const data = d.data();
              let queuePos = null;
              let estWait = null;
              
              if (data.type === 'credit_request' && data.status === 'pending') {
                const posIndex = globalQueue.findIndex(q => q.id === d.id);
                if (posIndex !== -1) {
                  queuePos = posIndex + 1;
                  const amtAhead = globalQueue.slice(0, posIndex).reduce((sum, q) => sum + (Number(q.amount) || 0), 0);
                  if (monthlyPool > 0) {
                    const totalNeeded = amtAhead + Number(data.amount);
                    const months = Math.ceil(totalNeeded / monthlyPool);
                    estWait = months <= 1 ? '~ This Month' : `~ ${months} Months`;
                  } else {
                    estWait = 'TBD';
                  }
                }
              }
              return { id: d.id, ...data, queuePos, estWait };
            })
            .filter(tx => (tx.type === 'credit_request' || tx.type === 'credit_repayment') && tx.status !== 'cancelled' && tx.status !== 'rejected')
            .sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0)); // Sort Oldest to Newest first to build lifecycles

          const pendingRequests = allTxs.filter(tx => tx.type === 'credit_request' && tx.status === 'pending');
          const approvedEvents = allTxs.filter(tx => tx.status === 'approved');

          // Group Approved Loans and their corresponding Repayments chronologically
          const cycles = [];
          let currentCycle = null;

          approvedEvents.forEach(tx => {
            if (tx.type === 'credit_request') {
              if (currentCycle) {
                cycles.push(currentCycle);
              }
              currentCycle = {
                loanTx: tx,
                repayments: [],
                totalRepaid: 0,
                loanAmount: Number(tx.amount) || 0
              };
            } else if (tx.type === 'credit_repayment') {
              if (!currentCycle) {
                currentCycle = {
                  loanTx: { id: 'legacy-' + tx.id, amount: Number(tx.amount) || 0, timestamp: tx.timestamp, type: 'credit_request', status: 'approved' },
                  repayments: [tx],
                  totalRepaid: Number(tx.amount) || 0,
                  loanAmount: Number(tx.amount) || 0
                };
              } else {
                currentCycle.repayments.push(tx);
                currentCycle.totalRepaid += (Number(tx.amount) || 0);
              }
            }
          });
          if (currentCycle) {
            cycles.push(currentCycle);
          }

          const activeDebt = uData?.activeCreditBalance || 0;
          let activeTxList = [...pendingRequests];
          let closedCycles = [];

          cycles.forEach((cycle, idx) => {
            const isLastCycle = idx === cycles.length - 1;
            const isClosed = (isLastCycle && activeDebt > 0) ? false : (cycle.totalRepaid >= cycle.loanAmount || !isLastCycle || activeDebt === 0);

            if (!isClosed) {
              setLatestLoanAmount(cycle.loanAmount);
              const lSec = cycle.loanTx.timestamp?.seconds || 0;
              const lDate = lSec ? new Date(lSec * 1000) : null;
              setLatestLoanDate(lDate ? `${String(lDate.getDate()).padStart(2, '0')}-${lDate.toLocaleString('en-US', { month: 'short' })}-${lDate.getFullYear()}` : '');
              activeTxList.push(cycle.loanTx, ...cycle.repayments);
            } else {
              const startSec = cycle.loanTx.timestamp?.seconds || 0;
              const lastRepay = cycle.repayments.length > 0 ? cycle.repayments[cycle.repayments.length - 1] : cycle.loanTx;
              const endSec = lastRepay.timestamp?.seconds || startSec;

              const startDateObj = startSec ? new Date(startSec * 1000) : null;
              const endDateObj = endSec ? new Date(endSec * 1000) : null;

              const formatFullDate = (d) => d ? `${String(d.getDate()).padStart(2, '0')}-${d.toLocaleString('en-US', { month: 'short' })}-${d.getFullYear()}` : 'N/A';

              let durationStr = 'Same Day';
              if (startDateObj && endDateObj && endSec > startSec) {
                const diffDays = Math.ceil((endDateObj - startDateObj) / (1000 * 60 * 60 * 24));
                if (diffDays >= 30) {
                  const months = Math.floor(diffDays / 30);
                  const remDays = diffDays % 30;
                  durationStr = `${months} Mo${months > 1 ? 's' : ''}${remDays > 0 ? ` ${remDays}d` : ''}`;
                } else {
                  durationStr = `${diffDays} Day${diffDays > 1 ? 's' : ''}`;
                }
              }

              // All transactions inside this closed loan (sorted newest first)
              const cycleTransactions = [
                { ...cycle.loanTx, customLabel: 'Loan Taken' },
                ...cycle.repayments.map((r, rIdx) => ({
                  ...r,
                  customLabel: rIdx === cycle.repayments.length - 1 ? 'Final EMI (Closed)' : 'EMI Repaid'
                }))
              ].sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));

              closedCycles.push({
                id: cycle.loanTx.id,
                loanAmount: cycle.loanAmount,
                totalRepaid: cycle.totalRepaid,
                takenDate: formatFullDate(startDateObj),
                closedDate: formatFullDate(endDateObj),
                duration: durationStr,
                emiCount: cycle.repayments.length,
                transactions: cycleTransactions
              });
            }
          });

          // Sort Current History & Closed Loans Newest First
          activeTxList.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
          closedCycles.reverse();

          setCurrentHistory(activeTxList);
          setClosedLoansList(closedCycles);
          if (closedCycles.length > 0) {
            setSelectedClosedLoan(closedCycles[0]);
          }
        } catch (err) { console.error(err); } finally { setLoading(false); }
      } else {
        navigate('/login');
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  const openDetails = (tx) => {
    setSelectedTx(tx);
    setShowModal(true);
  };

  if (loading) {
    return (
      <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto', marginTop: '40px' }}>
        <div style={{ height: '180px', backgroundColor: '#e2e8f0', borderRadius: '24px', animation: 'pulse 1.5s infinite' }}></div>
        <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ background: 'linear-gradient(180deg, #f4fdf8 0%, #fffbeb 100%)', minHeight: '100vh', paddingBottom: '90px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      
      {/* Curved Green Header with Closed Loans Button */}
      <div style={{ background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)', padding: '20px 16px 60px 16px', borderBottomLeftRadius: '28px', borderBottomRightRadius: '28px' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '17px', fontWeight: '900', color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.5px' }}>My Loans</h2>
            <p style={{ margin: '2px 0 0 0', color: '#dcfce7', fontSize: '9px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '1px' }}>Active Credit & Ledger</p>
          </div>
          
          <button 
            onClick={() => setShowClosedModal(true)} 
            style={{ backgroundColor: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.3)', padding: '7px 12px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '6px', color: '#ffffff', fontWeight: '900', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', cursor: 'pointer' }}
          >
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            Closed Loans
            {closedLoansList.length > 0 && (
              <span style={{ backgroundColor: '#ffffff', color: '#059669', borderRadius: '6px', padding: '1px 5px', fontSize: '9px', fontWeight: '900' }}>
                {closedLoansList.length}
              </span>
            )}
          </button>
        </div>
      </div>

      <div style={{ padding: '0 16px', maxWidth: '600px', margin: '0 auto', marginTop: '-42px', position: 'relative', zIndex: 10 }}>
        
        {/* Compact Summary Card: Recent Loan, Paid Amount & Outstanding Debt */}
        <div style={{ backgroundColor: '#ffffff', borderRadius: '20px', padding: '16px 18px', boxShadow: '0 8px 25px -5px rgba(6, 78, 59, 0.08)', border: '1px solid rgba(0,0,0,0.02)', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '12px' }}>
            
            {/* Recent Loan Taken */}
            <div style={{ flex: 1 }}>
              <p style={{ margin: '0 0 2px 0', fontSize: '8px', color: '#64748b', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Recent Loan</p>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '900', color: '#0f172a', letterSpacing: '-0.5px' }}>
                ₹{userData?.activeCreditBalance > 0 ? latestLoanAmount : 0}
              </h2>
              {userData?.activeCreditBalance > 0 && latestLoanDate && (
                <span style={{ fontSize: '8px', color: '#64748b', fontWeight: '800', textTransform: 'uppercase' }}>
                  {latestLoanDate}
                </span>
              )}
            </div>

            <div style={{ width: '1px', alignSelf: 'stretch', backgroundColor: '#e2e8f0' }}></div>

            {/* Paid Amount */}
            <div style={{ flex: 1, paddingLeft: '4px' }}>
              <p style={{ margin: '0 0 2px 0', fontSize: '8px', color: '#64748b', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Paid Amount</p>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '900', color: '#10b981', letterSpacing: '-0.5px' }}>
                ₹{userData?.activeCreditBalance > 0 ? Math.max(0, latestLoanAmount - (userData?.activeCreditBalance || 0)) : 0}
              </h2>
              <span style={{ fontSize: '8px', color: '#64748b', fontWeight: '800', textTransform: 'uppercase' }}>
                Total Paid
              </span>
            </div>

            <div style={{ width: '1px', alignSelf: 'stretch', backgroundColor: '#e2e8f0' }}></div>

            {/* Outstanding Debt */}
            <div style={{ flex: 1, paddingLeft: '4px' }}>
              <p style={{ margin: '0 0 2px 0', fontSize: '8px', color: '#64748b', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Outstanding</p>
              <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '900', color: userData?.activeCreditBalance > 0 ? '#ef4444' : '#10b981', letterSpacing: '-0.5px' }}>
                ₹{userData?.activeCreditBalance || 0}
              </h1>
              <span style={{ fontSize: '8px', color: '#64748b', fontWeight: '800', textTransform: 'uppercase' }}>
                Balance Due
              </span>
            </div>

          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', padding: '0 4px' }}>
          <h3 style={{ margin: 0, fontSize: '12px', color: '#0f172a', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Current Loan History</h3>
        </div>

        {/* Compact Current Loan History List */}
        <div style={{ backgroundColor: '#ffffff', borderRadius: '18px', padding: '4px', boxShadow: '0 4px 15px rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.02)' }}>
          {currentHistory.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center' }}>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: '11px', fontWeight: '700' }}>No active loan transactions.</p>
              {closedLoansList.length > 0 && (
                <p onClick={() => setShowClosedModal(true)} style={{ margin: '6px 0 0 0', color: '#059669', fontSize: '10px', fontWeight: '900', textTransform: 'uppercase', cursor: 'pointer' }}>
                  View {closedLoansList.length} Closed Loan{closedLoansList.length > 1 ? 's' : ''} →
                </p>
              )}
            </div>
          ) : (
            currentHistory.map((tx, idx) => {
              const isLoanTaken = tx.type === 'credit_request';
              const isPending = tx.status === 'pending';
              
              const origAmt = tx.originalAmount || tx.amount;
              const disbAmt = tx.disbursedAmount || 0;
              const hasBreakdown = isPending && (origAmt > tx.amount || disbAmt > 0);

              const dateObj = tx.timestamp?.seconds ? new Date(tx.timestamp.seconds * 1000) : null;
              const dateStr = dateObj ? `${String(dateObj.getDate()).padStart(2, '0')}-${dateObj.toLocaleString('en-US', { month: 'short' })}-${dateObj.getFullYear()}` : 'Just now';
              
              let iconBg = '#f0fdf4'; let iconCol = '#10b981'; let iconType = 'check';
              if (isLoanTaken) {
                if (isPending) { iconBg = '#fffbeb'; iconCol = '#d97706'; iconType = 'clock'; }
                else { iconBg = '#fef2f2'; iconCol = '#ef4444'; iconType = 'down'; }
              }

              let statusText = 'EMI Repaid';
              if (isLoanTaken) {
                statusText = isPending ? 'Loan Queued' : 'New Loan Taken';
              }

              return (
                <div key={tx.id} onClick={() => openDetails(tx)} style={{ display: 'flex', flexDirection: 'column', padding: '9px 12px', borderBottom: idx === currentHistory.length - 1 ? 'none' : '1px solid #f1f5f9', cursor: 'pointer' }}>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ backgroundColor: iconBg, width: '28px', height: '28px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: iconCol, flexShrink: 0 }}>
                        {iconType === 'check' && <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"></path></svg>}
                        {iconType === 'clock' && <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>}
                        {iconType === 'down' && <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path></svg>}
                      </div>
                      <div>
                        <p style={{ margin: '0 0 1px 0', fontWeight: '900', fontSize: '11px', color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.3px' }}>{statusText}</p>
                        <p style={{ margin: 0, fontSize: '9px', color: '#64748b', fontWeight: '800' }}>{dateStr}</p>
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                        <p style={{ margin: 0, fontWeight: '900', fontSize: '13px', color: isLoanTaken && !isPending ? '#ef4444' : (isPending ? '#d97706' : '#10b981') }}>
                          {isLoanTaken && !isPending ? '-' : (isPending ? '' : '+')}₹{tx.amount}
                        </p>
                        {isPending && (
                          <span style={{ fontSize: '8px', fontWeight: '900', color: '#d97706', backgroundColor: '#fffbeb', padding: '1px 5px', borderRadius: '4px', textTransform: 'uppercase' }}>Waiting</span>
                        )}
                      </div>
                      <svg width="11" height="11" fill="none" stroke="#cbd5e1" strokeWidth="3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"></path></svg>
                    </div>
                  </div>

                  {isPending && (
                    <div style={{ marginTop: '8px', padding: '6px 10px', backgroundColor: '#fffbeb', borderRadius: '8px', border: '1px dashed #fcd34d', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '9px', fontWeight: '900', color: '#d97706', textTransform: 'uppercase' }}>Queue: #{tx.queuePos}</span>
                      <span style={{ fontSize: '9px', fontWeight: '900', color: '#b45309', textTransform: 'uppercase' }}>Est: {tx.estWait}</span>
                    </div>
                  )}

                  {hasBreakdown && (
                    <div style={{ marginTop: '6px', padding: '5px 8px', backgroundColor: '#f8fafc', borderRadius: '6px', border: '1px dashed #cbd5e1', display: 'flex', justifyContent: 'space-between', fontSize: '8px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>
                      <span>Orig: ₹{origAmt}</span>
                      <span style={{ color: '#10b981' }}>Released: ₹{disbAmt}</span>
                      <span style={{ color: '#ef4444' }}>Waitlist: ₹{tx.amount}</span>
                    </div>
                  )}

                </div>
              );
            })
          )}
        </div>
      </div>

      {/* CLOSED LOANS MODAL */}
      {showClosedModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,23,42,0.65)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', backdropFilter: 'blur(4px)' }}>
          <div style={{ width: '100%', maxWidth: '360px', backgroundColor: '#ffffff', borderRadius: '24px', padding: '18px', animation: 'popIn 0.2s ease-out', boxSizing: 'border-box', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px rgba(0,0,0,0.25)' }}>
            
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '900', color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Closed Loans Archive</h4>
                <p style={{ margin: '2px 0 0 0', fontSize: '9px', color: '#64748b', fontWeight: '800', textTransform: 'uppercase' }}>Select a past loan to inspect</p>
              </div>
              <button onClick={() => setShowClosedModal(false)} style={{ background: '#f1f5f9', border: 'none', width: '28px', height: '28px', borderRadius: '50%', fontWeight: 'bold', cursor: 'pointer', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>✕</button>
            </div>

            {closedLoansList.length === 0 ? (
              <div style={{ padding: '30px 16px', textAlign: 'center', backgroundColor: '#f8fafc', borderRadius: '16px' }}>
                <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8', fontWeight: '800' }}>No closed loans found in your history.</p>
              </div>
            ) : (
              <>
                {/* Dropdown Selector for Closed Loans */}
                <div style={{ position: 'relative', marginBottom: '14px' }}>
                  <select
                    value={selectedClosedLoan?.id || ''}
                    onChange={(e) => {
                      const found = closedLoansList.find(c => c.id === e.target.value);
                      if (found) setSelectedClosedLoan(found);
                    }}
                    style={{ width: '100%', padding: '10px 30px 10px 12px', borderRadius: '12px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', fontSize: '11px', fontWeight: '900', color: '#0f172a', outline: 'none', appearance: 'none', cursor: 'pointer', textTransform: 'uppercase' }}
                  >
                    {closedLoansList.map((loan, index) => (
                      <option key={loan.id} value={loan.id}>
                        Loan #{closedLoansList.length - index}: ₹{loan.loanAmount}
                      </option>
                    ))}
                  </select>
                  <svg width="12" height="12" fill="none" stroke="#475569" strokeWidth="3" viewBox="0 0 24 24" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"></path>
                  </svg>
                </div>

                {/* Selected Closed Loan Summary Metrics */}
                {selectedClosedLoan && (
                  <div style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', paddingRight: '2px' }}>
                    
                    <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '14px', padding: '12px', marginBottom: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px dashed #bbf7d0' }}>
                        <div>
                          <span style={{ fontSize: '8px', fontWeight: '800', color: '#065f46', textTransform: 'uppercase', display: 'block' }}>Loan Amount</span>
                          <strong style={{ fontSize: '16px', fontWeight: '900', color: '#064e3b' }}>₹{selectedClosedLoan.loanAmount}</strong>
                        </div>
                        <span style={{ backgroundColor: '#10b981', color: '#ffffff', padding: '3px 8px', borderRadius: '6px', fontSize: '8px', fontWeight: '900', textTransform: 'uppercase' }}>
                          Closed in {selectedClosedLoan.duration}
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', textAlign: 'center' }}>
                        <div style={{ backgroundColor: '#ffffff', padding: '6px', borderRadius: '8px' }}>
                          <span style={{ fontSize: '8px', color: '#64748b', fontWeight: '800', textTransform: 'uppercase', display: 'block' }}>Taken On</span>
                          <strong style={{ fontSize: '9px', color: '#0f172a', fontWeight: '900' }}>{selectedClosedLoan.takenDate}</strong>
                        </div>
                        <div style={{ backgroundColor: '#ffffff', padding: '6px', borderRadius: '8px' }}>
                          <span style={{ fontSize: '8px', color: '#64748b', fontWeight: '800', textTransform: 'uppercase', display: 'block' }}>Closed On</span>
                          <strong style={{ fontSize: '9px', color: '#10b981', fontWeight: '900' }}>{selectedClosedLoan.closedDate}</strong>
                        </div>
                        <div style={{ backgroundColor: '#ffffff', padding: '6px', borderRadius: '8px' }}>
                          <span style={{ fontSize: '8px', color: '#64748b', fontWeight: '800', textTransform: 'uppercase', display: 'block' }}>Installments</span>
                          <strong style={{ fontSize: '9px', color: '#0f172a', fontWeight: '900' }}>{selectedClosedLoan.emiCount} EMIs</strong>
                        </div>
                      </div>
                    </div>

                    {/* Transactions for this Closed Loan */}
                    <p style={{ margin: '0 0 6px 2px', fontSize: '10px', fontWeight: '900', color: '#475569', textTransform: 'uppercase' }}>
                      Loan Transactions ({selectedClosedLoan.transactions.length})
                    </p>
                    <div style={{ backgroundColor: '#f8fafc', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '4px', overflowY: 'auto', maxHeight: '38vh' }}>
                      {selectedClosedLoan.transactions.map((tx, idx) => {
                        const isLoan = tx.type === 'credit_request';
                        const dObj = tx.timestamp?.seconds ? new Date(tx.timestamp.seconds * 1000) : null;
                        const dStr = dObj ? `${String(dObj.getDate()).padStart(2, '0')}-${dObj.toLocaleString('en-US', { month: 'short' })}-${dObj.getFullYear()}` : 'N/A';

                        return (
                          <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderBottom: idx === selectedClosedLoan.transactions.length - 1 ? 'none' : '1px solid #e2e8f0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div style={{ backgroundColor: isLoan ? '#fef2f2' : '#f0fdf4', width: '24px', height: '24px', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isLoan ? '#ef4444' : '#10b981' }}>
                                <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d={isLoan ? "M19 14l-7 7m0 0l-7-7m7 7V3" : "M5 13l4 4L19 7"}></path>
                                </svg>
                              </div>
                              <div>
                                <p style={{ margin: 0, fontSize: '10px', fontWeight: '900', color: '#0f172a', textTransform: 'uppercase' }}>{tx.customLabel}</p>
                                <p style={{ margin: 0, fontSize: '8px', color: '#64748b', fontWeight: '800' }}>{dStr}</p>
                              </div>
                            </div>
                            <span style={{ fontSize: '11px', fontWeight: '900', color: isLoan ? '#ef4444' : '#10b981' }}>
                              {isLoan ? '-' : '+'}₹{tx.amount}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Compact Transaction Details Modal */}
      {showModal && selectedTx && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,23,42,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', backdropFilter: 'blur(4px)' }}>
          <div style={{ width: '100%', maxWidth: '310px', backgroundColor: '#fff', borderRadius: '22px', padding: '18px', animation: 'popIn 0.2s ease-out', boxSizing: 'border-box', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '900', color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Transaction Info</h4>
              <button onClick={() => setShowModal(false)} style={{ background: '#f1f5f9', border: 'none', width: '26px', height: '26px', borderRadius: '50%', fontWeight: 'bold', cursor: 'pointer', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px' }}>✕</button>
            </div>
            
            <div style={{ backgroundColor: '#f8fafc', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              <div style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '9px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>Type</span>
                <span style={{ fontSize: '11px', fontWeight: '900', color: '#0f172a', textTransform: 'uppercase' }}>
                  {selectedTx.type === 'credit_request' ? 'Loan Entry' : 'EMI Repayment'}
                </span>
              </div>
              
              <div style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '9px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>Status</span>
                <span style={{ fontSize: '10px', fontWeight: '900', padding: '2px 7px', borderRadius: '5px', textTransform: 'uppercase', backgroundColor: selectedTx.status === 'pending' ? '#fef3c7' : '#d1fae5', color: selectedTx.status === 'pending' ? '#b45309' : '#065f46' }}>
                  {selectedTx.status}
                </span>
              </div>

              {selectedTx.type === 'credit_request' && selectedTx.status === 'pending' && (
                <>
                  <div style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '9px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>Queue Position</span>
                    <span style={{ fontSize: '11px', fontWeight: '900', color: '#d97706' }}>#{selectedTx.queuePos}</span>
                  </div>
                  <div style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '9px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>Est. Wait Time</span>
                    <span style={{ fontSize: '11px', fontWeight: '900', color: '#0f172a' }}>{selectedTx.estWait}</span>
                  </div>
                </>
              )}

              <div style={{ padding: '12px', backgroundColor: '#f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '9px', fontWeight: '900', color: '#475569', textTransform: 'uppercase' }}>Amount</span>
                <span style={{ fontSize: '15px', fontWeight: '900', color: selectedTx.type === 'credit_request' && selectedTx.status !== 'pending' ? '#ef4444' : '#10b981' }}>
                  ₹{selectedTx.amount}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes popIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }`}</style>
    </div>
  );
}
