import { useState, useEffect } from 'react'
import { useT } from '../ctx.jsx'
import { API } from '../api.js'
import { useFetchOnce } from '../hooks.js'
import { Input } from '../components/ui.jsx'
import { DISCORD_BLURPLE } from '../constants.js'

function DiscordIcon({size=18}){return<svg width={size} height={size} viewBox="0 0 71 55" fill={DISCORD_BLURPLE}><path d="M60.1 4.9A58.5 58.5 0 0 0 45.6.8a.2.2 0 0 0-.2.1 40.7 40.7 0 0 0-1.8 3.7 54 54 0 0 0-16.2 0 37.4 37.4 0 0 0-1.8-3.7.2.2 0 0 0-.2-.1A58.4 58.4 0 0 0 10.9 4.9a.2.2 0 0 0-.1.1C1.6 18.2-.9 31.1.3 43.8a.2.2 0 0 0 .1.2 58.8 58.8 0 0 0 17.7 9 .2.2 0 0 0 .2-.1 42 42 0 0 0 3.6-5.9.2.2 0 0 0-.1-.3 38.7 38.7 0 0 1-5.5-2.6.2.2 0 0 1 0-.4c.4-.3.7-.6 1.1-.9a.2.2 0 0 1 .2 0c11.5 5.3 24 5.3 35.4 0a.2.2 0 0 1 .2 0c.4.3.7.6 1.1.9a.2.2 0 0 1 0 .4 36.2 36.2 0 0 1-5.5 2.6.2.2 0 0 0-.1.3 47.1 47.1 0 0 0 3.6 5.9.2.2 0 0 0 .2.1 58.6 58.6 0 0 0 17.8-9 .2.2 0 0 0 .1-.2c1.5-15.1-2.5-28-10.5-39.5a.2.2 0 0 0-.1-.1zM23.7 36.1c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2c3.6 0 6.5 3.3 6.4 7.2 0 4-2.8 7.2-6.4 7.2zm23.6 0c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2c3.6 0 6.5 3.3 6.4 7.2 0 4-2.9 7.2-6.4 7.2z"/></svg>}

export function ResetPassword({token,onDone}){const{C,sz}=useT();const[p,setP]=useState('');const[c,setC]=useState('');const[err,setErr]=useState('');const[ok,setOk]=useState(false);const[loading,setLoading]=useState(false)
  const submit=async e=>{e.preventDefault();setErr('');if(!p){setErr('Password is required');return};if(p!==c){setErr('Passwords do not match');return};setLoading(true)
    try{const r=await fetch(`${API}/auth/reset-password`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,password:p})});const d=await r.json()
      if(d.error){setErr(d.error);setLoading(false);return};setOk(true)}catch{setErr('Connection error');setLoading(false)}}
  return <div className="min-h-screen flex items-center justify-center p-4" style={{background:C.bg}}>
    <div className="w-full max-w-sm">
      <div className="text-center mb-8"><div className="font-black tracking-widest mb-1" style={{color:C.textBright,fontSize:32}}>SITREP</div></div>
      <div className="rounded-2xl p-8" style={{background:C.bgCard,border:`1px solid ${C.border}`}}>
        <div className="font-black mb-1" style={{color:C.textBright,fontSize:sz.base+2}}>Set new password</div>
        {ok?<><div className="py-4 font-bold text-center" style={{color:C.accent,fontSize:sz.base}}>Password updated. You can now sign in.</div>
          <button onClick={onDone} className="w-full py-3 rounded-xl font-black uppercase tracking-widest cursor-pointer" style={{background:C.accent,color:'#000',fontSize:sz.base}}>Back to Login</button></>
        :<form onSubmit={submit}>
          <Input label="New Password" value={p} onChange={setP} type="password" placeholder="new password"/>
          <Input label="Confirm Password" value={c} onChange={setC} type="password" placeholder="confirm password"/>
          {err&&<div className="mb-3 px-3 py-2.5 rounded-lg font-bold" style={{background:C.redBg,color:C.red,border:`1px solid ${C.redBorder}`,fontSize:sz.stat}}>{err}</div>}
          <button type="submit" disabled={loading} className="w-full py-3 rounded-xl font-black uppercase tracking-widest cursor-pointer disabled:opacity-50 transition-all" style={{background:C.accent,color:'#000',fontSize:sz.base}}>{loading?'Saving...':'Set Password'}</button>
        </form>}
      </div>
    </div>
  </div>}

