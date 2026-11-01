import { useState, useEffect } from 'react';
import { collection, getDocs, doc, setDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { db, auth } from '../firebase/firebase';
import { useNavigate } from 'react-router-dom';

export default function AdminDirectory() {
  const [members, setMembers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState({ name: '', dob: '', mobile: '', upiId: '', initialSavings: '', initialLoan: '' });
  const [photoBase64, setPhotoBase64] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Success Modal States
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successData, setSuccessData] = useState({ name: '', mobile: '', password: '' });

  const navigate = useNavigate();

  const fetchMembers = async () => {
    try {
      const snap = await getDocs(collection(db, 'users'));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.role !== 'admin');
      setMembers(list.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  useEffect(() => { fetchMembers(); }, []);

  const handlePhotoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => { setPhotoBase64(reader.result); };
    reader.readAsDataURL(file);
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const allUsersSnap = await getDocs(collection(db, 'users'));
      const nextAccNum = 1001 + allUsersSnap.docs.length;

      // Mobile-based Firebase Auth Trick
      const loginEmail = `${form.mobile.trim()}@amaan.com`;
      const defaultPassword = "password123";
      
      const userCredential = await createUserWithEmailAndPassword(auth, loginEmail, defaultPassword);
      const newUserId = userCredential.user.uid;

      let age = '';
      if (form.dob) {
        const today = new Date(); const birthDate = new Date(form.dob);
        age = today.getFullYear() - birthDate.getFullYear();
        if (today.getMonth() < birthDate.getMonth() || (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate())) age--;
      }

      const initialSav = Number(form.initialSavings) || 0;
      const initialLn = Number(form.initialLoan) || 0;

      // Save Profile in Database
      await setDoc(doc(db, 'users', newUserId), {
        name: form.name.trim().toUpperCase(),
        dob: form.dob || '',
        age: age,
        mobile: form.mobile,
        upiId: form.upiId || '',
        photo: photoBase64 || '',
        accountNumber: String(nextAccNum),
        email: loginEmail,
        role: 'member',
        totalSavings: initialSav,
        activeCreditBalance: initialLn,
        createdAt: serverTimestamp()
      });

      if (initialSav > 0) {
        await addDoc(collection(db, 'transactions'), {
          userId: newUserId, userName: form.name.trim().toUpperCase(), type: 'savings_deposit', amount: initialSav, status: 'approved', timestamp: serverTimestamp()
        });
      }

      if (initialLn > 0) {
        await addDoc(collection(db, 'transactions'), {
          userId: newUserId, userName: form.name.trim().toUpperCase(), type: 'credit_request', amount: initialLn, status: 'approved', timestamp: serverTimestamp()
        });
      }

      setShowAddModal(false);
      setForm({ name: '', dob: '', mobile: '', upiId: '', initialSavings: '', initialLoan: '' });
      setPhotoBase64('');
      
      // Trigger Success Modal
      setSuccessData({ name: form.name.trim().toUpperCase(), mobile: form.mobile, password: defaultPassword });
      setShowSuccessModal(true);

      fetchMembers();
    } catch (err) { 
      if (err.code === 'auth/email-already-in-use') {
        alert("This mobile number is already registered in the system. If you recently deleted this member from the directory, you must also delete their account from the Firebase Authentication Console.");
      } else {
        alert('Error: ' + err.message); 
      }
    }
    setIsSubmitting(false);
  };

  const filteredMembers = members.filter(m => 
    m.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    m.accountNumber?.includes(searchQuery) ||
    m.mobile?.includes(searchQuery)
  );

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
      <div style={{ background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)', padding: '24px 20px 65px 20px', borderBottomLeftRadius: '28px', borderBottomRightRadius: '28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '900', color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Directory</h2>
          <p style={{ margin: '4px 0 0 0', color: '#dcfce7', fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '1px' }}>{members.length} Active Accounts</p>
        </div>
        <button onClick={() => setShowAddModal(true)} style={{ backgroundColor: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', padding: '8px 12px', borderRadius: '12px', color: '#ffffff', fontWeight: '900', fontSize: '11px', textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"></path></svg> Add
        </button>
      </div>

      <div style={{ padding: '0 16px', maxWidth: '600px', margin: '0 auto', marginTop: '-45px', position: 'relative', zIndex: 10 }}>
        
        {/* Overlapping Search Bar */}
        <div style={{ marginBottom: '16px' }}>
          <input type="text" placeholder="Search by name, a/c, or mobile..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ width: '100%', padding: '16px 20px', borderRadius: '20px', border: '1px solid rgba(0,0,0,0.05)', backgroundColor: '#ffffff', fontSize: '13px', fontWeight: '700', outline: 'none', boxSizing: 'border-box', boxShadow: '0 8px 25px -5px rgba(6, 78, 59, 0.1)' }} />
        </div>

        {/* Member List Container */}
        <div style={{ backgroundColor: '#ffffff', borderRadius: '24px', padding: '6px', boxShadow: '0 8px 25px -5px rgba(6, 78, 59, 0.08)', border: '1px solid rgba(0,0,0,0.02)' }}>
          {filteredMembers.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center' }}>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: '12px', fontWeight: '800' }}>No members found.</p>
            </div>
          ) : (
            filteredMembers.map((m, idx) => (
              <div key={m.id} onClick={() => navigate(`/admin/member/${m.id}`)} style={{ padding: '12px 14px', borderBottom: idx === filteredMembers.length - 1 ? 'none' : '1px solid #f1f5f9', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px' }}>
                {m.photo ? (
                  <img src={m.photo} alt={m.name} style={{ width: '38px', height: '38px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1px solid #e2e8f0' }} />
                ) : (
                  <div style={{ backgroundColor: '#f0fdf4', width: '38px', height: '38px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981', fontWeight: '900', fontSize: '16px', flexShrink: 0, border: '1px solid #dcfce7' }}>
                    {m.name?.charAt(0).toUpperCase()}
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <p style={{ margin: '0 0 2px 0', fontWeight: '900', fontSize: '13px', color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{m.name}</p>
                  <p style={{ margin: 0, fontSize: '10px', color: '#64748b', fontWeight: '700' }}>A/c: {m.accountNumber} • {m.mobile}</p>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                    <span style={{ fontSize: '13px', fontWeight: '900', color: '#059669' }}>₹{m.totalSavings || 0}</span>
                    {m.activeCreditBalance > 0 && (
                      <span style={{ fontSize: '10px', fontWeight: '800', color: '#ef4444', marginTop: '2px' }}>Loan: ₹{m.activeCreditBalance}</span>
                    )}
                  </div>
                  <svg width="16" height="16" fill="none" stroke="#cbd5e1" strokeWidth="3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"></path></svg>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Add Member Modal */}
      {showAddModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,23,42,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', backdropFilter: 'blur(4px)' }}>
          <div style={{ width: '100%', maxWidth: '340px', backgroundColor: '#fff', borderRadius: '28px', padding: '24px', animation: 'popIn 0.2s ease-out', boxSizing: 'border-box', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h4 style={{ margin: 0, fontSize: '18px', fontWeight: '900', color: '#0f172a', textTransform: 'uppercase' }}>Add Member</h4>
              <button onClick={() => setShowAddModal(false)} style={{ background: '#f1f5f9', border: 'none', width: '32px', height: '32px', borderRadius: '50%', fontWeight: 'bold', cursor: 'pointer', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>
            
            <form onSubmit={handleAddMember} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '8px' }}>
                <label htmlFor="memberPhotoInput" style={{ cursor: 'pointer', width: '70px', height: '70px', borderRadius: '50%', backgroundColor: '#f8fafc', border: '2px dashed #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
                  {photoBase64 ? (
                    <img src={photoBase64} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <svg width="24" height="24" fill="none" stroke="#64748b" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                  )}
                </label>
                <input id="memberPhotoInput" type="file" accept="image/*" onChange={handlePhotoUpload} style={{ display: 'none' }} />
                <span style={{ fontSize: '10px', color: '#64748b', fontWeight: '800', marginTop: '6px', textTransform: 'uppercase' }}>Tap to upload</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <input type="text" placeholder="FULL NAME *" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required style={{ padding: '14px', borderRadius: '16px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', fontSize: '13px', textTransform: 'uppercase', outline: 'none', fontWeight: '700' }} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <input type="tel" placeholder="MOBILE NUMBER *" value={form.mobile} onChange={e => setForm({...form, mobile: e.target.value})} required pattern="[0-9]{10}" maxLength="10" style={{ padding: '14px', borderRadius: '16px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', fontSize: '13px', outline: 'none', fontWeight: '700' }} />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
                  <label style={{ fontSize: '10px', color: '#64748b', fontWeight: '800', marginLeft: '6px', textTransform: 'uppercase' }}>Init Savings (₹)</label>
                  <input type="number" placeholder="0" value={form.initialSavings} onChange={e => setForm({...form, initialSavings: e.target.value})} min="0" style={{ width: '100%', boxSizing: 'border-box', padding: '14px', borderRadius: '16px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', fontSize: '13px', outline: 'none', fontWeight: '700' }} />
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
                  <label style={{ fontSize: '10px', color: '#64748b', fontWeight: '800', marginLeft: '6px', textTransform: 'uppercase' }}>Init Loan (₹)</label>
                  <input type="number" placeholder="0" value={form.initialLoan} onChange={e => setForm({...form, initialLoan: e.target.value})} min="0" style={{ width: '100%', boxSizing: 'border-box', padding: '14px', borderRadius: '16px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', fontSize: '13px', outline: 'none', fontWeight: '700' }} />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '10px', color: '#64748b', fontWeight: '800', marginLeft: '6px', textTransform: 'uppercase' }}>DOB (Optional)</label>
                <input type="date" value={form.dob} onChange={e => setForm({...form, dob: e.target.value})} style={{ padding: '14px', borderRadius: '16px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', fontSize: '13px', outline: 'none', fontWeight: '700' }} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <input type="text" placeholder="UPI ID (OPTIONAL)" value={form.upiId} onChange={e => setForm({...form, upiId: e.target.value})} style={{ padding: '14px', borderRadius: '16px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', fontSize: '13px', outline: 'none', fontWeight: '700' }} />
              </div>

              <button type="submit" disabled={isSubmitting} style={{ padding: '16px', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: '#fff', border: 'none', borderRadius: '16px', fontWeight: '900', fontSize: '14px', textTransform: 'uppercase', cursor: 'pointer', marginTop: '8px' }}>{isSubmitting ? 'Creating...' : 'Create Account'}</button>
            </form>
          </div>
        </div>
      )}

      {/* REGISTRATION SUCCESS MODAL WITH MOBILE & PASSWORD */}
      {showSuccessModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,23,42,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', backdropFilter: 'blur(4px)' }}>
          <div style={{ width: '100%', maxWidth: '340px', backgroundColor: '#fff', borderRadius: '28px', padding: '28px', textAlign: 'center', animation: 'popIn 0.2s ease-out', boxSizing: 'border-box', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            
            <div style={{ width: '64px', height: '64px', backgroundColor: '#dcfce7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto', color: '#16a34a' }}>
              <svg width="32" height="32" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"></path></svg>
            </div>
            
            <h3 style={{ margin: '0 0 8px 0', fontSize: '20px', color: '#0f172a', fontWeight: '900', textTransform: 'uppercase' }}>Success!</h3>
            <p style={{ margin: '0 0 20px 0', fontSize: '12px', color: '#64748b', lineHeight: '1.4', fontWeight: '600' }}>
              {successData.name} has-been added. Share these login details with them:
            </p>

            <div style={{ backgroundColor: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '16px', padding: '16px', marginBottom: '20px', textAlign: 'left' }}>
              <div style={{ marginBottom: '12px' }}>
                <span style={{ display: 'block', fontSize: '10px', color: '#64748b', fontWeight: '800', textTransform: 'uppercase', marginBottom: '2px' }}>Login Mobile Number</span>
                <span style={{ display: 'block', fontSize: '16px', color: '#0f172a', fontWeight: '900' }}>{successData.mobile}</span>
              </div>
              <div>
                <span style={{ display: 'block', fontSize: '10px', color: '#64748b', fontWeight: '800', textTransform: 'uppercase', marginBottom: '2px' }}>Default Password</span>
                <span style={{ display: 'block', fontSize: '18px', color: '#2563eb', fontWeight: '900', letterSpacing: '1px' }}>{successData.password}</span>
              </div>
            </div>
            
            <button onClick={() => setShowSuccessModal(false)} style={{ width: '100%', padding: '16px', backgroundColor: '#0f172a', color: '#fff', border: 'none', borderRadius: '16px', fontWeight: '900', fontSize: '14px', cursor: 'pointer', textTransform: 'uppercase' }}>
              Done
            </button>
          </div>
        </div>
      )}

      <style>{`@keyframes popIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }`}</style>
    </div>
  );
}
