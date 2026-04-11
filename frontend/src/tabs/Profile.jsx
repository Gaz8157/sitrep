import { useState, useEffect, useRef } from 'react'
import { useT } from '../ctx.jsx'
import { API, put, del, on401, getHeaders } from '../api.js'
import { useFetchOnce } from '../hooks.js'
import { Badge, Btn, Toggle } from '../components/ui.jsx'
function ProfileTab({authUser, userProfile, setUserProfile, toast}) {
  const {C, sz} = useT()
  const [displayName, setDisplayName] = useState(userProfile?.display_name || '')
  const [defaultTab, setDefaultTab] = useState(userProfile?.default_tab || 'dashboard')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState(null) // local blob URL for instant preview
  const [avatarKey, setAvatarKey] = useState(() => Date.now().toString())
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef(null)
  const AVATAR_COLORS = [C.accent, C.blue, C.purple, C.red, C.orange]
  const avatarBg = AVATAR_COLORS[(authUser?.username?.charCodeAt(0) || 0) % AVATAR_COLORS.length]
  const hasAvatar = userProfile?.avatar_ext
  const displayedName = displayName || authUser?.username || '?'
  const initial = displayedName[0].toUpperCase()

  const pickFile = file => {
    if (!file) return
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) { toast('Only jpg, png, webp allowed','danger'); return }
    if (file.size > 10*1024*1024) { toast('Image too large (max 10MB)','danger'); return }
    // Instant local preview — no server round-trip lag
    const preview = URL.createObjectURL(file)
    setAvatarPreview(preview)
    uploadAvatar(file, preview)
  }

  const uploadAvatar = async (file, preview) => {
    setUploading(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      const r = await fetch(`${API}/users/avatar`, {method:'POST', headers:getHeaders(), body:fd})
      if (r.status === 401) { on401(); URL.revokeObjectURL(preview); setAvatarPreview(null); return }
      const d = await r.json()
      if (d.error) { toast(d.error,'danger'); URL.revokeObjectURL(preview); setAvatarPreview(null); return }
      setUserProfile(p => ({...p, avatar_ext: d.ext}))
      setAvatarKey(Date.now().toString())
      URL.revokeObjectURL(preview)
      setAvatarPreview(null)
      toast('Avatar updated')
    } catch { toast('Upload failed','danger'); URL.revokeObjectURL(preview); setAvatarPreview(null) }
    finally { setUploading(false) }
  }

  const removeAvatar = async () => {
    const d = await del(`${API}/users/avatar`)
    if (d.error) { toast(d.error,'danger'); return }
    setUserProfile(p => ({...p, avatar_ext: ''}))
    setAvatarPreview(null)
    toast('Avatar removed','warning')
  }

  const save = async () => {
    setSaving(true)
    try {
      const r = await put(`${API}/users/profile`, {display_name: displayName, default_tab: defaultTab})
      if (r.error) { toast(r.error,'danger'); return }
      setUserProfile(p => ({...p, display_name: displayName, default_tab: defaultTab}))
      toast('Profile saved')
    } finally { setSaving(false) }
  }

  const onDrop = e => { e.preventDefault(); setDragOver(false); pickFile(e.dataTransfer.files?.[0]) }
  const onDragOver = e => { e.preventDefault(); setDragOver(true) }
  const onDragLeave = () => setDragOver(false)

  const TAB_OPTIONS = ['dashboard','console','admin','mods','config','startup','stats','aigm']
  const discordLinked = !!userProfile?.discord_id
  const fmtCreated = iso => {
    if (!iso) return '—'
    try { return new Date(iso).toLocaleDateString(undefined, {year:'numeric',month:'long',day:'numeric'}) } catch { return iso }
  }

  const avatarSrc = avatarPreview || (hasAvatar ? `${API}/users/${authUser?.username}/avatar?v=${userProfile.avatar_ext}&k=${avatarKey}` : null)

  const PLabel = ({children}) => (
    <label style={{display:'block',fontWeight:700,color:C.textDim,fontSize:sz.stat,marginBottom:6,textTransform:'uppercase',letterSpacing:'0.8px'}}>{children}</label>
  )
  const inputStyle = {width:'100%',background:C.bgInput,border:`1px solid ${C.border}`,borderRadius:10,padding:'9px 13px',color:C.text,fontSize:sz.input,outline:'none',fontFamily:'inherit',boxSizing:'border-box',transition:'border-color 0.15s'}

  return (
    <div className="profile-tab-anim">
      {/* Hero banner */}
      <div style={{borderRadius:14,overflow:'hidden',marginBottom:24,background:`linear-gradient(135deg, ${avatarBg}18 0%, ${C.bgInput} 100%)`,border:`1px solid ${avatarBg}30`}}>
        <div style={{padding:'20px 20px 16px',display:'flex',alignItems:'center',gap:18}}>
          {/* Avatar drop zone */}
          <div className="avatar-zone" style={{position:'relative',flexShrink:0,cursor:'pointer'}}
            onClick={()=>!uploading&&fileRef.current?.click()}
            onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}>
            <div style={{width:240,height:240,borderRadius:'50%',overflow:'hidden',display:'flex',alignItems:'center',justifyContent:'center',
              background:avatarSrc?'transparent':avatarBg,
              border:`3px solid ${dragOver?C.accent:avatarBg}`,
              boxShadow:dragOver?`0 0 0 4px ${C.accent}30`:'none',
              transition:'border-color 0.15s, box-shadow 0.15s'}}>
              {avatarSrc
                ? <img src={avatarSrc} style={{width:'100%',height:'100%',objectFit:'cover'}} alt=""/>
                : <span style={{color:'#fff',fontSize:88,fontWeight:800}}>{initial}</span>}
            </div>
            {/* Hover overlay */}
            <div className="avatar-overlay" style={{position:'absolute',inset:0,borderRadius:'50%',background:'rgba(0,0,0,0.55)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',opacity:0,transition:'opacity 0.18s',pointerEvents:'none'}}>
              {uploading
                ? <div style={{width:22,height:22,borderRadius:'50%',border:'2.5px solid rgba(255,255,255,0.2)',borderTopColor:'#fff',animation:'spin-cw 0.7s linear infinite'}}/>
                : <>
                    <svg width={18} height={18} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                    <span style={{color:'#fff',fontSize:9,fontWeight:700,marginTop:4,letterSpacing:'0.5px'}}>CHANGE</span>
                  </>}
            </div>
            <input type="file" ref={fileRef} style={{display:'none'}} accept="image/jpeg,image/png,image/webp" onChange={e=>pickFile(e.target.files?.[0])}/>
          </div>
          {/* Identity */}
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:900,color:C.textBright,fontSize:sz.base+4,lineHeight:1.2,marginBottom:4,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
              {displayedName}
            </div>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6,flexWrap:'wrap'}}>
              <span style={{color:C.textMuted,fontSize:sz.stat,fontFamily:'monospace'}}>@{authUser?.username}</span>
              <Badge text={authUser?.role} v={ROLE_COLORS[authUser?.role]||'dim'}/>
            </div>
            <div style={{color:C.textMuted,fontSize:sz.stat}}>Member since {fmtCreated(userProfile?.created)}</div>
          </div>
          {/* Avatar actions */}
          <div style={{display:'flex',flexDirection:'column',gap:6,flexShrink:0}}>
            <Btn small onClick={()=>fileRef.current?.click()} disabled={uploading}>{uploading?'Uploading…':'Upload'}</Btn>
            {(hasAvatar||avatarPreview)&&<Btn small v="danger" onClick={removeAvatar} disabled={uploading}>Remove</Btn>}
          </div>
        </div>
        <div style={{padding:'0 20px 4px',fontSize:sz.stat-1,color:C.textMuted,opacity:0.7}}>Drag an image onto your avatar · JPG, PNG or WebP · max 10 MB</div>
        <div style={{height:4,background:`linear-gradient(90deg, ${avatarBg}60, ${C.accent}40, transparent)`}}/>
      </div>

      {/* Form fields */}
      <div style={{display:'flex',flexDirection:'column',gap:16}}>
        <div>
          <PLabel>Display Name</PLabel>
          <input value={displayName} onChange={e=>setDisplayName(e.target.value.slice(0,32))} placeholder={authUser?.username} maxLength={32}
            style={inputStyle}
            onFocus={e=>e.target.style.borderColor=C.accent+'80'} onBlur={e=>e.target.style.borderColor=C.border}/>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          <div>
            <PLabel>Username</PLabel>
            <div style={{...inputStyle,color:C.textMuted,cursor:'default',display:'flex',alignItems:'center'}}>@{authUser?.username}</div>
          </div>
          <div>
            <PLabel>Default Tab</PLabel>
            <select value={defaultTab} onChange={e=>setDefaultTab(e.target.value)} style={{...inputStyle,cursor:'pointer'}}>
              {TAB_OPTIONS.map(t=><option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
            </select>
          </div>
        </div>

        {/* Discord row */}
        <div>
          <PLabel>Discord</PLabel>
          <div style={{display:'flex',alignItems:'center',gap:12,padding:'10px 14px',borderRadius:10,
            background:discordLinked?`#5865F218`:C.bgInput,
            border:`1px solid ${discordLinked?'#5865F240':C.border}`}}>
            <svg width={18} height={14} viewBox="0 0 71 55" fill={discordLinked?'#5865F2':C.textMuted} style={{flexShrink:0}}><path d="M60.1 4.9A58.5 58.5 0 0 0 45.6.8a.2.2 0 0 0-.2.1 40.7 40.7 0 0 0-1.8 3.7 54 54 0 0 0-16.2 0 37.4 37.4 0 0 0-1.8-3.7.2.2 0 0 0-.2-.1A58.4 58.4 0 0 0 10.9 4.9a.2.2 0 0 0-.1.1C1.6 18.2-.9 31.1.3 43.8a.2.2 0 0 0 .1.2 58.8 58.8 0 0 0 17.7 9 .2.2 0 0 0 .2-.1 42 42 0 0 0 3.6-5.9.2.2 0 0 0-.1-.3 38.7 38.7 0 0 1-5.5-2.6.2.2 0 0 1 0-.4c.4-.3.7-.6 1.1-.9a.2.2 0 0 1 .2 0c11.5 5.3 24 5.3 35.4 0a.2.2 0 0 1 .2 0c.4.3.7.6 1.1.9a.2.2 0 0 1 0 .4 36.2 36.2 0 0 1-5.5 2.6.2.2 0 0 0-.1.3 47.1 47.1 0 0 0 3.6 5.9.2.2 0 0 0 .2.1 58.6 58.6 0 0 0 17.8-9 .2.2 0 0 0 .1-.2c1.5-15.1-2.5-28-10.5-39.5a.2.2 0 0 0-.1-.1zM23.7 36.1c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2c3.6 0 6.5 3.3 6.4 7.2 0 4-2.8 7.2-6.4 7.2zm23.6 0c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2c3.6 0 6.5 3.3 6.4 7.2 0 4-2.9 7.2-6.4 7.2z"/></svg>
            {discordLinked
              ? <><span style={{fontWeight:700,color:'#5865F2',fontSize:sz.input}}>{userProfile.discord_username||'Linked'}</span>
                  <span style={{color:C.textMuted,fontSize:sz.stat,marginLeft:'auto',fontFamily:'monospace'}}>{userProfile.discord_id}</span></>
              : <span style={{color:C.textMuted,fontSize:sz.input}}>Not linked — ask an owner to connect your Discord</span>}
          </div>
        </div>

        <div style={{paddingTop:4}}>
          <Btn onClick={save} disabled={saving}>{saving?'Saving…':'Save Profile'}</Btn>
        </div>
      </div>
    </div>
  )
}

