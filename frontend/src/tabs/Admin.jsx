import { useState, useEffect, useMemo } from 'react'
import { useT } from '../ctx.jsx'
import { API, post, put, del, authHeaders, getHeaders, on401 } from '../api.js'
import { useFetch, useFetchOnce, useMobile } from '../hooks.js'
import { Badge, Btn, Card, Empty, Modal, Input, SrcTag } from '../components/ui.jsx'
import { LVL } from '../constants.js'
import Permissions from './Permissions.jsx'

const safeParse=(str,fallback=[])=>{try{return JSON.parse(str)}catch{return fallback}}
const SortBtn=({col,label,dbSort,setDbSort,setDbSortDir,dbSortDir,C,sz})=><button onClick={()=>{if(dbSort===col)setDbSortDir(d=>d==='desc'?'asc':'desc');else{setDbSort(col);setDbSortDir('desc')}}} className="cursor-pointer font-black uppercase tracking-wide flex items-center gap-1" style={{color:dbSort===col?C.accent:C.textDim,fontSize:sz.stat}}>{label}{dbSort===col&&<span style={{fontSize:sz.stat}}>{dbSortDir==='desc'?'↓':'↑'}</span>}</button>

export default function Admin({toast,authUser}){const{C,sz}=useT();const mobile=useMobile()
  const{data:status}=useFetch(`${API}/status`,4000)
  const{data:liveData,reload:reloadLive}=useFetch(`${API}/players/live`,5000)
  const{data:historyData,reload:reloadHistory}=useFetchOnce(`${API}/players/history`)
  const{data:modData,reload:reloadMods}=useFetchOnce(`${API}/admin/mods/detected`)
  const{data:trollData,reload:reloadTrolls}=useFetchOnce(`${API}/admin/troll-alerts`)
  const{data:ipBansData,reload:reloadIpBans}=useFetchOnce(`${API}/admin/ip-bans`)
  const{data:matBansData,reload:reloadMatBans}=useFetchOnce(`${API}/admin/mat/bans`)
  const{data:adminsData,reload:reloadAdmins}=useFetchOnce(`${API}/admins`)
  const{data:satRaw,reload:reloadSat}=useFetchOnce(`${API}/profile/config?path=profile/profile/ServerAdminTools_Config.json`)
  const{data:matRaw,reload:reloadMat}=useFetchOnce(`${API}/profile/config?path=profile/profile/Misfits_Logging/configs/admins.json`)
  const{data:msfSettingsRaw,reload:reloadMsfSettings}=useFetchOnce(`${API}/profile/config?path=profile/profile/Misfits_Logging/configs/msf_settings.json`)
  const{data:msfWebhooksRaw,reload:reloadMsfWebhooks}=useFetchOnce(`${API}/profile/config?path=profile/profile/Misfits_Logging/configs/msf_webhooks.json`)
  const{data:msfMotdRaw,reload:reloadMsfMotd}=useFetchOnce(`${API}/profile/config?path=profile/profile/Misfits_Logging/configs/motd_config.json`)
  const isOwner=authUser?.role==='owner'
  const isHeadAdmin=authUser?.role==='head_admin'
  const isAdmin=authUser?.role==='admin'||isHeadAdmin||isOwner
  const isDemo=authUser?.role==='demo'
  const[tab,setTab]=useState(()=>{try{return localStorage.getItem('admin-tab')||'live'}catch{return 'live'}})
  useEffect(()=>{try{localStorage.setItem('admin-tab',tab)}catch{}},[tab])
  const hasSat=modData?.sat||false
  const hasMat=modData?.mat||false
  const{data:rconLogs}=useFetch(`${API}/logs?lines=500`,5000)
  const[broadcastMsg,setBroadcastMsg]=useState('');const[broadcastSending,setBroadcastSending]=useState(false)
  const[adminLogFilter,setAdminLogFilter]=useState('')
  const sendBroadcast=async()=>{if(!broadcastMsg.trim()||broadcastSending)return;setBroadcastSending(true);const r=await post(`${API}/admin/rcon/message`,{message:broadcastMsg.trim()});setBroadcastSending(false);r.error?toast(r.error,'danger'):(toast('Broadcast sent'),setBroadcastMsg(''))}
  const[showNotes,setShowNotes]=useState(false);const[notesTarget,setNotesTarget]=useState(null);const[notesText,setNotesText]=useState('')
  const openNotes=async(p)=>{setNotesTarget(p);setNotesText('');setShowNotes(true);try{const r=await fetch(`${API}/players/${p.guid}/notes`,{headers:authHeaders()});if(r.status===401){on401();return};const j=await r.json();setNotesText(j.notes||'')}catch{toast('Failed to load notes','danger')}}
  const saveNotes=async()=>{if(!notesTarget)return;const r=await put(`${API}/players/${notesTarget.guid}/notes`,{notes:notesText});if(r?.error){toast(r.error,'danger');return};toast('Notes saved');setShowNotes(false);reloadHistory()}
  const[dbSort,setDbSort]=useState('last_seen');const[dbSortDir,setDbSortDir]=useState('desc');const[dbPage,setDbPage]=useState(0)
  const DB_PAGE_SIZE=50
  const[expandedPlayer,setExpandedPlayer]=useState(null)
  const[showMatAdd,setShowMatAdd]=useState(false)
  const[newMatAdmin,setNewMatAdmin]=useState({reforger_id:'',player_name:'',role:'admin',auto_admin:true})
  const[satEdit,setSatEdit]=useState(null)
  const[satSaving,setSatSaving]=useState(false)
  const[msfEdit,setMsfEdit]=useState(null)
  const[msfSaving,setMsfSaving]=useState(false)
  const[webhooksEdit,setWebhooksEdit]=useState(null)
  const[webhooksSaving,setWebhooksSaving]=useState(false)
  const[motdEdit,setMotdEdit]=useState(null)
  const[motdSaving,setMotdSaving]=useState(false)

  const matAdmins=useMemo(()=>Array.isArray(matRaw?.data)?matRaw.data:[],[matRaw])
  const saveMatAdmins=async(list)=>{const r=await put(`${API}/profile/config`,{path:'profile/profile/Misfits_Logging/configs/admins.json',data:list});if(r.error){toast(r.error,'danger');return false};reloadMat();return true}
  const addMatAdmin=async()=>{if(!newMatAdmin.reforger_id.trim()){toast('Reforger ID required','danger');return};const updated=[...matAdmins,{...newMatAdmin,reforger_id:newMatAdmin.reforger_id.trim()}];if(await saveMatAdmins(updated)){toast(`Added ${newMatAdmin.player_name||newMatAdmin.reforger_id}`);setShowMatAdd(false);setNewMatAdmin({reforger_id:'',player_name:'',role:'admin',auto_admin:true})}}
  const removeMatAdmin=async(idx)=>{if(await saveMatAdmins(matAdmins.filter((_,i)=>i!==idx)))toast('Removed','warning')}
  const[showAdd,setShowAdd]=useState(false);const[newAdmin,setNewAdmin]=useState({id:'',username:'',role:'admin',notes:''})
  const[showBan,setShowBan]=useState(false);const[newBan,setNewBan]=useState({id:'',reason:'',ip:''})
  const[showIpBan,setShowIpBan]=useState(false);const[newIpBan,setNewIpBan]=useState({ip:'',reason:''})
  const[playerSearch,setPlayerSearch]=useState('');const[histSearch,setHistSearch]=useState('');const[banSearch,setBanSearch]=useState('')
  const isOn=status?.server?.status==='online'
  const admins=adminsData?.admins||[];const sat=satRaw?.data||{};const satAdmins=sat.admins||{};const satBans=sat.bans||{}
  const msf=msfSettingsRaw?.data||{};const webhooks=msfWebhooksRaw?.data||{};const motd=msfMotdRaw?.data||{}
  const satForm=satEdit??sat;const msfForm=msfEdit??msf;const webhooksForm=webhooksEdit??webhooks;const motdForm=motdEdit??motd
  useEffect(()=>{if(Object.keys(sat).length>0&&satEdit===null)setSatEdit({...sat})},[sat])
  useEffect(()=>{if(Object.keys(msf).length>0&&msfEdit===null)setMsfEdit({...msf})},[msf])
  useEffect(()=>{if(Object.keys(webhooks).length>0&&webhooksEdit===null)setWebhooksEdit({...webhooks})},[webhooks])
  useEffect(()=>{if(Object.keys(motd).length>0&&motdEdit===null)setMotdEdit({...motd})},[motd])
  const saveSatConfig=async()=>{setSatSaving(true);const r=await put(`${API}/profile/config`,{path:'profile/profile/ServerAdminTools_Config.json',data:satEdit||sat});setSatSaving(false);r.error?toast(r.error,'danger'):(toast('SAT config saved'),reloadSat(),setSatEdit(null))}
  const saveMsfSettings=async()=>{setMsfSaving(true);const r=await put(`${API}/profile/config`,{path:'profile/profile/Misfits_Logging/configs/msf_settings.json',data:msfEdit||msf});setMsfSaving(false);r.error?toast(r.error,'danger'):(toast('MAT settings saved'),reloadMsfSettings(),setMsfEdit(null))}
  const saveWebhooks=async()=>{setWebhooksSaving(true);const r=await put(`${API}/profile/config`,{path:'profile/profile/Misfits_Logging/configs/msf_webhooks.json',data:webhooksEdit||webhooks});setWebhooksSaving(false);r.error?toast(r.error,'danger'):(toast('Webhooks saved'),reloadMsfWebhooks(),setWebhooksEdit(null))}
  const saveMotd=async()=>{setMotdSaving(true);const r=await put(`${API}/profile/config`,{path:'profile/profile/Misfits_Logging/configs/motd_config.json',data:motdEdit||motd});setMotdSaving(false);r.error?toast(r.error,'danger'):(toast('MOTD saved'),reloadMsfMotd(),setMotdEdit(null))}

  const copyGuid=(guid)=>{if(!guid)return;navigator.clipboard.writeText(guid).then(()=>toast('GUID copied','info')).catch(()=>toast('Copy failed','danger'))}
  const copyIp=(ip)=>{if(!ip)return;navigator.clipboard.writeText(ip).then(()=>toast('IP copied','info')).catch(()=>toast('Copy failed','danger'))}
  const addAdmin=async()=>{if(!newAdmin.id){toast('GUID required','danger');return};const r=await post(`${API}/admins/add`,newAdmin);if(r.error){toast(r.error,'danger');return};if(hasSat)await put(`${API}/profile/config`,{path:'profile/profile/ServerAdminTools_Config.json',data:{...sat,admins:{...satAdmins,[newAdmin.id]:newAdmin.username||'Admin'}}});toast(r.message||'Added');setShowAdd(false);setNewAdmin({id:'',username:'',role:'admin',notes:''});reloadAdmins();reloadSat()}
  const removeAdmin=async id=>{const r=await post(`${API}/admins/remove`,{id});if(r?.error){toast(r.error,'danger');return};const na={...satAdmins};delete na[id];if(hasSat)await put(`${API}/profile/config`,{path:'profile/profile/ServerAdminTools_Config.json',data:{...sat,admins:na}});toast('Removed','warning');reloadAdmins();reloadSat()}
  const addSatBan=async(guid,name,reason)=>{const r=await post(`${API}/admins/ban-kick`,{guid,reason:reason||'Banned'});if(r.error){toast(r.error,'danger');return};toast(r.message||'Banned');reloadSat()}
  const removeSatBan=async id=>{const nb={...satBans};delete nb[id];if(hasSat){const r=await put(`${API}/profile/config`,{path:'profile/profile/ServerAdminTools_Config.json',data:{...sat,bans:nb}});if(r?.error){toast(r.error,'danger');return}};toast('Unbanned');reloadSat()}
  const addMatBanFn=async(guid,name,reason)=>{const r=await post(`${API}/admin/mat/ban`,{reforger_id:guid,player_name:name||'',reason:reason||'Banned'});r.error?toast(r.error,'danger'):toast(r.message||'Banned');reloadMatBans()}
  const removeMatBanFn=async(guid)=>{const r=await del(`${API}/admin/mat/ban/${encodeURIComponent(guid)}`);r?.error?toast(r.error,'danger'):toast(r?.message||'Unbanned');reloadMatBans()}
  const addIpBanFn=async()=>{if(!newIpBan.ip){toast('IP required','danger');return};const r=await post(`${API}/admin/ip-ban`,newIpBan);r.error?toast(r.error,'danger'):toast(r.message||'IP banned');setShowIpBan(false);setNewIpBan({ip:'',reason:''});reloadIpBans()}
  const removeIpBanFn=async(ip)=>{const r=await del(`${API}/admin/ip-ban/${encodeURIComponent(ip)}`);r?.error?toast(r.error,'danger'):toast(r?.message||'Unbanned');reloadIpBans()}
  const kickPlayer=async(name)=>{const r=await post(`${API}/admin/rcon/kick`,{player_id:name});r.error?toast(r.error,'danger'):toast(`Kicked ${name}`,'warning')}
  const msgAll=async(msg)=>{if(!msg)return;const r=await post(`${API}/admin/rcon/message`,{message:msg});r.error?toast(r.error,'danger'):toast('Message sent')}

  const quickBan=(p)=>{setNewBan({id:p.guid||p.player_guid||'',reason:'',ip:p.ip||''});setShowBan(true)}
  const quickMatAdmin=(p)=>{setNewMatAdmin({reforger_id:p.guid||'',player_name:p.name||p.player_name||'',role:'admin',auto_admin:true});setShowMatAdd(true);setTab('admins')}

  const histPlayers=historyData?.players||[]
  const filteredHist=useMemo(()=>histSearch?histPlayers.filter(p=>(p.name||'').toLowerCase().includes(histSearch.toLowerCase())||p.guid.includes(histSearch)||(p.ips_seen||'').includes(histSearch)):histPlayers,[histPlayers,histSearch])
  const sortedHist=useMemo(()=>[...filteredHist].sort((a,b)=>{const av=a[dbSort]||'';const bv=b[dbSort]||'';const cmp=typeof av==='number'?av-bv:String(av).localeCompare(String(bv));return dbSortDir==='desc'?-cmp:cmp}),[filteredHist,dbSort,dbSortDir])

  const matBans=matBansData?.bans||[]
  const ipBans=ipBansData?.bans||[]
  const allGuids=useMemo(()=>{const g={...satBans};matBans.forEach(b=>{if(b.reforger_id&&!g[b.reforger_id])g[b.reforger_id]={source:'mat',reason:b.reason||'Banned',name:b.player_name,banned_at:b.banned_at}});Object.keys(satBans).forEach(id=>{if(!g[id]||g[id].source!=='mat')g[id]={source:'sat',reason:satBans[id]}});return g},[satBans,matBans])
  const trollAlerts=trollData?.alerts||[]
  const playerCount=status?.server?.players||0;const maxPlayers=status?.server?.maxPlayers||0

  const PLATFORM_ICON={PC:'PC',Xbox:'XB',PlayStation:'PS',Unknown:'?'}


  const{data:auditData,reload:reloadAudit}=useFetchOnce(`${API}/admin/audit-log`)
  const{data:mySettings,reload:reloadMySettings}=useFetchOnce(`${API}/users/settings`)
  const[ipVisible,setIpVisible]=useState(true)
  useEffect(()=>{if(mySettings?.ip_visible!==undefined)setIpVisible(mySettings.ip_visible)},[mySettings])
  const toggleIpVisible=async()=>{const nv=!ipVisible;setIpVisible(nv);await put(`${API}/users/settings`,{ip_visible:nv});reloadMySettings()}

  const TABS=[
    {id:'live',label:`Online${isOn?' ('+playerCount+')':''}`,icon:'▶'},
    {id:'database',label:`Database (${historyData?.total??'...'})`,icon:'◈'},
    {id:'bans',label:`Bans (${Object.keys(allGuids).length+ipBans.length})`,icon:'⊗'},
    ...(trollAlerts.length>0?[{id:'alerts',label:`Alerts (${trollAlerts.length})`,icon:'⚑'}]:[]),
    {id:'logs',label:'Server Logs',icon:'≡'},
    {id:'admins',label:'Admins',icon:'★'},
    ...(hasSat?[{id:'sat',label:'SAT'}]:[]),
    ...(hasMat?[{id:'matcfg',label:'MAT'}]:[]),
    ...((isOwner||isHeadAdmin||isDemo)?[{id:'audit',label:'Audit'}]:[]),
    ...((isOwner||isHeadAdmin||isDemo)?[{id:'permissions',label:'Permissions'}]:[]),
  ]

  return <div className="flex flex-col h-full">
    <div className={`flex items-center gap-3 mb-3 ${mobile?'flex-col items-start':''} flex-wrap`}>
      <h2 className="font-black" style={{color:C.textBright,fontSize:sz.base+4}}>Admin Panel</h2>
      {isOn?<Badge text={`${playerCount}/${maxPlayers} online`} v="default" pulse/>:<Badge text="Server Offline" v="danger"/>}
      <Badge text={`${historyData?.total||0} ever`} v="dim"/>
      {Object.keys(allGuids).length>0&&<Badge text={`${Object.keys(allGuids).length} GUID ban${Object.keys(allGuids).length!==1?'s':''}`} v="danger"/>}
      {ipBans.length>0&&<Badge text={`${ipBans.length} IP ban${ipBans.length!==1?'s':''}`} v="danger"/>}
      {trollAlerts.length>0&&<Badge text={`${trollAlerts.length} troll alert${trollAlerts.length!==1?'s':''}`} v="warning"/>}
      {modData?.mods?.map(m=><Badge key={m.id} text={m.short} v="info"/>)}
      <div className="ml-auto"><button onClick={toggleIpVisible} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg cursor-pointer font-bold" style={{background:ipVisible?C.accentBg:C.bgInput,color:ipVisible?C.accent:C.textMuted,border:`1px solid ${ipVisible?C.accent+'30':C.border}`,fontSize:sz.stat}}>{ipVisible?'IPs Visible':'IPs Hidden'}</button></div>
    </div>
    <div className="flex items-center gap-2 mb-3 flex-wrap">
      <div className="overflow-x-auto max-w-full" style={{WebkitOverflowScrolling:'touch'}}>
        <div className="flex rounded-lg overflow-hidden" style={{background:C.bgInput,border:`1px solid ${C.border}`,width:'max-content'}}>
          {TABS.map(t=><button key={t.id} onClick={()=>setTab(t.id)} className="px-3 font-bold cursor-pointer whitespace-nowrap" style={{paddingTop:mobile?12:6,paddingBottom:mobile?12:6,background:tab===t.id?C.accentBg:'transparent',color:tab===t.id?C.accent:C.textDim,fontSize:sz.nav}}>{t.label}</button>)}
        </div>
      </div>
      <div className="flex-1"/>
      {tab==='live'&&<><input value={playerSearch} onChange={e=>setPlayerSearch(e.target.value)} placeholder="Search player..." className={`rounded-lg px-3 py-1.5 outline-none placeholder:opacity-30 ${mobile?'flex-1':'w-44'}`} style={{background:C.bgInput,border:`1px solid ${C.border}`,color:C.text,fontSize:sz.input}}/><Btn v="ghost" onClick={()=>reloadLive()}>Refresh</Btn></>}
      {tab==='database'&&<><input value={histSearch} onChange={e=>{setHistSearch(e.target.value);setDbPage(0)}} placeholder="Search name/GUID/IP..." className={`rounded-lg px-3 py-1.5 outline-none placeholder:opacity-30 ${mobile?'flex-1':'w-52'}`} style={{background:C.bgInput,border:`1px solid ${C.border}`,color:C.text,fontSize:sz.input}}/><Btn v="ghost" onClick={()=>{setHistSearch('');reloadHistory()}}>Refresh</Btn></>}
      {tab==='bans'&&<><input value={banSearch} onChange={e=>setBanSearch(e.target.value)} placeholder="Search..." className={`rounded-lg px-3 py-1.5 outline-none placeholder:opacity-30 ${mobile?'flex-1':'w-40'}`} style={{background:C.bgInput,border:`1px solid ${C.border}`,color:C.text,fontSize:sz.input}}/><Btn v="danger" onClick={()=>setShowBan(true)}>+ GUID Ban</Btn><Btn v="danger" onClick={()=>setShowIpBan(true)}>+ IP Ban</Btn></>}
      {tab==='admins'&&<><Btn onClick={()=>setShowAdd(true)}>+ Add Admin</Btn>{hasMat&&<Btn onClick={()=>setShowMatAdd(true)}>+ MAT Admin</Btn>}</>}
      {tab==='alerts'&&<Btn v="ghost" onClick={()=>reloadTrolls()}>Refresh</Btn>}
      {tab==='logs'&&<><input value={adminLogFilter} onChange={e=>setAdminLogFilter(e.target.value)} placeholder="Filter logs..." className={`rounded-lg px-3 py-1.5 outline-none placeholder:opacity-30 ${mobile?'flex-1':'w-44'}`} style={{background:C.bgInput,border:`1px solid ${C.border}`,color:C.text,fontSize:sz.input}}/><Btn v="ghost" onClick={()=>setAdminLogFilter('')}>Clear</Btn></>}
      {tab==='audit'&&<Btn v="ghost" onClick={()=>reloadAudit()}>Refresh</Btn>}
    </div>

    {tab==='live'&&<div className="flex-1 overflow-auto space-y-3">
      {isOn&&<div className="flex gap-2 p-3 rounded-xl" style={{background:C.bgInput,border:`1px solid ${C.border}`}}>
        <span className="font-black self-center px-2" style={{color:C.accent,fontSize:sz.base+2}}>📢</span>
        <input value={broadcastMsg} onChange={e=>setBroadcastMsg(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sendBroadcast()} placeholder="Broadcast message to all players..." className="flex-1 rounded-lg px-3 py-2 outline-none" style={{background:'transparent',color:C.text,fontSize:sz.input}}/>
        <Btn onClick={sendBroadcast} disabled={broadcastSending||!broadcastMsg.trim()}>{broadcastSending?'Sending...':'Broadcast'}</Btn>
      </div>}
      {!isOn?<Empty title="Server offline" sub="Start the server to see online players"/>:(()=>{
        const livePlayers=liveData?.players||[]
        const shown=playerSearch?livePlayers.filter(p=>(p.player_name||'').toLowerCase().includes(playerSearch.toLowerCase())):livePlayers
        if(shown.length===0)return <Empty title="No players online" sub="Players appear here when they join"/>
        return <div className="space-y-2">{shown.map((p,i)=>{
          const name=p.player_name||'Unknown';const guid=p.player_guid||''
          const isBanned=!!allGuids[guid]
          const isPlayerAdmin=satAdmins[guid]||matAdmins.some(a=>a.reforger_id===guid)
          const joinMins=p.joined_at?Math.round((Date.now()/1000-p.joined_at)/60):null
          return <div key={i} className="rounded-xl px-4 py-3 transition-all" style={{background:C.bgCard,border:`1.5px solid ${isBanned?C.red+'40':isPlayerAdmin?C.accent+'30':C.border}`}}>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl flex-shrink-0 flex items-center justify-center font-black relative" style={{background:isPlayerAdmin?C.accentBg:`${C.accent}0a`,color:C.accent,border:`2px solid ${isPlayerAdmin?C.accent+'60':C.accent+'20'}`,fontSize:sz.base+5}}>
                {name[0].toUpperCase()}
                {joinMins!=null&&<div className="absolute -bottom-1.5 -right-1.5 px-1 py-[1px] rounded font-black" style={{background:C.bgCard,border:`1px solid ${C.border}`,color:C.textMuted,fontSize:8}}>{joinMins}m</div>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <span className="font-black" style={{color:C.textBright,fontSize:sz.base+2}}>{name}</span>
                  <Badge text="LIVE" v="default" pulse/>
                  {isPlayerAdmin&&<Badge text="ADMIN" v="info"/>}
                  {isBanned&&<Badge text="BANNED" v="danger"/>}
                  {p.platform&&<Badge text={PLATFORM_ICON[p.platform]||p.platform} v="dim"/>}
                  {p.faction_name&&<Badge text={p.faction_name} v="dim"/>}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono" style={{color:C.textMuted,fontSize:sz.stat}}>{guid?guid.slice(0,18)+'...':'No GUID'}</span>
                  {guid&&<button onClick={()=>copyGuid(guid)} className="cursor-pointer px-1.5 py-0.5 rounded" style={{background:C.bgInput,color:C.textMuted,border:`1px solid ${C.border}`,fontSize:sz.stat}}>copy</button>}
                  {p.ip&&ipVisible&&<><span className="font-mono" style={{color:C.blue,fontSize:sz.stat}}>{p.ip}</span><button onClick={()=>copyIp(p.ip)} className="cursor-pointer px-1 py-0.5 rounded" style={{background:C.bgInput,color:C.textMuted,border:`1px solid ${C.border}`,fontSize:sz.stat}}>cp</button></>}
                </div>
                {(p.kills>0||p.deaths>0||p.teamkills>0)&&<div className="flex gap-4 mt-1">
                  <span style={{color:C.accent,fontSize:sz.stat}}>K <span className="font-black">{p.kills||0}</span></span>
                  <span style={{color:C.red,fontSize:sz.stat}}>D <span className="font-black">{p.deaths||0}</span></span>
                  {p.teamkills>0&&<span style={{color:C.orange,fontSize:sz.stat}}>TK <span className="font-black">{p.teamkills}</span></span>}
                </div>}
              </div>
              <div className="flex flex-wrap gap-1.5 items-center justify-end shrink-0" style={{maxWidth:180}}>
                {isOn&&<Btn small v="warning" onClick={()=>kickPlayer(name)}>Kick</Btn>}
                {guid&&!isBanned&&<Btn small v="danger" onClick={()=>quickBan({guid,name,ip:p.ip})}>Ban</Btn>}
                {guid&&isBanned&&<Btn small onClick={()=>{hasMat?removeMatBanFn(guid):removeSatBan(guid)}}>Unban</Btn>}
                {p.ip&&ipVisible&&!ipBans.find(b=>b.ip===p.ip)&&<Btn small v="danger" onClick={()=>{setNewIpBan({ip:p.ip,reason:`Banned ${name}`});setShowIpBan(true)}}>IP Ban</Btn>}
                {guid&&!isPlayerAdmin&&<Btn small v="ghost" onClick={()=>quickMatAdmin(p)}>+Admin</Btn>}
                <Btn small v="ghost" onClick={()=>post(`${API}/admin/rcon/message`,{message:`[ADMIN] ${broadcastMsg||'Message sent'}`,target:name}).then(r=>r.error?toast(r.error,'danger'):toast(`Msg sent to ${name}`))}>Msg</Btn>
              </div>
            </div>
          </div>
        })}</div>
      })()}
    </div>}

    {tab==='database'&&<div className="flex-1 overflow-auto">
      {(()=>{
        const sorted=sortedHist
        const page=sorted.slice(dbPage*DB_PAGE_SIZE,(dbPage+1)*DB_PAGE_SIZE)
        const totalPages=Math.ceil(sorted.length/DB_PAGE_SIZE)
        return <>
          {!mobile&&<div className="px-4 py-2.5 grid gap-3 mb-1" style={{gridTemplateColumns:'1fr 1fr 80px 80px 80px 80px 110px',borderBottom:`1px solid ${C.border}`}}>
            <SortBtn col="name" label="Player" dbSort={dbSort} setDbSort={setDbSort} setDbSortDir={setDbSortDir} dbSortDir={dbSortDir} C={C} sz={sz}/><SortBtn col="guid" label="GUID" dbSort={dbSort} setDbSort={setDbSort} setDbSortDir={setDbSortDir} dbSortDir={dbSortDir} C={C} sz={sz}/><SortBtn col="session_count" label="Sessions" dbSort={dbSort} setDbSort={setDbSort} setDbSortDir={setDbSortDir} dbSortDir={dbSortDir} C={C} sz={sz}/><SortBtn col="kills" label="Kills" dbSort={dbSort} setDbSort={setDbSort} setDbSortDir={setDbSortDir} dbSortDir={dbSortDir} C={C} sz={sz}/><SortBtn col="deaths" label="Deaths" dbSort={dbSort} setDbSort={setDbSort} setDbSortDir={setDbSortDir} dbSortDir={dbSortDir} C={C} sz={sz}/><SortBtn col="teamkills" label="TK" dbSort={dbSort} setDbSort={setDbSort} setDbSortDir={setDbSortDir} dbSortDir={dbSortDir} C={C} sz={sz}/><SortBtn col="last_seen" label="Last Seen" dbSort={dbSort} setDbSort={setDbSort} setDbSortDir={setDbSortDir} dbSortDir={dbSortDir} C={C} sz={sz}/>
          </div>}
          <div className="space-y-1">{page.map((p,i)=>{
            const ips=safeParse(p.ips_seen,[]);const names=safeParse(p.names_seen,[])
            const isBanned=!!allGuids[p.guid];const isExpanded=expandedPlayer===p.guid
            const isPlayerAdmin=satAdmins[p.guid]||matAdmins.some(a=>a.reforger_id===p.guid)
            return <div key={p.guid||i}>
              <div className="px-4 py-2.5 rounded-lg cursor-pointer transition-all" style={{background:isExpanded?C.accentBg:C.bgCard,border:`1px solid ${isExpanded?C.accent+'40':C.border}`,display:mobile?'flex':'grid',alignItems:'center',gap:mobile?8:12,...(!mobile&&{gridTemplateColumns:'1fr 1fr 80px 80px 80px 80px 110px'})}} onClick={()=>setExpandedPlayer(isExpanded?null:p.guid)}>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold truncate" style={{color:C.textBright,fontSize:sz.base}}>{p.name}</span>
                    {isPlayerAdmin&&<Badge text="ADM" v="info"/>}
                    {isBanned&&<Badge text="BAN" v="danger"/>}
                    {names.length>1&&<span style={{color:C.textMuted,fontSize:sz.stat}}>+{names.length-1}</span>}
                  </div>
                  {ips.length>0&&ipVisible&&<div className="font-mono" style={{color:C.textMuted,fontSize:sz.stat-1}}>{ips[ips.length-1]}</div>}
                  {p.notes&&<div style={{color:C.orange,fontSize:sz.stat-1}}>★ {p.notes.slice(0,40)}</div>}
                </div>
                {!mobile&&<div className="flex items-center gap-1 min-w-0">
                  <span className="font-mono truncate" style={{color:C.textMuted,fontSize:sz.stat-1}}>{p.guid?.slice(0,16)||'-'}</span>
                  {p.guid&&<button onClick={e=>{e.stopPropagation();copyGuid(p.guid)}} className="cursor-pointer px-1 py-0.5 rounded shrink-0" style={{fontSize:9,background:C.bgInput,color:C.textMuted,border:`1px solid ${C.border}`}}>cp</button>}
                </div>}
                {!mobile&&<span className="font-mono text-center font-bold" style={{color:C.text,fontSize:sz.base}}>{p.session_count}</span>}
                {!mobile&&<span className="font-mono text-center" style={{color:C.accent,fontSize:sz.base}}>{p.kills||0}</span>}
                {!mobile&&<span className="font-mono text-center" style={{color:C.red,fontSize:sz.base}}>{p.deaths||0}</span>}
                {!mobile&&<span className="font-mono text-center font-bold" style={{color:p.teamkills>0?C.orange:C.textMuted,fontSize:sz.base}}>{p.teamkills||0}</span>}
                {!mobile&&<span className="font-mono text-right" style={{color:C.textMuted,fontSize:sz.stat-1}}>{p.last_seen?.slice(0,10)||'?'}</span>}
                {mobile&&<div className="ml-auto text-right shrink-0"><div style={{color:C.accent,fontSize:sz.stat}}>{p.kills||0}K/{p.deaths||0}D</div><div style={{color:C.textMuted,fontSize:sz.stat-1}}>{p.last_seen?.slice(0,10)||'?'}</div></div>}
              </div>
              {isExpanded&&<div className="mx-2 mb-2 rounded-b-xl p-4 space-y-3" style={{background:`${C.accent}06`,border:`1px solid ${C.accent}20`,borderTop:'none'}}>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div><div style={{color:C.textDim,fontSize:sz.stat}}>First Seen</div><div className="font-bold font-mono" style={{color:C.text,fontSize:sz.base}}>{p.first_seen?.slice(0,10)||'?'}</div></div>
                  <div><div style={{color:C.textDim,fontSize:sz.stat}}>Platform</div><div className="font-bold" style={{color:C.text,fontSize:sz.base}}>{p.platform||'Unknown'}</div></div>
                  <div><div style={{color:C.textDim,fontSize:sz.stat}}>Aliases ({names.length})</div><div className="font-mono" style={{color:C.text,fontSize:sz.stat}}>{names.join(', ')}</div></div>
                  <div><div style={{color:C.textDim,fontSize:sz.stat}}>IPs ({ips.length})</div><div className="font-mono" style={{color:ipVisible?C.text:C.textMuted,fontSize:sz.stat}}>{ipVisible?ips.join(', '):'Hidden'}</div></div>
                </div>
                <div>
                  <div style={{color:C.textDim,fontSize:sz.stat}} className="mb-1">Admin Notes</div>
                  <textarea value={notesTarget?.guid===p.guid?notesText:p.notes||''} onChange={e=>notesTarget?.guid===p.guid&&setNotesText(e.target.value)} onFocus={()=>{if(notesTarget?.guid!==p.guid){setNotesTarget(p);setNotesText(p.notes||'')}}} rows={2} placeholder="Add admin notes..." className="w-full rounded-lg px-3 py-2 outline-none resize-none font-mono" style={{background:C.bgInput,border:`1px solid ${C.border}`,color:C.text,fontSize:sz.stat}}/>
                  {notesTarget?.guid===p.guid&&<div className="flex gap-2 mt-1 justify-end"><Btn small v="ghost" onClick={()=>{setNotesTarget(null);setNotesText('')}}>Cancel</Btn><Btn small onClick={saveNotes}>Save Notes</Btn></div>}
                </div>
                <div className="flex gap-2 flex-wrap">
                  {p.guid&&!isBanned&&<Btn small v="danger" onClick={()=>quickBan(p)}>Ban GUID</Btn>}
                  {p.guid&&isBanned&&<Btn small onClick={()=>{hasMat?removeMatBanFn(p.guid):removeSatBan(p.guid)}}>Unban</Btn>}
                  {p.guid&&!isPlayerAdmin&&<Btn small v="ghost" onClick={()=>quickMatAdmin(p)}>+ Make Admin</Btn>}
                  {ips.length>0&&ipVisible&&!ipBans.find(b=>b.ip===ips[ips.length-1])&&<Btn small v="danger" onClick={()=>{setNewIpBan({ip:ips[ips.length-1],reason:`Banned ${p.name}`});setShowIpBan(true)}}>IP Ban</Btn>}
                </div>
              </div>}
            </div>
          })}</div>
          {totalPages>1&&<div className="flex items-center gap-2 justify-center mt-3">
            <Btn small v="ghost" onClick={()=>setDbPage(p=>Math.max(0,p-1))} disabled={dbPage===0}>Prev</Btn>
            <span style={{color:C.textDim,fontSize:sz.stat}}>Page {dbPage+1}/{totalPages} · {sorted.length} total</span>
            <Btn small v="ghost" onClick={()=>setDbPage(p=>Math.min(totalPages-1,p+1))} disabled={dbPage>=totalPages-1}>Next</Btn>
          </div>}
        </>
      })()}
    </div>}

    {tab==='bans'&&<div className="flex-1 overflow-auto space-y-4">
      <div>
        <div className="font-black uppercase tracking-widest mb-2" style={{color:C.textDim,fontSize:sz.label}}>GUID Bans ({Object.keys(allGuids).length})</div>
        {Object.keys(allGuids).length===0?<Empty title="No GUID bans" sub="Use the Ban button on a player to ban by GUID"/>:
          <div className="space-y-2">{Object.entries(allGuids).filter(([id])=>{if(!banSearch)return true;const q=banSearch.toLowerCase();const e=allGuids[id];return id.toLowerCase().includes(q)||(e?.name||'').toLowerCase().includes(q)||(typeof e.reason==='string'?e.reason:JSON.stringify(e)).toLowerCase().includes(q)}).map(([id,ban])=>{
            const name=ban.name||histPlayers.find(p=>p.guid===id)?.name||'Unknown'
            const reason=typeof ban==='string'?ban:ban.reason||'Banned'
            const src=ban.source||'sat'
            return <Card key={id} className="px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap"><span className="font-bold" style={{color:C.text,fontSize:sz.base}}>{name}</span><Badge text="BANNED" v="danger"/><Badge text={src.toUpperCase()} v="dim"/></div>
                <div className="flex items-center gap-1.5 mt-0.5"><span className="font-mono truncate" style={{color:C.textMuted,fontSize:sz.stat-1}}>{id}</span><button onClick={()=>copyGuid(id)} className="cursor-pointer px-1 py-0.5 rounded text-xs" style={{background:C.bgInput,color:C.textMuted,border:`1px solid ${C.border}`}}>cp</button></div>
                <div style={{color:C.red,fontSize:sz.stat}}>Reason: {reason}</div>
                {ban.banned_at&&<div style={{color:C.textMuted,fontSize:sz.stat-1}}>Banned: {ban.banned_at}</div>}
              </div>
              <Btn small onClick={()=>{if(hasMat)removeMatBanFn(id);else removeSatBan(id)}}>Unban</Btn>
            </Card>
          })}</div>}
      </div>
      <div>
        <div className="font-black uppercase tracking-widest mb-2" style={{color:C.textDim,fontSize:sz.label}}>IP Bans ({ipBans.length})</div>
        {ipBans.length===0?<Empty title="No IP bans" sub="IP bans block connections at the firewall level (ufw)"/>:
          <div className="space-y-2">{ipBans.filter(b=>!banSearch||b.ip.includes(banSearch)||(b.reason||'').toLowerCase().includes(banSearch.toLowerCase())||(b.banned_by||'').toLowerCase().includes(banSearch.toLowerCase())).map((b,i)=>
            <Card key={i} className="px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2"><span className="font-mono font-bold" style={{color:C.textBright,fontSize:sz.base}}>{b.ip}</span><Badge text="IP BANNED" v="danger"/></div>
                <div style={{color:C.textDim,fontSize:sz.stat}}>Reason: {b.reason||'Banned'}</div>
                <div style={{color:C.textMuted,fontSize:sz.stat-1}}>By {b.banned_by||'?'} at {b.banned_at?.slice(0,10)||'?'}</div>
              </div>
              <Btn small onClick={()=>removeIpBanFn(b.ip)}>Remove</Btn>
            </Card>
          )}</div>}
      </div>
    </div>}

    {tab==='alerts'&&<div className="flex-1 overflow-auto">
      {trollAlerts.length===0?<Empty title="No troll alerts" sub="Alerts appear when the same IP connects with multiple different names"/>:
        <div className="space-y-3">{trollAlerts.map((a,i)=><Card key={i} className="p-4" style={{border:`1px solid ${C.orange}30`,background:`${C.orange}05`}}>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center font-black shrink-0" style={{background:`${C.orange}15`,color:C.orange,fontSize:sz.base+2}}>!</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono font-bold" style={{color:C.orange,fontSize:sz.base}}>{a.ip}</span>
                <Badge text={`${a.player_count} accounts`} v="warning"/>
                <button onClick={()=>copyIp(a.ip)} className="cursor-pointer px-1.5 py-0.5 rounded text-xs" style={{background:C.bgInput,color:C.textMuted,border:`1px solid ${C.border}`}}>cp IP</button>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-2">{a.names.map(n=><span key={n} className="px-2 py-0.5 rounded font-bold" style={{background:C.bgInput,color:C.text,fontSize:sz.stat,border:`1px solid ${C.border}`}}>{n}</span>)}</div>
              <div className="space-y-1">{a.players.map(p=><div key={p.guid} className="flex items-center gap-2" style={{fontSize:sz.stat-1}}>
                <span className="font-bold" style={{color:C.text}}>{p.name}</span>
                <span className="font-mono" style={{color:C.textMuted}}>{p.guid?.slice(0,12)||'no GUID'}...</span>
                <span style={{color:C.textDim}}>{p.last_seen?.slice(0,10)}</span>
                {!allGuids[p.guid]&&p.guid&&<Btn small v="danger" onClick={()=>quickBan(p)}>Ban</Btn>}
                {!ipBans.find(b=>b.ip===a.ip)&&<Btn small v="danger" onClick={()=>{setNewIpBan({ip:a.ip,reason:`Troll - ${a.names.join(', ')}`});setShowIpBan(true)}}>IP Ban</Btn>}
              </div>)}</div>
            </div>
          </div>
        </Card>)}</div>}
    </div>}

    {tab==='logs'&&<div className="flex-1 flex flex-col min-h-0 gap-2">
      <div className="flex gap-1.5 flex-wrap shrink-0">
        {[['connect','Joins',C.accent],['disconnect','Leaves',C.red],['kill','Kills',C.orange],['chat','Chat',C.blue],['error','Errors',C.red]].map(([kw,label,col])=>{const active=adminLogFilter===kw;return<button key={kw} onClick={()=>setAdminLogFilter(active?'':kw)} className="px-3 py-1 rounded-lg font-bold cursor-pointer" style={{background:active?col+'18':'transparent',color:active?col:C.textMuted,border:`1px solid ${active?col+'40':C.border}`,fontSize:sz.stat}}>{label}</button>})}
      </div>
      <div className="flex-1 rounded-xl overflow-auto font-mono min-h-0 py-1" style={{background:C.consoleBg,border:`1px solid ${C.border}`,fontSize:sz.code}}>
        {(rconLogs||[]).filter(l=>!adminLogFilter||l.msg.toLowerCase().includes(adminLogFilter.toLowerCase())||l.level.toLowerCase().includes(adminLogFilter.toLowerCase())).map((l,i)=>{const lv=LVL[l.level]||LVL.INFO;const sev=l.level==='ERROR'||l.level==='FATAL';const isConnect=l.msg.toLowerCase().includes('player')||l.msg.toLowerCase().includes('authenticated');return<div key={i} className="flex items-start gap-1.5 px-3 py-[2px]" style={{borderLeft:`2px solid ${sev?lv.c:isConnect?C.accent+'40':'transparent'}`,background:sev?'#ff475706':'transparent'}}><span className="w-3 shrink-0 text-center" style={{color:lv.c}}>{lv.i}</span><span className="w-16 shrink-0" style={{color:C.textMuted,fontSize:sz.code-1}}>{l.ts}</span><SrcTag source={l.source}/><span className="flex-1 break-words" style={{color:sev?lv.c:l.level==='WARN'?C.orange:isConnect?C.textBright:C.textDim}}>{l.msg}</span></div>})}
        <div className="px-3 py-1"><span className="animate-[blink_1s_step-end_infinite]" style={{color:C.accent}}>_</span></div>
      </div>
      <div style={{color:C.textMuted,fontSize:sz.stat}} className="shrink-0">Full session log · {(rconLogs||[]).length} lines</div>
    </div>}

    {tab==='admins'&&<div className="flex-1 overflow-auto space-y-4">
      <div>
        <div className="font-black uppercase tracking-widest mb-2" style={{color:C.textDim,fontSize:sz.label}}>Panel / SAT Admins</div>
        {admins.length===0&&Object.keys(satAdmins).length===0?<Empty title="No admins" sub="Add a GUID to grant in-game admin access"/>:
          <div className="space-y-2">{[...new Set([...admins.map(a=>a.id),...Object.keys(satAdmins)])].map(id=>{const pa=admins.find(a=>a.id===id);const sn=satAdmins[id];const ph=histPlayers.find(p=>p.guid===id)
            return <Card key={id} className="px-4 py-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center font-black shrink-0" style={{background:C.accentBg,color:C.accent,border:`1px solid ${C.accent}20`,fontSize:sz.base+2}}>{(pa?.username||sn||ph?.name||'?')[0].toUpperCase()}</div>
              <div className="flex-1 min-w-0">
                <div className="font-bold" style={{color:C.text,fontSize:sz.base}}>{pa?.username||sn||ph?.name||'Unknown'}</div>
                <div className="flex items-center gap-1.5 mt-0.5"><span className="font-mono truncate" style={{color:C.textMuted,fontSize:sz.stat-1}}>{id}</span><button onClick={()=>copyGuid(id)} className="cursor-pointer px-1 py-0.5 rounded text-xs" style={{background:C.bgInput,color:C.textMuted,border:`1px solid ${C.border}`}}>cp</button></div>
                {pa?.notes&&<div style={{color:C.textDim,fontSize:sz.stat}}>{pa.notes}</div>}
              </div>
              <div className="flex items-center gap-2 shrink-0">{sn&&<Badge text="SAT" v="info"/>}{pa?.role&&<Badge text={pa.role}/>}<Btn small v="danger" onClick={()=>removeAdmin(id)}>X</Btn></div>
            </Card>})}</div>}
      </div>
      {hasMat&&<div>
        <div className="font-black uppercase tracking-widest mb-2" style={{color:C.textDim,fontSize:sz.label}}>MAT Admins</div>
        {matAdmins.length===0?<Empty title="No MAT admins" sub="Add admins to Misfits_Logging/configs/admins.json"/>:
          <div className="space-y-2">{matAdmins.map((a,i)=>{const isP=a.reforger_id==='REPLACE-WITH-YOUR-REFORGER-ID'
            return <Card key={i} className={`px-4 py-3 flex items-center gap-3 ${isP?'opacity-50 border-red-500/30':''}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap"><span className="font-bold" style={{color:C.text,fontSize:sz.base}}>{a.player_name||'Unnamed'}</span><Badge text={a.role} v={a.role==='owner'?'danger':a.role==='admin'?'info':'dim'}/>{a.auto_admin&&<Badge text="auto" v="dim"/>}{isP&&<Badge text="PLACEHOLDER" v="danger"/>}</div>
                <div className="font-mono" style={{color:isP?C.red:C.textMuted,fontSize:sz.stat-1}}>{a.reforger_id}</div>
              </div>
              <Btn small v="danger" onClick={()=>removeMatAdmin(i)}>Remove</Btn>
            </Card>
          })}</div>}
      </div>}
    </div>}

    {tab==='sat'&&<div className="flex-1 overflow-auto space-y-4">
      <Card className="p-5">
        <div className="font-black uppercase tracking-wide mb-1" style={{color:C.textDim,fontSize:sz.label}}>AI GM Integration</div>
        <div className="font-mono mb-3" style={{color:C.textMuted,fontSize:sz.stat}}>ServerAdminTools_Config.json</div>
        <div className="rounded-lg p-3 mb-4" style={{background:'#3b82f610',border:'1px solid #3b82f630'}}>
          <span style={{color:'#3b82f6',fontSize:sz.stat}}>Set eventsApiAddress to pipe game events to the AI GM bridge at port 5555.</span>
        </div>
        <Input label="Events API Address" value={(satForm.eventsApiAddress||'').replace(/^"|"$/g,'')} onChange={v=>setSatEdit(p=>({...p,eventsApiAddress:`"${v}"`}))} placeholder="http://127.0.0.1:5555/events" mono/>
        <Input label="Events API Token" value={satForm.eventsApiToken||''} onChange={v=>setSatEdit(p=>({...p,eventsApiToken:v}))} placeholder="optional secret token" mono/>
        <div className="grid grid-cols-2 gap-3 mb-3"><Input label="Rate Limit (seconds)" value={satForm.eventsApiRatelimitSeconds??''} onChange={v=>setSatEdit(p=>({...p,eventsApiRatelimitSeconds:Number(v)||0}))} type="number"/></div>
        <div className="grid grid-cols-2 gap-3 mb-3"><Input label="Ban Reload (minutes)" value={satForm.banReloadIntervalMinutes??''} onChange={v=>setSatEdit(p=>({...p,banReloadIntervalMinutes:Number(v)||0}))} type="number"/><Input label="Stats Update (seconds)" value={satForm.statsFileUpdateIntervalSeconds??''} onChange={v=>setSatEdit(p=>({...p,statsFileUpdateIntervalSeconds:Number(v)||0}))} type="number"/></div>
        <div className="space-y-2 mb-4">{[['chatMessagesUtcTime','Chat timestamps in UTC'],['serverMessageOpen','Show server message on join'],['statsSaveConnectedPlayers','Save connected player stats'],['repeatedChatMessagesCycle','Cycle repeated chat messages']].map(([k,label])=>
          <div key={k} className="flex items-center gap-3 cursor-pointer" onClick={()=>setSatEdit(p=>({...p,[k]:!p[k]}))}>
            <div className="w-4 h-4 rounded flex items-center justify-center shrink-0" style={{border:`2px solid ${satForm[k]?C.accent:C.textMuted}`,background:satForm[k]?C.accent:'transparent',color:'#000',fontSize:10}}>{satForm[k]?'✓':''}</div>
            <span style={{color:C.textDim,fontSize:sz.base}}>{label}</span>
          </div>)}</div>
        <div className="flex justify-end gap-2"><Btn v="ghost" onClick={()=>setSatEdit(null)}>Reset</Btn><Btn onClick={saveSatConfig} disabled={satSaving}>{satSaving?'Saving…':'Save SAT Config'}</Btn></div>
      </Card>
    </div>}

    {tab==='matcfg'&&<div className="flex-1 overflow-auto space-y-4">
      <Card className="p-5">
        <div className="font-black uppercase tracking-wide mb-1" style={{color:C.textDim,fontSize:sz.label}}>Message of the Day</div>
        <div className="font-mono mb-3" style={{color:C.textMuted,fontSize:sz.stat}}>Misfits_Logging/configs/motd_config.json</div>
        {[['enabled','Enabled'],['auto_show','Show automatically on join']].map(([k,lbl])=><div key={k} className="flex items-center gap-3 mb-3 cursor-pointer" onClick={()=>setMotdEdit(p=>({...p,[k]:!p[k]}))}>
          <div className="w-4 h-4 rounded flex items-center justify-center shrink-0" style={{border:`2px solid ${motdForm[k]?C.accent:C.textMuted}`,background:motdForm[k]?C.accent:'transparent',color:'#000',fontSize:10}}>{motdForm[k]?'✓':''}</div>
          <span style={{color:C.textDim,fontSize:sz.base}}>{lbl}</span></div>)}
        <Input label="Title" value={motdForm.title||''} onChange={v=>setMotdEdit(p=>({...p,title:v}))} placeholder="Welcome to the Server"/>
        <div className="mb-3"><label className="font-bold block mb-1" style={{color:C.textDim,fontSize:sz.stat}}>Message</label><textarea value={motdForm.message||''} onChange={e=>setMotdEdit(p=>({...p,message:e.target.value}))} rows={4} className="w-full rounded-lg px-3 py-2 outline-none resize-y" style={{background:C.bgInput,border:`1px solid ${C.border}`,color:C.text,fontSize:sz.input}}/></div>
        <Input label="Discord Link" value={motdForm.discord_link||''} onChange={v=>setMotdEdit(p=>({...p,discord_link:v}))} placeholder="https://discord.gg/..."/>
        <div className="flex justify-end gap-2"><Btn v="ghost" onClick={()=>setMotdEdit(null)}>Reset</Btn><Btn onClick={saveMotd} disabled={motdSaving}>{motdSaving?'Saving…':'Save MOTD'}</Btn></div>
      </Card>
      <Card className="p-5">
        <div className="font-black uppercase tracking-wide mb-1" style={{color:C.textDim,fontSize:sz.label}}>Game Settings</div>
        <div className="font-mono mb-3" style={{color:C.textMuted,fontSize:sz.stat}}>Misfits_Logging/configs/msf_settings.json</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 mb-3">{[['friendly_fire_enabled','Friendly Fire'],['afk_kicker_enabled','AFK Kicker'],['spawn_protection_enabled','Spawn Protection'],['chat_roles_enabled','Chat Role Tags'],['lightning_enabled','Lightning'],['gm_budgets_disabled','Disable GM Budgets'],['entity_clear_broadcast_enabled','Entity Clear Broadcast'],['entity_clear_scheduled_enabled','Scheduled Entity Clear']].map(([k,label])=>
          <div key={k} className="flex items-center gap-2 cursor-pointer" onClick={()=>setMsfEdit(p=>({...p,[k]:!p[k]}))}>
            <div className="w-4 h-4 rounded flex items-center justify-center shrink-0" style={{border:`2px solid ${msfForm[k]?C.accent:C.textMuted}`,background:msfForm[k]?C.accent:'transparent',color:'#000',fontSize:10}}>{msfForm[k]?'✓':''}</div>
            <span style={{color:C.textDim,fontSize:sz.base}}>{label}</span></div>)}</div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <Input label="AFK Warn (s)" value={msfForm.afk_warn_seconds??''} onChange={v=>setMsfEdit(p=>({...p,afk_warn_seconds:Number(v)||0}))} type="number"/>
          <Input label="AFK Kick (s)" value={msfForm.afk_kick_seconds??''} onChange={v=>setMsfEdit(p=>({...p,afk_kick_seconds:Number(v)||0}))} type="number"/>
          <Input label="Entity Clear Delay (s)" value={msfForm.entity_clear_delay_seconds??''} onChange={v=>setMsfEdit(p=>({...p,entity_clear_delay_seconds:Number(v)||0}))} type="number"/>
          <Input label="Entity Clear Interval (min)" value={msfForm.entity_clear_interval_minutes??''} onChange={v=>setMsfEdit(p=>({...p,entity_clear_interval_minutes:Number(v)||0}))} type="number"/>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div><label className="font-bold block mb-1" style={{color:C.textDim,fontSize:sz.stat}}>Admin Chat Color</label><div className="flex gap-2 flex-wrap">{['purple','red','blue','green','yellow','white'].map(c=><button key={c} onClick={()=>setMsfEdit(p=>({...p,admin_chat_color:c}))} className="px-2 py-1 rounded font-bold cursor-pointer capitalize" style={{background:msfForm.admin_chat_color===c?C.accentBg:'transparent',border:`1px solid ${msfForm.admin_chat_color===c?C.accent:C.border}`,color:msfForm.admin_chat_color===c?C.accent:C.textDim,fontSize:sz.stat}}>{c}</button>)}</div></div>
          <div><label className="font-bold block mb-1" style={{color:C.textDim,fontSize:sz.stat}}>GM Chat Color</label><div className="flex gap-2 flex-wrap">{['yellow','purple','red','blue','green','white'].map(c=><button key={c} onClick={()=>setMsfEdit(p=>({...p,gm_chat_color:c}))} className="px-2 py-1 rounded font-bold cursor-pointer capitalize" style={{background:msfForm.gm_chat_color===c?C.accentBg:'transparent',border:`1px solid ${msfForm.gm_chat_color===c?C.accent:C.border}`,color:msfForm.gm_chat_color===c?C.accent:C.textDim,fontSize:sz.stat}}>{c}</button>)}</div></div>
        </div>
        <div className="flex justify-end gap-2"><Btn v="ghost" onClick={()=>setMsfEdit(null)}>Reset</Btn><Btn onClick={saveMsfSettings} disabled={msfSaving}>{msfSaving?'Saving…':'Save Game Settings'}</Btn></div>
      </Card>
      <Card className="p-5">
        <div className="font-black uppercase tracking-wide mb-1" style={{color:C.textDim,fontSize:sz.label}}>Discord Webhooks</div>
        <div className="font-mono mb-3" style={{color:C.textMuted,fontSize:sz.stat}}>Misfits_Logging/configs/msf_webhooks.json</div>
        <div className="space-y-3">{[['kills','Kill Feed'],['teamkills','Team Kills'],['admin_alerts','Admin Alerts'],['admin_actions','Admin Actions'],['player_connect','Player Connect'],['chat_messages','Chat Messages'],['server_stats','Server Stats']].map(([k,label])=>
          <div key={k} className="rounded-lg p-3" style={{background:C.consoleBg,border:`1px solid ${C.border}`}}>
            <div className="flex items-center gap-3 mb-2 cursor-pointer" onClick={()=>setWebhooksEdit(p=>({...p,[`${k}_enabled`]:!p[`${k}_enabled`]}))}>
              <div className="w-4 h-4 rounded flex items-center justify-center shrink-0" style={{border:`2px solid ${webhooksForm[`${k}_enabled`]?C.accent:C.textMuted}`,background:webhooksForm[`${k}_enabled`]?C.accent:'transparent',color:'#000',fontSize:10}}>{webhooksForm[`${k}_enabled`]?'✓':''}</div>
              <span className="font-bold" style={{color:C.text,fontSize:sz.base}}>{label}</span>
            </div>
            {webhooksForm[`${k}_enabled`]&&<input value={webhooksForm[`${k}_url`]||''} onChange={e=>setWebhooksEdit(p=>({...p,[`${k}_url`]:e.target.value}))} placeholder="https://discord.com/api/webhooks/..." className="w-full rounded px-3 py-1.5 outline-none font-mono placeholder:opacity-30" style={{background:C.bgInput,border:`1px solid ${C.border}`,color:C.text,fontSize:sz.stat}}/>}
          </div>)}</div>
        <div className="flex justify-end gap-2 mt-3"><Btn v="ghost" onClick={()=>setWebhooksEdit(null)}>Reset</Btn><Btn onClick={saveWebhooks} disabled={webhooksSaving}>{webhooksSaving?'Saving…':'Save Webhooks'}</Btn></div>
      </Card>
    </div>}

    {tab==='permissions'&&(isOwner||isHeadAdmin||isDemo)&&<div className="flex-1 overflow-auto"><Permissions toast={toast} authUser={authUser}/></div>}

    {tab==='audit'&&(isOwner||isHeadAdmin||isDemo)&&<div className="flex-1 overflow-auto">
      <div className="mb-3" style={{color:C.textMuted,fontSize:sz.stat}}>All admin actions are logged here. This log is stored in the panel database and persists across restarts.</div>
      {(auditData?.actions||[]).length===0?<Empty title="No actions logged yet" sub="Admin actions (bans, kicks, config saves) will appear here"/>:<div className="space-y-1">
        {(auditData.actions||[]).map((a,i)=>{
          const ts=new Date(a.timestamp+'Z').toLocaleString()
          const actionColors={ban:`${C.red}`,kick:`${C.orange}`,ip_ban:`${C.red}`,ip_unban:`${C.accent}`,startup_params_update:`${C.blue}`,config_save:`${C.blue}`}
          const col=actionColors[a.action]||C.textDim
          return <div key={i} className="flex items-center gap-3 px-4 py-2.5 rounded-lg" style={{background:C.bgCard,border:`1px solid ${C.border}`}}>
            <span className="font-black px-2 py-0.5 rounded font-mono" style={{background:col+'10',color:col,fontSize:sz.stat,minWidth:80,textAlign:'center'}}>{a.action}</span>
            <span className="font-bold" style={{color:C.textBright,fontSize:sz.base,minWidth:80}}>{a.actor}</span>
            {a.target&&<span className="font-mono" style={{color:C.textDim,fontSize:sz.stat}}>{a.target}</span>}
            {a.detail&&<span className="font-mono truncate flex-1" style={{color:C.textMuted,fontSize:sz.stat}}>{a.detail}</span>}
            <span className="ml-auto whitespace-nowrap" style={{color:C.textMuted,fontSize:sz.stat}}>{ts}</span>
          </div>
        })}
      </div>}
    </div>}

    <Modal open={showNotes} onClose={()=>setShowNotes(false)} title={`Notes — ${notesTarget?.name||''}`}>
      <textarea value={notesText} onChange={e=>setNotesText(e.target.value)} rows={5} placeholder="Admin notes about this player..." className="w-full rounded-lg px-3 py-2.5 outline-none resize-none font-mono" style={{background:C.bgInput,border:`1px solid ${C.border}`,color:C.text,fontSize:sz.input}}/>
      <div className="flex gap-2 justify-end mt-3"><Btn v="ghost" onClick={()=>setShowNotes(false)}>Cancel</Btn><Btn onClick={saveNotes}>Save Notes</Btn></div>
    </Modal>
    <Modal open={showMatAdd} onClose={()=>setShowMatAdd(false)} title="Add MAT Admin">
      <Input label="Reforger ID (GUID)" value={newMatAdmin.reforger_id} onChange={v=>setNewMatAdmin(p=>({...p,reforger_id:v}))} placeholder="e.g. 0f3b2c9c-7b2f-4e69-a870-63a61efbb44d" mono/>
      <Input label="Player Name" value={newMatAdmin.player_name} onChange={v=>setNewMatAdmin(p=>({...p,player_name:v}))} placeholder="e.g. Gaz"/>
      <div className="mb-3"><label className="font-bold block mb-1" style={{color:C.textDim,fontSize:sz.stat}}>Role</label><div className="flex rounded-lg overflow-hidden" style={{background:C.bgInput,border:`1px solid ${C.border}`}}>{['owner','admin','moderator'].map(r=><button key={r} onClick={()=>setNewMatAdmin(p=>({...p,role:r}))} className="flex-1 px-3 py-1.5 font-bold cursor-pointer capitalize" style={{background:newMatAdmin.role===r?C.accentBg:'transparent',color:newMatAdmin.role===r?C.accent:C.textDim,fontSize:sz.nav}}>{r}</button>)}</div></div>
      <div className="flex items-center gap-3 mb-3 cursor-pointer" onClick={()=>setNewMatAdmin(p=>({...p,auto_admin:!p.auto_admin}))}><div className="w-4 h-4 rounded flex items-center justify-center" style={{border:`2px solid ${newMatAdmin.auto_admin?C.accent:C.textMuted}`,background:newMatAdmin.auto_admin?C.accent:'transparent',color:'#000',fontSize:10}}>{newMatAdmin.auto_admin?'ok':''}</div><span style={{color:C.textDim,fontSize:sz.base}}>Auto-admin on join</span></div>
      <div className="flex gap-2 justify-end"><Btn v="ghost" onClick={()=>setShowMatAdd(false)}>Cancel</Btn><Btn onClick={addMatAdmin}>+ Add</Btn></div>
    </Modal>
    <Modal open={showAdd} onClose={()=>setShowAdd(false)} title="Add Panel / SAT Admin">
      <Input label="Player GUID" value={newAdmin.id} onChange={v=>setNewAdmin(p=>({...p,id:v}))} placeholder="Arma GUID" mono/>
      <Input label="Display Name" value={newAdmin.username} onChange={v=>setNewAdmin(p=>({...p,username:v}))} placeholder="e.g. Gaz"/>
      <Input label="Notes" value={newAdmin.notes} onChange={v=>setNewAdmin(p=>({...p,notes:v}))} placeholder="Server owner, mod, etc."/>
      <div className="flex gap-2 justify-end mt-3"><Btn v="ghost" onClick={()=>setShowAdd(false)}>Cancel</Btn><Btn onClick={addAdmin}>+ Add</Btn></div>
    </Modal>
    <Modal open={showBan} onClose={()=>setShowBan(false)} title="Ban Player by GUID">
      <Input label="GUID" value={newBan.id} onChange={v=>setNewBan(p=>({...p,id:v}))} placeholder="Player GUID" mono/>
      <Input label="Reason" value={newBan.reason} onChange={v=>setNewBan(p=>({...p,reason:v}))} placeholder="Reason for ban"/>
      <div className="flex gap-2 justify-end mt-2"><Btn v="ghost" onClick={()=>setShowBan(false)}>Cancel</Btn>
        {hasMat&&<Btn v="danger" onClick={()=>addMatBanFn(newBan.id,'',newBan.reason).then(()=>setShowBan(false))}>Ban (MAT)</Btn>}
        {hasSat&&<Btn v="danger" onClick={()=>addSatBan(newBan.id,'',newBan.reason).then(()=>setShowBan(false))}>Ban (SAT)</Btn>}
        {!hasMat&&!hasSat&&<Btn v="danger" onClick={()=>addSatBan(newBan.id,'',newBan.reason).then(()=>setShowBan(false))}>Ban</Btn>}
      </div>
    </Modal>
    <Modal open={showIpBan} onClose={()=>setShowIpBan(false)} title="Ban IP Address">
      <div className="mb-3 p-3 rounded-lg" style={{background:`${C.orange}10`,border:`1px solid ${C.orange}30`}}><span style={{color:C.orange,fontSize:sz.stat}}>This will block the IP at the firewall level via ufw. The player will not be able to connect.</span></div>
      <Input label="IP Address" value={newIpBan.ip} onChange={v=>setNewIpBan(p=>({...p,ip:v}))} placeholder="1.2.3.4" mono/>
      <Input label="Reason" value={newIpBan.reason} onChange={v=>setNewIpBan(p=>({...p,reason:v}))} placeholder="Reason for ban"/>
      <div className="flex gap-2 justify-end mt-2"><Btn v="ghost" onClick={()=>setShowIpBan(false)}>Cancel</Btn><Btn v="danger" onClick={addIpBanFn}>Ban IP</Btn></div>
    </Modal>
  </div>}
