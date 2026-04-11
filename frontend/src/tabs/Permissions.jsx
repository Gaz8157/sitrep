import { useState, useEffect } from 'react'
import { AreaChart, Area, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useT } from '../ctx.jsx'
import { API, post, put } from '../api.js'
import { useFetch, useFetchOnce } from '../hooks.js'
import { Badge, Btn, Card, Input, Modal, Toggle } from '../components/ui.jsx'
import { DISCORD_BLURPLE } from '../constants.js'

function DiscordIcon({size=18}){return<svg width={size} height={size} viewBox="0 0 71 55" fill={DISCORD_BLURPLE}><path d="M60.1 4.9A58.5 58.5 0 0 0 45.6.8a.2.2 0 0 0-.2.1 40.7 40.7 0 0 0-1.8 3.7 54 54 0 0 0-16.2 0 37.4 37.4 0 0 0-1.8-3.7.2.2 0 0 0-.2-.1A58.4 58.4 0 0 0 10.9 4.9a.2.2 0 0 0-.1.1C1.6 18.2-.9 31.1.3 43.8a.2.2 0 0 0 .1.2 58.8 58.8 0 0 0 17.7 9 .2.2 0 0 0 .2-.1 42 42 0 0 0 3.6-5.9.2.2 0 0 0-.1-.3 38.7 38.7 0 0 1-5.5-2.6.2.2 0 0 1 0-.4c.4-.3.7-.6 1.1-.9a.2.2 0 0 1 .2 0c11.5 5.3 24 5.3 35.4 0a.2.2 0 0 1 .2 0c.4.3.7.6 1.1.9a.2.2 0 0 1 0 .4 36.2 36.2 0 0 1-5.5 2.6.2.2 0 0 0-.1.3 47.1 47.1 0 0 0 3.6 5.9.2.2 0 0 0 .2.1 58.6 58.6 0 0 0 17.8-9 .2.2 0 0 0 .1-.2c1.5-15.1-2.5-28-10.5-39.5a.2.2 0 0 0-.1-.1zM23.7 36.1c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2c3.6 0 6.5 3.3 6.4 7.2 0 4-2.8 7.2-6.4 7.2zm23.6 0c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2c3.6 0 6.5 3.3 6.4 7.2 0 4-2.9 7.2-6.4 7.2z"/></svg>}

const SectionHeader=({title,sub,open,onToggle,action,C,sz})=><div className="flex items-center justify-between mb-3 cursor-pointer" onClick={onToggle}>
  <div><div className="font-black flex items-center gap-2" style={{color:C.textBright,fontSize:sz.base+2}}><span style={{color:C.textMuted,fontSize:sz.base}}>{open?'▾':'▸'}</span>{title}</div>{sub&&<div style={{color:C.textMuted,fontSize:sz.stat}}>{sub}</div>}</div>
  {action&&<div onClick={e=>e.stopPropagation()}>{action}</div>}
</div>

const PeriodSel=({period,setPeriod,C,sz})=><div className="flex items-center gap-1 ml-auto">{['7d','30d','all'].map(p=><button key={p} onClick={()=>setPeriod(p)} className="font-bold uppercase cursor-pointer px-2 py-0.5 rounded" style={{fontSize:sz.stat,background:period===p?C.accentBg:'transparent',color:period===p?C.accent:C.textMuted,border:`1px solid ${period===p?C.accent+'40':C.border}`}}>{p}</button>)}</div>