function SecurityTab({authUser, toast}) {
  const {C, sz} = useT()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [show, setShow] = useState({current:false, next:false, confirm:false})
  const [email, setEmail] = useState('')
  const [emailSaving, setEmailSaving] = useState(false)
  const {data:meData,reload:reloadMe}=useFetchOnce(`${API}/auth/me`)
  useEffect(()=>{if(meData?.email)setEmail(meData.email)},[meData])
  const saveEmail=async()=>{setEmailSaving(true);try{const r=await fetch(`${API}/users/update`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:authUser.username,email})});const d=await r.json();if(d.error){toast(d.error,'danger')}else{toast('Email saved')}}catch{toast('Connection error','danger')}setEmailSaving(false)}
  // 2FA state
  const [twoFaEnabled,setTwoFaEnabled]=useState(false)
  const [twoFaView,setTwoFaView]=useState('idle') // idle | setup | disable | backup
  const [twoFaSecret,setTwoFaSecret]=useState('')
  const [twoFaQr,setTwoFaQr]=useState('')
  const [twoFaCode,setTwoFaCode]=useState('')
  const [twoFaErr,setTwoFaErr]=useState('')
  const [twoFaLoading,setTwoFaLoading]=useState(false)
  const [backupCodes,setBackupCodes]=useState([])
  useEffect(()=>{if(meData?.totp_enabled)setTwoFaEnabled(true)},[meData])
  const startSetup=async()=>{setTwoFaLoading(true);setTwoFaErr('');try{const r=await fetch(`${API}/auth/2fa/setup`);const d=await r.json();if(d.error){setTwoFaErr(d.error);setTwoFaLoading(false);return};setTwoFaSecret(d.secret);setTwoFaQr(d.qr);setTwoFaView('setup')}catch{setTwoFaErr('Connection error')}setTwoFaLoading(false)}
  const confirmEnable=async()=>{setTwoFaLoading(true);setTwoFaErr('');try{const r=await fetch(`${API}/auth/2fa/enable`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret:twoFaSecret,code:twoFaCode.replace(/\s/g,'')})});const d=await r.json();if(d.error){setTwoFaErr(d.error);setTwoFaLoading(false);return};setBackupCodes(d.backup_codes);setTwoFaEnabled(true);setTwoFaView('backup');reloadMe()}catch{setTwoFaErr('Connection error')}setTwoFaLoading(false)}
  const confirmDisable=async()=>{setTwoFaLoading(true);setTwoFaErr('');try{const r=await fetch(`${API}/auth/2fa/disable`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:twoFaCode.replace(/\s/g,'')})});const d=await r.json();if(d.error){setTwoFaErr(d.error);setTwoFaLoading(false);return};setTwoFaEnabled(false);setTwoFaView('idle');setTwoFaCode('');reloadMe()}catch{setTwoFaErr('Connection error')}setTwoFaLoading(false)}

  const pwStrength = pw => {
    if (!pw) return 0
    let s = 0
    if (pw.length >= 8) s++
    if (pw.length >= 12) s++
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++
    if (/\d/.test(pw)) s++
    if (/[^A-Za-z0-9]/.test(pw)) s++
    return Math.min(s, 4)
  }

  const strength = pwStrength(next)
  const strengthLabel = ['','Weak','Fair','Good','Strong'][strength]
  const strengthColor = [C.border, C.red, C.orange, C.blue, C.accent][strength]

  const save = async () => {
    setErr('')
    if (!current || !next || !confirm) { setErr('All fields required'); return }
    if (!next) { setErr('New password is required'); return }
    if (next !== confirm) { setErr('New passwords do not match'); return }
    setSaving(true)
    try {
      const r = await put(`${API}/users/password`, {current_password: current, new_password: next})
      if (r.error) { setErr(r.error); return }
      setCurrent(''); setNext(''); setConfirm('')
      toast('Password changed — other sessions revoked')
    } finally { setSaving(false) }
  }

  const inputBase = {width:'100%',background:C.bgInput,border:`1px solid ${C.border}`,borderRadius:10,padding:'9px 13px',color:C.text,fontSize:sz.input,outline:'none',fontFamily:'inherit',boxSizing:'border-box',paddingRight:52,transition:'border-color 0.15s'}
  const PLabel = ({children}) => <label style={{display:'block',fontWeight:700,color:C.textDim,fontSize:sz.stat,marginBottom:6,textTransform:'uppercase',letterSpacing:'0.8px'}}>{children}</label>

  const PwField = ({id, label, value, onChange, autoComplete}) => (
    <div>
      <PLabel>{label}</PLabel>
      <div className="pw-field" style={{position:'relative',border:`1px solid ${C.border}`,borderRadius:10,background:C.bgInput,transition:'border-color 0.15s'}}>
        <input type={show[id]?'text':'password'} autoComplete={autoComplete} value={value} onChange={e=>onChange(e.target.value)}
          style={{width:'100%',background:'transparent',border:'none',borderRadius:10,padding:'9px 52px 9px 13px',color:C.text,fontSize:sz.input,outline:'none',fontFamily:'inherit',boxSizing:'border-box'}}/>
        <button type="button" onClick={()=>setShow(s=>({...s,[id]:!s[id]}))}
          style={{position:'absolute',right:0,top:0,bottom:0,width:44,display:'flex',alignItems:'center',justifyContent:'center',background:'none',border:'none',cursor:'pointer',color:show[id]?C.accent:C.textMuted,fontSize:sz.stat,fontWeight:700,letterSpacing:'0.3px',transition:'color 0.15s'}}>
          {show[id]?'HIDE':'SHOW'}
        </button>
      </div>
    </div>
  )

  return (
    <div className="profile-tab-anim">
      <div style={{fontWeight:900,color:C.textBright,fontSize:sz.base+2,marginBottom:4}}>Recovery Email</div>
      <div style={{color:C.textMuted,fontSize:sz.stat,marginBottom:12}}>Used for password reset. Not shared with anyone.</div>
      <div style={{display:'flex',gap:8,maxWidth:380,marginBottom:28}}>
        <input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="your@email.com" className="flex-1 rounded-lg px-3 py-2 outline-none font-mono" style={{background:C.bgInput,border:`1px solid ${C.border}`,color:C.text,fontSize:sz.input}}/>
        <Btn onClick={saveEmail} disabled={emailSaving}>{emailSaving?'Saving…':'Save'}</Btn>
      </div>
      <div style={{fontWeight:900,color:C.textBright,fontSize:sz.base+2,marginBottom:4,marginTop:8}}>Two-Factor Authentication</div>
      <div style={{color:C.textMuted,fontSize:sz.stat,marginBottom:12}}>{twoFaEnabled?'2FA is enabled on your account.':'Add an extra layer of security using an authenticator app.'}</div>
      {twoFaView==='idle'&&<div style={{maxWidth:380,marginBottom:28}}>
        {twoFaEnabled
          ?<Btn v="danger" onClick={()=>{setTwoFaView('disable');setTwoFaCode('');setTwoFaErr('')}}>Disable 2FA</Btn>
          :<Btn onClick={startSetup} disabled={twoFaLoading}>{twoFaLoading?'Loading...':'Enable 2FA'}</Btn>}
        {twoFaErr&&<div className="mt-2 px-3 py-2 rounded-lg font-bold" style={{background:C.redBg,color:C.red,border:`1px solid ${C.redBorder}`,fontSize:sz.stat}}>{twoFaErr}</div>}
      </div>}
      {twoFaView==='setup'&&<div style={{maxWidth:380,marginBottom:28}}>
        <div style={{color:C.textDim,fontSize:sz.base,marginBottom:12}}>Scan this QR code with <strong>Google Authenticator</strong>, <strong>Authy</strong>, or any TOTP app.</div>
        <img src={twoFaQr} alt="QR Code" style={{width:180,height:180,borderRadius:8,marginBottom:12,display:'block'}}/>
        <div style={{color:C.textMuted,fontSize:sz.stat,marginBottom:4}}>Or enter this key manually:</div>
        <div className="font-mono px-3 py-2 rounded-lg mb-4 select-all" style={{background:C.bgInput,color:C.accent,fontSize:sz.stat,letterSpacing:'0.1em'}}>{twoFaSecret}</div>
        <div style={{color:C.textDim,fontSize:sz.base,marginBottom:8}}>Enter the 6-digit code from your app to confirm:</div>
        <input value={twoFaCode} onChange={e=>setTwoFaCode(e.target.value)} placeholder="000000" maxLength={6} inputMode="numeric" className="w-full rounded-lg px-3 py-2.5 outline-none font-mono text-center mb-3" style={{background:C.bgInput,border:`1px solid ${C.border}`,color:C.text,fontSize:sz.base+2,letterSpacing:'0.3em'}}/>
        {twoFaErr&&<div className="mb-3 px-3 py-2 rounded-lg font-bold" style={{background:C.redBg,color:C.red,border:`1px solid ${C.redBorder}`,fontSize:sz.stat}}>{twoFaErr}</div>}
        <div className="flex gap-2">
          <Btn onClick={confirmEnable} disabled={twoFaLoading||twoFaCode.length<6}>{twoFaLoading?'Verifying...':'Confirm & Enable'}</Btn>
          <Btn v="ghost" onClick={()=>{setTwoFaView('idle');setTwoFaCode('');setTwoFaErr('')}}>Cancel</Btn>
        </div>
      </div>}
      {twoFaView==='backup'&&<div style={{maxWidth:380,marginBottom:28}}>
        <div className="px-4 py-3 rounded-xl mb-4" style={{background:C.orange+'18',border:`1px solid ${C.orange}40`}}>
          <div style={{fontWeight:700,color:C.orange,fontSize:sz.base,marginBottom:4}}>Save your backup codes</div>
          <div style={{color:C.textDim,fontSize:sz.stat}}>These codes let you sign in if you lose your authenticator. Each code can only be used once. Store them somewhere safe.</div>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-4">{backupCodes.map((c,i)=><div key={i} className="font-mono px-3 py-2 rounded-lg text-center" style={{background:C.bgInput,color:C.text,fontSize:sz.stat,border:`1px solid ${C.border}`}}>{c}</div>)}</div>
        <Btn onClick={()=>setTwoFaView('idle')}>Done</Btn>
      </div>}
      {twoFaView==='disable'&&<div style={{maxWidth:380,marginBottom:28}}>
        <div style={{color:C.textDim,fontSize:sz.base,marginBottom:12}}>Enter a code from your authenticator app (or a backup code) to disable 2FA.</div>
        <input value={twoFaCode} onChange={e=>setTwoFaCode(e.target.value)} placeholder="000000" maxLength={11} inputMode="numeric" className="w-full rounded-lg px-3 py-2.5 outline-none font-mono text-center mb-3" style={{background:C.bgInput,border:`1px solid ${C.border}`,color:C.text,fontSize:sz.base+2,letterSpacing:'0.3em'}}/>
        {twoFaErr&&<div className="mb-3 px-3 py-2 rounded-lg font-bold" style={{background:C.redBg,color:C.red,border:`1px solid ${C.redBorder}`,fontSize:sz.stat}}>{twoFaErr}</div>}
        <div className="flex gap-2">
          <Btn v="danger" onClick={confirmDisable} disabled={twoFaLoading||!twoFaCode}>{twoFaLoading?'Disabling...':'Disable 2FA'}</Btn>
          <Btn v="ghost" onClick={()=>{setTwoFaView('idle');setTwoFaCode('');setTwoFaErr('')}}>Cancel</Btn>
        </div>
      </div>}
      <div style={{fontWeight:900,color:C.textBright,fontSize:sz.base+2,marginBottom:4}}>Change Password</div>
      <div style={{color:C.textMuted,fontSize:sz.stat,marginBottom:20}}>Changing your password will sign out all other active sessions.</div>
      <div style={{display:'flex',flexDirection:'column',gap:14,maxWidth:380}}>
        <PwField id="current" label="Current Password" value={current} onChange={setCurrent} autoComplete="current-password"/>

        <div>
          <PwField id="next" label="New Password" value={next} onChange={setNext} autoComplete="new-password"/>
          {/* Strength bar */}
          {next.length > 0 && (
            <div style={{marginTop:8}}>
              <div style={{display:'flex',gap:3,marginBottom:4}}>
                {[1,2,3,4].map(i=>(
                  <div key={i} style={{flex:1,height:3,borderRadius:2,background:strength>=i?strengthColor:C.border,transition:'background 0.2s'}}/>
                ))}
              </div>
              <div style={{fontSize:sz.stat-1,fontWeight:700,color:strengthColor,letterSpacing:'0.5px'}}>{strengthLabel}</div>
            </div>
          )}
        </div>

        <PwField id="confirm" label="Confirm New Password" value={confirm} onChange={setConfirm} autoComplete="new-password"/>

        {/* Confirm match indicator */}
        {confirm.length > 0 && (
          <div style={{fontSize:sz.stat,fontWeight:700,color:next===confirm?C.accent:C.red,marginTop:-6}}>
            {next===confirm ? '✓ Passwords match' : '✗ Passwords do not match'}
          </div>
        )}

        {err&&<div style={{padding:'8px 12px',borderRadius:8,background:C.redBg,border:`1px solid ${C.redBorder}`,color:C.red,fontSize:sz.stat,fontWeight:700}}>{err}</div>}
        <div style={{paddingTop:4}}><Btn onClick={save} disabled={saving||!!(!current||!next||!confirm||next!==confirm)}>{saving?'Saving…':'Change Password'}</Btn></div>
      </div>
    </div>
  )
}

