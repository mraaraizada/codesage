import React from 'react';
import {describe,it,expect,beforeEach} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {AuthProvider,useAuth} from '../context/AuthContext.jsx';
function Harness(){const {user,login,logout,updateProfile}=useAuth();return <div><span>{user?.name||'signed out'}</span><button onClick={()=>login('qa@fixora.dev')}>login</button><button onClick={logout}>logout</button><button onClick={()=>updateProfile('QA User')}>rename</button></div>}
beforeEach(()=>localStorage.clear());
describe('authentication state',()=>{
 it('stores a session when logging in',()=>{render(<AuthProvider><Harness/></AuthProvider>);fireEvent.click(screen.getByText('login'));expect(screen.getByText('qa')).toBeInTheDocument();expect(JSON.parse(localStorage.getItem('fixora_user')).email).toBe('qa@fixora.dev')});
 it('clears persisted session on logout',()=>{render(<AuthProvider><Harness/></AuthProvider>);fireEvent.click(screen.getByText('login'));fireEvent.click(screen.getByText('logout'));expect(localStorage.getItem('fixora_user')).toBeNull()});
 it('persists profile edits',()=>{render(<AuthProvider><Harness/></AuthProvider>);fireEvent.click(screen.getByText('login'));fireEvent.click(screen.getByText('rename'));expect(JSON.parse(localStorage.getItem('fixora_user')).name).toBe('QA User')});
});