export default function Permissions({toast,authUser}){const{C,sz}=useT()
  const isOwner=authUser?.role==='owner'
  const isHeadAdmin=authUser?.role==='head_admin'
  const canManage=isOwner||isHeadAdmin
  const{data:userData,loading,reload}=useFetchOnce(`${API}/users`)
  const{data:permData,reload:reloadPerms}=useFetchOnce(`${API}/permissions`)
  const{data:panelSettings,reload:reloadPanelSettings}=useFetchOnce(`${API}/settings`)
  const[showAdd,setShowAdd]=useState(false);const[newUser,setNewUser]=useState({username:'',password:'',role:'viewer'})
  const[localPerms,setLocalPerms]=useState(null);const[permDirty,setPermDirty]=useState(false)
  const[ipqsKey,setIpqsKey]=useState('');const[ipqsLoading,setIpqsLoading]=useState(false)
  // Discord state
  const[discordSettings,setDiscordSettings]=useState({discord_client_id:'',discord_client_secret:'',discord_redirect_uri:'',frontend_url:'',discord_allow_auto_register:false})
  const[discordDirty,setDiscordDirty]=useState(false);const[discordSaving,setDiscordSaving]=useState(false)
  const[showLinkModal,setShowLinkModal]=useState(false);const[linkTarget,setLinkTarget]=useState(null)
  const[linkDiscordId,setLinkDiscordId]=useState('');const[linkDiscordName,setLinkDiscordName]=useState('')
  const[showDiscordSection,setShowDiscordSection]=useState(true)
  const[showUsersSection,setShowUsersSection]=useState(true)
  const[showPermsSection,setShowPermsSection]=useState(false)

  useEffect(()=>{if(permData&&!permDirty)setLocalPerms(permData.permissions||{})},[permData])
  useEffect(()=>{if(panelSettings){
    setIpqsKey(panelSettings.ipqs_api_key||'')
    setDiscordSettings({
      discord_client_id:panelSettings.discord_client_id||'',
      discord_client_secret:panelSettings.discord_client_secret||'',
      discord_redirect_uri:panelSettings.discord_redirect_uri||`${API}/auth/discord/callback`,
      frontend_url:panelSettings.frontend_url||`${window.location.protocol}//${window.location.hostname}:${window.location.port||8000}`,
      discord_allow_auto_register:!!panelSettings.discord_allow_auto_register
    })
  }},[panelSettings])

  const users=userData?.users||[]
  const saveIpqsKey=async()=>{setIpqsLoading(true);const r=await put(`${API}/settings`,{...panelSettings,ipqs_api_key:ipqsKey});setIpqsLoading(false);r.error?toast(r.error,'danger'):(toast('IPQS key saved'),reloadPanelSettings())}
  const toggleUserIp=async(username,current)=>{await put(`${API}/users/${username}/settings`,{ip_visible:!current});reload()}
  const groups=permData?.groups||{};const labels=permData?.labels||{}
  const roles=['owner','head_admin','admin','moderator','viewer','demo']
  const addUser=async()=>{if(!newUser.username||!newUser.password){toast('Username and password required','danger');return}
    const r=await post(`${API}/users/add`,newUser);if(r.error){toast(r.error,'danger');return}
    toast(r.message||'User added');setShowAdd(false);setNewUser({username:'',password:'',role:'viewer'});reload()}
  const removeUser=async username=>{if(!confirm(`Remove user "${username}"?`))return
    const r=await post(`${API}/users/remove`,{username});if(r.error){toast(r.error,'danger');return}
    toast(r.message||'Removed','warning');reload()}
  const changeRole=async(username,role)=>{const r=await put(`${API}/users/update`,{username,role});if(r.error){toast(r.error,'danger');return};toast('Role updated');reload()}
  const setPermRole=(key,role)=>{setLocalPerms(p=>({...p,[key]:role}));setPermDirty(true)}
  const savePerms=async()=>{const r=await put(`${API}/permissions`,localPerms);if(r.error){toast(r.error,'danger');return};toast('Permissions saved');setPermDirty(false);reloadPerms()}
  const saveDiscord=async()=>{setDiscordSaving(true);const r=await put(`${API}/settings`,{...panelSettings,...discordSettings});setDiscordSaving(false);r.error?toast(r.error,'danger'):(toast('Discord settings saved'),reloadPanelSettings(),setDiscordDirty(false))}
  const unlinkDiscord=async(username)=>{const r=await put(`${API}/users/${username}/link-discord`,{discord_id:'',discord_username:''});r.error?toast(r.error,'danger'):(toast(`Unlinked Discord from ${username}`,'warning'),reload())}
  const doLinkDiscord=async()=>{if(!linkDiscordId.trim()){toast('Discord ID required','danger');return};const r=await put(`${API}/users/${linkTarget}/link-discord`,{discord_id:linkDiscordId.trim(),discord_username:linkDiscordName.trim()});r.error?toast(r.error,'danger'):(toast(`Linked Discord to ${linkTarget}`),setShowLinkModal(false),setLinkDiscordId(''),setLinkDiscordName(''),reload())}
  const discordEnabled=!!(panelSettings?.discord_client_id)

  if(loading)return <div className="animate-pulse" style={{color:C.textDim,fontSize:sz.base}}>Loading...</div>

  return <div className="flex flex-col gap-5">

    {/* ── DISCORD OAUTH ── */}
    <div>
      <SectionHeader C={C} sz={sz} title={<><DiscordIcon size={16}/> Discord OAuth</>} sub="Single sign-on via Discord account" open={showDiscordSection} onToggle={()=>setShowDiscordSection(p=>!p)}
        action={<div className="flex items-center gap-2">
          {discordEnabled?<Badge text="ACTIVE" v="default" pulse/>:<Badge text="NOT CONFIGURED" v="dim"/>}
          {discordDirty&&isOwner&&<Btn small onClick={saveDiscord} disabled={discordSaving}>{discordSaving?'Saving...':'Save'}</Btn>}
        </div>}/>
      {showDiscordSection&&<div className="space-y-3">
        <div className="rounded-xl p-5 space-y-4" style={{background:DISCORD_BLURPLE+'0a',border:`1.5px solid ${DISCORD_BLURPLE}30`}}>
          <div className="flex items-start gap-3">
            <DiscordIcon size={32}/>
            <div>
              <div className="font-black" style={{color:C.textBright,fontSize:sz.base+1}}>Discord Application</div>
              <div style={{color:C.textMuted,fontSize:sz.stat}}>Players can sign in with their Discord account instead of creating a panel login.</div>
            </div>
          </div>

          {/* Status strip */}
          <div className="grid grid-cols-3 gap-2">
            {[
              ['Client ID',discordSettings.discord_client_id?'✓ Set':'✗ Missing',!!discordSettings.discord_client_id],
              ['Client Secret',discordSettings.discord_client_secret?'✓ Set':'✗ Missing',!!discordSettings.discord_client_secret],
              ['Redirect URI',discordSettings.discord_redirect_uri?'✓ Set':'✗ Missing',!!discordSettings.discord_redirect_uri],
            ].map(([label,status,ok])=><div key={label} className="rounded-lg p-2.5 text-center" style={{background:ok?C.accentBg:C.redBg,border:`1px solid ${ok?C.accent+'30':C.redBorder}`}}>
              <div className="font-bold" style={{color:ok?C.accent:C.red,fontSize:sz.stat}}>{label}</div>
              <div style={{color:ok?C.textDim:C.red,fontSize:sz.stat-1}}>{status}</div>
            </div>)}
          </div>

          {isOwner&&<div className="space-y-3">
            <div>
              <label className="block font-bold uppercase tracking-wide mb-1.5" style={{color:C.textDim,fontSize:sz.label}}>Application ID (Client ID)</label>
              <input value={discordSettings.discord_client_id} onChange={e=>{setDiscordSettings(p=>({...p,discord_client_id:e.target.value}));setDiscordDirty(true)}} placeholder="e.g. 1485073389164167341" className="w-full rounded-lg px-3 py-2.5 outline-none font-mono" style={{background:C.bgInput,border:`1px solid ${C.border}`,color:C.text,fontSize:sz.input}}/>
            </div>
            <div>
              <label className="block font-bold uppercase tracking-wide mb-1.5" style={{color:C.textDim,fontSize:sz.label}}>Client Secret</label>
              <Input label="" value={discordSettings.discord_client_secret} onChange={v=>{setDiscordSettings(p=>({...p,discord_client_secret:v}));setDiscordDirty(true)}} type="password" placeholder="From OAuth2 → Client Secret in Discord Dev Portal" mono/>
            </div>
            <div>
              <label className="block font-bold uppercase tracking-wide mb-1.5" style={{color:C.textDim,fontSize:sz.label}}>Redirect URI <span style={{color:C.textMuted,fontWeight:400}}>(add this in Discord Dev Portal → OAuth2 → Redirects)</span></label>
              <div className="flex gap-2">
                <input value={discordSettings.discord_redirect_uri} onChange={e=>{setDiscordSettings(p=>({...p,discord_redirect_uri:e.target.value}));setDiscordDirty(true)}} className="flex-1 rounded-lg px-3 py-2.5 outline-none font-mono" style={{background:C.bgInput,border:`1px solid ${C.border}`,color:C.text,fontSize:sz.input}}/>
                <Btn small v="ghost" onClick={()=>navigator.clipboard.writeText(discordSettings.discord_redirect_uri).then(()=>toast('Copied'))}>Copy</Btn>
              </div>
            </div>
            <div>
              <label className="block font-bold uppercase tracking-wide mb-1.5" style={{color:C.textDim,fontSize:sz.label}}>Panel URL <span style={{color:C.textMuted,fontWeight:400}}>(where Discord redirects users after login)</span></label>
              <input value={discordSettings.frontend_url} onChange={e=>{setDiscordSettings(p=>({...p,frontend_url:e.target.value}));setDiscordDirty(true)}} className="w-full rounded-lg px-3 py-2.5 outline-none font-mono" style={{background:C.bgInput,border:`1px solid ${C.border}`,color:C.text,fontSize:sz.input}} placeholder="e.g. http://192.168.1.16:8000"/>
            </div>
            <Toggle label="Auto-register new Discord users as Viewer (no manual link needed)" value={discordSettings.discord_allow_auto_register} onChange={()=>{setDiscordSettings(p=>({...p,discord_allow_auto_register:!p.discord_allow_auto_register}));setDiscordDirty(true)}}/>
            <div className="flex gap-2">
              <Btn onClick={saveDiscord} disabled={discordSaving||!discordDirty}>{discordSaving?'Saving...':'Save Discord Settings'}</Btn>
              {discordEnabled&&<a href={`${API}/auth/discord`} target="_blank" rel="noreferrer" className="px-4 py-2 rounded-xl font-black flex items-center gap-2 no-underline" style={{background:DISCORD_BLURPLE+'18',color:DISCORD_BLURPLE,border:`1.5px solid ${DISCORD_BLURPLE}40`,fontSize:sz.base,textDecoration:'none'}}><DiscordIcon size={14}/>Test Login</a>}
            </div>
          </div>}

          {/* Setup guide */}
          <div className="rounded-lg p-3 space-y-1" style={{background:C.bgInput,border:`1px solid ${C.border}`}}>
            <div className="font-bold" style={{color:C.textDim,fontSize:sz.stat}}>Setup checklist</div>
            {[
              ['Go to discord.com/developers → Your App → OAuth2',''],
              [`Add redirect: ${discordSettings.discord_redirect_uri||'(set redirect URI above)'}`, ''],
              ['Copy the Client Secret from that page',''],
              ['Link Discord IDs to panel users below (or enable auto-register)',''],
            ].map(([step],i)=><div key={i} className="flex items-start gap-2" style={{color:C.textMuted,fontSize:sz.stat}}>
              <span className="font-black shrink-0" style={{color:C.accent}}>{i+1}.</span><span>{step}</span>
            </div>)}
          </div>
        </div>

        {/* Per-user Discord linking */}
        <Card className="overflow-hidden">
          <div className="px-5 py-3 font-black uppercase tracking-wide" style={{borderBottom:`1px solid ${C.border}`,color:C.textDim,fontSize:sz.label,background:C.bgInput}}>Discord Account Links</div>
          {users.map(u=><div key={u.username} className="px-5 py-3.5 flex items-center gap-3" style={{borderBottom:`1px solid ${C.border}`}}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center font-black shrink-0" style={{background:u.discord_id?DISCORD_BLURPLE+'18':C.bgInput,color:u.discord_id?DISCORD_BLURPLE:C.textMuted,border:`1px solid ${u.discord_id?DISCORD_BLURPLE+'40':C.border}`}}>{u.discord_id?<DiscordIcon size={14}/>:'?'}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2"><span className="font-bold" style={{color:C.textBright,fontSize:sz.base}}>{u.username}</span><Badge text={u.role} v="dim"/></div>
              {u.discord_id
                ?<div className="font-mono flex items-center gap-2 mt-0.5" style={{color:DISCORD_BLURPLE,fontSize:sz.stat}}>{u.discord_username&&<span className="font-bold">@{u.discord_username}</span>}<span style={{color:C.textMuted}}>ID: {u.discord_id}</span></div>
                :<div style={{color:C.textMuted,fontSize:sz.stat}}>No Discord account linked</div>}
            </div>
            {canManage&&<div className="flex gap-2 shrink-0">
              {u.discord_id
                ?<Btn small v="danger" onClick={()=>unlinkDiscord(u.username)}>Unlink</Btn>
                :<Btn small onClick={()=>{setLinkTarget(u.username);setLinkDiscordId('');setLinkDiscordName('');setShowLinkModal(true)}}>Link Discord</Btn>}
            </div>}
          </div>)}
        </Card>
      </div>}
    </div>

    {/* ── PANEL USERS ── */}
    <div>
      <SectionHeader C={C} sz={sz} title="Panel Users" sub="Manage who can access this panel" open={showUsersSection} onToggle={()=>setShowUsersSection(p=>!p)}
        action={canManage&&<Btn small onClick={()=>setShowAdd(true)}>+ Add User</Btn>}/>
      {showUsersSection&&<Card className="overflow-hidden">
        <div className="px-5 py-3 flex items-center gap-3 font-bold uppercase tracking-wide" style={{borderBottom:`1px solid ${C.border}`,color:C.textDim,fontSize:sz.stat}}>
          <span className="flex-1">User</span><span className="w-16 text-center">Discord</span><span className="w-20 text-center">IPs</span><span className="w-28">Role</span><span className="w-14 text-right">Action</span>
        </div>
        {users.map(u=>{const isOwnerAccount=u.role==='owner';const canEdit=canManage&&u.username!==authUser?.username&&(!isOwnerAccount||isOwner);return <div key={u.username} className="px-5 py-3.5 flex items-center gap-3" style={{borderBottom:`1px solid ${C.border}`}}>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold" style={{color:C.textBright,fontSize:sz.base}}>{u.username}</span>
              {u.username===authUser?.username&&<Badge text="YOU" v="dim"/>}
              {isOwnerAccount&&<Badge text="Owner" v="default"/>}
              {u.discord_username&&<span className="flex items-center gap-1 px-1.5 py-0.5 rounded font-bold" style={{background:DISCORD_BLURPLE+'15',color:DISCORD_BLURPLE,border:`1px solid ${DISCORD_BLURPLE}30`,fontSize:sz.stat-1}}><DiscordIcon size={10}/>@{u.discord_username}</span>}
            </div>
            <div style={{color:C.textMuted,fontSize:sz.stat}}>Joined {u.created?new Date(u.created).toLocaleDateString():'-'}</div>
          </div>
          <div className="w-16 flex justify-center">
            <div className="w-5 h-5 flex items-center justify-center rounded-full" style={{background:u.discord_id?DISCORD_BLURPLE+'18':C.bgInput,border:`1px solid ${u.discord_id?DISCORD_BLURPLE+'40':C.border}`}}>
              {u.discord_id&&<DiscordIcon size={10}/>}
            </div>
          </div>
          <div className="w-20 flex justify-center">
            <button onClick={()=>canEdit&&toggleUserIp(u.username,u.ip_visible!==false)} disabled={!canEdit} className="px-2 py-1 rounded font-bold" style={{background:u.ip_visible!==false?C.accentBg:C.bgInput,color:u.ip_visible!==false?C.accent:C.textMuted,border:`1px solid ${u.ip_visible!==false?C.accent+'30':C.border}`,fontSize:sz.stat,cursor:canEdit?'pointer':'default'}}>{u.ip_visible!==false?'Visible':'Hidden'}</button>
          </div>
          <div className="w-28">
            <select value={u.role} onChange={e=>canEdit&&changeRole(u.username,e.target.value)} disabled={!canEdit} className="w-full rounded-lg px-2 py-1.5 outline-none font-bold" style={{background:C.bgInput,border:`1px solid ${C.border}`,color:C.accent,fontSize:sz.input}}>
              {roles.filter(r=>isOwner||r!=='owner').map(r=><option key={r} value={r}>{r.split('_').map(w=>w[0].toUpperCase()+w.slice(1)).join(' ')}</option>)}
            </select>
          </div>
          <div className="w-14 flex justify-end">{canEdit&&<Btn small v="danger" onClick={()=>removeUser(u.username)}>X</Btn>}</div>
        </div>})}
      </Card>}
    </div>

    {/* ── ACCESS CONTROL ── */}
    <div>
      <SectionHeader C={C} sz={sz} title="Access Control" sub="Minimum role required per action. Owner always has full access." open={showPermsSection} onToggle={()=>setShowPermsSection(p=>!p)}
        action={canManage&&localPerms&&<div className="flex items-center gap-2">{permDirty&&<span className="font-bold" style={{color:C.orange,fontSize:sz.stat}}>Unsaved</span>}<Btn small onClick={savePerms} disabled={!permDirty}>Save</Btn></div>}/>
      {showPermsSection&&localPerms&&Object.entries(groups).map(([group,keys])=><Card key={group} className="mb-3 overflow-hidden">
        <div className="px-5 py-2.5 font-black uppercase tracking-wide" style={{borderBottom:`1px solid ${C.border}`,color:C.textDim,fontSize:sz.label,background:C.bgInput}}>{group}</div>
        {keys.map(key=>{const cur=localPerms[key]||'admin';return <div key={key} className="px-5 py-3 flex items-center gap-4" style={{borderBottom:`1px solid ${C.border}`}}>
          <div className="flex-1"><div className="font-bold" style={{color:C.text,fontSize:sz.base}}>{labels[key]||key}</div><div className="font-mono" style={{color:C.textMuted,fontSize:sz.stat}}>{key}</div></div>
          <div className="flex gap-1.5 flex-wrap">{[['viewer','Viewer',C.textDim],['moderator','Mod',C.orange],['admin','Admin',C.blue],['head_admin','Head Admin',C.purple],['owner','Owner',C.accent]].map(([r,label,col])=>{const active=r===cur;const clickable=canManage&&r!=='owner';return <button key={r} onClick={()=>clickable&&setPermRole(key,r)} disabled={!clickable} className="px-2.5 py-1 rounded font-bold" style={{background:active?col+'20':'transparent',color:active?col:C.textMuted,border:`1px solid ${active?col+'40':C.border}`,fontSize:sz.stat,opacity:r==='owner'?0.4:1,cursor:clickable?'pointer':'default'}}>{label}</button>})}
        </div></div>})}
      </Card>)}
    </div>

    {/* ── INTEGRATIONS ── */}
    {isOwner&&<div>
      <div className="font-black mb-3" style={{color:C.textBright,fontSize:sz.base+1}}>Integrations</div>
      <Card className="p-5">
        <div className="font-bold mb-1" style={{color:C.textBright,fontSize:sz.base}}>IP Quality Score (IPQS)</div>
        <div className="mb-3" style={{color:C.textMuted,fontSize:sz.stat}}>Checks player IPs for VPNs, proxies, TOR. 1,000 free checks/month.</div>
        <div className="flex gap-2"><Input label="" value={ipqsKey} onChange={setIpqsKey} type="password" placeholder="IPQS API key..." mono/><Btn onClick={saveIpqsKey} disabled={ipqsLoading}>{ipqsLoading?'Saving...':'Save'}</Btn></div>
        {panelSettings?.ipqs_api_key&&<div className="mt-2 flex items-center gap-2"><div className="w-2 h-2 rounded-full" style={{background:C.accent}}/><span style={{color:C.textDim,fontSize:sz.stat}}>Key configured</span></div>}
      </Card>
    </div>}

    {/* Modals */}
    <Modal open={showAdd} onClose={()=>setShowAdd(false)} title="Add Panel User">
      <Input label="Username" value={newUser.username} onChange={v=>setNewUser(p=>({...p,username:v}))} placeholder="username"/>
      <Input label="Password" value={newUser.password} onChange={v=>setNewUser(p=>({...p,password:v}))} type="password" placeholder="password"/>
      <div className="mb-3"><label className="block font-bold uppercase tracking-wide mb-1.5" style={{color:C.textDim,fontSize:sz.label}}>Role</label><select value={newUser.role} onChange={e=>setNewUser(p=>({...p,role:e.target.value}))} className="w-full rounded-lg px-3 py-2.5 outline-none" style={{background:C.bgInput,border:`1px solid ${C.border}`,color:C.text,fontSize:sz.input}}>{['demo','viewer','moderator','admin','head_admin'].map(r=><option key={r} value={r}>{r.split('_').map(w=>w[0].toUpperCase()+w.slice(1)).join(' ')}</option>)}</select></div>
      <div className="flex gap-2 justify-end mt-3"><Btn v="ghost" onClick={()=>setShowAdd(false)}>Cancel</Btn><Btn onClick={addUser}>Create User</Btn></div>
    </Modal>

    <Modal open={showLinkModal} onClose={()=>setShowLinkModal(false)} title={`Link Discord → ${linkTarget}`}>
      <div className="mb-4 p-3 rounded-lg" style={{background:DISCORD_BLURPLE+'10',border:`1px solid ${DISCORD_BLURPLE}30`}}>
        <div style={{color:DISCORD_BLURPLE,fontSize:sz.stat}}>Find the Discord User ID by right-clicking a user in Discord → Copy User ID (requires Developer Mode in Discord settings).</div>
      </div>
      <Input label="Discord User ID" value={linkDiscordId} onChange={setLinkDiscordId} placeholder="e.g. 123456789012345678" mono/>
      <Input label="Discord Username (optional)" value={linkDiscordName} onChange={setLinkDiscordName} placeholder="e.g. PlayerName"/>
      <div className="flex gap-2 justify-end mt-3"><Btn v="ghost" onClick={()=>setShowLinkModal(false)}>Cancel</Btn><Btn onClick={doLinkDiscord}>Link Account</Btn></div>
    </Modal>
  </div>}