function LayoutTab({userProfile, setUserProfile, toast}) {
  const {C, sz} = useT()
  const PANEL_DEFS = [
    {id:'perf',label:'Performance'},
    {id:'bw',label:'Bandwidth'},
    {id:'storage',label:'Storage'},
    {id:'bwest',label:'Bandwidth Est.'},
    {id:'players',label:'Players'},
    {id:'stats',label:'Stats'},
  ]
  const savedOrder = userProfile?.panel_defaults?.order || []
  const savedHidden = userProfile?.panel_defaults?.hidden || []
  const orderedIds = new Set(savedOrder)
  const initialOrder = savedOrder.length
    ? [
        ...savedOrder.map(id => PANEL_DEFS.find(p=>p.id===id)).filter(Boolean),
        ...PANEL_DEFS.filter(p => !orderedIds.has(p.id))
      ]
    : PANEL_DEFS
  const [panels, setPanels] = useState(initialOrder)
  const [hidden, setHidden] = useState(new Set(savedHidden))
  const [saving, setSaving] = useState(false)
  const dragIdx = useRef(null)

  const onDragStart = (e, i) => { dragIdx.current = i; e.dataTransfer.effectAllowed = 'move' }
  const onDragOver = (e, i) => {
    e.preventDefault()
    const from = dragIdx.current
    if (from === null || from === i) return
    dragIdx.current = i
    setPanels(prev => {
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(i, 0, moved)
      return next
    })
  }
  const onDragEnd = () => { dragIdx.current = null }
  const toggleHidden = id => setHidden(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  const save = async () => {
    setSaving(true)
    const panel_defaults = {order: panels.map(p=>p.id), hidden: [...hidden]}
    try {
      const r = await put(`${API}/users/profile`, {panel_defaults})
      if (r.error) { toast(r.error,'danger'); return }
      setUserProfile(p=>({...p, panel_defaults}))
      toast('Layout saved')
    } finally { setSaving(false) }
  }

  const reset = () => { setPanels(PANEL_DEFS); setHidden(new Set()) }

  return (
    <div>
      <div style={{fontWeight:900,color:C.textBright,fontSize:sz.base+2,marginBottom:8}}>Dashboard Layout</div>
      <div style={{color:C.textMuted,fontSize:sz.stat,marginBottom:16}}>Drag to reorder. Toggle visibility for each panel.</div>
      <div style={{display:'flex',flexDirection:'column',gap:4,marginBottom:20}}>
        {panels.map((p,i)=>(
          <div key={p.id} draggable onDragStart={e=>onDragStart(e,i)} onDragOver={e=>onDragOver(e,i)} onDragEnd={onDragEnd}
            style={{display:'flex',alignItems:'center',gap:12,padding:'10px 12px',borderRadius:8,background:C.bgInput,border:`1px solid ${C.border}`,cursor:'grab',userSelect:'none'}}>
            <span style={{color:C.textMuted,fontSize:16,cursor:'grab'}}>⠿</span>
            <span style={{flex:1,fontWeight:700,color:hidden.has(p.id)?C.textMuted:C.textBright,fontSize:sz.base}}>{p.label}</span>
            <button onClick={()=>toggleHidden(p.id)} style={{padding:'3px 10px',borderRadius:6,fontWeight:700,fontSize:sz.stat,cursor:'pointer',background:hidden.has(p.id)?C.bgInput:C.accentBg,color:hidden.has(p.id)?C.textMuted:C.accent,border:`1px solid ${hidden.has(p.id)?C.border:C.accent+'40'}`}}>
              {hidden.has(p.id)?'Hidden':'Visible'}
            </button>
          </div>
        ))}
      </div>
      <div style={{display:'flex',gap:8}}>
        <Btn onClick={save} disabled={saving}>{saving?'Saving...':'Save Layout'}</Btn>
        <Btn v="ghost" onClick={reset}>Reset to Default</Btn>
      </div>
    </div>
  )
}

function AppearanceLabel({children}) {
  const {C, sz} = useT()
  return <label style={{display:'block',fontWeight:700,color:C.textDim,fontSize:sz.stat,marginBottom:8,textTransform:'uppercase',letterSpacing:'0.5px'}}>{children}</label>
}

function AppearanceTab({authUser, userProfile, setUserProfile, toast, themeName, setThemeName, textSize, setTextSize}) {
  const {C, sz} = useT()
  const prefs = userProfile?.preferences || {}
  const [bgType, setBgType] = useState(prefs.bg_type || 'none')
  const [customAccent, setCustomAccent] = useState(prefs.custom_accent || '')
  const [customBgColor, setCustomBgColor] = useState(prefs.custom_bg_color || '#0d1117')
  const [saving, setSaving] = useState(false)
  const bgFileRef = useRef(null)

  const uploadBackground = async file => {
    if (!file) return
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) { toast('Only jpg, png, webp allowed','danger'); return }
    if (file.size > 5*1024*1024) { toast('Image too large (max 5MB)','danger'); return }
    try {
      const fd = new FormData(); fd.append('file', file)
      const r = await fetch(`${API}/users/background`, {method:'POST', headers:getHeaders(), body:fd})
      if (r.status===401){on401();return}
      const d = await r.json()
      if (d.error) { toast(d.error,'danger'); return }
      setUserProfile(p=>({...p, bg_ext:d.ext, preferences:{...p?.preferences, bg_type:'image'}}))
      setBgType('image')
      toast('Background updated')
    } catch(e) { toast('Upload failed','danger') }
  }

  const removeBackground = async () => {
    const d = await del(`${API}/users/background`)
    if (d.error) { toast(d.error,'danger'); return }
    setUserProfile(p=>({...p, bg_ext:'', preferences:{...p?.preferences, bg_type:'none'}}))
    setBgType('none')
    toast('Background removed','warning')
  }

  const save = async () => {
    setSaving(true)
    const newPrefs = {
      theme: themeName,
      text_size: textSize,
      custom_accent: customAccent || null,
      bg_type: bgType,
      custom_bg_color: bgType==='color' ? customBgColor : null
    }
    try {
      const r = await put(`${API}/users/profile`, {preferences: newPrefs})
      if (r.error) { toast(r.error,'danger'); return }
      setUserProfile(p=>({...p, preferences:newPrefs}))
      toast('Appearance saved')
    } finally { setSaving(false) }
  }

  return (
    <div>
      <div style={{fontWeight:900,color:C.textBright,fontSize:sz.base+2,marginBottom:20}}>Appearance</div>

      {/* Theme picker */}
      <div style={{marginBottom:20}}>
        <AppearanceLabel>Theme</AppearanceLabel>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6}}>
          {Object.entries(THEMES).map(([key,theme])=>(
            <button key={key} onClick={()=>{setThemeName(key);localStorage.setItem('sitrep-theme',key)}}
              style={{background:themeName===key?`${theme.accent}10`:theme.bgCard,border:`2px solid ${themeName===key?theme.accent:theme.border}`,borderRadius:8,padding:'8px 10px',cursor:'pointer',textAlign:'left'}}
              onMouseEnter={e=>{if(themeName!==key)e.currentTarget.style.borderColor=theme.accent+'80'}}
              onMouseLeave={e=>{if(themeName!==key)e.currentTarget.style.borderColor=theme.border}}>
              <div style={{display:'flex',gap:2,marginBottom:5,height:4,borderRadius:3,overflow:'hidden'}}>
                <div style={{flex:3,background:theme.bg}}/><div style={{flex:2,background:theme.accent}}/><div style={{flex:1,background:theme.blue}}/><div style={{flex:1,background:theme.red}}/>
              </div>
              <div style={{fontSize:9,fontWeight:700,color:themeName===key?theme.accent:theme.textDim,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{theme.name}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Custom accent */}
      <div style={{marginBottom:20}}>
        <AppearanceLabel>Custom Accent Color</AppearanceLabel>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <input type="color" value={customAccent||C.accent} onChange={e=>setCustomAccent(e.target.value)} style={{width:40,height:32,borderRadius:6,border:`1px solid ${C.border}`,background:'none',cursor:'pointer',padding:2}}/>
          <span style={{color:C.textMuted,fontSize:sz.stat}}>{customAccent||'(theme default)'}</span>
          {customAccent&&<button onClick={()=>setCustomAccent('')} style={{color:C.textMuted,fontSize:sz.stat,background:'none',border:'none',cursor:'pointer',textDecoration:'underline'}}>Reset</button>}
        </div>
      </div>

      {/* Text size */}
      <div style={{marginBottom:20}}>
        <AppearanceLabel>Text Size</AppearanceLabel>
        <div style={{display:'flex',borderRadius:8,overflow:'hidden',border:`1px solid ${C.border}`,width:'fit-content'}}>
          {['S','M','L','XL','XXL'].map(s=>(
            <button key={s} onClick={()=>{setTextSize(s);localStorage.setItem('sitrep-ts',s)}} style={{padding:'6px 14px',fontWeight:700,cursor:'pointer',background:textSize===s?C.accentBg:'transparent',color:textSize===s?C.accent:C.textDim,border:'none',fontSize:10}}>{s}</button>
          ))}
        </div>
      </div>

      {/* Background */}
      <div style={{marginBottom:20}}>
        <AppearanceLabel>Background</AppearanceLabel>
        <div style={{display:'flex',borderRadius:8,overflow:'hidden',border:`1px solid ${C.border}`,width:'fit-content',marginBottom:12}}>
          {[['none','None'],['color','Color'],['image','Image']].map(([v,l])=>(
            <button key={v} onClick={()=>setBgType(v)} style={{padding:'6px 14px',fontWeight:700,cursor:'pointer',background:bgType===v?C.accentBg:'transparent',color:bgType===v?C.accent:C.textDim,border:'none',fontSize:sz.stat}}>{l}</button>
          ))}
        </div>
        {bgType==='color'&&(
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <input type="color" value={customBgColor} onChange={e=>setCustomBgColor(e.target.value)} style={{width:40,height:32,borderRadius:6,border:`1px solid ${C.border}`,background:'none',cursor:'pointer',padding:2}}/>
            <span style={{color:C.textMuted,fontSize:sz.stat}}>{customBgColor}</span>
          </div>
        )}
        {bgType==='image'&&(
          <div>
            <input type="file" ref={bgFileRef} style={{display:'none'}} accept="image/jpeg,image/png,image/webp" onChange={e=>uploadBackground(e.target.files?.[0])}/>
            {userProfile?.bg_ext
              ? <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <img src={`${API}/users/${authUser?.username}/background?v=${userProfile.bg_ext}`} style={{width:80,height:50,objectFit:'cover',borderRadius:6,border:`1px solid ${C.border}`}} alt=""/>
                  <div style={{display:'flex',flexDirection:'column',gap:6}}>
                    <Btn small onClick={()=>bgFileRef.current?.click()}>Change</Btn>
                    <Btn small v="danger" onClick={removeBackground}>Remove</Btn>
                  </div>
                </div>
              : <Btn small onClick={()=>bgFileRef.current?.click()}>Upload Image</Btn>
            }
          </div>
        )}
      </div>

      <Btn onClick={save} disabled={saving}>{saving?'Saving...':'Save Appearance'}</Btn>
    </div>
  )
}

function SessionsTab({toast}) {
  const {C, sz} = useT()
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [revoking, setRevoking] = useState(null)
  const [revokingAll, setRevokingAll] = useState(false)

  const load = async () => {
    setLoading(true)
    const d = await (async () => {
      try {
        const r = await fetch(`${API}/users/sessions`, {headers: getHeaders()})
        if (r.status === 401) { on401(); return null }
        return r.json()
      } catch { return null }
    })()
    setLoading(false)
    if (d?.sessions) setSessions(d.sessions)
  }

  useEffect(() => { load() }, [])

  const revoke = async sid => {
    setRevoking(sid)
    try {
      const r = await fetch(`${API}/users/sessions/${sid}`, {method:'DELETE', headers:getHeaders()})
      if (r.status === 401) { on401(); return }
      const d = await r.json()
      if (d.error) { toast(d.error, 'danger'); return }
      toast('Session revoked', 'warning')
      setSessions(prev => prev.filter(s => s.sid !== sid))
    } finally { setRevoking(null) }
  }

  const revokeAll = async () => {
    setRevokingAll(true)
    try {
      const r = await fetch(`${API}/users/sessions`, {method:'DELETE', headers:getHeaders()})
      if (r.status === 401) { on401(); return }
      const d = await r.json()
      if (d.error) { toast(d.error, 'danger'); return }
      toast(d.message || 'All other sessions revoked', 'warning')
      setSessions(prev => prev.filter(s => s.is_current))
    } finally { setRevokingAll(false) }
  }

  const fmtAgo = ts => {
    if (!ts) return '—'
    const diff = Date.now()/1000 - ts
    if (diff < 60) return 'just now'
    if (diff < 3600) return `${Math.floor(diff/60)}m ago`
    if (diff < 86400) return `${Math.floor(diff/3600)}h ago`
    if (diff < 604800) return `${Math.floor(diff/86400)}d ago`
    return new Date(ts * 1000).toLocaleDateString()
  }

  const fmtExpiry = ts => {
    if (!ts) return '—'
    const diff = ts - Date.now()/1000
    if (diff <= 0) return 'expired'
    if (diff < 3600) return `${Math.floor(diff/60)}m left`
    if (diff < 86400) return `${Math.floor(diff/3600)}h left`
    return `${Math.floor(diff/86400)}d left`
  }

  const otherCount = sessions.filter(s => !s.is_current).length

  return (
    <div className="profile-tab-anim">
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
        <div style={{fontWeight:900,color:C.textBright,fontSize:sz.base+2}}>Active Sessions</div>
        {otherCount > 0 && (
          <Btn small v="danger" onClick={revokeAll} disabled={revokingAll}>
            {revokingAll ? 'Revoking…' : `Sign out ${otherCount} other${otherCount>1?'s':''}`}
          </Btn>
        )}
      </div>
      <div style={{color:C.textMuted,fontSize:sz.stat,marginBottom:20}}>
        {sessions.length} active {sessions.length===1?'session':'sessions'}
      </div>

      {loading ? (
        <div style={{display:'flex',gap:10,alignItems:'center',padding:'24px 0',color:C.textMuted,fontSize:sz.stat}}>
          <div style={{width:16,height:16,borderRadius:'50%',border:`2px solid ${C.border}`,borderTopColor:C.accent,animation:'spin-cw 0.7s linear infinite'}}/>
          Loading sessions…
        </div>
      ) : sessions.length === 0 ? (
        <div style={{padding:'32px 0',textAlign:'center',color:C.textMuted,fontSize:sz.stat}}>No active sessions found.</div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:20}}>
          {sessions.map(s => {
            const iconColor = s.is_current ? C.accent : C.textMuted
            const DeviceIcon = () => {
              if (s.device === 'mobile') return (
                <svg width={17} height={17} fill="none" stroke={iconColor} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <rect x="5" y="2" width="14" height="20" rx="2"/>
                  <circle cx="12" cy="17" r="1" fill={iconColor} stroke="none"/>
                </svg>
              )
              if (s.device === 'tablet') return (
                <svg width={17} height={17} fill="none" stroke={iconColor} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <rect x="4" y="2" width="16" height="20" rx="2"/>
                  <circle cx="12" cy="17.5" r="0.8" fill={iconColor} stroke="none"/>
                </svg>
              )
              // desktop
              return (
                <svg width={17} height={17} fill="none" stroke={iconColor} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <rect x="2" y="3" width="20" height="13" rx="2"/>
                  <path d="M8 21h8M12 16v5"/>
                </svg>
              )
            }
            const deviceLabel = {mobile:'Mobile',tablet:'Tablet',desktop:'Desktop'}[s.device||'desktop']
            return (
              <div key={s.sid} style={{
                display:'flex',alignItems:'center',gap:14,
                padding:'14px 16px',borderRadius:12,
                background:s.is_current?`${C.accent}08`:C.bgInput,
                border:`1px solid ${s.is_current?C.accent+'50':C.border}`,
                borderLeft:`3px solid ${s.is_current?C.accent:C.border}`,
                transition:'opacity 0.2s',
                opacity:revoking===s.sid?0.5:1}}>
                {/* Device icon badge */}
                <div style={{width:40,height:40,borderRadius:12,background:s.is_current?`${C.accent}15`:C.bgCard,border:`1px solid ${s.is_current?C.accent+'30':C.border}`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                  <DeviceIcon/>
                </div>
                {/* Info */}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:5,flexWrap:'wrap'}}>
                    <span style={{fontWeight:700,color:C.textBright,fontSize:sz.base}}>{deviceLabel}</span>
                    {s.is_current && <span style={{fontSize:9,fontWeight:800,color:C.accent,background:`${C.accent}20`,padding:'2px 8px',borderRadius:99,letterSpacing:'0.8px'}}>ACTIVE NOW</span>}
                    <span style={{fontSize:9,fontWeight:700,color:s.remember?C.blue:C.textMuted,background:s.remember?`${C.blue}15`:`${C.textMuted}12`,padding:'2px 8px',borderRadius:99,letterSpacing:'0.5px'}}>
                      {s.remember?'30-DAY':'SESSION'}
                    </span>
                  </div>
                  <div style={{display:'flex',gap:14,flexWrap:'wrap'}}>
                    <span style={{color:C.textMuted,fontSize:sz.stat}}>Started {fmtAgo(s.created_at)}</span>
                    <span style={{color:C.textMuted,fontSize:sz.stat}}>{fmtExpiry(s.expires_at)}</span>
                  </div>
                </div>
                {/* Action */}
                {s.is_current
                  ? <div style={{fontSize:sz.stat,color:C.textMuted,fontWeight:600,flexShrink:0}}>Current</div>
                  : <Btn small v="danger" onClick={()=>revoke(s.sid)} disabled={!!revoking}>
                      {revoking===s.sid ? '…' : 'Revoke'}
                    </Btn>}
              </div>
            )
          })}
        </div>
      )}

      <div style={{padding:'12px 16px',borderRadius:12,background:`${C.accent}08`,border:`1px solid ${C.accent}20`,display:'flex',gap:10,alignItems:'flex-start'}}>
        <svg width={14} height={14} style={{marginTop:1,flexShrink:0}} fill="none" stroke={C.accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
        <div style={{color:C.textMuted,fontSize:sz.stat,lineHeight:1.6}}>Revoking a session immediately signs out that device. Changing your password automatically revokes all other sessions.</div>
      </div>
    </div>
  )
}

export function ProfileModal({open, initialTab, onClose, authUser, userProfile, setUserProfile, toast, themeName, setThemeName, textSize, setTextSize}) {
  const {C, sz} = useT()
  const [activeTab, setActiveTab] = useState(initialTab || 'profile')
  useEffect(() => { if (open) setActiveTab(initialTab || 'profile') }, [open, initialTab])
  if (!open) return null

  const AVATAR_COLORS = [C.accent, C.blue, C.purple, C.red, C.orange]
  const avatarBg = AVATAR_COLORS[(authUser?.username?.charCodeAt(0) || 0) % AVATAR_COLORS.length]
  const hasAvatar = userProfile?.avatar_ext
  const displayedName = userProfile?.display_name || authUser?.username || '?'
  const initial = displayedName[0].toUpperCase()

  // Tab definitions: [id, label, SVG path data (24x24 viewBox)]
  const TABS = [
    ['profile','Profile',<svg width={15} height={15} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>],
    ['appearance','Appearance',<svg width={15} height={15} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>],
    ['layout','Layout',<svg width={15} height={15} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>],
    ['security','Security',<svg width={15} height={15} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>],
    ['sessions','Sessions',<svg width={15} height={15} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>],
  ]

  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16,background:'rgba(0,0,0,0.8)',backdropFilter:'blur(12px)'}}>
      <div onClick={e=>e.stopPropagation()} style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:20,width:'100%',maxWidth:720,maxHeight:'90vh',display:'flex',flexDirection:'column',overflow:'hidden',boxShadow:`0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px ${C.border}`}}>
        {/* Header */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 20px',borderBottom:`1px solid ${C.border}`,flexShrink:0,background:`linear-gradient(135deg, ${avatarBg}0a 0%, transparent 100%)`}}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <div style={{width:32,height:32,borderRadius:'50%',overflow:'hidden',display:'flex',alignItems:'center',justifyContent:'center',background:hasAvatar?'transparent':avatarBg,flexShrink:0}}>
              {hasAvatar
                ? <img src={`${API}/users/${authUser?.username}/avatar?v=${userProfile.avatar_ext}`} style={{width:'100%',height:'100%',objectFit:'cover'}} alt=""/>
                : <span style={{color:'#fff',fontSize:13,fontWeight:800}}>{initial}</span>}
            </div>
            <div>
              <div style={{fontWeight:900,color:C.textBright,fontSize:sz.base+1,lineHeight:1.1}}>{displayedName}</div>
              <div style={{color:C.textMuted,fontSize:sz.stat-1}}>@{authUser?.username} · {authUser?.role}</div>
            </div>
          </div>
          <button onClick={onClose} style={{cursor:'pointer',color:C.textDim,fontSize:20,background:`${C.border}40`,border:`1px solid ${C.border}`,borderRadius:8,lineHeight:1,padding:'3px 9px',transition:'background 0.15s'}}
            onMouseEnter={e=>e.currentTarget.style.background=C.bgInput} onMouseLeave={e=>e.currentTarget.style.background=`${C.border}40`}>×</button>
        </div>

        <div style={{display:'flex',flex:1,overflow:'hidden'}}>
          {/* Sidebar */}
          <div style={{width:170,borderRight:`1px solid ${C.border}`,padding:'12px 8px',display:'flex',flexDirection:'column',gap:2,flexShrink:0}}>
            {TABS.map(([id,label,icon])=>(
              <button key={id} onClick={()=>setActiveTab(id)}
                style={{width:'100%',textAlign:'left',padding:'9px 12px',borderRadius:10,fontWeight:700,cursor:'pointer',fontSize:sz.base,
                  background:activeTab===id?C.accentBg:'transparent',
                  color:activeTab===id?C.accent:C.textDim,
                  border:'none',borderLeft:activeTab===id?`3px solid ${C.accent}`:'3px solid transparent',
                  display:'flex',alignItems:'center',gap:9,transition:'background 0.1s, color 0.1s'}}
                onMouseEnter={e=>{if(activeTab!==id){e.currentTarget.style.background=C.bgInput;e.currentTarget.style.color=C.text}}}
                onMouseLeave={e=>{if(activeTab!==id){e.currentTarget.style.background='transparent';e.currentTarget.style.color=C.textDim}}}>
                <span style={{flexShrink:0,opacity:activeTab===id?1:0.6}}>{icon}</span>
                {label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div style={{flex:1,overflow:'auto',padding:24}}>
            {activeTab==='profile'&&<ProfileTab authUser={authUser} userProfile={userProfile} setUserProfile={setUserProfile} toast={toast}/>}
            {activeTab==='appearance'&&<AppearanceTab authUser={authUser} userProfile={userProfile} setUserProfile={setUserProfile} toast={toast} themeName={themeName} setThemeName={setThemeName} textSize={textSize} setTextSize={setTextSize}/>}
            {activeTab==='layout'&&<LayoutTab userProfile={userProfile} setUserProfile={setUserProfile} toast={toast}/>}
            {activeTab==='security'&&<SecurityTab authUser={authUser} toast={toast}/>}
            {activeTab==='sessions'&&<SessionsTab toast={toast}/>}
          </div>
        </div>
      </div>
    </div>
  )
}

export function AvatarWidget({authUser, userProfile, onClick}) {
  const {C, sz} = useT()
  const name = userProfile?.display_name || authUser?.username || '?'
  const initial = name[0].toUpperCase()
  const hasAvatar = userProfile?.avatar_ext
  const AVATAR_COLORS = [C.accent, C.blue, C.purple, C.red, C.orange]
  const avatarBg = AVATAR_COLORS[(authUser?.username?.charCodeAt(0) || 0) % AVATAR_COLORS.length]
  const roleDot = {owner:C.accent,head_admin:C.purple,admin:C.blue,moderator:C.orange,viewer:C.textMuted,demo:C.textMuted}[authUser?.role] || C.textMuted
  return (
    <div style={{position:'relative',cursor:'pointer',flexShrink:0}} onClick={onClick}>
      <div style={{width:28,height:28,borderRadius:'50%',overflow:'hidden',display:'flex',alignItems:'center',justifyContent:'center',background:hasAvatar?'transparent':avatarBg,border:`2px solid ${avatarBg}40`}}>
        {hasAvatar
          ? <img src={`${API}/users/${authUser?.username}/avatar?v=${userProfile.avatar_ext}`} style={{width:'100%',height:'100%',objectFit:'cover'}} alt=""/>
          : <span style={{color:'#fff',fontSize:sz.stat-1,fontWeight:800}}>{initial}</span>}
      </div>
      <div style={{position:'absolute',bottom:-1,right:-1,width:8,height:8,borderRadius:'50%',background:roleDot,border:`1.5px solid ${C.bgCard}`}}/>
    </div>
  )
}

export function ProfileDropdown({authUser, userProfile, onClose, onOpen, onLogout}) {
  const {C, sz} = useT()
  const name = userProfile?.display_name || authUser?.username || '?'
  const initial = name[0].toUpperCase()
  const hasAvatar = userProfile?.avatar_ext
  const AVATAR_COLORS = [C.accent, C.blue, C.purple, C.red, C.orange]
  const avatarBg = AVATAR_COLORS[(authUser?.username?.charCodeAt(0) || 0) % AVATAR_COLORS.length]
  const ref = useRef(null)
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose])
  const menuItems = [
    ['Profile','profile',<svg width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>],
    ['Appearance','appearance',<svg width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>],
    ['Layout','layout',<svg width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>],
    ['Security','security',<svg width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>],
    ['Sessions','sessions',<svg width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>],
  ]
  return (
    <div ref={ref} style={{position:'absolute',right:0,top:'calc(100% + 8px)',background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:14,width:220,zIndex:300,boxShadow:`0 16px 48px rgba(0,0,0,0.5), 0 0 0 1px ${C.border}`,overflow:'hidden'}}>
      {/* User header */}
      <div style={{display:'flex',alignItems:'center',gap:10,padding:'12px 14px',borderBottom:`1px solid ${C.border}`,background:`linear-gradient(135deg, ${avatarBg}12 0%, transparent 100%)`}}>
        <div style={{width:40,height:40,borderRadius:'50%',overflow:'hidden',display:'flex',alignItems:'center',justifyContent:'center',background:hasAvatar?'transparent':avatarBg,border:`2px solid ${avatarBg}50`,flexShrink:0}}>
          {hasAvatar
            ? <img src={`${API}/users/${authUser?.username}/avatar?v=${userProfile.avatar_ext}`} style={{width:'100%',height:'100%',objectFit:'cover'}} alt=""/>
            : <span style={{color:'#fff',fontSize:sz.base+1,fontWeight:800}}>{initial}</span>}
        </div>
        <div style={{minWidth:0,flex:1}}>
          <div style={{fontWeight:800,color:C.textBright,fontSize:sz.base,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{name}</div>
          <div style={{marginTop:2}}><Badge text={authUser.role} v={ROLE_COLORS[authUser.role]||'dim'}/></div>
        </div>
      </div>
      {/* Menu items */}
      <div style={{padding:'6px 4px'}}>
        {menuItems.map(([label,tab,icon])=>
          <div key={tab} onClick={()=>onOpen(tab)}
            style={{display:'flex',alignItems:'center',gap:10,padding:'8px 12px',borderRadius:9,cursor:'pointer',color:C.textDim,fontSize:sz.base,fontWeight:600,transition:'background 0.1s,color 0.1s'}}
            onMouseEnter={e=>{e.currentTarget.style.background=C.bgInput;e.currentTarget.style.color=C.text}}
            onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color=C.textDim}}>
            <span style={{opacity:0.7,flexShrink:0}}>{icon}</span>{label}
          </div>
        )}
        <div style={{borderTop:`1px solid ${C.border}`,margin:'4px 0'}}/>
        <div onClick={onLogout}
          style={{display:'flex',alignItems:'center',gap:10,padding:'8px 12px',borderRadius:9,cursor:'pointer',color:C.red,fontSize:sz.base,fontWeight:700,transition:'background 0.1s'}}
          onMouseEnter={e=>e.currentTarget.style.background=C.redBg} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
          <svg width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
          Sign Out
        </div>
      </div>
    </div>
  )
}
