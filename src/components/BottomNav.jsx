import { useNavigate, useLocation } from 'react-router-dom';

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const path = location.pathname;

  if (path === '/login' || path === '/') return null;

  const isAdmin = path.startsWith('/admin');
  const activeColor = '#059669'; // Forest Green
  const inactiveColor = '#94a3b8'; // Slate Gray

  const NavItem = ({ label, iconPath, isActive, onClick }) => (
    <div onClick={onClick} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', cursor: 'pointer', color: isActive ? activeColor : inactiveColor, flex: 1, padding: '4px 0' }}>
      <div style={{ padding: '4px 14px', borderRadius: '14px', backgroundColor: isActive ? '#dcfce7' : 'transparent', transition: 'background-color 0.2s ease' }}>
        <svg width="20" height="20" fill={isActive ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={isActive ? "0" : "2.5"} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d={iconPath}></path>
        </svg>
      </div>
      <p style={{ margin: 0, fontSize: '9px', fontWeight: isActive ? '900' : '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</p>
    </div>
  );

  return (
    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, backgroundColor: '#ffffff', display: 'flex', justifyContent: 'space-around', padding: '8px 4px 12px 4px', zIndex: 1000, boxShadow: '0 -4px 20px rgba(0,0,0,0.04)', borderRadius: '20px 20px 0 0', border: '1px solid rgba(0,0,0,0.02)' }}>
      {isAdmin ? (
        <>
          <NavItem label="Home" iconPath="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" isActive={path === '/admin'} onClick={() => navigate('/admin')} />
          <NavItem label="Members" iconPath="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" isActive={path.includes('/members')} onClick={() => navigate('/admin/members')} />
          <NavItem label="Queue" iconPath="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" isActive={path.includes('/queue')} onClick={() => navigate('/admin/queue')} />
          <NavItem label="Dues" iconPath="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" isActive={path.includes('/dues')} onClick={() => navigate('/admin/dues')} />
          <NavItem label="Settings" iconPath="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" isActive={path.includes('/settings')} onClick={() => navigate('/admin/settings')} />
        </>
      ) : (
        <>
          <NavItem label="Home" iconPath="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" isActive={path === '/dashboard'} onClick={() => navigate('/dashboard')} />
          <NavItem label="Passbook" iconPath="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" isActive={path === '/passbook'} onClick={() => navigate('/passbook')} />
          <NavItem label="Loans" iconPath="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" isActive={path.includes('/credit')} onClick={() => navigate('/dashboard/credit')} />
          <NavItem label="Settings" iconPath="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" isActive={path === '/settings'} onClick={() => navigate('/settings')} />
        </>
      )}
    </div>
  );
}
