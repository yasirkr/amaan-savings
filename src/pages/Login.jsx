import { useState, useEffect } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/firebase';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [focusedInput, setFocusedInput] = useState(null);
  const navigate = useNavigate();

  // ONLY show Splash Screen once per session when the app first loads
  const [showSplash, setShowSplash] = useState(() => {
    // Only show splash if we are explicitly on the root/login page AND it hasn't been shown yet this session
    const alreadyShown = sessionStorage.getItem('splashShown');
    if (!alreadyShown) {
      sessionStorage.setItem('splashShown', 'true');
      return true;
    }
    return false;
  });

  useEffect(() => {
    if (showSplash) {
      const timer = setTimeout(() => {
        setShowSplash(false);
        sessionStorage.setItem('splashShown', 'true');
      }, 2200);
      return () => clearTimeout(timer);
    }
  }, [showSplash]);

  const handleLogin = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      let emailToLogin = loginId.trim();
      if (!emailToLogin.includes('@')) emailToLogin = `${emailToLogin}@amaan.com`;
      const userCredential = await signInWithEmailAndPassword(auth, emailToLogin, password);
      const userDoc = await getDoc(doc(db, 'users', userCredential.user.uid));
      if (userDoc.exists()) {
        if (userDoc.data().role === 'admin') navigate('/admin', { replace: true });
        else navigate('/dashboard', { replace: true });
      } else {
        if (emailToLogin.includes('admin') || emailToLogin.includes('yasir')) navigate('/admin', { replace: true });
        else setError('User profile not found.');
      }
    } catch (err) {
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') setError('Invalid mobile/email or password.');
      else setError('Login failed: ' + err.message);
    } finally { setLoading(false); }
  };

  const handleHardRefresh = () => {
    if ('caches' in window) { caches.keys().then((names) => { names.forEach(name => caches.delete(name)); }); }
    if ('serviceWorker' in navigator) { navigator.serviceWorker.getRegistrations().then((registrations) => { registrations.forEach(reg => reg.unregister()); }); }
    setTimeout(() => { window.location.reload(true); }, 300);
  };

  const inputStyle = (isFocused) => ({ 
    width: '100%', boxSizing: 'border-box', 
    padding: '14px 16px 14px 46px', // Slightly tighter vertical padding
    borderRadius: '16px', // Less bulky rounded corners
    backgroundColor: isFocused ? '#ffffff' : 'rgba(255,255,255,0.6)', 
    border: `1px solid ${isFocused ? '#10b981' : '#cbd5e1'}`, // Thinner 1px border
    fontSize: '14px', 
    fontWeight: '500', // Reduced from 800 to 500 for a clean, regular weight
    color: '#0f172a', outline: 'none', transition: 'all 0.2s ease', 
    boxShadow: isFocused ? '0 8px 20px rgba(16, 185, 129, 0.1)' : 'none' 
  });

  if (showSplash) {
    return (
      <div style={{ background: 'linear-gradient(135deg, #064e3b 0%, #0f766e 100%)', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
         <div style={{ animation: 'pulse 2s infinite', textAlign: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center' }}>
              <h1 style={{ margin: 0, fontSize: '42px', fontWeight: '900', color: '#ffffff', letterSpacing: '-1px' }}>amaan</h1>
              <span style={{ fontSize: '50px', fontWeight: '900', color: '#10b981' }}>.</span>
            </div>
            <p style={{ margin: '8px 0 0 0', fontSize: '11px', color: '#fef08a', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '2.5px' }}>Welcome to Islamic Banking System</p>
         </div>
         <style>{`@keyframes pulse { 0% { opacity: 0.8; transform: scale(0.98); } 50% { opacity: 1; transform: scale(1); } 100% { opacity: 0.8; transform: scale(0.98); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ background: 'linear-gradient(135deg, #dcfce7 0%, #fefce8 100%)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: 'system-ui, -apple-system, sans-serif', boxSizing: 'border-box', position: 'relative', overflow: 'hidden' }}>
      
      <div style={{ position: 'absolute', top: '-10%', left: '-10%', width: '300px', height: '300px', background: 'radial-gradient(circle, rgba(16,185,129,0.2) 0%, rgba(255,255,255,0) 70%)', borderRadius: '50%', pointerEvents: 'none' }}></div>
      <div style={{ position: 'absolute', bottom: '-10%', right: '-10%', width: '300px', height: '300px', background: 'radial-gradient(circle, rgba(234,179,8,0.15) 0%, rgba(255,255,255,0) 70%)', borderRadius: '50%', pointerEvents: 'none' }}></div>

      <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(20px)', width: '100%', maxWidth: '360px', borderRadius: '36px', padding: '40px 24px', boxShadow: '0 20px 50px -10px rgba(0,0,0,0.1)', position: 'relative', zIndex: 10, border: '1px solid #ffffff' }}>
        
        {/* Top Right Force Update Icon */}
        <div style={{ position: 'absolute', top: '16px', right: '16px' }}>
          <button type="button" onClick={handleHardRefresh} title="Force PWA Update" style={{ background: '#fefce8', border: '1px solid #fef08a', padding: '8px', borderRadius: '14px', color: '#ca8a04', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px rgba(0,0,0,0.02)' }}>
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
          </button>
        </div>

        <div style={{ textAlign: 'center', marginBottom: '40px', marginTop: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center' }}>
            <h1 style={{ margin: 0, fontSize: '36px', fontWeight: '900', color: '#064e3b', letterSpacing: '-1px' }}>amaan</h1>
            <span style={{ fontSize: '36px', fontWeight: '900', color: '#10b981' }}>.</span>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: '10px', color: '#d97706', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '2px' }}>Islamic Banking System</p>
        </div>

        {error && (
          <div style={{ padding: '14px', backgroundColor: '#fef2f2', borderLeft: '4px solid #ef4444', borderRadius: '16px', marginBottom: '24px', display: 'flex', gap: '10px', alignItems: 'center' }}>
            <svg width="20" height="20" fill="none" stroke="#ef4444" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
            <p style={{ margin: 0, fontSize: '13px', color: '#991b1b', fontWeight: '800' }}>{error}</p>
          </div>
        )}

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', left: '18px', top: '50%', transform: 'translateY(-50%)', color: focusedInput === 'loginId' ? '#10b981' : '#94a3b8', transition: 'color 0.2s', display: 'flex', alignItems: 'center' }}><svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path></svg></div>
            <input type="text" placeholder="Registered Mobile" value={loginId} onChange={(e) => setLoginId(e.target.value)} onFocus={() => setFocusedInput('loginId')} onBlur={() => setFocusedInput(null)} required style={inputStyle(focusedInput === 'loginId')} />
          </div>

          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', left: '18px', top: '50%', transform: 'translateY(-50%)', color: focusedInput === 'password' ? '#10b981' : '#94a3b8', transition: 'color 0.2s', display: 'flex', alignItems: 'center' }}><svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg></div>
            <input type={showPassword ? 'text' : 'password'} placeholder="Passcode" value={password} onChange={(e) => setPassword(e.target.value)} onFocus={() => setFocusedInput('password')} onBlur={() => setFocusedInput(null)} required style={inputStyle(focusedInput === 'password')} />
            <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: '18px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0, display: 'flex', alignItems: 'center' }}>
              {showPassword ? <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"></path></svg> : <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>}
            </button>
          </div>

          <button type="submit" disabled={loading} style={{ width: '100%', marginTop: '12px', padding: '18px', background: 'linear-gradient(135deg, #059669 0%, #047857 100%)', color: '#fff', border: 'none', borderRadius: '20px', fontWeight: '900', fontSize: '15px', textTransform: 'uppercase', letterSpacing: '1px', cursor: 'pointer', boxShadow: '0 10px 25px rgba(5, 150, 105, 0.4)', opacity: loading ? 0.7 : 1, transition: 'all 0.2s' }}>{loading ? 'Authenticating...' : 'Login'}</button>
        </form>
      </div>
    </div>
  );
}
