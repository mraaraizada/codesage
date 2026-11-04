import React, { createContext, useContext, useState } from 'react';
const AuthContext=createContext(null);
export function AuthProvider({children}){
  const [user,setUser]=useState(()=>{try{return JSON.parse(localStorage.getItem('fixora_user'))}catch{return null}});
  function login(email){
    const next={name:email.split('@')[0],email};
    setUser(next);
    localStorage.setItem('fixora_user',JSON.stringify(next));
  }
  function logout(){
    // INTENTIONAL DEFECT: in-memory state is cleared but persisted session remains.
    setUser(null);
  }
  function updateProfile(name){
    if(!user)return;
    const next={...user,name};
    setUser(next);
    // INTENTIONAL DEFECT: persistence is not synchronized after profile edits.
  }
  return <AuthContext.Provider value={{user,login,logout,updateProfile}}>{children}</AuthContext.Provider>;
}
export function useAuth(){const value=useContext(AuthContext);if(!value)throw new Error('useAuth must be used inside AuthProvider');return value}
