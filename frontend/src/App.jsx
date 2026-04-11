import { useState, useEffect, useRef, useCallback } from 'react'
import { Ctx } from './ctx.jsx'
import { API, setServerId, authHeaders, getHeaders, on401 } from './api.js'
import { useToast, useMobile } from './hooks.js'
import { THEMES, TEXT_SIZES, TABS, ROLE_TABS, ROLE_COLORS } from './constants.js'
import { Badge, Toasts } from './components/ui.jsx'
import { ResetPassword, Login, SetupWizard } from './tabs/Auth.jsx'
import ServerPicker from './tabs/ServerPicker.jsx'
import { ProfileModal, AvatarWidget, ProfileDropdown } from './tabs/Profile.jsx'
import Dashboard from './tabs/Dashboard.jsx'
import Console from './tabs/Console.jsx'
import Startup from './tabs/Startup.jsx'
import Admin from './tabs/Admin.jsx'
import Config from './tabs/Config.jsx'
import Mods from './tabs/Mods.jsx'
import Files from './tabs/Files.jsx'
import Webhooks from './tabs/Webhooks.jsx'
import Network from './tabs/Network.jsx'
import AiGm from './tabs/AiGm.jsx'
import Scheduler from './tabs/Scheduler.jsx'
import Tracker from './tabs/Tracker.jsx'

const ROUTES={dashboard:Dashboard,console:Console,startup:Startup,admin:Admin,config:Config,mods:Mods,files:Files,webhooks:Webhooks,network:Network,aigm:AiGm,scheduler:Scheduler,tracker:Tracker}

