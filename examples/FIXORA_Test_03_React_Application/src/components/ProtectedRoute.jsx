import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
export default function ProtectedRoute({children}){
  const {user}=useAuth();
  // INTENTIONAL DEFECT: checks a different key than AuthContext writes.
  const hasSession=Boolean(localStorage.getItem('fixora_session'));
  return user && hasSession ? children : <Navigate to="/login" replace/>;
}
