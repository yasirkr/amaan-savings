import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, addDoc, doc, getDoc, updateDoc, increment, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { useNavigate } from 'react-router-dom';

export default function AdminLoanQueue() {
  const [queue, setQueue] = useState([]);
  const [members, setMembers] = useState([]);
  const [stats, setStats] = useState({ available: 0, required: 0, monthlyInflux: 0 });
  const [loading, setLoading] = useState(true);
  
  const [showQueueModal, setShowQueueModal] = useState(false);
  const [queueForm, setQueueForm] = useState({ memberId: '', amount: '' });
  
  // Unified Manage Modal State
  const [showManageModal, setShowManageModal] = useState(false);
  const [selectedTx, setSelectedTx] = useState(null);
  const [manageAmount, setManageAmount] = useState('');
  
  const [isProcessing, setIsProcessing] = useState(false);
  const navigate = useNavigate();

  const fetchData = async () => {
    try {
      const setSnap = await getDoc(doc(db, 'settings', 'global'));
      const mandatoryAmt = setSnap.exists() ? (setSnap.data().mandatorySavingsAmount || 0) : 0;

      const usersSnap = await getDocs(collection(db, 'users'));
      const membersList = usersSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.role !== 'admin');
      setMembers(membersList.sort((a, b) => a.name.localeCompare(b.name)));

      let totalSav = 0, totalCred = 0;
      membersList.forEach(m => {
        totalSav += (m.totalSavings || 0);
        totalCred += (m.activeCreditBalance || 0);
      });
      const availableFund = totalSav - totalCred;

      const txSnap = await getDocs(query(collection(db, 'transactions'), where('type', '==', 'credit_request'), where('status', '==', 'pending')));
      const qList = txSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));
      
      const totalRequired = qList.reduce((sum, tx) => sum + Number(tx.amount), 0);
      const influx = membersList.length * mandatoryAmt; 

      setStats({ available: availableFund, required: totalRequired, monthlyInflux: influx });
      setQueue(qList);
    } catch (error) { console.error(error); } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const handleAddQueue = async (e) => {
    e.preventDefault();
    const lAmt = Number(queueForm.amount);
    const sm = members.find(m => m.id === queueForm.memberId);
    
    if (!sm || !lAmt || lAmt <= 0) return alert("Valid member and amount required.");

    const isAlreadyQueued = queue.some(tx => tx.userId === sm.id);
    if (isAlreadyQueued) return alert(`${sm.name} is already in the waitlist!`);

    setIsProcessing(true);
    try {
      await addDoc(collection(db, 'transactions'), {
        userId: sm.id, userName: sm.name, type: 'credit_request', amount: lAmt, status: 'pending', timestamp: serverTimestamp()
      });
      setShowQueueModal(false); setQueueForm({ memberId: '', amount: '' }); fetchData();
    } catch (err) { alert('Error: ' + err.message); }
    setIsProcessing(false);
  };

  const openManageModal = (tx) => {
    setSelectedTx(tx);
    setManageAmount(tx.availableForThis || '');
    setShowManageModal(true);
  };

  const handleDisburse = async (e) => {
    e.preventDefault();
    const dAmt = Number(manageAmount);
    const reqAmt = selectedTx.amount;
    const origAmt = selectedTx.originalAmount || reqAmt;
    const disbAmt = selectedTx.disbursedAmount || 0;
    
    if (!dAmt || dAmt <= 0) return alert("Enter a valid amount.");
    if (dAmt > reqAmt) return alert(`Cannot exceed pending amount of ₹${reqAmt}`);
    if (dAmt > stats.available) return alert(`Insufficient bank funds! Only ₹${stats.available} available.`);

    setIsProcessing(true);
    try {
      if (dAmt === reqAmt) {
        await updateDoc(doc(db, 'transactions', selectedTx.id), { 
          status: 'approved', 
          timestamp: serverTimestamp() 
        });
      } else {
        await addDoc(collection(db, 'transactions'), {
          userId: selectedTx.userId, userName: selectedTx.userName, type: 'credit_request', amount: dAmt, status: 'approved', timestamp: serverTimestamp()
        });
        const remainingAmt = reqAmt - dAmt;
        const newDisbursed = disbAmt + dAmt;
        await updateDoc(doc(db, 'transactions', selectedTx.id), { 
          amount: remainingAmt,
          originalAmount: origAmt,
          disbursedAmount: newDisbursed
        });
      }
      
      await updateDoc(doc(db, 'users', selectedTx.userId), { activeCreditBalance: increment(dAmt) });
      
      setShowManageModal(false); 
      setSelectedTx(null);
      fetchData();
    } catch (err) { alert(err.message); }
    setIsProcessing(false);
  };

  const handleCancelQueue = async () => {
    if (!window.confirm("Are you sure you want to cancel this waitlist request?")) return;
    setIsProcessing(true);
    try {
      await updateDoc(doc(db, 'transactions', selectedTx.id), { status: 'cancelled' });
      setShowManageModal(false);
      setSelectedTx(null);
      fetchData();
    } catch (err) { alert('Error: ' + err.message); }
    setIsProcessing(false);
  };

  let simAvailable = stats.available;
  let cumulativeDeficit = 0;
  
  const enrichedQueue = queue.map((tx) => {
    let isFullyFunded = false;
    let isPartiallyFunded = false;
    let statusMsg = '';
    let availableForThis = 0;
    
    if (simAvailable >= tx.amount) {
      isFullyFunded = true;
      availableForThis = tx.amount;
      statusMsg = 'Funds Available';
      simAvailable -= tx.amount; 
    } else if (simAvailable > 0) {
      isPartiallyFunded = true;
      availableForThis = simAvailable;
      let shortfall = tx.amount - simAvailable;
      simAvailable = 0;
      cumulativeDeficit += shortfall;
      let monthsWait = stats.monthlyInflux > 0 ? Math.ceil(cumulativeDeficit / stats.monthlyInflux) : 0;
      statusMsg = `Partial Funds Avail. Wait: ~${monthsWait} mo`;
    } else {
      let shortfall = tx.amount;
      cumulativeDeficit += shortfall;
      let monthsWait = stats.monthlyInflux > 0 ? Math.ceil(cumulativeDeficit / stats.monthlyInflux) : 0;
      statusMsg = monthsWait > 0 ? `Est. Wait: ~${monthsWait} month${monthsWait > 1 ? 's' : ''}` : 'Wait time unknown';
    }

    return { ...tx, isFullyFunded, isPartiallyFunded, availableForThis, statusMsg };
  });

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
      
      <div style={{ background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)', padding: '24px 20px 65px 20px', borderBottomLeftRadius: '28px', borderBottomRightRadius: '28px' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '900', color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Loan Queue</h2>
              <p style={{ margin: '4px 0 0 0', color: '#dcfce7', fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '1px' }}>Member Waitlist</p>
            </div>
            <button onClick={() => setShowQueueModal(true)} style={{ backgroundColor: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', padding: '8px 12px', borderRadius: '12px', color: '#ffffff', fontWeight: '900', fontSize: '11px', textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"></path></svg> Add
            </button>
          </div>
        </div>
      </div>

      <div style={{ padding: '0 16px', maxWidth: '600px', margin: '0 auto', marginTop: '-45px', position: 'relative', zIndex: 10 }}>
        
        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
          <div style={{ flex: 1, backgroundColor: '#ffffff', borderRadius: '24px', padding: '16px', boxShadow: '0 8px 25px -5px rgba(6, 78, 59, 0.08)', border: '1px solid rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <p style={{ margin: '0 0 4px 0', fontSize: '10px', color: '#64748b', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Available Fund</p>
            <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '900', color: '#10b981', letterSpacing: '-0.5px' }}>₹{stats.available}</h1>
          </div>
          <div style={{ flex: 1, backgroundColor: '#ffffff', borderRadius: '24px', padding: '16px', boxShadow: '0 8px 25px -5px rgba(6, 78, 59, 0.08)', border: '1px solid rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <p style={{ margin: '0 0 4px 0', fontSize: '10px', color: '#64748b', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Required Fund</p>
            <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '900', color: '#d97706', letterSpacing: '-0.5px' }}>₹{stats.required}</h1>
          </div>
        </div>

        <h3 style={{ margin: '0 0 12px 4px', fontSize: '13px', color: '#0f172a', fontWeight: '900' }}>WAITLIST ({queue.length})</h3>

        <div style={{ backgroundColor: '#ffffff', borderRadius: '24px', padding: '6px', boxShadow: '0 8px 25px -5px rgba(6, 78, 59, 0.08)', border: '1px solid rgba(0,0,0,0.02)' }}>
          {enrichedQueue.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center' }}>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: '12px', fontWeight: '800' }}>The queue is currently empty.</p>
            </div>
          ) : (
            enrichedQueue.map((tx, idx) => {
              const dateObj = tx.timestamp?.seconds ? new Date(tx.timestamp.seconds * 1000) : null;
              const dateStr = dateObj ? dateObj.toLocaleDateString('en-GB') : 'Just now';
              
              return (
                <div key={tx.id} onClick={() => openManageModal(tx)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 14px', borderBottom: idx === enrichedQueue.length - 1 ? 'none' : '1px solid #f1f5f9', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ backgroundColor: (tx.isFullyFunded || tx.isPartiallyFunded) ? '#dcfce7' : '#fffbeb', width: '38px', height: '38px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: (tx.isFullyFunded || tx.isPartiallyFunded) ? '#16a34a' : '#d97706', flexShrink: 0 }}>
                      {(tx.isFullyFunded || tx.isPartiallyFunded) ? (
                        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                      ) : (
                        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                      )}
                    </div>
                    <div>
                      <p style={{ margin: '0 0 2px 0', fontWeight: '900', fontSize: '13px', color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{tx.userName || 'Member'}</p>
                      <p style={{ margin: 0, fontSize: '10px', color: (tx.isFullyFunded || tx.isPartiallyFunded) ? '#16a34a' : '#d97706', fontWeight: '800' }}>{tx.statusMsg}</p>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div>
                      <p style={{ margin: '0 0 2px 0', fontWeight: '900', fontSize: '15px', color: '#ef4444' }}>₹{tx.amount}</p>
                      <p style={{ margin: 0, fontSize: '9px', color: '#94a3b8', fontWeight: '700' }}>Q'd: {dateStr}</p>
                    </div>
                    <svg width="16" height="16" fill="none" stroke="#cbd5e1" strokeWidth="3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"></path></svg>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {showQueueModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,23,42,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', backdropFilter: 'blur(4px)' }}>
          <div style={{ width: '100%', maxWidth: '340px', backgroundColor: '#fff', borderRadius: '28px', padding: '24px', animation: 'popIn 0.2s ease-out', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h4 style={{ margin: 0, fontSize: '18px', fontWeight: '900', color: '#0f172a', textTransform: 'uppercase' }}>Add to Queue</h4>
              <button onClick={() => { setShowQueueModal(false); setQueueForm({ memberId: '', amount: '' }); }} style={{ background: '#f1f5f9', border: 'none', width: '32px', height: '32px', borderRadius: '50%', fontWeight: 'bold', cursor: 'pointer', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>
            <form onSubmit={handleAddQueue} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '11px', color: '#64748b', fontWeight: '800', textTransform: 'uppercase' }}>Select Member</label>
                <select value={queueForm.memberId} onChange={(e) => setQueueForm({ ...queueForm, memberId: e.target.value })} required style={{ padding: '14px', borderRadius: '16px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', fontSize: '14px', fontWeight: '700', outline: 'none' }}>
                  <option value="">-- Choose Member --</option>
                  {members.map(m => {
                    const isQueued = queue.some(tx => tx.userId === m.id);
                    return (
                      <option key={m.id} value={m.id} disabled={isQueued}>
                        {m.name} (A/c: {m.accountNumber}) {isQueued ? '— Already Queued' : ''}
                      </option>
                    )
                  })}
                </select>
              </div>
              {queueForm.memberId && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', color: '#64748b', fontWeight: '800', textTransform: 'uppercase' }}>Requested Amount (₹)</label>
                  <input type="number" placeholder="0" value={queueForm.amount} onChange={e => setQueueForm({ ...queueForm, amount: e.target.value })} min="1" required style={{ padding: '14px', borderRadius: '16px', border: '1px solid #e2e8f0', width: '100%', boxSizing: 'border-box', fontSize: '14px', fontWeight: '700', outline: 'none' }} />
                </div>
              )}
              <button type="submit" disabled={isProcessing} style={{ padding: '16px', backgroundColor: '#d97706', color: '#fff', border: 'none', borderRadius: '16px', fontWeight: '900', fontSize: '14px', textTransform: 'uppercase', cursor: 'pointer', marginTop: '8px' }}>{isProcessing ? 'Processing...' : 'Add to Queue'}</button>
            </form>
          </div>
        </div>
      )}

      {showManageModal && selectedTx && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,23,42,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', backdropFilter: 'blur(4px)' }}>
          <div style={{ width: '100%', maxWidth: '340px', backgroundColor: '#fff', borderRadius: '28px', padding: '24px', animation: 'popIn 0.2s ease-out', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h4 style={{ margin: 0, fontSize: '18px', fontWeight: '900', color: '#0f172a', textTransform: 'uppercase' }}>Manage Request</h4>
              <button onClick={() => setShowManageModal(false)} style={{ background: '#f1f5f9', border: 'none', width: '32px', height: '32px', borderRadius: '50%', fontWeight: 'bold', cursor: 'pointer', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>
            
            <div style={{ padding: '16px', backgroundColor: '#f8fafc', borderRadius: '16px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
              <p style={{ margin: '0 0 8px 0', fontSize: '11px', color: '#64748b', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{selectedTx.userName}</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>Orig Requested:</span>
                <span style={{ fontSize: '14px', fontWeight: '900', color: '#0f172a' }}>₹{selectedTx.originalAmount || selectedTx.amount}</span>
              </div>
              {selectedTx.disbursedAmount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>Already Released:</span>
                  <span style={{ fontSize: '14px', fontWeight: '900', color: '#10b981' }}>₹{selectedTx.disbursedAmount}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>Pending Waitlist:</span>
                <span style={{ fontSize: '14px', fontWeight: '900', color: '#ef4444' }}>₹{selectedTx.amount}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #cbd5e1', paddingTop: '10px' }}>
                <span style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>Bank Funds Avail:</span>
                <span style={{ fontSize: '14px', fontWeight: '900', color: '#10b981' }}>₹{stats.available}</span>
              </div>
            </div>

            {(selectedTx.isFullyFunded || selectedTx.isPartiallyFunded) ? (
              <form onSubmit={handleDisburse} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', color: '#64748b', fontWeight: '800', textTransform: 'uppercase' }}>Issue Amount (₹)</label>
                  <input type="number" value={manageAmount} onChange={e => setManageAmount(e.target.value)} min="1" max={Math.min(selectedTx.amount, stats.available)} required style={{ padding: '14px', borderRadius: '16px', border: '1px solid #e2e8f0', width: '100%', boxSizing: 'border-box', fontSize: '15px', fontWeight: '900', outline: 'none', color: '#0f172a' }} />
                  <span style={{ fontSize: '10px', color: '#64748b', fontWeight: '600', lineHeight: '1.4', marginTop: '4px' }}>
                    If you issue a partial amount, the remainder will stay in the queue.
                  </span>
                </div>
                <button type="submit" disabled={isProcessing} style={{ padding: '16px', background: selectedTx.isFullyFunded ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', color: '#fff', border: 'none', borderRadius: '16px', fontWeight: '900', fontSize: '14px', textTransform: 'uppercase', cursor: 'pointer' }}>
                  {isProcessing ? 'Processing...' : (selectedTx.isFullyFunded ? 'Issue Loan Now' : 'Issue Partial Loan')}
                </button>
              </form>
            ) : (
              <div style={{ padding: '16px', backgroundColor: '#fffbeb', borderRadius: '16px', border: '1px solid #fde68a', marginBottom: '16px', textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: '12px', color: '#d97706', fontWeight: '800', lineHeight: '1.5' }}>Insufficient funds to issue this loan right now. <br/>{selectedTx.statusMsg}</p>
              </div>
            )}

            <button onClick={handleCancelQueue} disabled={isProcessing} style={{ width: '100%', padding: '16px', backgroundColor: '#fef2f2', color: '#ef4444', border: 'none', borderRadius: '16px', fontWeight: '900', fontSize: '14px', textTransform: 'uppercase', cursor: 'pointer' }}>
              Cancel Request
            </button>
          </div>
        </div>
      )}

      <style>{`@keyframes popIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }`}</style>
    </div>
  );
}
