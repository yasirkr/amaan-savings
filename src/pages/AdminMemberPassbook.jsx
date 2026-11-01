import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import html2canvas from 'html2canvas';

export default function AdminMemberPassbook() {
  const { id } = useParams();
  const [member, setMember] = useState(null);
  const [monthsData, setMonthsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  
  const [isSharing, setIsSharing] = useState(false);
  const reportRef = useRef(null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', id));
        if (!userDoc.exists()) { setLoading(false); return; }
        const uData = { id: userDoc.id, ...userDoc.data() };
        setMember(uData);

        const setSnap = await getDoc(doc(db, 'settings', 'global'));
        const setData = setSnap.exists() ? setSnap.data() : {};
        let rates = setData.rates || [];
        if (rates.length === 0 && setData.mandatorySavingsAmount) rates = [{ month: '2000-01', amount: setData.mandatorySavingsAmount }];
        rates.sort((a, b) => b.month.localeCompare(a.month));

        const q = query(collection(db, 'transactions'), where('userId', '==', id));
        const txSnapshot = await getDocs(q);
        const approvedTx = txSnapshot.docs.map(d => ({ id: d.id, ...d.data() })).filter(tx => tx.status === 'approved').sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
        
        let jd = uData?.createdAt?.seconds ? new Date(uData.createdAt.seconds * 1000) : new Date();
        if (!uData?.createdAt?.seconds && approvedTx.length > 0) {
          const earliest = approvedTx.reduce((min, tx) => ((tx.timestamp?.seconds || Infinity) < (min.timestamp?.seconds || Infinity) ? tx : min), approvedTx[0]);
          if (earliest?.timestamp?.seconds) jd = new Date(earliest.timestamp.seconds * 1000);
        }

        let curr = new Date(jd.getFullYear(), jd.getMonth(), 1);
        let now = new Date(); let end = new Date(now.getFullYear(), now.getMonth(), 1);
        let mList = [];

        while (curr <= end) {
          let mStr = `${curr.getFullYear()}-${String(curr.getMonth() + 1).padStart(2, '0')}`;
          let activeRate = rates.find(r => r.month <= mStr);
          let expectedSav = activeRate ? activeRate.amount : (rates.length > 0 ? rates[rates.length - 1].amount : 0);

          mList.push({ id: mStr, dateObj: new Date(curr), expectedSavings: expectedSav, actualSavings: 0, loanRepaid: 0, loanTaken: 0 });
          curr.setMonth(curr.getMonth() + 1);
        }

        approvedTx.forEach(tx => {
          let txDate = tx.timestamp?.seconds ? new Date(tx.timestamp.seconds * 1000) : new Date();
          let mStr = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}`;
          let mObj = mList.find(m => m.id === mStr);
          if (!mObj) {
            mObj = { id: mStr, dateObj: txDate, expectedSavings: 0, actualSavings: 0, loanRepaid: 0, loanTaken: 0 };
            mList.push(mObj);
          } else {
            mObj.dateObj = txDate;
          }
          if (tx.type === 'savings_deposit') mObj.actualSavings += tx.amount;
          if (tx.type === 'credit_repayment') mObj.loanRepaid += tx.amount;
          if (tx.type === 'credit_request') mObj.loanTaken += tx.amount;
        });

        mList.sort((a, b) => a.id.localeCompare(b.id));
        let runningLoan = 0;
        mList.forEach(m => {
           runningLoan += m.loanTaken;
           runningLoan -= m.loanRepaid;
           if (runningLoan < 0) runningLoan = 0;
           m.runningLoan = runningLoan;
        });

        mList.sort((a, b) => b.id.localeCompare(a.id));
        setMonthsData(mList);
      } catch (err) { console.error(err); } finally { setLoading(false); }
    };
    fetchData();
  }, [id]);

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
        const file = new File([blob], `${member?.name.replace(/\s+/g, '_')}_Passbook.png`, { type: 'image/png' });
        
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: 'Amaan Passbook Report',
            files: [file]
          });
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = `${member?.name.replace(/\s+/g, '_')}_Passbook.png`; a.click();
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

  if (loading) {
    return (
      <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto', marginTop: '40px' }}>
        <div style={{ height: '200px', backgroundColor: '#e2e8f0', borderRadius: '28px', animation: 'pulse 1.5s infinite' }}></div>
      </div>
    );
  }

  if (!member) return <div style={{ padding: '20px', textAlign: 'center' }}>Member not found.</div>;

  const availableYears = [...new Set(monthsData.map(m => m.id.substring(0, 4)))].sort((a, b) => b.localeCompare(a));
  const filteredData = selectedYear === 'All' ? monthsData : monthsData.filter(m => m.id.startsWith(selectedYear));

  return (
    <div style={{ background: 'linear-gradient(180deg, #f4fdf8 0%, #fffbeb 100%)', minHeight: '100vh', paddingBottom: '130px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)', padding: '24px 20px 65px 20px', borderBottomLeftRadius: '28px', borderBottomRightRadius: '28px' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '900', color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Passbook</h2>
            <p style={{ margin: '4px 0 0 0', color: '#dcfce7', fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '1px' }}>Ledger Breakdown</p>
          </div>
          
          {/* Action Row: Year Selector & Share Button */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <select 
                value={selectedYear} 
                onChange={(e) => setSelectedYear(e.target.value)}
                style={{ backgroundColor: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', padding: '6px 26px 6px 12px', borderRadius: '10px', color: '#ffffff', fontWeight: '900', fontSize: '12px', outline: 'none', cursor: 'pointer', appearance: 'none' }}
              >
                <option value="All" style={{ color: '#0f172a' }}>All Time</option>
                {availableYears.map(y => <option key={y} value={y} style={{ color: '#0f172a' }}>{y}</option>)}
              </select>
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24" style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', color: '#ffffff', pointerEvents: 'none' }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"></path>
              </svg>
            </div>
            
            {/* HD SHARE BUTTON */}
            <button onClick={handleShareImage} disabled={isSharing} style={{ backgroundColor: '#ffffff', border: 'none', width: '28px', height: '28px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981', cursor: isSharing ? 'wait' : 'pointer', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}>
              {isSharing ? (
                <div style={{ width: '14px', height: '14px', border: '2px solid #e2e8f0', borderTop: '2px solid #10b981', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
              ) : (
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"></path></svg>
              )}
            </button>
          </div>
        </div>
      </div>

      <div style={{ padding: '0 16px', maxWidth: '600px', margin: '0 auto', marginTop: '-45px', position: 'relative', zIndex: 10 }}>
        
        {/* Passbook Frame - Wrapped in ref for HD Capture */}
        <div ref={reportRef} style={{ backgroundColor: '#ffffff', padding: '24px', borderRadius: '16px', boxShadow: '0 10px 40px rgba(0,0,0,0.05)', boxSizing: 'border-box', WebkitFontSmoothing: 'antialiased', textRendering: 'optimizeLegibility' }}>
          
          {/* Amaan Bank Branding & Member Details */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '900', color: '#064e3b', letterSpacing: '-0.5px', display: 'flex', alignItems: 'baseline' }}>
                  amaan<span style={{ fontSize: '30px', fontWeight: '900', color: '#10b981', lineHeight: '0' }}>.</span>
                </h2>
                <p style={{ margin: 0, fontSize: '9px', color: '#d97706', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '1px', marginTop: '4px' }}>Islamic Banking System</p>
              </div>
            <div style={{ textAlign: 'right' }}>
              <h3 style={{ margin: '0 0 2px 0', fontSize: '13px', fontWeight: '900', color: '#0f172a', textTransform: 'uppercase' }}>{member.name}</h3>
              <p style={{ margin: 0, fontSize: '9px', color: '#64748b', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.5px' }}>A/C: {member.accountNumber || 'N/A'}</p>
            </div>
          </div>

          <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ backgroundColor: '#f8fafc' }}>
              <tr style={{ borderBottom: '2px solid #0f172a' }}>
                <th style={{ width: '28%', padding: '10px 4px', fontSize: '9px', fontWeight: '900', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date</th>
                <th style={{ width: '18%', padding: '10px 4px', fontSize: '9px', fontWeight: '900', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right' }}>Savings</th>
                <th style={{ width: '18%', padding: '10px 4px', fontSize: '9px', fontWeight: '900', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right' }}>Loan</th>
                <th style={{ width: '18%', padding: '10px 4px', fontSize: '9px', fontWeight: '900', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right' }}>EMI</th>
                <th style={{ width: '18%', padding: '10px 4px', fontSize: '9px', fontWeight: '900', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right' }}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.length === 0 ? (
                <tr><td colSpan="5" style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '11px', fontWeight: '700' }}>No records found for {selectedYear}.</td></tr>
              ) : (
                filteredData.map((m, i) => {
                  const hasActivity = m.actualSavings > 0 || m.loanTaken > 0 || m.loanRepaid > 0;
                  if (!hasActivity && selectedYear !== 'All') return null;

                  const d = m.dateObj;
                  const dateStr = `${String(d.getDate()).padStart(2, '0')}-${d.toLocaleString('en-US', { month: 'short' })}-${d.getFullYear()}`;
                  
                  return (
                    <tr key={m.id} style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: i % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                      <td style={{ padding: '8px 4px', fontSize: '9px', fontWeight: '900', color: '#0f172a', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{dateStr}</td>
                      <td style={{ padding: '8px 4px', fontSize: '9px', fontWeight: '800', color: m.actualSavings > 0 ? '#10b981' : '#cbd5e1', textAlign: 'right' }}>{m.actualSavings > 0 ? `₹${m.actualSavings}` : '-'}</td>
                      <td style={{ padding: '8px 4px', fontSize: '9px', fontWeight: '800', color: m.loanTaken > 0 ? '#d97706' : '#cbd5e1', textAlign: 'right' }}>{m.loanTaken > 0 ? `₹${m.loanTaken}` : '-'}</td>
                      <td style={{ padding: '8px 4px', fontSize: '9px', fontWeight: '800', color: m.loanRepaid > 0 ? '#ef4444' : '#cbd5e1', textAlign: 'right' }}>{m.loanRepaid > 0 ? `₹${m.loanRepaid}` : '-'}</td>
                      <td style={{ padding: '8px 4px', fontSize: '9px', fontWeight: '900', color: m.runningLoan > 0 ? '#ef4444' : '#10b981', textAlign: 'right' }}>₹{m.runningLoan}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>

        </div>
      </div>
      <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
