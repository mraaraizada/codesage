import React,{useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useAuth} from '../context/AuthContext.jsx';
export default function Login(){
  const [email,setEmail]=useState('tester@fixora.dev');const [password,setPassword]=useState('fixora123');
  const {login}=useAuth();const navigate=useNavigate();
  function submit(e){e.preventDefault();if(!email.includes('@')||password.length<6)return;login(email);
    // INTENTIONAL DEFECT: navigates to a route that is not registered.
    navigate('/home');
  }
  return <section className="panel auth"><span className="eyebrow">PRODUCTOTHON · CHALLENGE 01</span><h1>Welcome back</h1><p>Sign in to continue testing the FIXORA workspace.</p><form onSubmit={submit}><label>Email<input value={email} onChange={e=>setEmail(e.target.value)} type="email"/></label><label>Password<input value={password} onChange={e=>setPassword(e.target.value)} type="password"/></label><button className="primary">Sign in</button></form><small>Demo credentials are prefilled. Any valid email and 6+ character password work.</small></section>
}
