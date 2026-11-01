import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/firebase';

export default function MemberStatement() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [member, setMember] = useState(null);
  const [dueAmount, setDueAmount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Edit Profile Modal States
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', mobile: '', dob: '', upiId: '' });
  const [photoBase64, setPhotoBase64] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Scroll to top on load
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  const fetchData = async () => {
    try {
      const userDoc = await getDoc(doc(db, 'users', id));
      if (!userDoc.exists()) { setLoading(false); return; }
      const uData = { id: userDoc.id, ...userDoc.data() };
      setMember(uData);
      setEditForm({ name: uData.name || '', mobile: uData.mobile || '', dob: uData.dob || '', upiId: uData.upiId || '' });
      setPhotoBase64(uData.photo || '');

      // Get Global Settings for Dues Calculation
      const setSnap = await getDoc(doc(db, 'settings', 'global'));
      const setData = setSnap.exists() ? setSnap.data() : {};
      let rates = setData.rates || [];
      if (rates.length === 0 && setData.mandatorySavingsAmount) rates = [{ month: '2000-01', amount: setData.mandatorySavingsAmount }];
      rates.sort((a, b) => b.month.localeCompare(a.month));

      const q = query(collection(db, 'transactions'), where('userId', '==', id));
      const txSnapshot = await getDocs(q);
      const allTx = txSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      
      const approvedTx = allTx.filter(tx => tx.status === 'approved').sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
      const pendingSavingsAmt = allTx.filter(tx => tx.type === 'savings_deposit' && tx.status === 'pending').reduce((sum, tx) => sum + tx.amount, 0);

      let expectedSavings = 0;
      let jd = uData?.createdAt?.seconds ? new Date(uData.createdAt.seconds * 1000) : new Date();
      if (!uData?.createdAt?.seconds && approvedTx.length > 0) {
        const earliest = approvedTx.reduce((min, tx) => ((tx.timestamp?.seconds || Infinity) < (min.timestamp?.seconds || Infinity) ? tx : min), approvedTx[0]);
        if (earliest?.timestamp?.seconds) jd = new Date(earliest.timestamp.seconds * 1000);
      }

      let curr = new Date(jd.getFullYear(), jd.getMonth(), 1);
      let now = new Date(); let end = new Date(now.getFullYear(), now.getMonth(), 1);

      while (curr <= end) {
        let mStr = `${curr.getFullYear()}-${String(curr.getMonth() + 1).padStart(2, '0')}`;
        let activeRate = rates.find(r => r.month <= mStr);
        let expectedSav = activeRate ? activeRate.amount : (rates.length > 0 ? rates[rates.length - 1].amount : 0);
        expectedSavings += expectedSav;
        curr.setMonth(curr.getMonth() + 1);
      }

      const totalAccounted = (uData.totalSavings || 0) + pendingSavingsAmt;
      const calcDue = expectedSavings - totalAccounted;
      setDueAmount(calcDue > 0 ? calcDue : 0);

    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [id]);

  const handlePhotoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => { setPhotoBase64(reader.result); };
    reader.readAsDataURL(file);
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setIsUpdating(true);
    try {
      let age = member.age || '';
      if (editForm.dob && editForm.dob !== member.dob) {
        const today = new Date(); const birthDate = new Date(editForm.dob);
        age = today.getFullYear() - birthDate.getFullYear();
        if (today.getMonth() < birthDate.getMonth() || (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate())) age--;
      }

      await updateDoc(doc(db, 'users', id), {
        name: editForm.name.trim().toUpperCase(),
        mobile: editForm.mobile.trim(),
        dob: editForm.dob,
        age: age,
        upiId: editForm.upiId.trim(),
        photo: photoBase64
      });

      setShowEditModal(false);
      fetchData();
    } catch (err) { alert('Error updating profile: ' + err.message); }
    setIsUpdating(false);
  };

  if (loading) {
    return (
      <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto', marginTop: '40px' }}>
        <div style={{ height: '200px', backgroundColor: '#e2e8f0', borderRadius: '28px', animation: 'pulse 1.5s infinite' }}></div>
        <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }`}</style>
      </div>
    );
  }

  if (!member) return <div style={{ padding: '20px', textAlign: 'center' }}>Member not found.</div>;

  const totalSavings = member.totalSavings || 0;
  const activeLoan = member.activeCreditBalance || 0;

  return (
    <div style={{ background: 'linear-gradient(180deg, #f4fdf8 0%, #fffbeb 100%)', minHeight: '100vh', paddingBottom: '130px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      
      {/* Curved Green Header */}
      <div style={{ background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)', padding: '24px 20px 65px 20px', borderBottomLeftRadius: '28px', borderBottomRightRadius: '28px' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '900', color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Member Profile</h2>
            <p style={{ margin: '4px 0 0 0', color: '#dcfce7', fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '1px' }}>Statement & Ledger</p>
          </div>
          <button onClick={() => setShowEditModal(true)} style={{ backgroundColor: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', width: '32px', height: '32px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', cursor: 'pointer' }}>
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
          </button>
        </div>
      </div>

      <div style={{ padding: '0 16px', maxWidth: '600px', margin: '0 auto', marginTop: '-45px', position: 'relative', zIndex: 10 }}>
        
        {/* Profile Card */}
        <div style={{ backgroundColor: '#ffffff', borderRadius: '24px', padding: '20px', boxShadow: '0 8px 25px -5px rgba(6, 78, 59, 0.08), 0 4px 6px -2px rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.02)', textAlign: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
            {member.photo ? (
              <img src={member.photo} alt={member.name} style={{ width: '70px', height: '70px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #10b981', boxShadow: '0 4px 10px rgba(0,0,0,0.05)' }} />
            ) : (
              <div style={{ width: '70px', height: '70px', borderRadius: '50%', backgroundColor: '#f0fdf4', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '26px', fontWeight: '900', border: '2px solid #10b981' }}>
                {member.name?.charAt(0)}
              </div>
            )}
          </div>
          <h2 style={{ margin: '0 0 6px 0', fontSize: '16px', fontWeight: '900', color: '#0f172a', textTransform: 'uppercase' }}>{member.name}</h2>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
            <span style={{ backgroundColor: '#f1f5f9', color: '#475569', padding: '4px 10px', borderRadius: '8px', fontSize: '10px', fontWeight: '800' }}>A/c: {member.accountNumber}</span>
            <span style={{ backgroundColor: '#f1f5f9', color: '#475569', padding: '4px 10px', borderRadius: '8px', fontSize: '10px', fontWeight: '800' }}>{member.mobile}</span>
          </div>
        </div>

        {/* PORTFOLIO CARD */}
        <div style={{ background: 'linear-gradient(135deg, #0f766e 0%, #064e3b 100%)', padding: '24px', borderRadius: '28px', boxShadow: '0 12px 25px -5px rgba(6, 78, 59, 0.4)', marginBottom: '20px', position: 'relative', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.15)' }}>
          <div style={{ position: 'absolute', top: '-20px', left: '-20px', width: '120px', height: '120px', background: 'radial-gradient(circle, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 70%)', borderRadius: '50%' }}></div>
          <div style={{ position: 'absolute', bottom: '-30px', right: '-20px', width: '140px', height: '140px', background: 'radial-gradient(circle, rgba(16,185,129,0.3) 0%, rgba(255,255,255,0) 70%)', borderRadius: '50%' }}></div>
          
          <div style={{ position: 'relative', zIndex: 2 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '32px', height: '32px', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff' }}>
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"></path></svg>
                </div>
                <span style={{ fontSize: '12px', color: '#ffffff', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Member Portfolio</span>
              </div>
              <span style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: '#ffffff', padding: '4px 10px', borderRadius: '8px', fontSize: '9px', fontWeight: '900', textTransform: 'uppercase' }}>
                ACTIVE
              </span>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              
              {/* Left Side: Total Savings */}
              <div style={{ flex: 1, paddingRight: '12px' }}>
                <p style={{ margin: '0 0 4px 0', fontSize: '10px', color: '#a7f3d0', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Savings</p>
                <h1 style={{ margin: '0 0 12px 0', fontSize: '26px', fontWeight: '900', color: '#ffffff', letterSpacing: '-0.5px' }}>₹{totalSavings}</h1>
                <span style={{ backgroundColor: dueAmount > 0 ? '#fef08a' : '#10b981', color: dueAmount > 0 ? '#854d0e' : '#ffffff', padding: '5px 12px', borderRadius: '9999px', fontSize: '10px', fontWeight: '900', display: 'inline-block', textTransform: 'uppercase' }}>
                  {dueAmount > 0 ? `Savings Due: ₹${dueAmount}` : 'No Dues'}
                </span>
              </div>
              
              <div style={{ width: '1px', alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.2)', margin: '0 4px' }}></div>
              
              {/* Right Side: Active Loan */}
              <div style={{ flex: 1, paddingLeft: '16px' }}>
                <p style={{ margin: '0 0 4px 0', fontSize: '10px', color: '#a7f3d0', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Loan Due</p>
                <h1 style={{ margin: '0 0 12px 0', fontSize: '26px', fontWeight: '900', color: activeLoan > 0 ? '#fca5a5' : '#ffffff', letterSpacing: '-0.5px' }}>₹{activeLoan}</h1>
                <span style={{ backgroundColor: activeLoan > 0 ? '#fecaca' : 'rgba(255,255,255,0.15)', color: activeLoan > 0 ? '#991b1b' : '#dcfce7', padding: '5px 12px', borderRadius: '9999px', fontSize: '10px', fontWeight: '900', display: 'inline-block', textTransform: 'uppercase' }}>
                  {activeLoan > 0 ? `Loan: ₹${activeLoan}` : 'No Loan'}
                </span>
              </div>

            </div>
          </div>
        </div>

        {/* SIDE-BY-SIDE NAVIGATION BUTTONS: LOAN HISTORY & PASSBOOK */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '24px' }}>
          <div onClick={() => navigate(`/admin/member/${id}/credit`)} style={{ flex: 1, backgroundColor: '#ffffff', padding: '14px 12px', borderRadius: '20px', boxShadow: '0 4px 15px rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.02)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ backgroundColor: '#eff6ff', width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb', flexShrink: 0 }}>
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
              </div>
              <p style={{ margin: 0, fontSize: '11px', fontWeight: '900', color: '#0f172a', textTransform: 'uppercase' }}>Loan History</p>
            </div>
            <svg width="14" height="14" fill="none" stroke="#cbd5e1" strokeWidth="3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"></path></svg>
          </div>

          <div onClick={() => navigate(`/admin/member/${id}/passbook`)} style={{ flex: 1, backgroundColor: '#ffffff', padding: '14px 12px', borderRadius: '20px', boxShadow: '0 4px 15px rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.02)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ backgroundColor: '#f0fdf4', width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981', flexShrink: 0 }}>
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>
              </div>
              <p style={{ margin: 0, fontSize: '11px', fontWeight: '900', color: '#0f172a', textTransform: 'uppercase' }}>Passbook</p>
            </div>
            <svg width="14" height="14" fill="none" stroke="#cbd5e1" strokeWidth="3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"></path></svg>
          </div>
        </div>

      </div>

      {/* Edit Profile Modal with Photo Upload */}
      {showEditModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,23,42,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', backdropFilter: 'blur(4px)' }}>
          <div style={{ width: '100%', maxWidth: '340px', backgroundColor: '#fff', borderRadius: '28px', padding: '24px', animation: 'popIn 0.2s ease-out', boxSizing: 'border-box', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h4 style={{ margin: 0, fontSize: '18px', fontWeight: '900', color: '#0f172a', textTransform: 'uppercase' }}>Edit Profile</h4>
              <button onClick={() => setShowEditModal(false)} style={{ background: '#f1f5f9', border: 'none', width: '32px', height: '32px', borderRadius: '50%', fontWeight: 'bold', cursor: 'pointer', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>
            
            <form onSubmit={handleUpdateProfile} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '4px' }}>
                <label htmlFor="editPhotoInput" style={{ cursor: 'pointer', width: '70px', height: '70px', borderRadius: '50%', backgroundColor: '#f8fafc', border: '2px dashed #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
                  {photoBase64 ? (
                    <img src={photoBase64} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <svg width="24" height="24" fill="none" stroke="#64748b" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                  )}
                </label>
                <input id="editPhotoInput" type="file" accept="image/*" onChange={handlePhotoUpload} style={{ display: 'none' }} />
                <span style={{ fontSize: '10px', color: '#64748b', fontWeight: '800', marginTop: '6px', textTransform: 'uppercase' }}>Tap to change photo</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '10px', color: '#64748b', fontWeight: '800', textTransform: 'uppercase' }}>Full Name</label>
                <input type="text" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} required style={{ padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', fontSize: '13px', fontWeight: '700', outline: 'none', textTransform: 'uppercase' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '10px', color: '#64748b', fontWeight: '800', textTransform: 'uppercase' }}>Mobile Number</label>
                <input type="tel" value={editForm.mobile} onChange={e => setEditForm({...editForm, mobile: e.target.value})} required maxLength="10" style={{ padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', fontSize: '13px', fontWeight: '700', outline: 'none' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '10px', color: '#64748b', fontWeight: '800', textTransform: 'uppercase' }}>Date of Birth</label>
                <input type="date" value={editForm.dob} onChange={e => setEditForm({...editForm, dob: e.target.value})} style={{ padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', fontSize: '13px', fontWeight: '700', outline: 'none' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '10px', color: '#64748b', fontWeight: '800', textTransform: 'uppercase' }}>UPI ID</label>
                <input type="text" value={editForm.upiId} onChange={e => setEditForm({...editForm, upiId: e.target.value})} style={{ padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', fontSize: '13px', fontWeight: '700', outline: 'none' }} />
              </div>
              <button type="submit" disabled={isUpdating} style={{ padding: '14px', backgroundColor: '#10b981', color: '#fff', border: 'none', borderRadius: '14px', fontWeight: '900', fontSize: '13px', textTransform: 'uppercase', cursor: 'pointer', marginTop: '8px' }}>
                {isUpdating ? 'Saving...' : 'Save Changes'}
              </button>
            </form>
          </div>
        </div>
      )}

      <style>{`@keyframes popIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }`}</style>
    </div>
  );
}