export default function App(){
  const[themeName,setThemeName]=useState(()=>localStorage.getItem('sitrep-theme')||'dark')
  const[textSize,setTextSize]=useState(()=>localStorage.getItem('sitrep-ts')||'M')
  const C=THEMES[themeName]||THEMES.dark;const sz=TEXT_SIZES[textSize]||TEXT_SIZES.M
  const[authUser,setAuthUser]=useState(null);const[authLoading,setAuthLoading]=useState(true);const[needsSetup,setNeedsSetup]=useState(false)
  const [userProfile, setUserProfile] = useState(null)
  const [profileModalOpen, setProfileModalOpen] = useState(false)
  const [profileModalTab, setProfileModalTab] = useState('profile')
  const{toasts,push:toast,dismiss:dismissToast}=useToast()
  const [selectedServer, setSelectedServer] = useState(null)

  const selectServer = useCallback(server => {
    setServerId(server ? server.id : null)
    setSelectedServer(server)
    if (server) localStorage.setItem('sitrep-server-id', String(server.id))
    else localStorage.removeItem('sitrep-server-id')
  }, [])

  const backToServers = useCallback(() => {
    setServerId(null)
    setSelectedServer(null)
    localStorage.removeItem('sitrep-server-id')
  }, [])

  // Auto-restore last server selection after login
  useEffect(() => {
    if (authUser && !selectedServer) {
      const savedId = localStorage.getItem('sitrep-server-id')
      if (savedId) {
        fetch(`${API}/servers`, {headers: authHeaders()})
          .then(r => {if(r.status===401){on401();return null};return r.json()})
          .then(d => {
            if(!d)return
            const saved = (d.servers || []).find(s => s.id === parseInt(savedId))
            if (saved) selectServer(saved)
          })
          .catch(() => {})
      }
    }
  }, [authUser, selectedServer, selectServer])

  useEffect(()=>{
    // Check first-run setup status, then check auth
    fetch(`${API}/setup/status`).then(r=>r.ok?r.json():null).then(d=>{
      if(d?.needs_setup){setNeedsSetup(true);setAuthLoading(false);return}
      fetch(`${API}/auth/me`,{headers:getHeaders()}).then(async r=>{
        if(r.ok){
          const u=await r.json();setAuthUser(u)
          fetch(`${API}/users/profile`,{headers:getHeaders()})
            .then(r=>r.ok?r.json():null)
            .then(p=>{if(p&&!p.error)setUserProfile(p)})
            .catch(()=>{})
        }
        setAuthLoading(false)
      }).catch(()=>setAuthLoading(false))
    }).catch(()=>{
      fetch(`${API}/auth/me`,{headers:getHeaders()}).then(async r=>{
        if(r.ok){const u=await r.json();setAuthUser(u)}
        setAuthLoading(false)
      }).catch(()=>setAuthLoading(false))
    })
  },[])
  useEffect(()=>{const h=()=>{setAuthUser(null);setUserProfile(null);localStorage.removeItem('sitrep-server-id')};window.addEventListener('sitrep-401',h);return()=>window.removeEventListener('sitrep-401',h)},[])
  const logout=async()=>{try{await fetch(`${API}/auth/logout`,{method:'POST'})}catch{};setAuthUser(null);setUserProfile(null);setServerId(null);setSelectedServer(null);localStorage.removeItem('sitrep-server-id')}
  const CSS=`::-webkit-scrollbar{width:5px;height:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:${C.border};border-radius:4px}::selection{background:${C.accent}25;color:${C.textBright}}@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}@keyframes spin-cw{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}@keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}*{scrollbar-width:thin;scrollbar-color:${C.border} transparent;-webkit-tap-highlight-color:transparent;box-sizing:border-box}input,select,textarea{font-size:16px!important}button{touch-action:manipulation}img{max-width:100%}.overflow-auto,.overflow-y-auto{-webkit-overflow-scrolling:touch}.profile-tab-anim{animation:fadeIn 0.15s ease}.avatar-zone:hover .avatar-overlay{opacity:1!important}.pw-field:focus-within{border-color:${C.accent}80!important}.toast-item:hover .toast-x{opacity:1!important}`
  if(authLoading)return <Ctx.Provider value={{C,sz}}><div className="min-h-screen flex items-center justify-center" style={{background:C.bg}}><style>{CSS}</style><div className="animate-pulse font-black tracking-widest" style={{color:C.textDim,fontSize:20}}>SITREP</div></div></Ctx.Provider>
  const resetToken=new URLSearchParams(window.location.search).get('reset_token')
  if(resetToken)return <Ctx.Provider value={{C,sz}}><style>{CSS}</style><ResetPassword token={resetToken} onDone={()=>{window.history.replaceState({},'',window.location.pathname)}}/></Ctx.Provider>
  if(needsSetup)return <Ctx.Provider value={{C,sz}}><style>{CSS}</style><SetupWizard onComplete={u=>{setNeedsSetup(false);setAuthUser(u)}}/></Ctx.Provider>
  if (!authUser) return (
    <Ctx.Provider value={{C,sz}}>
      <style>{CSS}</style>
      <Toasts toasts={toasts} dismiss={dismissToast}/>
      <Login onLogin={u=>{
        setAuthUser(u)
        fetch(`${API}/users/profile`,{headers:getHeaders()})
          .then(r=>r.ok?r.json():null)
          .then(p=>{if(p&&!p.error)setUserProfile(p)})
          .catch(()=>{})
      }}/>
    </Ctx.Provider>
  )
  if (!selectedServer) return (
    <Ctx.Provider value={{C,sz}}>
      <style>{CSS}</style>
      <Toasts toasts={toasts} dismiss={dismissToast}/>
      <ServerPicker
        authUser={authUser}
        userProfile={userProfile}
        setUserProfile={setUserProfile}
        onSelect={selectServer}
        onLogout={logout}
        toast={toast}
        themeName={themeName}
        setThemeName={setThemeName}
        textSize={textSize}
        setTextSize={setTextSize}
      />
    </Ctx.Provider>
  )
  return (
    <AppShell C={C} sz={sz} CSS={CSS} themeName={themeName} setThemeName={setThemeName}
      textSize={textSize} setTextSize={setTextSize} authUser={authUser} logout={logout}
      toast={toast} toasts={toasts} dismissToast={dismissToast} selectedServer={selectedServer} onBackToServers={backToServers}
      userProfile={userProfile} setUserProfile={setUserProfile}
      profileModalOpen={profileModalOpen} setProfileModalOpen={setProfileModalOpen}
      profileModalTab={profileModalTab} setProfileModalTab={setProfileModalTab}/>
  )
}