export function ServerStats(){const{C,sz}=useT();const[tab,setTab]=useState('feed');const[period,setPeriod]=useState('7d');const{data:feed}=useFetch(`${API}/stats/feed?limit=50`,10000);const{data:board}=useFetch(`${API}/stats/leaderboard?period=${period}`,30000);const{data:wpns}=useFetch(`${API}/stats/weapons?period=${period}`,30000);const{data:hist}=useFetch(`${API}/stats/player-history`,60000);const{data:ov}=useFetch(`${API}/stats/overview`,30000);const tabs=[['feed','Kill Feed'],['leaderboard','Leaderboard'],['weapons','Weapons'],['overview','Overview']];const fmtAgo=ts=>{const s=Math.floor(Date.now()/1000-ts);if(s<60)return`${s}s ago`;if(s<3600)return`${Math.floor(s/60)}m ago`;return`${Math.floor(s/3600)}h ago`};return(<div><div className="flex items-center gap-1 mb-3 flex-wrap">{tabs.map(([id,label])=><button key={id} onClick={()=>setTab(id)} className="font-bold uppercase tracking-wide cursor-pointer px-3 py-1 rounded-lg" style={{fontSize:sz.stat,background:tab===id?C.accentBg:'transparent',color:tab===id?C.accent:C.textMuted,border:`1px solid ${tab===id?C.accent+'40':'transparent'}`}}>{label}</button>)}{(tab==='leaderboard'||tab==='weapons')&&<PeriodSel period={period} setPeriod={setPeriod} C={C} sz={sz}/>}{tab==='overview'&&ov&&<span className="ml-auto font-mono" style={{color:C.textMuted,fontSize:sz.stat}}>{ov.uptime_pct_30d}% uptime (30d)</span>}</div>{tab==='feed'&&<div style={{maxHeight:320,overflowY:'auto'}}>{ (!feed?.events?.length)&&<div className="py-8 text-center" style={{color:C.textMuted,fontSize:sz.base}}>No kills recorded yet</div>}{feed?.events?.map((ev,i)=><div key={i} className="flex items-center gap-2 py-2 px-1" style={{borderBottom:`1px solid ${C.border}`,fontSize:sz.base}}><span className="font-bold" style={{color:ev.team_kill?C.red:C.textBright}}>{ev.killer}</span><span style={{color:C.textMuted}}>{'→'}</span><span style={{color:C.textDim}}>{ev.victim}</span><span className="flex-1"/><span style={{color:C.textMuted,fontSize:sz.stat}}>{ev.weapon}</span><span className="font-mono" style={{color:C.textMuted,fontSize:sz.stat}}>{parseFloat(ev.distance).toFixed(0)}m</span><span style={{color:C.textMuted,fontSize:sz.stat}}>{fmtAgo(ev.ts)}</span></div>)}</div>}{tab==='leaderboard'&&<div style={{maxHeight:320,overflowY:'auto'}}>{(!board?.leaderboard?.length)&&<div className="py-8 text-center" style={{color:C.textMuted,fontSize:sz.base}}>No player data yet</div>}{board?.leaderboard?.map((p,i)=><div key={i} className="flex items-center gap-3 py-2 px-1" style={{borderBottom:`1px solid ${C.border}`}}><span className="w-6 text-right font-black" style={{color:C.textMuted,fontSize:sz.stat}}>{i+1}</span><span className="flex-1 font-bold" style={{color:C.textBright,fontSize:sz.base}}>{p.name}</span><span className="font-mono" style={{color:C.accent,fontSize:sz.base}}>{p.kills}K</span><span className="font-mono" style={{color:C.textMuted,fontSize:sz.stat}}>{p.deaths}D</span><span className="font-mono w-12 text-right" style={{color:C.textDim,fontSize:sz.stat}}>{p.kd} K/D</span></div>)}</div>}{tab==='weapons'&&<div style={{maxHeight:320,overflowY:'auto'}}>{(!wpns?.weapons?.length)&&<div className="py-8 text-center" style={{color:C.textMuted,fontSize:sz.base}}>No weapon data yet</div>}{wpns?.weapons?.map((w,i)=><div key={i} className="flex items-center gap-3 py-2 px-1" style={{borderBottom:`1px solid ${C.border}`}}><span className="w-5 text-right font-black" style={{color:C.textMuted,fontSize:sz.stat}}>{i+1}</span><span className="flex-1" style={{color:C.textDim,fontSize:sz.base}}>{w.weapon}</span><span className="font-mono font-bold" style={{color:C.accent,fontSize:sz.base}}>{w.kills}</span><span className="font-mono w-10 text-right" style={{color:C.textMuted,fontSize:sz.stat}}>{w.pct}%</span></div>)}</div>}{tab==='overview'&&<div>{!ov&&<div className="py-8 text-center" style={{color:C.textMuted,fontSize:sz.base}}>Loading...</div>}{ov&&<div className="grid grid-cols-2 gap-3 mb-4">{[['Total Kills',ov.total_kills,C.accent],['Total Deaths',ov.total_deaths,C.red],['K/D Ratio',ov.kd_ratio,C.textBright],['Unique Players',ov.unique_players,C.blue]].map(([label,val,color])=><div key={label} className="p-3 rounded-lg" style={{background:C.bgInput,border:`1px solid ${C.border}`}}><div className="font-bold uppercase tracking-widest mb-1" style={{color:C.textMuted,fontSize:sz.stat}}>{label}</div><div className="font-black" style={{color,fontSize:sz.base+6}}>{val??'--'}</div></div>)}</div>}{hist?.history&&<div><div className="font-bold uppercase tracking-widest mb-2" style={{color:C.textDim,fontSize:sz.stat}}>7-Day Player History</div><ResponsiveContainer width="100%" height={120}><AreaChart data={hist.history} margin={{top:0,right:0,left:-20,bottom:0}}><defs><linearGradient id="phG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.accent} stopOpacity={0.3}/><stop offset="100%" stopColor={C.accent} stopOpacity={0}/></linearGradient></defs><YAxis tick={false} axisLine={false}/><Tooltip contentStyle={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:8,fontSize:sz.base,color:C.text}} formatter={(v)=>[v,'Players']} labelFormatter={(ts)=>new Date(ts*1000).toLocaleDateString()}/><Area type="monotone" dataKey="count" stroke={C.accent} fill="url(#phG)" strokeWidth={1.5} dot={false} name="Players"/></AreaChart></ResponsiveContainer></div>}</div>}</div>)}