export function Login({onLogin}){const{C,sz}=useT();const[u,setU]=useState('');const[p,setP]=useState('');const[err,setErr]=useState('');const[loading,setLoading]=useState(false);const[remember,setRemember]=useState(false);const[view,setView]=useState('login');const[fpEmail,setFpEmail]=useState('');const[fpMsg,setFpMsg]=useState('');const[fpErr,setFpErr]=useState('');const[fpLoading,setFpLoading]=useState(false);const[pendingToken,setPendingToken]=useState('');const[totpCode,setTotpCode]=useState('');const[totpErr,setTotpErr]=useState('');const[totpLoading,setTotpLoading]=useState(false)
  const{data:settings}=useFetchOnce(`${API}/settings/public`)
  const discordEnabled=!!settings?.discord_client_id
  useEffect(()=>{
    const params=new URLSearchParams(window.location.search)
    const derr=params.get('discord_error')
    if(!derr)return
    const dDiscordName=(params.get('discord_name')||'').replace(/[^a-zA-Z0-9_.# -]/g,'').slice(0,50)
    if(derr==='not_linked')setErr(`Discord account (${dDiscordName||'unknown'}) not linked to a panel user. Ask an owner to link your Discord.`)
    else setErr(`Discord login failed: ${derr}`)
    window.history.replaceState({},'',window.location.pathname)
  },[])
  const submit=async e=>{e.preventDefault();if(!u||!p)return;setLoading(true);setErr('')
    try{const r=await fetch(`${API}/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p,remember})});const d=await r.json()
      if(d.error){setErr(d.error);setLoading(false);return}
      if(d.requires_2fa){setPendingToken(d.pending_token);setView('totp');setLoading(false);return}
      onLogin({username:d.username,role:d.role})}catch{setErr('Connection error');setLoading(false)}}
  const submitTotp=async e=>{e.preventDefault();if(!totpCode)return;setTotpLoading(true);setTotpErr('')
    try{const r=await fetch(`${API}/auth/2fa/verify`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pending_token:pendingToken,code:totpCode.replace(/\s/g,'')})});const d=await r.json()
      if(d.error){setTotpErr(d.error);setTotpLoading(false);return}
      onLogin({username:d.username,role:d.role})}catch{setTotpErr('Connection error');setTotpLoading(false)}}
  const submitFp=async e=>{e.preventDefault();if(!fpEmail)return;setFpLoading(true);setFpErr('');setFpMsg('')
    try{const r=await fetch(`${API}/auth/forgot-password`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:fpEmail})});const d=await r.json()
      if(d.error){setFpErr(d.error);setFpLoading(false);return}
      setFpMsg(d.message)}catch{setFpErr('Connection error')}setFpLoading(false)}
  return <div className="min-h-screen flex items-center justify-center p-4" style={{background:C.bg}}>
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <div className="font-black tracking-widest mb-1" style={{color:C.textBright,fontSize:32}}>SITREP</div>
        <div className="font-bold uppercase tracking-widest" style={{color:C.textMuted,fontSize:sz.stat}}>Arma Reforger Server Panel <span className="px-1.5 py-0.5 rounded font-black" style={{background:C.orange+'22',color:C.orange,fontSize:sz.stat-1,border:`1px solid ${C.orange}40`}}>BETA</span></div>
      </div>
      <div className="rounded-2xl p-8" style={{background:C.bgCard,border:`1px solid ${C.border}`}}>
        {view==='totp'?<>
          <div className="font-black mb-1" style={{color:C.textBright,fontSize:sz.base+2}}>Two-Factor Authentication</div>
          <div className="mb-4" style={{color:C.textDim,fontSize:sz.base}}>Enter the 6-digit code from your authenticator app, or a backup code.</div>
          <form onSubmit={submitTotp}>
            <input value={totpCode} onChange={e=>setTotpCode(e.target.value)} placeholder="000000" maxLength={8} autoFocus autoComplete="one-time-code" inputMode="numeric" className="w-full rounded-lg px-3 py-3 outline-none font-mono text-center mb-3" style={{background:C.bgInput,border:`1px solid ${C.border}`,color:C.text,fontSize:sz.base+4,letterSpacing:'0.3em'}}/>
            {totpErr&&<div className="mb-3 px-3 py-2.5 rounded-lg font-bold" style={{background:C.redBg,color:C.red,border:`1px solid ${C.redBorder}`,fontSize:sz.stat}}>{totpErr}</div>}
            <button type="submit" disabled={totpLoading} className="w-full py-3 rounded-xl font-black uppercase tracking-widest cursor-pointer disabled:opacity-50 transition-all mb-3" style={{background:C.accent,color:'#000',fontSize:sz.base}}>{totpLoading?'Verifying...':'Verify'}</button>
          </form>
          <button onClick={()=>{setView('login');setPendingToken('');setTotpCode('');setTotpErr('')}} className="w-full py-2 rounded-xl font-bold cursor-pointer" style={{background:'transparent',color:C.textMuted,fontSize:sz.base}}>Back to Sign In</button>
        </>:view==='forgot'?<>
          <div className="font-black mb-1" style={{color:C.textBright,fontSize:sz.base+2}}>Reset password</div>
          <div className="mb-4" style={{color:C.textDim,fontSize:sz.base}}>Enter your email address and we'll send you a reset link.</div>
          {fpMsg?<div className="py-4 font-bold text-center" style={{color:C.accent,fontSize:sz.base}}>{fpMsg}</div>
          :<form onSubmit={submitFp}>
            <Input label="Email" value={fpEmail} onChange={setFpEmail} type="email" placeholder="your@email.com"/>
            {fpErr&&<div className="mb-3 px-3 py-2.5 rounded-lg font-bold" style={{background:C.redBg,color:C.red,border:`1px solid ${C.redBorder}`,fontSize:sz.stat}}>{fpErr}</div>}
            <button type="submit" disabled={fpLoading} className="w-full py-3 rounded-xl font-black uppercase tracking-widest cursor-pointer disabled:opacity-50 transition-all mb-3" style={{background:C.accent,color:'#000',fontSize:sz.base}}>{fpLoading?'Sending...':'Send Reset Link'}</button>
          </form>}
          <button onClick={()=>setView('login')} className="w-full py-2 rounded-xl font-bold cursor-pointer" style={{background:'transparent',color:C.textMuted,fontSize:sz.base}}>Back to Sign In</button>
        </>:<>
          {discordEnabled&&<><a href={`${API}/auth/discord`} className="flex items-center justify-center gap-3 w-full py-3 rounded-xl font-black mb-4 cursor-pointer transition-all" style={{background:'#5865F2',color:'#fff',fontSize:sz.base,textDecoration:'none'}} onMouseEnter={e=>e.currentTarget.style.background='#4752c4'} onMouseLeave={e=>e.currentTarget.style.background='#5865F2'}>
            <svg width="20" height="20" viewBox="0 0 71 55" fill="#fff"><path d="M60.1 4.9A58.5 58.5 0 0 0 45.6.8a.2.2 0 0 0-.2.1 40.7 40.7 0 0 0-1.8 3.7 54 54 0 0 0-16.2 0 37.4 37.4 0 0 0-1.8-3.7.2.2 0 0 0-.2-.1A58.4 58.4 0 0 0 10.9 4.9a.2.2 0 0 0-.1.1C1.6 18.2-.9 31.1.3 43.8a.2.2 0 0 0 .1.2 58.8 58.8 0 0 0 17.7 9 .2.2 0 0 0 .2-.1 42 42 0 0 0 3.6-5.9.2.2 0 0 0-.1-.3 38.7 38.7 0 0 1-5.5-2.6.2.2 0 0 1 0-.4c.4-.3.7-.6 1.1-.9a.2.2 0 0 1 .2 0c11.5 5.3 24 5.3 35.4 0a.2.2 0 0 1 .2 0c.4.3.7.6 1.1.9a.2.2 0 0 1 0 .4 36.2 36.2 0 0 1-5.5 2.6.2.2 0 0 0-.1.3 47.1 47.1 0 0 0 3.6 5.9.2.2 0 0 0 .2.1 58.6 58.6 0 0 0 17.8-9 .2.2 0 0 0 .1-.2c1.5-15.1-2.5-28-10.5-39.5a.2.2 0 0 0-.1-.1zM23.7 36.1c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2c3.6 0 6.5 3.3 6.4 7.2 0 4-2.8 7.2-6.4 7.2zm23.6 0c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2c3.6 0 6.5 3.3 6.4 7.2 0 4-2.9 7.2-6.4 7.2z"/></svg>
            Login
          </a>
          <div className="flex items-center gap-3 mb-4"><div className="flex-1 h-px" style={{background:C.border}}/><span style={{color:C.textMuted,fontSize:sz.stat}}>or</span><div className="flex-1 h-px" style={{background:C.border}}/></div></>}
          <form onSubmit={submit}>
            <Input label="Username" value={u} onChange={setU} placeholder="username"/>
            <Input label="Password" value={p} onChange={setP} type="password" placeholder="password"/>
            {err&&<div className="mb-3 px-3 py-2.5 rounded-lg font-bold" style={{background:C.redBg,color:C.red,border:`1px solid ${C.redBorder}`,fontSize:sz.stat}}>{err}</div>}
            <label className="flex items-center gap-2 mb-3 cursor-pointer" style={{color:C.textDim,fontSize:sz.base}}>
              <input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)} className="w-4 h-4 cursor-pointer" style={{accentColor:C.accent}}/>
              Remember me for 30 days
            </label>
            <button type="submit" disabled={loading} className="w-full py-3 rounded-xl font-black uppercase tracking-widest cursor-pointer disabled:opacity-50 transition-all" style={{background:C.accent,color:'#000',fontSize:sz.base}}>{loading?'Signing in...':'Sign In'}</button>
          </form>
          <div className="text-center mt-4"><button onClick={()=>setView('forgot')} className="cursor-pointer" style={{color:C.textMuted,fontSize:sz.stat,background:'none',border:'none'}}>Forgot password?</button></div>
        </>}
      </div>
    </div>
  </div>}

export function SetupWizard({onComplete}){const{C,sz}=useT()
  const[step,setStep]=useState('account') // account | 2fa-prompt | 2fa-setup | 2fa-backup
  const[username,setUsername]=useState('');const[email,setEmail]=useState('');const[password,setPassword]=useState('');const[confirm,setConfirm]=useState('')
  const[err,setErr]=useState('');const[loading,setLoading]=useState(false)
  const[createdUser,setCreatedUser]=useState(null)
  // 2FA setup state
  const[twoFaSecret,setTwoFaSecret]=useState('');const[twoFaQr,setTwoFaQr]=useState('')
  const[twoFaCode,setTwoFaCode]=useState('');const[twoFaErr,setTwoFaErr]=useState('')
  const[twoFaLoading,setTwoFaLoading]=useState(false);const[backupCodes,setBackupCodes]=useState([])

  const submitAccount=async e=>{e.preventDefault();setErr('')
    if(password!==confirm){setErr('Passwords do not match');return}
    if(!password||password.length<12){setErr('Password must be at least 12 characters');return}
    if(!email){setErr('Recovery email is required');return}
    setLoading(true)
    try{const r=await fetch(`${API}/setup/complete`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password,email})});const d=await r.json()
      if(d.error){setErr(d.error);setLoading(false);return}
      setCreatedUser({username:d.username,role:d.role});setStep('2fa-prompt')}catch{setErr('Connection error')}setLoading(false)}

  const start2fa=async()=>{setTwoFaLoading(true);setTwoFaErr('')
    try{const r=await fetch(`${API}/auth/2fa/setup`);const d=await r.json()
      if(d.error){setTwoFaErr(d.error);setTwoFaLoading(false);return}
      setTwoFaSecret(d.secret);setTwoFaQr(d.qr);setStep('2fa-setup')}catch{setTwoFaErr('Connection error')}setTwoFaLoading(false)}

  const confirm2fa=async()=>{setTwoFaLoading(true);setTwoFaErr('')
    try{const r=await fetch(`${API}/auth/2fa/enable`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret:twoFaSecret,code:twoFaCode.replace(/\s/g,'')})});const d=await r.json()
      if(d.error){setTwoFaErr(d.error);setTwoFaLoading(false);return}
      setBackupCodes(d.backup_codes);setStep('2fa-backup')}catch{setTwoFaErr('Connection error')}setTwoFaLoading(false)}

  return<div className="min-h-screen flex items-center justify-center p-4" style={{background:C.bg}}>
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <div className="font-black tracking-widest mb-1" style={{color:C.textBright,fontSize:32}}>SITREP</div>
        <div className="font-bold uppercase tracking-widest" style={{color:C.textMuted,fontSize:sz.stat}}>First-Time Setup</div>
      </div>
      <div className="rounded-2xl p-8" style={{background:C.bgCard,border:`1px solid ${C.border}`}}>

        {step==='account'&&<>
          <div className="mb-5 px-3 py-3 rounded-lg" style={{background:C.accentBg,border:`1px solid ${C.accent}30`}}>
            <div className="font-bold" style={{color:C.accent,fontSize:sz.base}}>Create your owner account</div>
            <div style={{color:C.textDim,fontSize:sz.stat,marginTop:4}}>This account has full control of the panel. You can add more users after setup.</div>
          </div>
          <form onSubmit={submitAccount}>
            <Input label="Username" value={username} onChange={setUsername} placeholder="e.g. admin"/>
            <Input label="Recovery Email" value={email} onChange={setEmail} type="email" placeholder="your@email.com"/>
            <Input label="Password" value={password} onChange={setPassword} type="password" placeholder="at least 12 characters"/>
            <Input label="Confirm Password" value={confirm} onChange={setConfirm} type="password" placeholder="repeat password"/>
            {err&&<div className="mb-3 px-3 py-2.5 rounded-lg font-bold" style={{background:C.redBg,color:C.red,border:`1px solid ${C.redBorder}`,fontSize:sz.stat}}>{err}</div>}
            <button type="submit" disabled={loading||!username||!password||!confirm||!email} className="w-full py-3 rounded-xl font-black uppercase tracking-widest cursor-pointer disabled:opacity-50 transition-all" style={{background:C.accent,color:'#000',fontSize:sz.base}}>{loading?'Creating...':'Create Account'}</button>
          </form>
        </>}

        {step==='2fa-prompt'&&<>
          <div className="text-center mb-5">
            <div className="font-black mb-2" style={{color:C.textBright,fontSize:sz.base+4}}>Account created!</div>
            <div style={{color:C.textDim,fontSize:sz.base}}>Welcome, <strong>{createdUser?.username}</strong>.</div>
          </div>
          <div className="mb-5 px-4 py-4 rounded-xl" style={{background:C.orange+'12',border:`1px solid ${C.orange}40`}}>
            <div className="font-black mb-1" style={{color:C.orange,fontSize:sz.base}}>Recommended: Enable 2FA</div>
            <div style={{color:C.textDim,fontSize:sz.stat,lineHeight:1.6}}>Two-factor authentication protects your account even if your password is compromised. Takes 30 seconds to set up.</div>
          </div>
          {twoFaErr&&<div className="mb-3 px-3 py-2.5 rounded-lg font-bold" style={{background:C.redBg,color:C.red,border:`1px solid ${C.redBorder}`,fontSize:sz.stat}}>{twoFaErr}</div>}
          <button onClick={start2fa} disabled={twoFaLoading} className="w-full py-3 rounded-xl font-black uppercase tracking-widest cursor-pointer disabled:opacity-50 transition-all mb-3" style={{background:C.orange,color:'#000',fontSize:sz.base}}>{twoFaLoading?'Loading...':'Set Up 2FA Now'}</button>
          <button onClick={()=>onComplete(createdUser)} className="w-full py-2.5 rounded-xl font-bold cursor-pointer" style={{background:'transparent',color:C.textMuted,fontSize:sz.base,border:`1px solid ${C.border}`}}>Skip for now</button>
        </>}

        {step==='2fa-setup'&&<>
          <div className="font-black mb-1" style={{color:C.textBright,fontSize:sz.base+2}}>Set up authenticator</div>
          <div style={{color:C.textDim,fontSize:sz.base,marginBottom:12}}>Scan with <strong>Google Authenticator</strong>, <strong>Authy</strong>, or any TOTP app.</div>
          <img src={twoFaQr} alt="QR Code" style={{width:180,height:180,borderRadius:8,marginBottom:12,display:'block',margin:'0 auto 12px'}}/>
          <div style={{color:C.textMuted,fontSize:sz.stat,marginBottom:4,textAlign:'center'}}>Or enter key manually:</div>
          <div className="font-mono px-3 py-2 rounded-lg mb-4 text-center select-all" style={{background:C.bgInput,color:C.accent,fontSize:sz.stat,letterSpacing:'0.1em'}}>{twoFaSecret}</div>
          <div style={{color:C.textDim,fontSize:sz.base,marginBottom:8}}>Enter the 6-digit code to confirm:</div>
          <input value={twoFaCode} onChange={e=>setTwoFaCode(e.target.value)} placeholder="000000" maxLength={6} inputMode="numeric" autoFocus className="w-full rounded-lg px-3 py-2.5 outline-none font-mono text-center mb-3" style={{background:C.bgInput,border:`1px solid ${C.border}`,color:C.text,fontSize:sz.base+2,letterSpacing:'0.3em'}}/>
          {twoFaErr&&<div className="mb-3 px-3 py-2 rounded-lg font-bold" style={{background:C.redBg,color:C.red,border:`1px solid ${C.redBorder}`,fontSize:sz.stat}}>{twoFaErr}</div>}
          <button onClick={confirm2fa} disabled={twoFaLoading||twoFaCode.length<6} className="w-full py-3 rounded-xl font-black uppercase tracking-widest cursor-pointer disabled:opacity-50 transition-all mb-3" style={{background:C.accent,color:'#000',fontSize:sz.base}}>{twoFaLoading?'Verifying...':'Confirm'}</button>
          <button onClick={()=>onComplete(createdUser)} className="w-full py-2.5 rounded-xl font-bold cursor-pointer" style={{background:'transparent',color:C.textMuted,fontSize:sz.base,border:`1px solid ${C.border}`}}>Skip for now</button>
        </>}

        {step==='2fa-backup'&&<>
          <div className="font-black mb-2" style={{color:C.textBright,fontSize:sz.base+2}}>2FA enabled!</div>
          <div className="px-4 py-3 rounded-xl mb-4" style={{background:C.orange+'18',border:`1px solid ${C.orange}40`}}>
            <div style={{fontWeight:700,color:C.orange,fontSize:sz.base,marginBottom:4}}>Save your backup codes</div>
            <div style={{color:C.textDim,fontSize:sz.stat}}>If you lose your authenticator, these let you sign in. Each code works once. Store them safely — they won't be shown again.</div>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-5">{backupCodes.map((c,i)=><div key={i} className="font-mono px-3 py-2 rounded-lg text-center" style={{background:C.bgInput,color:C.text,fontSize:sz.stat,border:`1px solid ${C.border}`}}>{c}</div>)}</div>
          <button onClick={()=>onComplete(createdUser)} className="w-full py-3 rounded-xl font-black uppercase tracking-widest cursor-pointer transition-all" style={{background:C.accent,color:'#000',fontSize:sz.base}}>Enter Panel</button>
        </>}

      </div>
    </div>
  </div>}
