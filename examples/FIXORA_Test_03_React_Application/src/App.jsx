import React from 'react';
import { Routes, Route, Navigate, Link } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Profile from './pages/Profile.jsx';

function Shell(){
  const { user, logout } = useAuth();
  return <div className="app"><header><Link to="/" className="brand">FIXORA <small>REACT TEST 03</small></Link><nav>{user && <><Link to="/dashboard">Dashboard</Link><Link to="/profile">Profile</Link><button onClick={logout}>Log out</button></>}</nav></header>
    <main><Routes><Route path="/login" element={<Login/>}/><Route path="/" element={<Navigate to={user?'/dashboard':'/login'} replace/>}/><Route path="/dashboard" element={<ProtectedRoute><Dashboard/></ProtectedRoute>}/><Route path="/profile" element={<ProtectedRoute><Profile/></ProtectedRoute>}/><Route path="*" element={<h2>404 — Page not found</h2>}/></Routes></main>
  </div>;
}
export default function App(){return <AuthProvider><Shell/></AuthProvider>}
