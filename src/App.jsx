import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase/firebase';
import Header from './components/Header';
import BottomNav from './components/BottomNav';

import Login from './pages/Login';
import UserDashboard from './pages/UserDashboard';
import UserCredit from './pages/UserCredit';
import UserPassbook from './pages/UserPassbook';
import UserSettings from './pages/UserSettings';
import AdminDashboard from './pages/AdminDashboard';
import AdminDirectory from './pages/AdminDirectory';
import MemberStatement from './pages/MemberStatement';
import AdminMemberCredit from './pages/AdminMemberCredit';
import AdminMemberPassbook from './pages/AdminMemberPassbook';
import AdminLoanQueue from './pages/AdminLoanQueue';
import AdminSettings from './pages/AdminSettings';
import AdminLoanHistory from './pages/AdminLoanHistory';
import AdminPendingDues from './pages/AdminPendingDues';
import UserHistory from './pages/UserHistory';

const ProtectedRoute = ({ children }) => {
  const [isChecking, setIsChecking] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsAuthenticated(!!user);
      setIsChecking(false);
    });
    return () => unsubscribe();
  }, []);

  if (isChecking) return <div style={{ height: '100vh', backgroundColor: '#f9fafb' }} />;
  return isAuthenticated ? children : <Navigate to="/login" replace />;
};

export default function App() {
  return (
    <BrowserRouter>
      {/* Increased paddingBottom from 60px to 120px to prevent bottom navigation overlap */}
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: '#f8fafc', paddingBottom: '120px' }}>
        <Header />
        <div style={{ flex: 1 }}>
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<Login />} />
            
            {/* User Routes */}
            <Route path="/dashboard" element={<ProtectedRoute><UserDashboard /></ProtectedRoute>} />
            <Route path="/passbook" element={<ProtectedRoute><UserPassbook /></ProtectedRoute>} />
            <Route path="/dashboard/credit" element={<ProtectedRoute><UserCredit /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><UserSettings /></ProtectedRoute>} />
            <Route path="/history" element={<ProtectedRoute><UserHistory /></ProtectedRoute>} />
            
            {/* Admin Routes */}
            <Route path="/admin" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
            <Route path="/admin/members" element={<ProtectedRoute><AdminDirectory /></ProtectedRoute>} />
            <Route path="/admin/member/:id" element={<ProtectedRoute><MemberStatement /></ProtectedRoute>} />
            <Route path="/admin/member/:id/credit" element={<ProtectedRoute><AdminMemberCredit /></ProtectedRoute>} />
            <Route path="/admin/member/:id/passbook" element={<ProtectedRoute><AdminMemberPassbook /></ProtectedRoute>} />
            <Route path="/admin/queue" element={<ProtectedRoute><AdminLoanQueue /></ProtectedRoute>} />
            <Route path="/admin/settings" element={<ProtectedRoute><AdminSettings /></ProtectedRoute>} />
            <Route path="/admin/loans" element={<ProtectedRoute><AdminLoanHistory /></ProtectedRoute>} />
            <Route path="/admin/dues" element={<ProtectedRoute><AdminPendingDues /></ProtectedRoute>} />
            
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </div>
        <BottomNav />
      </div>
    </BrowserRouter>
  );
}