function AppShell({C,sz,CSS,themeName,setThemeName,textSize,setTextSize,authUser,logout,toast,toasts,dismissToast,selectedServer,onBackToServers,userProfile,setUserProfile,profileModalOpen,setProfileModalOpen,profileModalTab,setProfileModalTab}){
  const getHash=()=>{const h=window.location.hash.slice(1);return TABS.find(t=>t.id===h)?h:'dashboard'}
  const[tab,setTab]=useState(getHash)
  const[sidebarOpen,setSidebarOpen]=useState(()=>localStorage.getItem('sitrep-sb')!=='0')
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false)
  const[showThemes,setShowThemes]=useState(false)
  const[time,setTime]=useState(new Date())
  const mobile=useMobile()
  const swipeRef=useRef(null)
  const[pullY,setPullY]=useState(0);const[pulling,setPulling]=useState(false);const pullRef=useRef(null);const startYRef=useRef(0)
  const[trackerWiredUp,setTrackerWiredUp]=useState(false)
  const[aigmEnabled,setAigmEnabled]=useState(true)
  useEffect(()=>{
    const check=()=>fetch('/api/tracker/status').then(r=>r.json()).then(d=>setTrackerWiredUp(!!d.wired_up)).catch(()=>{})
    check();const iv=setInterval(check,8000);return()=>clearInterval(iv)
  },[])
  useEffect(()=>{
    fetch(`${API}/settings/public`).then(r=>r.ok?r.json():null).then(d=>{
      if(d&&typeof d.aigm_enabled==='boolean')setAigmEnabled(d.aigm_enabled)
    }).catch(()=>{})
  },[])
  const onPTRStart=e=>{if(!mobile)return;const el=pullRef.current;if(el&&el.scrollTop===0){startYRef.current=e.touches[0]?.clientY||0;setPulling(true)}}
  const onPTRMove=e=>{if(!pulling||!e.touches[0])return;const dy=e.touches[0].clientY-startYRef.current;if(dy>0)setPullY(Math.min(dy,70))}
  const onPTREnd=()=>{if(!pulling)return;if(pullY>50)window.dispatchEvent(new Event('sitrep-refresh'));setPullY(0);setPulling(false)}
  const onSwipeStart=e=>{if(!mobile)return;swipeRef.current={x:e.touches[0].clientX,y:e.touches[0].clientY}}
  const onSwipeEnd=e=>{
    if(!mobile||!swipeRef.current)return
    const dx=e.changedTouches[0].clientX-swipeRef.current.x
    const dy=e.changedTouches[0].clientY-swipeRef.current.y
    swipeRef.current=null
    if(Math.abs(dx)<60||Math.abs(dy)>40)return
    const cur=visibleTabs.findIndex(t=>t.id===tab)
    if(dx<0&&cur<visibleTabs.length-1)nav(visibleTabs[cur+1].id)
    else if(dx>0&&cur>0)nav(visibleTabs[cur-1].id)
  }
  const visibleTabs=TABS.filter(t=>{const allowed=(ROLE_TABS[authUser.role]||['dashboard']).includes(t.id);if(t.id==='tracker')return allowed&&trackerWiredUp;if(t.id==='aigm')return allowed&&aigmEnabled;return allowed})
  useEffect(()=>{const iv=setInterval(()=>setTime(new Date()),1000);return()=>clearInterval(iv)},[])
  useEffect(()=>{const h=()=>setTab(getHash);window.addEventListener('hashchange',h);return()=>window.removeEventListener('hashchange',h)},[])
  useEffect(()=>{
    if(!userProfile?.preferences)return
    const prefs=userProfile.preferences
    if(prefs.theme&&prefs.theme!==themeName){setThemeName(prefs.theme);localStorage.setItem('sitrep-theme',prefs.theme)}
    if(prefs.text_size&&prefs.text_size!==textSize){setTextSize(prefs.text_size);localStorage.setItem('sitrep-ts',prefs.text_size)}
  },[userProfile])
  useEffect(()=>{
    if(!userProfile?.default_tab)return
    const h=window.location.hash.slice(1)
    if(TABS.find(t=>t.id===h))return
    const dt=userProfile.default_tab
    if(TABS.find(t=>t.id===dt)&&visibleTabs.find(t=>t.id===dt)){window.location.hash=dt;setTab(dt)}
  },[userProfile])
  const nav=id=>{window.location.hash=id;setTab(id);if(mobile)setSidebarOpen(false)}
  const Tab=ROUTES[tab]||Dashboard
  const MOBILE_NAV_PRIORITY=['dashboard','console','admin','mods']
  const bottomNavTabs=MOBILE_NAV_PRIORITY.map(id=>visibleTabs.find(t=>t.id===id)).filter(Boolean).slice(0,4)
  const hasMore=visibleTabs.length>4
  const bgStyle=(()=>{
    const prefs=userProfile?.preferences
    if(prefs?.bg_type==='image'&&userProfile?.bg_ext)return{backgroundImage:`url('${API}/users/${authUser.username}/background?v=${userProfile.bg_ext}')`,backgroundSize:'cover',backgroundPosition:'center',backgroundAttachment:'fixed'}
    if(prefs?.bg_type==='color'&&prefs?.custom_bg_color)return{background:prefs.custom_bg_color}
    return{background:C.bg}
  })()
  return <Ctx.Provider value={{C,sz}}>
    <div className="min-h-screen" style={{...bgStyle,color:C.text,fontFamily:"'JetBrains Mono','Fira Code','SF Mono',Consolas,monospace",position:'relative'}}>
      {userProfile?.preferences?.bg_type==='image'&&userProfile?.bg_ext&&<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:0,pointerEvents:'none'}}/>}
      <div style={{position:'relative',zIndex:1}}>
      <style>{CSS}</style><Toasts toasts={toasts} dismiss={dismissToast}/>
      {/* ── Top bar ── */}
      <div className="px-3 h-12 flex items-center gap-2 select-none" style={{background:C.bgCard,borderBottom:`1px solid ${C.border}`}}>
        {/* Hamburger — desktop shows sidebar toggle, mobile opens full drawer */}
        <button onClick={()=>setSidebarOpen(p=>{localStorage.setItem('sitrep-sb',!p?'1':'0');return!p})} className="cursor-pointer flex items-center justify-center w-8 h-8 rounded-lg" style={{color:C.textDim,fontSize:18,background:sidebarOpen&&!mobile?C.accentBg:'transparent'}}>≡</button>
        <button onClick={onBackToServers} className="flex items-center gap-1 px-2 py-1.5 rounded-lg font-bold cursor-pointer shrink-0" style={{background:C.bgInput,color:C.textDim,border:`1px solid ${C.border}`,fontSize:sz.stat}} onMouseEnter={e=>e.currentTarget.style.color=C.text} onMouseLeave={e=>e.currentTarget.style.color=C.textDim}>← {mobile?'':'Servers'}</button>
        {selectedServer&&<div className="flex items-center gap-1.5 px-2 py-1 rounded-lg min-w-0 overflow-hidden" style={{background:C.accentBg,border:`1px solid ${C.accent}30`}}><div className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse" style={{background:C.accent}}/><span className="font-bold truncate" style={{color:C.accent,fontSize:sz.stat}}>{selectedServer.name}{!mobile&&` #${selectedServer.id}`}</span></div>}
        {!mobile&&<div className="flex items-center gap-1.5"><span className="font-black tracking-wide" style={{color:C.textBright,fontSize:sz.base+2}}>SITREP</span></div>}
        <div className="flex-1"/>
        {/* Text size — hidden on mobile (accessible via sidebar) */}
        {!mobile&&<div className="flex rounded-lg overflow-hidden" style={{border:`1px solid ${C.border}`}}>{['S','M','L','XL','XXL'].map(s=><button key={s} onClick={()=>{setTextSize(s);localStorage.setItem('sitrep-ts',s)}} className="px-2.5 py-1 font-bold cursor-pointer" style={{background:textSize===s?C.accentBg:'transparent',color:textSize===s?C.accent:C.textDim,fontSize:9}}>{s}</button>)}</div>}
        {/* Theme picker */}
        <div className="relative"><button onClick={()=>setShowThemes(!showThemes)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-bold cursor-pointer" style={{background:C.bgInput,border:`1px solid ${C.border}`,color:C.textDim,fontSize:sz.stat}}><div className="w-3 h-3 rounded-full shrink-0" style={{background:C.accent}}/>{!mobile&&C.name}</button>{showThemes&&<div className="absolute right-0 top-full mt-2 rounded-xl shadow-2xl z-50" style={{background:C.bgCard,border:`1px solid ${C.border}`,width:306}}>
              <div style={{padding:'7px 10px 6px',borderBottom:`1px solid ${C.border}`,fontSize:8,fontWeight:700,letterSpacing:'1.5px',color:C.textMuted,textTransform:'uppercase'}}>Themes</div>
              <div style={{padding:8,display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:5}}>
                {Object.entries(THEMES).map(([key,theme])=>(
                  <button key={key} onClick={()=>{setThemeName(key);localStorage.setItem('sitrep-theme',key);setShowThemes(false)}}
                    style={{background:themeName===key?`${theme.accent}10`:theme.bgCard,border:`2px solid ${themeName===key?theme.accent:theme.border}`,borderRadius:8,padding:'8px 9px',cursor:'pointer',textAlign:'left'}}
                    onMouseEnter={e=>{if(themeName!==key)e.currentTarget.style.borderColor=theme.accent+'80'}}
                    onMouseLeave={e=>{if(themeName!==key)e.currentTarget.style.borderColor=theme.border}}>
                    <div style={{display:'flex',gap:1,marginBottom:6,height:4,borderRadius:3,overflow:'hidden'}}>
                      <div style={{flex:3,background:theme.bg}}/>
                      <div style={{flex:2,background:theme.accent}}/>
                      <div style={{flex:1,background:theme.blue}}/>
                      <div style={{flex:1,background:theme.red}}/>
                    </div>
                    <div style={{display:'flex',gap:3,marginBottom:5}}>
                      {[theme.text,theme.textMuted,theme.accent,theme.red,theme.purple].map((c,i)=>(
                        <div key={i} style={{width:7,height:7,borderRadius:'50%',background:c}}/>
                      ))}
                    </div>
                    <div style={{fontSize:9,fontWeight:700,color:themeName===key?theme.accent:theme.textDim,letterSpacing:'0.3px',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{theme.name}</div>
                  </button>
                ))}
              </div>
            </div>}</div>
        <div style={{position:'relative'}}>
          <AvatarWidget authUser={authUser} userProfile={userProfile} onClick={()=>setProfileDropdownOpen(p=>!p)}/>
          {profileDropdownOpen&&<ProfileDropdown authUser={authUser} userProfile={userProfile} onClose={()=>setProfileDropdownOpen(false)} onOpen={tab=>{setProfileModalTab(tab);setProfileModalOpen(true);setProfileDropdownOpen(false)}} onLogout={logout}/>}
        </div>
        {!mobile&&<span className="tabular-nums font-mono shrink-0" style={{color:C.textMuted,fontSize:sz.stat}}>{time.toLocaleTimeString('en-US',{hour12:false})}</span>}
      </div>

      {/* ── Main area ── */}
      <div className="flex" style={{height:`calc(100vh - 48px${mobile?' - 56px':''})`}}>
        {/* Sidebar — desktop: fixed left panel; mobile: slide-out drawer */}
        {sidebarOpen&&(()=>{
          const groups=['Server','Configuration','Tools']
          const grouped=groups.map(g=>({group:g,tabs:visibleTabs.filter(t=>t.group===g)})).filter(g=>g.tabs.length>0)
          return <div className={`shrink-0 flex flex-col ${mobile?'fixed inset-y-12 left-0 z-50 w-[240px] shadow-2xl':'w-[210px]'}`} style={{background:C.bgCard,borderRight:`1px solid ${C.border}`}}>
            <div className="flex-1 overflow-auto pt-3 pb-2">
              {grouped.map((g,gi)=><div key={g.group} className={gi>0?'mt-1':''}>
                <div className="px-5 pb-1.5 pt-2 font-black uppercase tracking-widest" style={{color:C.textMuted,fontSize:9}}>{g.group}</div>
                {g.tabs.map(tb=><div key={tb.id} onClick={()=>nav(tb.id)} className="flex items-center gap-3 cursor-pointer mx-2 rounded-lg px-3 py-3" style={{background:tab===tb.id?C.accentBg:'transparent',color:tab===tb.id?C.accent:C.textDim,fontWeight:tab===tb.id?800:500,fontSize:sz.nav,borderLeft:tab===tb.id?`3px solid ${C.accent}`:'3px solid transparent',minHeight:44}} onMouseEnter={e=>{if(tab!==tb.id){e.currentTarget.style.background=C.bgHover;e.currentTarget.style.color=C.text}}} onMouseLeave={e=>{if(tab!==tb.id){e.currentTarget.style.background='transparent';e.currentTarget.style.color=C.textDim}}}><span style={{fontSize:14,opacity:0.7}}>{tb.icon}</span>{tb.label}</div>)}
              </div>)}
            </div>
            {mobile&&<div className="px-4 py-3 border-t" style={{borderColor:C.border}}>
              {/* Text size in mobile sidebar */}
              <div className="mb-2" style={{color:C.textMuted,fontSize:9,fontWeight:700,letterSpacing:'1px',textTransform:'uppercase'}}>Text Size</div>
              <div className="flex rounded-lg overflow-hidden mb-3" style={{border:`1px solid ${C.border}`}}>{['S','M','L','XL','XXL'].map(s=><button key={s} onClick={()=>{setTextSize(s);localStorage.setItem('sitrep-ts',s)}} className="flex-1 py-1.5 font-bold cursor-pointer" style={{background:textSize===s?C.accentBg:'transparent',color:textSize===s?C.accent:C.textDim,fontSize:9}}>{s}</button>)}</div>
              <div className="flex items-center gap-2"><Badge text={authUser.role} v={ROLE_COLORS[authUser.role]||'dim'}/><span style={{color:C.textDim,fontSize:sz.stat}}>{authUser.username}</span></div>
            </div>}
            {!mobile&&<div className="px-5 py-3" style={{borderTop:`1px solid ${C.border}`}}><div className="font-mono" style={{color:C.textMuted,fontSize:8}}>SITREP</div></div>}
          </div>
        })()}
        {mobile&&sidebarOpen&&<div className="fixed inset-0 z-40" style={{background:'rgba(0,0,0,0.6)',backdropFilter:'blur(2px)'}} onClick={()=>setSidebarOpen(false)}/>}
        <div ref={pullRef} className="flex-1 overflow-auto" style={{padding:mobile?'12px':'20px'}} onTouchStart={e=>{onPTRStart(e);onSwipeStart(e)}} onTouchMove={onPTRMove} onTouchEnd={e=>{onPTREnd(e);onSwipeEnd(e)}}>
          {mobile&&pullY>10&&<div style={{height:pullY,display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden',transition:'height 0.1s'}}><div style={{color:C.accent,fontSize:12,fontWeight:700,opacity:Math.min(pullY/60,1)}}>{pullY>50?'↑ Release to refresh':'↓ Pull to refresh'}</div></div>}
          <Tab toast={toast} authUser={authUser} role={authUser.role}/>
        </div>
      </div>

      {/* ── Mobile bottom navigation bar ── */}
      {mobile&&<div className="fixed bottom-0 left-0 right-0 z-50 flex" style={{background:C.bgCard,borderTop:`1px solid ${C.border}`,height:56,paddingBottom:'env(safe-area-inset-bottom)'}}>
        {bottomNavTabs.map(tb=>{const active=tab===tb.id;return <button key={tb.id} onClick={()=>nav(tb.id)} className="flex-1 flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors" style={{color:active?C.accent:C.textMuted,background:'transparent',border:'none',minHeight:56}}>
          <span style={{fontSize:16,lineHeight:1}}>{tb.icon}</span>
          <span style={{fontSize:8,fontWeight:active?800:600,letterSpacing:'0.5px',textTransform:'uppercase'}}>{tb.short}</span>
        </button>})}
        {hasMore&&<button onClick={()=>setSidebarOpen(p=>!p)} className="flex-1 flex flex-col items-center justify-center gap-0.5 cursor-pointer" style={{color:C.textMuted,background:'transparent',border:'none',minHeight:56}}>
          <span style={{fontSize:16,lineHeight:1}}>≡</span>
          <span style={{fontSize:8,fontWeight:600,letterSpacing:'0.5px',textTransform:'uppercase'}}>More</span>
        </button>}
      </div>}
      </div>
      <ProfileModal
        open={profileModalOpen}
        initialTab={profileModalTab}
        onClose={()=>setProfileModalOpen(false)}
        authUser={authUser}
        userProfile={userProfile}
        setUserProfile={setUserProfile}
        toast={toast}
        themeName={themeName}
        setThemeName={setThemeName}
        textSize={textSize}
        setTextSize={setTextSize}
      />
    </div>
  </Ctx.Provider>
}
