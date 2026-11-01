import { useState, useEffect } from 'react';
import { collection, getDocs, doc, getDoc, addDoc, updateDoc, increment, serverTimestamp, query, where } from 'firebase/firestore';
import { db } from '../firebase/firebase';

export default function AdminPendingDues() {
  const [duesList, setDuesList] = useState([]);
  const [totals, setTotals] = useState({ savDues: 0, loanDues: 0 });
  const [loading, setLoading] = useState(true);

  // Log Cash Modal States
  const [showCashModal, setShowCashModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [cashForm, setCashForm] = useState({ savings: '', emi: '' });
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const fetchData = async () => {
    try {
      const setSnap = await getDoc(doc(db, 'settings', 'global'));
      const setData = setSnap.exists() ? setSnap.data() : {};
      let rates = setData.rates || [];
      if (rates.length === 0 && setData.mandatorySavingsAmount) {
        rates = [{ month: '2000-01', amount: setData.mandatorySavingsAmount }];
      }
      rates.sort((a, b) => b.month.localeCompare(a.month));

      const usersSnap = await getDocs(collection(db, 'users'));
      const allMembers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.role !== 'admin');

      const txSnap = await getDocs(query(collection(db, 'transactions'), where('status', '==', 'approved')));
      const allTx = txSnap.docs.map(d => d.data());

      let globalSavDues = 0;
      let globalLoanDues = 0;
      let membersWithDues = [];

      const now = new Date();
      const end = new Date(now.getFullYear(), now.getMonth(), 1);

      for (let u of allMembers) {
        let expectedSavings = 0;
        
        let jd = u.createdAt?.seconds ? new Date(u.createdAt.seconds * 1000) : new Date();
        const userTx = allTx.filter(tx => tx.userId === u.id).sort((a, b) => (a.timestamp?.seconds || Infinity) - (b.timestamp?.seconds || Infinity));
        if (!u.createdAt?.seconds && userTx.length > 0 && userTx[0].timestamp?.seconds) {
          jd = new Date(userTx[0].timestamp.seconds * 1000);
        }

        let curr = new Date(jd.getFullYear(), jd.getMonth(), 1);

        while (curr <= end) {
          let mStr = `${curr.getFullYear()}-${String(curr.getMonth() + 1).padStart(2, '0')}`;
          let activeRate = rates.find(r => r.month <= mStr);
          let expectedSav = activeRate ? activeRate.amount : (rates.length > 0 ? rates[rates.length - 1].amount : 0);
          expectedSavings += expectedSav;
          curr.setMonth(curr.getMonth() + 1);
        }

        const totalAccounted = u.totalSavings || 0;
        let savDue = expectedSavings - totalAccounted;
        if (savDue < 0) savDue = 0;

        let loanDue = u.activeCreditBalance || 0;

        if (savDue > 0 || loanDue > 0) {
          globalSavDues += savDue;
          globalLoanDues += loanDue;
          membersWithDues.push({ ...u, savDue, loanDue });
        }
      }

      membersWithDues.sort((a, b) => a.name.localeCompare(b.name));
      setDuesList(membersWithDues);
      setTotals({ savDues: globalSavDues, loanDues: globalLoanDues });

    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const openCashModal = (member) => {
    setSelectedMember(member);
    // Auto-fill savings due amount
    setCashForm({ 
      savings: member.savDue > 0 ? member.savDue.toString() : '', 
      emi: '' 
    });
    setShowCashModal(true);
  };

  const handleLogCash = async (e) => {
    e.preventDefault();
    const savAmt = Number(cashForm.savings) || 0;
    const emiAmt = Number(cashForm.emi) || 0;

    if (savAmt === 0 && emiAmt === 0) return alert("Please enter a Savings or EMI amount to log.");
    if (savAmt > selectedMember.savDue) return alert(`Cannot deposit more than pending savings due (₹${selectedMember.savDue})`);
    if (emiAmt > selectedMember.loanDue) return alert(`Cannot repay more than active loan balance (₹${selectedMember.loanDue})`);

    setIsProcessing(true);
    try {
      if (savAmt > 0) {
        await addDoc(collection(db, 'transactions'), {
          userId: selectedMember.id,
          userName: selectedMember.name,
          type: 'savings_deposit',
          amount: savAmt,
          status: 'approved',
          timestamp: serverTimestamp()
        });
        await updateDoc(doc(db, 'users', selectedMember.id), { totalSavings: increment(savAmt) });
      }

      if (emiAmt > 0) {
        await addDoc(collection(db, 'transactions'), {
          userId: selectedMember.id,
          userName: selectedMember.name,
          type: 'credit_repayment',
          amount: emiAmt,
          status: 'approved',
          timestamp: serverTimestamp()
        });
        await updateDoc(doc(db, 'users', selectedMember.id), { activeCreditBalance: increment(-emiAmt) });
      }
      
      setShowCashModal(false);
      setCashForm({ savings: '', emi: '' });
      fetchData(); // Refresh the list globally
    } catch (err) { alert(err.message); }
    setIsProcessing(false);
  };

  if (loading) {
    return (
      <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto', marginTop: '40px' }}>
        <div style={{ height: '200px', backgroundColor: '#e2e8f0', borderRadius: '28px', animation: 'pulse 1.5s infinite' }}></div>
        <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }`}</style>
      </div>
    );
  }

  const totalAmountToLog = (Number(cashForm.savings) || 0) + (Number(cashForm.emi) || 0);

  return (
    <div style={{ background: 'linear-gradient(180deg, #f4fdf8 0%, #fffbeb 100%)', minHeight: '100vh', paddingBottom: '130px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      
      {/* Curved Green Header */}
      <div style={{ background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)', padding: '24px 20px 65px 20px', borderBottomLeftRadius: '28px', borderBottomRightRadius: '28px' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '900', color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Pending Dues</h2>
          <p style={{ margin: '4px 0 0 0', color: '#dcfce7', fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '1px' }}>Savings & Loan Arrears</p>
        </div>
      </div>

      <div style={{ padding: '0 16px', maxWidth: '600px', margin: '0 auto', marginTop: '-45px', position: 'relative', zIndex: 10 }}>
        
        {/* SUMMARY CARDS (Side-by-Side) */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
          <div style={{ flex: 1, backgroundColor: '#ffffff', borderRadius: '24px', padding: '16px', boxShadow: '0 8px 25px -5px rgba(6, 78, 59, 0.08)', border: '1px solid rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <p style={{ margin: '0 0 4px 0', fontSize: '10px', color: '#64748b', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Sav Dues</p>
            <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '900', color: totals.savDues > 0 ? '#d97706' : '#10b981', letterSpacing: '-0.5px' }}>₹{totals.savDues}</h1>
          </div>
          <div style={{ flex: 1, backgroundColor: '#ffffff', borderRadius: '24px', padding: '16px', boxShadow: '0 8px 25px -5px rgba(6, 78, 59, 0.08)', border: '1px solid rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <p style={{ margin: '0 0 4px 0', fontSize: '10px', color: '#64748b', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Loan Due</p>
            <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '900', color: totals.loanDues > 0 ? '#ef4444' : '#10b981', letterSpacing: '-0.5px' }}>₹{totals.loanDues}</h1>
          </div>
        </div>

        <h3 style={{ margin: '0 0 12px 4px', fontSize: '13px', color: '#0f172a', fontWeight: '900' }}>MEMBERS WITH DUES ({duesList.length})</h3>

        {/* Compact Members List - Badges Always Show */}
        <div style={{ backgroundColor: '#ffffff', borderRadius: '24px', padding: '6px', boxShadow: '0 8px 25px -5px rgba(6, 78, 59, 0.08)', border: '1px solid rgba(0,0,0,0.02)' }}>
          {duesList.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center' }}>
              <p style={{ margin: 0, color: '#10b981', fontSize: '13px', fontWeight: '800' }}>Hooray! All clear. No dues found.</p>
            </div>
          ) : (
            duesList.map((m, idx) => (
              <div key={m.id} onClick={() => openCashModal(m)} style={{ padding: '12px 14px', borderBottom: idx === duesList.length - 1 ? 'none' : '1px solid #f1f5f9', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}>
                
                {/* Avatar */}
                <div style={{ backgroundColor: '#f0fdf4', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981', fontWeight: '900', fontSize: '14px', flexShrink: 0, border: '1px solid #dcfce7' }}>
                  {m.name?.charAt(0).toUpperCase()}
                </div>
                
                {/* Info & Badges Column */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  
                  {/* Top Row: Name & A/c */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                    <p style={{ margin: 0, fontWeight: '900', fontSize: '13px', color: '#0f172a', textTransform: 'uppercase', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{m.name}</p>
                    <span style={{ fontSize: '10px', color: '#64748b', fontWeight: '800', flexShrink: 0 }}>A/C: {m.accountNumber}</span>
                  </div>
                  
                  {/* Bottom Row: Dues Badges (Always Displayed) */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '10px', fontWeight: '900', color: m.savDue > 0 ? '#b45309' : '#065f46', backgroundColor: m.savDue > 0 ? '#fef3c7' : '#d1fae5', padding: '3px 8px', borderRadius: '6px' }}>
                      Sav: ₹{m.savDue}
                    </span>
                    <span style={{ fontSize: '10px', fontWeight: '900', color: m.loanDue > 0 ? '#b91c1c' : '#065f46', backgroundColor: m.loanDue > 0 ? '#fee2e2' : '#d1fae5', padding: '3px 8px', borderRadius: '6px' }}>
                      Loan: ₹{m.loanDue}
                    </span>
                  </div>

                </div>
                
                {/* Right Chevron Arrow */}
                <svg width="16" height="16" fill="none" stroke="#cbd5e1" strokeWidth="3" viewBox="0 0 24 24" style={{ flexShrink: 0 }}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"></path></svg>
              </div>
            ))
          )}
        </div>

      </div>

      {/* LOG CASH MODAL */}
      {showCashModal && selectedMember && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,23,42,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', backdropFilter: 'blur(4px)' }}>
          <div style={{ width: '100%', maxWidth: '340px', backgroundColor: '#fff', borderRadius: '24px', padding: '24px', animation: 'popIn 0.2s ease-out', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h4 style={{ margin: 0, fontSize: '16px', fontWeight: '900', color: '#0f172a' }}>Log Cash Entry</h4>
              <button onClick={() => setShowCashModal(false)} style={{ background: '#f1f5f9', border: 'none', width: '28px', height: '28px', borderRadius: '50%', fontWeight: 'bold', cursor: 'pointer', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>

            <form onSubmit={handleLogCash} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* Selected Member Readonly */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '10px', color: '#64748b', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Member Details</label>
                <div style={{ padding: '12px 14px', borderRadius: '12px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', fontSize: '13px', fontWeight: '800', color: '#0f172a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{selectedMember.name} (A/c: {selectedMember.accountNumber})</span>
                </div>
              </div>

              {/* SPECIAL DESIGN: Premium Dues Context Card */}
              <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', borderRadius: '16px', padding: '16px', color: '#ffffff', position: 'relative', overflow: 'hidden', boxShadow: '0 10px 20px -5px rgba(15, 23, 42, 0.25)' }}>
                <div style={{ position: 'absolute', right: '-15px', top: '-15px', opacity: 0.05 }}>
                  <svg width="100" height="100" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative', zIndex: 1 }}>
                  <div>
                    <p style={{ margin: '0 0 4px 0', fontSize: '10px', color: '#94a3b8', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Savings Due</p>
                    <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '900', color: selectedMember.savDue > 0 ? '#fde047' : '#34d399' }}>₹{selectedMember.savDue}</h2>
                  </div>
                  
                  <div style={{ width: '1px', alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.1)', margin: '0 8px' }}></div>
                  
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ margin: '0 0 4px 0', fontSize: '10px', color: '#94a3b8', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Loan Balance</p>
                    <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '900', color: selectedMember.loanDue > 0 ? '#fca5a5' : '#34d399' }}>₹{selectedMember.loanDue}</h2>
                  </div>
                </div>
              </div>

              {/* Side-by-Side Amount Inputs (Disabled if 0) */}
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '10px', color: '#64748b', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Savings (₹)</label>
                  <input 
                    type="number" 
                    placeholder="0" 
                    value={cashForm.savings} 
                    onChange={e => setCashForm({ ...cashForm, savings: e.target.value })} 
                    min="0" 
                    max={selectedMember.savDue} 
                    disabled={selectedMember.savDue === 0}
                    style={{ padding: '12px 14px', borderRadius: '12px', border: '1px solid #e2e8f0', width: '100%', boxSizing: 'border-box', fontSize: '14px', fontWeight: '900', outline: 'none', backgroundColor: selectedMember.savDue === 0 ? '#f1f5f9' : '#ffffff', opacity: selectedMember.savDue === 0 ? 0.5 : 1, transition: 'all 0.2s ease' }} 
                  />
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '10px', color: '#64748b', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.5px' }}>EMI (₹)</label>
                  <input 
                    type="number" 
                    placeholder="0" 
                    value={cashForm.emi} 
                    onChange={e => setCashForm({ ...cashForm, emi: e.target.value })} 
                    min="0" 
                    max={selectedMember.loanDue} 
                    disabled={selectedMember.loanDue === 0}
                    style={{ padding: '12px 14px', borderRadius: '12px', border: '1px solid #e2e8f0', width: '100%', boxSizing: 'border-box', fontSize: '14px', fontWeight: '900', outline: 'none', backgroundColor: selectedMember.loanDue === 0 ? '#f1f5f9' : '#ffffff', opacity: selectedMember.loanDue === 0 ? 0.5 : 1, transition: 'all 0.2s ease' }} 
                  />
                </div>
              </div>

              {/* Automatic Total Calculation Bar */}
              {totalAmountToLog > 0 && (
                <div style={{ padding: '12px 14px', backgroundColor: '#f0fdf4', borderRadius: '12px', border: '1px dashed #10b981', display: 'flex', justifyContent: 'space-between', alignItems: 'center', animation: 'popIn 0.2s ease-out' }}>
                  <span style={{ fontSize: '11px', fontWeight: '900', color: '#065f46', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Payment</span>
                  <span style={{ fontSize: '16px', fontWeight: '900', color: '#10b981' }}>₹{totalAmountToLog}</span>
                </div>
              )}

              <button type="submit" disabled={isProcessing || totalAmountToLog === 0} style={{ padding: '14px', backgroundColor: '#10b981', color: '#fff', border: 'none', borderRadius: '14px', fontWeight: '900', fontSize: '13px', textTransform: 'uppercase', cursor: (isProcessing || totalAmountToLog === 0) ? 'not-allowed' : 'pointer', opacity: (isProcessing || totalAmountToLog === 0) ? 0.6 : 1, marginTop: '4px', transition: 'opacity 0.2s ease' }}>
                {isProcessing ? 'Processing...' : 'Log Payment'}
              </button>
            </form>
          </div>
        </div>
      )}

      <style>{`@keyframes popIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }`}</style>
    </div>
  );
}
