import { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { updatePassword, onAuthStateChanged, signOut } from 'firebase/auth';
import { db, auth } from '../firebase/firebase';
import { useNavigate } from 'react-router-dom';

export default function UserSettings() {
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const [userData, setUserData] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', dob: '', mobile: '', upiId: '' });
  const [editPhotoBase64, setEditPhotoBase64] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [isUpdatingPwd, setIsUpdatingPwd] = useState(false);

  const [currentUserUid, setCurrentUserUid] = useState(null);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) { navigate('/login'); return; }
      setCurrentUserUid(user.uid);
      try {
        const userSnap = await getDoc(doc(db, 'users', user.uid));
        if (userSnap.exists()) {
          const uData = userSnap.data();
          setUserData(uData);
          setEditForm({ name: uData.name || '', dob: uData.dob || '', mobile: uData.mobile || '', upiId: uData.upiId || '' });
          setEditPhotoBase64(uData.photo || '');
        }
      } catch (err) { console.error(err); } finally { setLoading(false); }
    });
    return () => unsubscribe();
  }, [navigate]);

  const handlePhotoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => { setEditPhotoBase64(reader.result); };
    reader.readAsDataURL(file);
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault(); setIsSubmitting(true);
    try {
      let age = '';
      if (editForm.dob) {
        const today = new Date(); const birthDate = new Date(editForm.dob);
        age = today.getFullYear() - birthDate.getFullYear();
        if (today.getMonth() < birthDate.getMonth() || (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate())) age--;
      }
      await updateDoc(doc(db, 'users', currentUserUid), { name: editForm.name.trim().toUpperCase(), dob: editForm.dob || '', age: age, mobile: editForm.mobile, upiId: editForm.upiId || '', photo: editPhotoBase64 || '' });
      const updatedSnap = await getDoc(doc(db, 'users', currentUserUid));
      if (updatedSnap.exists()) setUserData(updatedSnap.data());
      setShowEditModal(false); alert("Profile updated successfully!");
    } catch (err) { alert('Error: ' + err.message); }
    setIsSubmitting(false);
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    if (newPassword.length < 6) return alert("Password must be at least 6 characters.");
    setIsUpdatingPwd(true);
    try {
      if (!auth.currentUser) throw new Error("No user logged in.");
      await updatePassword(auth.currentUser, newPassword);
      alert("Password successfully updated!"); setShowPasswordModal(false); setNewPassword('');
    } catch (err) {
      if (err.code === 'auth/requires-recent-login') alert("Security requirement: Please log out and log back in to change your password.");
      else alert(err.message);
    }
    setIsUpdatingPwd(false);
  };

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

  const formatDOB = (dateStr) => {
    if (!dateStr) return 'Not Set';
    const parts = dateStr.split('-');
    if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
    return dateStr;
  };

  if (loading) return <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}><div style={{ height: '140px', backgroundColor: '#e2e8f0', borderRadius: '20px', animation: 'pulse 1.5s infinite' }}></div></div>;

  return (
    <div style={{ background: 'linear-gradient(180deg, #f4fdf8 0%, #fffbeb 100%)', minHeight: '100vh', paddingBottom: '90px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      
      {/* Curved Green Header */}
      <div style={{ background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)', padding: '24px 20px 65px 20px', borderBottomLeftRadius: '28px', borderBottomRightRadius: '28px' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '900', color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Settings</h2>
            <p style={{ margin: '4px 0 0 0', color: '#dcfce7', fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '1px' }}>Account & Security</p>
          </div>
          <button onClick={() => setShowLogoutModal(true)} style={{ backgroundColor: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', width: '32px', height: '32px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', cursor: 'pointer' }}>
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
          </button>
        </div>
      </div>

      <div style={{ padding: '0 16px', maxWidth: '600px', margin: '0 auto', marginTop: '-45px', position: 'relative', zIndex: 10 }}>
        
        {/* User Details Card */}
        <div style={{ backgroundColor: '#ffffff', borderRadius: '20px', padding: '16px 20px', boxShadow: '0 8px 25px -5px rgba(6, 78, 59, 0.08)', border: '1px solid rgba(0,0,0,0.02)', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px', borderBottom: '1px dashed #f1f5f9', paddingBottom: '14px' }}>
            {userData?.photo ? (
              <img src={userData.photo} alt={userData?.name} style={{ width: '44px', height: '44px', borderRadius: '50%', objectFit: 'cover', border: '1px solid #e2e8f0' }} />
            ) : (
              <div style={{ width: '44px', height: '44px', borderRadius: '50%', backgroundColor: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981', fontWeight: '900', fontSize: '18px', border: '1px solid #dcfce7' }}>
                {userData?.name?.charAt(0).toUpperCase() || 'U'}
              </div>
            )}
            <div>
              <h4 style={{ margin: '0 0 2px 0', fontSize: '14px', fontWeight: '900', color: '#0f172a', textTransform: 'uppercase' }}>{userData?.name || 'N/A'}</h4>
              <p style={{ margin: 0, fontSize: '9px', color: '#64748b', fontWeight: '800', textTransform: 'uppercase' }}>A/C: {userData?.accountNumber || 'N/A'}</p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '8px', borderBottom: '1px solid #f8fafc' }}>
              <span style={{ fontSize: '10px', color: '#64748b', fontWeight: '800', textTransform: 'uppercase' }}>Mobile Number</span>
              <span style={{ fontSize: '12px', color: '#0f172a', fontWeight: '900' }}>{userData?.mobile || 'Not Set'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '8px', borderBottom: '1px solid #f8fafc' }}>
              <span style={{ fontSize: '10px', color: '#64748b', fontWeight: '800', textTransform: 'uppercase' }}>Date of Birth</span>
              <span style={{ fontSize: '12px', color: '#0f172a', fontWeight: '900' }}>{formatDOB(userData?.dob)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '10px', color: '#64748b', fontWeight: '800', textTransform: 'uppercase' }}>UPI ID</span>
              <span style={{ fontSize: '12px', color: '#0f172a', fontWeight: '900' }}>{userData?.upiId || 'Not Set'}</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <h3 style={{ margin: '0 0 12px 4px', fontSize: '13px', color: '#0f172a', fontWeight: '900' }}>Account Actions</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '24px' }}>
          
          <div onClick={() => setShowEditModal(true)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <div style={{ backgroundColor: '#ffffff', width: '48px', height: '48px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6', boxShadow: '0 4px 12px rgba(0,0,0,0.04)' }}>
              <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
            </div>
            <span style={{ fontSize: '10px', color: '#475569', fontWeight: '800' }}>Profile</span>
          </div>

          <div onClick={() => setShowPasswordModal(true)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <div style={{ backgroundColor: '#ffffff', width: '48px', height: '48px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#eab308', boxShadow: '0 4px 12px rgba(0,0,0,0.04)' }}>
              <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
            </div>
            <span style={{ fontSize: '10px', color: '#475569', fontWeight: '800' }}>Password</span>
          </div>

        </div>

      </div>

      {showEditModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,23,42,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', backdropFilter: 'blur(4px)' }}>
          <div style={{ width: '100%', maxWidth: '320px', backgroundColor: '#fff', borderRadius: '24px', padding: '20px', animation: 'popIn 0.2s ease-out', boxSizing: 'border-box', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h4 style={{ margin: 0, fontSize: '15px', fontWeight: '900', color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Edit Profile</h4>
              <button type="button" onClick={() => setShowEditModal(false)} style={{ background: '#f1f5f9', border: 'none', width: '28px', height: '28px', borderRadius: '50%', fontWeight: 'bold', cursor: 'pointer', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>✕</button>
            </div>
            <form onSubmit={handleUpdateProfile} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '4px' }}>
                <label htmlFor="editPhotoInput" style={{ cursor: 'pointer', width: '60px', height: '60px', borderRadius: '50%', backgroundColor: '#f8fafc', border: '2px dashed #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
                  {editPhotoBase64 ? <img src={editPhotoBase64} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <svg width="20" height="20" fill="none" stroke="#64748b" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>}
                </label>
                <input id="editPhotoInput" type="file" accept="image/*" onChange={handlePhotoUpload} style={{ display: 'none' }} />
                <span style={{ fontSize: '9px', color: '#64748b', fontWeight: '800', marginTop: '4px', textTransform: 'uppercase' }}>Tap to change</span>
              </div>
              <input type="text" placeholder="Full Name" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} required style={{ padding: '12px 14px', borderRadius: '12px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', fontSize: '13px', textTransform: 'uppercase', outline: 'none', fontWeight: '800' }} />
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '9px', color: '#64748b', fontWeight: '800', marginLeft: '4px', textTransform: 'uppercase' }}>Date of Birth</span>
                <input type="date" value={editForm.dob} onChange={e => setEditForm({...editForm, dob: e.target.value})} style={{ padding: '12px 14px', borderRadius: '12px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', fontSize: '13px', outline: 'none', fontWeight: '800' }} />
              </div>
              
              <input type="tel" placeholder="Mobile Number" value={editForm.mobile} onChange={e => setEditForm({...editForm, mobile: e.target.value})} required pattern="[0-9]{10}" maxLength="10" style={{ padding: '12px 14px', borderRadius: '12px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', fontSize: '13px', outline: 'none', fontWeight: '800' }} />
              <input type="text" placeholder="UPI ID" value={editForm.upiId} onChange={e => setEditForm({...editForm, upiId: e.target.value})} style={{ padding: '12px 14px', borderRadius: '12px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', fontSize: '13px', outline: 'none', fontWeight: '800' }} />
              <button type="submit" disabled={isSubmitting} style={{ padding: '14px', backgroundColor: '#10b981', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: '900', fontSize: '12px', textTransform: 'uppercase', marginTop: '4px', cursor: 'pointer' }}>{isSubmitting ? 'Saving...' : 'Save Profile'}</button>
            </form>
          </div>
        </div>
      )}

      {showPasswordModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,23,42,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', backdropFilter: 'blur(4px)' }}>
          <div style={{ width: '100%', maxWidth: '320px', backgroundColor: '#fff', borderRadius: '24px', padding: '20px', animation: 'popIn 0.2s ease-out', boxSizing: 'border-box', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h4 style={{ margin: 0, fontSize: '15px', fontWeight: '900', color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Change Password</h4>
              <button onClick={() => setShowPasswordModal(false)} style={{ background: '#f1f5f9', border: 'none', width: '28px', height: '28px', borderRadius: '50%', fontWeight: 'bold', cursor: 'pointer', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>✕</button>
            </div>
            <form onSubmit={handleUpdatePassword} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <input type="password" placeholder="New Password (min 6 chars)" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength="6" style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', fontSize: '13px', fontWeight: '800', outline: 'none', boxSizing: 'border-box' }} />
              <button type="submit" disabled={isUpdatingPwd} style={{ width: '100%', padding: '14px', background: 'linear-gradient(135deg, #eab308 0%, #ca8a04 100%)', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: '900', fontSize: '12px', textTransform: 'uppercase', cursor: 'pointer' }}>{isUpdatingPwd ? 'Updating...' : 'Update Password'}</button>
            </form>
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
      <style>{`@keyframes popIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }`}</style>
    </div>
  );
}
