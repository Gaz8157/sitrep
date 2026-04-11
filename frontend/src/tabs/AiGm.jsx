import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useT } from '../ctx.jsx'
import { API, post, del, authHeaders, on401 } from '../api.js'
import { useFetch, useFetchOnce, useMobile } from '../hooks.js'
import { Badge, Btn, Card, FloatingPanel } from '../components/ui.jsx'
import { TC, ESC_NAMES, ESC_DESC, ESC_COLORS } from '../constants.js'
const QUICK_CMDS=[
  {group:'OPFOR',color:TC.red,cmds:[
    {label:'QRF',cmd:'Deploy QRF — 8-12 infantry near players, hunt behavior, aggressive'},
    {label:'Ambush',cmd:'Set up ambush on nearest road to players with 2 fireteams and MG'},
    {label:'Snipers',cmd:'Deploy 2 sniper teams 500-800m from players on high ground'},
    {label:'Assault',cmd:'Full combined arms assault on player positions from multiple directions'},
    {label:'Armor',cmd:'Deploy light armor with infantry escort toward players'},
    {label:'Checkpoint',cmd:'Set up defensive checkpoint with infantry and MG on nearest road'},
  ]},
  {group:'BLUFOR',color:TC.green,cmds:[
    {label:'Backup',cmd:'Send backup to player position — 1 rifle squad, same faction as nearest player'},
    {label:'Extract',cmd:'Extract nearest player — send pickup vehicle and security team'},
    {label:'Medevac',cmd:'Medevac nearest player — send medical team to player position'},
    {label:'Reinforce',cmd:'Reinforce player position with additional squad and hold behavior'},
  ]},
  {group:'TACTICAL',color:TC.yellow,cmds:[
    {label:'Pincer',cmd:'Flank from east while element approaches from west — pincer on players'},
    {label:'Encircle',cmd:'Encircle player positions, cut off escape routes'},
    {label:'Retreat',cmd:'Retreat all AI to defensive positions away from players'},
    {label:'Hold Fire',cmd:'Set all AI groups to defend behavior — hold current positions'},
  ]},
  {group:'OPS',color:TC.purple,cmds:[
    {label:'New Op',cmd:'Plan new operation — generate fresh op based on current situation'},
    {label:'Skip Phase',cmd:'Advance operation to next phase immediately'},
    {label:'Abort Op',cmd:'Abort current operation and stand down all forces'},
    {label:'Populate',cmd:'Populate area with ambient military presence — patrols, guards, checkpoints'},
  ]},
]
function OpordSection({title,children}){
  const{C}=useT();const[open,setOpen]=useState(true)
  return(
    <div className="mb-4 rounded-lg overflow-hidden" style={{border:`1px solid ${C.border}`}}>
      <button onClick={()=>setOpen(v=>!v)} className="w-full flex items-center gap-2 px-4 py-3" style={{background:C.bgInput,border:'none',cursor:'pointer',color:C.text}}>
        <span style={{fontSize:8,transform:open?'rotate(90deg)':'',transition:'transform 0.2s',color:C.textMuted}}>►</span>
        <span style={{fontSize:9,fontWeight:700,letterSpacing:'2px',textTransform:'uppercase',color:C.cyan+'cc'}}>{title}</span>
      </button>
      {open&&<div className="p-4 space-y-3" style={{background:C.bg}}>{children}</div>}
    </div>
  )
}
function OpordField({label,value,rows=2,onChange,placeholder}){
  const{C}=useT()
  return(
    <div>
      <label style={{display:'block',fontSize:9,fontWeight:700,letterSpacing:'1px',color:C.textMuted,textTransform:'uppercase',marginBottom:4}}>{label}</label>
      <textarea rows={rows} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-md px-3 py-2 font-mono resize-none outline-none" style={{background:C.bgInput,border:`1px solid ${C.border}`,color:C.text,fontSize:11,lineHeight:1.6}}/>
    </div>
  )
}
const HwBar=({val,max,color,sml})=>{const pct=Math.round(Math.min(100,Math.max(0,(val/max)*100)));return(<div className="flex items-center gap-2"><div className="flex-1 rounded-full overflow-hidden" style={{height:4,background:'rgba(255,255,255,0.06)'}}><div style={{width:`${pct}%`,height:'100%',background:color,borderRadius:9999,transition:'width 0.8s ease'}}/></div><span className="font-mono shrink-0" style={{fontSize:sml,color,fontWeight:600,minWidth:28,textAlign:'right'}}>{pct}%</span></div>)}
const HwTemp=({t,sml})=>{const{C}=useT();const c=t>=80?C.red:t>=65?C.orange:C.accent;return<span className="font-mono" style={{color:c,fontSize:sml,fontWeight:700}}>{t}°C</span>}

export default function AiGm({toast}){
  const{C,sz}=useT();const mobile=useMobile()
  // Derive TC from the active theme so the whole AI GM panel respects theme changes
  const TC=useMemo(()=>({
    bg:C.bg, surface:C.bgCard, surface2:C.bgInput, border:C.border, borderDim:C.border,
    text:C.text, textDim:C.textDim, textMuted:C.textMuted,
    cyan:C.cyan, cyanDim:C.cyan+'1a', cyanBorder:C.cyan+'40',
    red:C.red, redDim:C.redBg, redBorder:C.redBorder,
    green:C.accent, greenDim:C.accentBg, greenBorder:C.accent+'40',
    yellow:C.orange, yellowDim:C.orangeBg, yellowBorder:C.orange+'40',
    purple:C.purple, purpleDim:C.purpleBg, purpleBorder:C.purple+'40',
    orange:C.orange, orangeBg:C.orangeBg, blue:C.blue, amber:C.orange,
  }),[C])
  const{data:gm}=useFetch(`${API}/aigm/status`,2000)
  const{data:decisions}=useFetch(`${API}/aigm/decisions?limit=100`,6000)
  const{data:livePlayers}=useFetch(`${API}/players/live`,5000)
  const{data:sysData}=useFetch(`${API}/status`,8000)
  const{data:bridgeInfo}=useFetch(`${API}/aigm/bridge-info`,30000)
  // Canvas refs — must be at top level
  const canvasRef=useRef(null);const containerRef=useRef(null)
  const chatEndRef=useRef(null)
  const logsEndRef=useRef(null);const consoleEndRef=useRef(null)
  const[tab,setTab]=useState(()=>{try{return localStorage.getItem('aigm-tab')||'ops'}catch{return 'ops'}})
  useEffect(()=>{try{localStorage.setItem('aigm-tab',tab)}catch{}},[tab])
  const[chatTab,setChatTab]=useState('chat')
  const[chatInput,setChatInput]=useState('');const[chatHistory,setChatHistory]=useState([])
  const[showQuickCmds,setShowQuickCmds]=useState(false)
  const[starting,setStarting]=useState(false);const[aiThinking,setAiThinking]=useState(false)
  const[stopping,setStopping]=useState(false)
  const[userStopped,setUserStopped]=useState(false)
  useEffect(()=>{if(stopping&&gm&&gm.bridge!=='online')setStopping(false)},[gm,stopping])
  const[warmingUp,setWarmingUp]=useState(false);const[unloading,setUnloading]=useState(false)
  const[scfg,setScfg]=useState(null);const[scfgLoading,setScfgLoading]=useState(false)
  const[modelCfg,setModelCfg]=useState(null);const[modelCfgSaving,setModelCfgSaving]=useState(false)
  const[availableModels,setAvailableModels]=useState([])
  const[mission,setMission]=useState('');const[missionSaved,setMissionSaved]=useState('')
  // OPORD editor state
  const[opord,setOpord]=useState({
    situation:{enemy:'',friendly:'',terrain:'',weather:'',civil:''},
    mission:{statement:'',intent:''},
    execution:{concept:'',phases:[],roe:'',no_fire_areas:''},
    admin:{resupply:'',casualty_point:'',qrf_grid:''},
    command:{chain:'',code_words:'',phase_lines:''}
  })
  const[opordSaving,setOpordSaving]=useState(false)
  const[opordParsing,setOpordParsing]=useState(false)
  const[opordPreview,setOpordPreview]=useState(null)
  const[broadcastMode,setBroadcastMode]=useState('command')
  const[localDiff,setLocalDiff]=useState(50);const draggingRef=useRef(false)
  const[localEsc,setLocalEsc]=useState(-1);const escDragRef=useRef(false)
  const[spawnUnit,setSpawnUnit]=useState('');const[spawnCount,setSpawnCount]=useState(4)
  const[spawnGrid,setSpawnGrid]=useState('');const[spawnBehavior,setSpawnBehavior]=useState('patrol')
  const[spawnCatFilter,setSpawnCatFilter]=useState('all');const[spawnSearch,setSpawnSearch]=useState('')
  const[expandedDecision,setExpandedDecision]=useState(null)
  const[colWidths,setColWidths]=useState(()=>{try{const s=localStorage.getItem('aigm-cols');return s?JSON.parse(s):{left:280,right:360}}catch{return{left:280,right:360}}})
  const resizeRef=useRef(null)
  const[floating,setFloating]=useState({})
  const detach=(id)=>setFloating(p=>({...p,[id]:{x:140+Object.keys(p).length*30,y:110+Object.keys(p).length*30}}))
  const dock=(id)=>setFloating(p=>{const n={...p};delete n[id];return n})
  const[hiddenPanels,setHiddenPanels]=useState(()=>{try{const s=localStorage.getItem('aigm-hidden');return s?JSON.parse(s):{}}catch{return{}}})
  const hidePanel=(id)=>setHiddenPanels(p=>{const n={...p,[id]:true};try{localStorage.setItem('aigm-hidden',JSON.stringify(n))}catch{};return n})
  const showPanel=(id)=>setHiddenPanels(p=>{const n={...p};delete n[id];try{localStorage.setItem('aigm-hidden',JSON.stringify(n))}catch{};return n})
  const AIGM_LABELS={'gameserver':'Game Server','bridge':'Bridge','escalation':'Escalation','component':'Component','hardware':'Hardware','metrics':'Metrics','controls':'Controls','model':'Model','admin':'Admin','players':'Players'}
  const SH=({label,id})=>(
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
      <div style={{fontSize:tny,fontWeight:700,letterSpacing:'1.5px',color:TC.textMuted,textTransform:'uppercase'}}>{label}</div>
      {id&&<div style={{display:'flex',alignItems:'center',gap:4}}>
        <button onClick={()=>detach(id)} title="Detach / float panel" style={{background:'none',border:`1px solid ${TC.cyan}50`,cursor:'pointer',color:TC.cyan,fontSize:11,lineHeight:1,padding:'1px 4px',borderRadius:4}} onMouseEnter={e=>{e.currentTarget.style.color=TC.text;e.currentTarget.style.borderColor=TC.cyan}} onMouseLeave={e=>{e.currentTarget.style.color=TC.cyan;e.currentTarget.style.borderColor=TC.cyan+'50'}}>⬡</button>
        <button onClick={()=>hidePanel(id)} title="Hide panel (restore from bar above)" style={{background:'none',border:`1px solid ${TC.border}`,cursor:'pointer',color:TC.textMuted,fontSize:13,lineHeight:1.2,padding:'0px 4px',borderRadius:4}} onMouseEnter={e=>{e.currentTarget.style.color=TC.red;e.currentTarget.style.borderColor=TC.red+'50'}} onMouseLeave={e=>{e.currentTarget.style.color=TC.textMuted;e.currentTarget.style.borderColor=TC.border}}>×</button>
      </div>}
    </div>
  )
  const gmOn=!stopping&&!userStopped&&gm&&gm.bridge==='online'
  const gs=gm?.current_state||null
  // Thinking timer
  const[thinkSecs,setThinkSecs]=useState(0);const thinkStartRef=useRef(null)
  useEffect(()=>{
    if(aiThinking||(gm?.ai_thinking)){if(!thinkStartRef.current)thinkStartRef.current=Date.now();const id=setInterval(()=>setThinkSecs(Math.floor((Date.now()-thinkStartRef.current)/1000)),500);return()=>clearInterval(id)}
    else{thinkStartRef.current=null;setThinkSecs(0)}
  },[aiThinking,gm?.ai_thinking])
  // Ollama model status (poll every 10s only when bridge online)
  const{data:ollamaStatus,reload:reloadOllama}=useFetchOnce(`${API}/aigm/model/status`)
  useEffect(()=>{if(gmOn){reloadOllama();const id=setInterval(reloadOllama,10000);return()=>clearInterval(id)}},[gmOn,reloadOllama])
  const tny=sz.label      // tiny: section labels, badges, timestamps
  const sml=sz.stat       // small: secondary values, mono detail
  const bod=sz.base       // body: main text, stat rows
  const big=sz.base+14    // big: metric counters

  // All useMemo hooks must precede conditional returns
  const matPlayers=livePlayers?.players||[]
  const bridgeSkillsRaw=(gm?.agent?.player_skills)||{}
  const playerList=useMemo(()=>{
    if(matPlayers.length>0)return matPlayers.map(p=>{const sk=bridgeSkillsRaw[p.player_name]||{};return{...p,...sk,name:p.player_name,guid:p.player_guid,faction:p.faction_name}})
    return Object.entries(bridgeSkillsRaw).map(([name,s])=>({...s,name}))
  },[matPlayers,bridgeSkillsRaw])
  const gsPlayers=gs?.players||[]
  const allPlayers=useMemo(()=>{
    if(gsPlayers.length>0)return gsPlayers
    return playerList.map(p=>({name:p.name,status:'alive',faction:p.faction||'',pos:{x:0,y:0}}))
  },[gsPlayers,playerList])
  const catalog=gs?.catalog||[]
  const byFaction=useMemo(()=>{const m={};catalog.forEach(e=>{const f=e.faction||'Unknown';if(!m[f])m[f]=[];m[f].push(e)});return m},[catalog])
  const catalogCategories=useMemo(()=>[...new Set(catalog.map(e=>e.category||'unknown'))].sort(),[catalog])
  const spawnFiltered=useMemo(()=>catalog.filter(e=>(spawnCatFilter==='all'||e.category===spawnCatFilter)&&(!spawnSearch||e.name.toLowerCase().includes(spawnSearch.toLowerCase()))),[catalog,spawnCatFilter,spawnSearch])
  const spawnByFaction=useMemo(()=>{const m={};spawnFiltered.forEach(e=>{const f=e.faction||'Unknown';if(!m[f])m[f]=[];m[f].push(e)});return m},[spawnFiltered])
  const cmdLog=useMemo(()=>gm?.recent_commands||[],[gm])
  const serverLogs=useMemo(()=>gm?.server_logs||[],[gm])
  const consoleLogs=useMemo(()=>gm?.console_logs||[],[gm])

  // Canvas draw function
  const drawMap=useCallback(()=>{
    const canvas=canvasRef.current;const container=containerRef.current
    if(!canvas||!container)return
    const rect=container.getBoundingClientRect()
    if(rect.width===0||rect.height===0)return
    const dpr=window.devicePixelRatio||1
    canvas.width=rect.width*dpr;canvas.height=rect.height*dpr
    canvas.style.width=`${rect.width}px`;canvas.style.height=`${rect.height}px`
    const ctx=canvas.getContext('2d');if(!ctx)return
    ctx.scale(dpr,dpr)
    const W=rect.width;const H=rect.height
    const MAP=gs?.map_size||12800
    const OX=gs?.map_offset_x??0;const OZ=gs?.map_offset_z??0
    // Background
    const bg=ctx.createRadialGradient(W/2,H/2,0,W/2,H/2,W*0.8)
    bg.addColorStop(0,'#0c0c14');bg.addColorStop(1,'#08080c')
    ctx.fillStyle=bg;ctx.fillRect(0,0,W,H)
    // Grid
    const div=20
    ctx.strokeStyle='rgba(34,211,238,0.03)';ctx.lineWidth=0.5
    for(let i=0;i<=div;i++){const x=(i/div)*W;const y=(i/div)*H;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}
    ctx.strokeStyle='rgba(34,211,238,0.08)';ctx.lineWidth=0.5
    for(let i=0;i<=div;i+=4){const x=(i/div)*W;const y=(i/div)*H;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}
    // Grid labels
    ctx.fillStyle='rgba(34,211,238,0.12)';ctx.font="500 9px 'JetBrains Mono',monospace"
    const gridStep=MAP/div
    for(let i=0;i<div;i+=4){const gv=Math.floor((i*gridStep)/100);const lbl=String(gv).padStart(3,'0');const x=(i/div)*W;const y=(1-i/div)*H;ctx.fillText(lbl,x+3,H-5);ctx.fillText(lbl,3,y-5)}
    // Coord helpers
    const toS=(x,y)=>[((x-OX)/MAP)*W,(1-(y-OZ)/MAP)*H]
    const toG=(gx,gy)=>[(gx/MAP)*W,(1-gy/MAP)*H]
    // Valid spawn grids
    ;(gs?.valid_spawn_grids||[]).forEach(g=>{const[gxs,gzs]=g.split('-');const[sx,sy]=toG(parseInt(gxs)*100,parseInt(gzs)*100);ctx.fillStyle='rgba(34,211,238,0.05)';ctx.beginPath();ctx.arc(sx,sy,1.5,0,Math.PI*2);ctx.fill()})
    // AI groups
    ;(gs?.ai_units?.groups||[]).forEach(g=>{
      if(!g.grid)return
      const[gxs,gzs]=g.grid.split('-');const[sx,sy]=toG(parseInt(gxs)*100,parseInt(gzs)*100)
      ctx.fillStyle='rgba(239,68,68,0.04)';ctx.beginPath();ctx.arc(sx,sy,20,0,Math.PI*2);ctx.fill()
      ctx.fillStyle='rgba(239,68,68,0.5)';ctx.strokeStyle='rgba(239,68,68,0.8)';ctx.lineWidth=1.5
      const ds=6;ctx.beginPath();ctx.moveTo(sx,sy-ds);ctx.lineTo(sx+ds-1,sy);ctx.lineTo(sx,sy+ds);ctx.lineTo(sx-ds+1,sy);ctx.closePath();ctx.fill();ctx.stroke()
      const lbl=`${g.type.split('_').slice(-2).join(' ')} x${g.count}`;ctx.font="600 9px 'Inter',sans-serif"
      const m=ctx.measureText(lbl);const lx=sx+10;const ly=sy-2
      ctx.fillStyle='rgba(0,0,0,0.6)';ctx.fillRect(lx-2,ly-9,m.width+4,13)
      ctx.fillStyle='rgba(239,68,68,0.9)';ctx.fillText(lbl,lx,ly+1)
      if(g.behavior){ctx.font="500 7px 'JetBrains Mono',monospace";ctx.fillStyle='rgba(239,68,68,0.4)';ctx.fillText(`[${g.behavior}]`,lx,ly+11)}
    })
    // Players
    const awarenessMap=Object.fromEntries((gs?.awareness||[]).map(a=>[a.player,a]))
    ;(gs?.players||[]).forEach(p=>{
      const[sx,sy]=toS(p.pos.x,p.pos.y)
      const alive=p.status==='alive';const col=alive?[34,197,94]:[239,68,68]
      if(alive){ctx.strokeStyle=`rgba(${col},0.12)`;ctx.lineWidth=1;ctx.beginPath();ctx.arc(sx,sy,18,0,Math.PI*2);ctx.stroke();ctx.strokeStyle=`rgba(${col},0.06)`;ctx.beginPath();ctx.arc(sx,sy,28,0,Math.PI*2);ctx.stroke()}
      const gw=ctx.createRadialGradient(sx,sy,0,sx,sy,12);gw.addColorStop(0,`rgba(${col},0.3)`);gw.addColorStop(1,`rgba(${col},0)`);ctx.fillStyle=gw;ctx.beginPath();ctx.arc(sx,sy,12,0,Math.PI*2);ctx.fill()
      ctx.fillStyle=`rgba(${col},1)`;ctx.beginPath();ctx.arc(sx,sy,4,0,Math.PI*2);ctx.fill()
      ctx.fillStyle='rgba(255,255,255,0.8)';ctx.beginPath();ctx.arc(sx,sy,1.5,0,Math.PI*2);ctx.fill()
      // Heading arrow from awareness data
      const pa=awarenessMap[p.name]
      if(pa&&pa.heading!=null&&alive){
        const hdgRad=pa.heading*Math.PI/180
        const aLen=26;const ax=sx+Math.sin(hdgRad)*aLen;const ay=sy-Math.cos(hdgRad)*aLen
        ctx.strokeStyle=`rgba(${col},0.65)`;ctx.lineWidth=1.5
        ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(ax,ay);ctx.stroke()
        const hLen=5;const hAng=0.45
        ctx.beginPath()
        ctx.moveTo(ax,ay);ctx.lineTo(ax-hLen*Math.sin(hdgRad-hAng),ay+hLen*Math.cos(hdgRad-hAng))
        ctx.moveTo(ax,ay);ctx.lineTo(ax-hLen*Math.sin(hdgRad+hAng),ay+hLen*Math.cos(hdgRad+hAng))
        ctx.stroke()
      }
      ctx.font="bold 11px 'Inter',sans-serif";ctx.fillStyle='rgba(0,0,0,0.7)';ctx.fillText(p.name,sx+11,sy-2);ctx.fillStyle=`rgba(${col},1)`;ctx.fillText(p.name,sx+10,sy-3)
      const gx=Math.floor((p.pos.x-OX)/100);const gz=Math.floor((p.pos.y-OZ)/100)
      ctx.font="500 9px 'JetBrains Mono',monospace";ctx.fillStyle='rgba(255,255,255,0.25)'
      ctx.fillText(`${String(Math.max(0,gx)).padStart(3,'0')}-${String(Math.max(0,gz)).padStart(3,'0')}`,sx+10,sy+9)
      if(pa?.nearest_location?.name){ctx.fillStyle='rgba(34,211,238,0.3)';ctx.fillText(pa.nearest_location.name,sx+10,sy+19)}
    })
    // Map name watermark
    if(gs?.map){ctx.font="800 16px 'Inter',sans-serif";ctx.fillStyle='rgba(34,211,238,0.06)';ctx.fillText(gs.map.replace(/^#[A-Za-z]*[-_]?/,'').replace(/_/g,' ').replace(/\s*Name$/i,'').trim().toUpperCase(),14,28)}
    // Compass
    const cx=W-30;const cy=30
    ctx.strokeStyle='rgba(255,255,255,0.1)';ctx.lineWidth=1;ctx.beginPath();ctx.arc(cx,cy,14,0,Math.PI*2);ctx.stroke()
    ctx.font="bold 8px 'Inter',sans-serif";ctx.fillStyle='rgba(239,68,68,0.7)';ctx.textAlign='center';ctx.fillText('N',cx,cy-7)
    ctx.fillStyle='rgba(255,255,255,0.2)';ctx.fillText('S',cx,cy+12);ctx.fillText('E',cx+10,cy+3);ctx.fillText('W',cx-10,cy+3);ctx.textAlign='left'
  },[gs])

  useEffect(()=>{drawMap()},[drawMap])
  useEffect(()=>{
    const obs=new ResizeObserver(()=>drawMap())
    if(containerRef.current)obs.observe(containerRef.current)
    return()=>obs.disconnect()
  },[drawMap])

  // Sync difficulty slider with server (only when not dragging)
  useEffect(()=>{if(!draggingRef.current)setLocalDiff(gm?.difficulty??50)},[gm?.difficulty])
  // Mission sync
  useEffect(()=>{if(gm?.mission_briefing&&!missionSaved){setMission(gm.mission_briefing);setMissionSaved(gm.mission_briefing)}},[gm?.mission_briefing])
  // Clear chat when bridge goes offline — session chat only, no persistence between runs
  const prevGmOnRef=useRef(false)
  useEffect(()=>{
    if(prevGmOnRef.current&&!gmOn){setChatHistory([]);setChatInput('')}
    prevGmOnRef.current=gmOn
  },[gmOn])
  // Load session config
  const loadScfg=async()=>{setScfgLoading(true);try{const r=await fetch(`${API}/aigm/session-config`,{headers:authHeaders()});if(r.status===401){on401();return};const j=await r.json();if(!j.error){setScfg(j);if(j.broadcast_mode)setBroadcastMode(j.broadcast_mode)}}catch{toast('Failed to load session config','danger')}finally{setScfgLoading(false)}}
  useEffect(()=>{if(gmOn&&tab==='config'&&!scfg)loadScfg()},[gmOn,tab,loadScfg])
  useEffect(()=>{if(!gmOn||tab!=='config'||modelCfg)return;let on=true;fetch(`${API}/aigm/model-config`,{headers:authHeaders()}).then(r=>r.json()).then(d=>{if(on&&!d.error)setModelCfg(d)}).catch(()=>{});return()=>{on=false}},[gmOn,tab])
  useEffect(()=>{if(!gmOn||tab!=='config')return;let on=true;fetch(`${API}/aigm/model/list`,{headers:authHeaders()}).then(r=>r.json()).then(d=>{if(on&&d.models)setAvailableModels(d.models.map(m=>m.name))}).catch(()=>{});return()=>{on=false}},[gmOn,tab])
  // Auto-scroll chat
  useEffect(()=>{chatEndRef.current?.scrollIntoView({behavior:'smooth'})},[chatHistory])
  // Auto-scroll logs to latest when tab active
  useEffect(()=>{if(chatTab==='logs')logsEndRef.current?.scrollIntoView()},[chatTab,serverLogs])
  useEffect(()=>{if(chatTab==='console')consoleEndRef.current?.scrollIntoView()},[chatTab,consoleLogs])
  // Set initial spawn unit from catalog
  useEffect(()=>{if(catalog.length>0&&!spawnUnit)setSpawnUnit(catalog[0].name)},[catalog])

  // API actions
  const startBridge=async()=>{setStarting(true);setUserStopped(false);const r=await post(`${API}/aigm/start`);toast(r.message||r.error||'Bridge starting...','info');setStarting(false)}
  const stopBridge=async()=>{setStopping(true);setUserStopped(true);const r=await post(`${API}/aigm/stop`);toast(r.message||r.error||'Stopped','warning');setStopping(false);setTimeout(reloadOllama,2500)}
  const triggerAI=async()=>{const r=await post(`${API}/aigm/trigger`);toast(r.status==='queued'?'AI triggered':'No game state yet — join first','info')}
  const warmUp=async()=>{setWarmingUp(true);toast('Warming up...','info');const r=await post(`${API}/aigm/warmup`);toast(r.status==='ok'?`Ready — ${Math.round(r.latency_ms)}ms`:r.error||'Warmup failed',r.status==='ok'?'default':'danger');setWarmingUp(false);reloadOllama()}
  const unloadModel=async()=>{setUnloading(true);toast('Unloading model from VRAM...','info');const r=await post(`${API}/aigm/model/unload`,{model:gm?.model||''});if(r.error)toast(r.error,'danger');else toast(`Unloaded ${r.model||'model'} — VRAM freed`,'warning');setUnloading(false);setTimeout(reloadOllama,1500)}
  const setEscOverride=async(val)=>{await post(`${API}/aigm/config`,{escalation:val})}
  const sendChat=async(text)=>{
    const m=text||chatInput;if(!m.trim()||aiThinking)return
    setChatInput('');setChatHistory(h=>[...h,{role:'user',content:m}]);setAiThinking(true)
    const r=await post(`${API}/aigm/chat`,{message:m})
    setChatHistory(h=>[...h,{role:'ai',content:r.reply||r.error||'No response'}]);setAiThinking(false)
  }
  const setConfig=async(cfg)=>{await post(`${API}/aigm/config`,cfg)}
  const deleteAllAI=async()=>{const r=await post(`${API}/aigm/admin`,{command:'delete_all'});toast(r.status||r.error||'Done','warning')}
  const clearQueue=async()=>{const r=await post(`${API}/aigm/admin`,{command:'clear_queue'});toast(r.status||r.error||'Done')}
  const manualSpawn=async()=>{if(!spawnUnit)return;const r=await post(`${API}/aigm/admin`,{command:'spawn',units:spawnUnit,count:spawnCount,grid:spawnGrid||'450-680',behavior:spawnBehavior});toast(r.status||r.error||'Spawned')}
  const saveMission=async()=>{const r=await post(`${API}/aigm/mission`,{briefing:mission});if(r.error)toast(r.error,'danger');else{toast('Mission set');setMissionSaved(mission)}}
  const clearMission=async()=>{const r=await del(`${API}/aigm/mission`);if(r?.error)toast(r.error,'danger');else{toast('Mission cleared','warning');setMission('');setMissionSaved('')}}
  const saveScfg=async()=>{const r=await post(`${API}/aigm/session-config`,scfg);if(r.error)toast(r.error,'danger');else toast('Session config saved')}
  const saveModelCfg=async(updates)=>{setModelCfgSaving(true);const r=await post(`${API}/aigm/model-config`,updates);setModelCfgSaving(false);if(r.error)toast(r.error,'danger');else{setModelCfg(p=>({...p,...updates}));toast('Model config saved')}}
  const saveOpord=async()=>{
    setOpordSaving(true)
    const r=await post(`${API}/aigm/opord/save`,opord)
    if(r.error)toast(r.error,'danger');else toast('OPORD saved')
    setOpordSaving(false)
  }
  const parseOpord=async()=>{
    setOpordParsing(true)
    setOpordPreview(null)
    const r=await post(`${API}/aigm/opord/parse`,opord)
    if(r.error)toast(r.error,'danger');else setOpordPreview(r.operation)
    setOpordParsing(false)
  }
  const loadOpord=async()=>{
    if(!opordPreview){toast('Parse first','danger');return}
    const r=await post(`${API}/aigm/opord/load`,{operation:opordPreview})
    if(r.error)toast(r.error,'danger');else toast('OPORD loaded — AI GM will follow it')
  }
  const advancePhase=async()=>{
    const r=await post(`${API}/aigm/operation/advance`,{})
    if(r.error)toast(r.error,'danger');else toast('Phase advanced')
  }
  const abortOp=async()=>{
    const r=await post(`${API}/aigm/operation/abort`,{})
    if(r.error)toast(r.error,'danger');else toast('Operation aborted','warning')
  }
  const saveBroadcastMode=async(mode)=>{
    setBroadcastMode(mode)
    await post(`${API}/aigm/config`,{broadcast_mode:mode})
  }
  const startResize=(col,e)=>{
    e.preventDefault()
    const startX=e.clientX;const startW=colWidths[col]
    const onMove=(e)=>{
      const dx=e.clientX-startX
      setColWidths(p=>{
        const w=col==='left'?Math.max(220,Math.min(480,startW+dx)):Math.max(240,Math.min(520,startW-dx))
        return{...p,[col]:w}
      })
    }
    const onUp=()=>{
      setColWidths(p=>{localStorage.setItem('aigm-cols',JSON.stringify(p));return p})
      window.removeEventListener('mousemove',onMove)
      window.removeEventListener('mouseup',onUp)
    }
    window.addEventListener('mousemove',onMove)
    window.addEventListener('mouseup',onUp)
  }
  const fmtMs=ms=>ms?`${Math.round(ms)}ms`:'—'
  const escColor=e=>e<=1?TC.green:e<=2?TC.yellow:e<=3?TC.red:TC.purple

  if(!gmOn)return(
    <div className="space-y-3">
      <div className="flex items-center gap-3 mb-1">
        <h2 className="font-black" style={{color:C.textBright,fontSize:sz.base+4}}>AI Game Master</h2>
        <Badge text="OFFLINE" v="danger"/>
      </div>
      <Card className="p-5">
        <div className="font-black mb-1" style={{color:C.textBright,fontSize:sz.base+2}}>Bridge not running</div>
        <div className="mb-4 leading-relaxed" style={{color:C.textDim,fontSize:sz.base}}>The AI GM bridge connects this panel to a local LLM. When running, the AI autonomously manages the Game Master role — spawning enemies, reacting to player actions, and adjusting difficulty in real time.</div>
        <div className="space-y-1.5 mb-4">
          {[['Bridge script',bridgeInfo?.bridge_path||'Set AIGM_BRIDGE_PATH in .env'],['Bridge port','localhost:5555'],['LLM backend','Ollama (local GPU)'],['Required mod','Command&Control (workshop)']].map(([k,v])=>(
            <div key={k} className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{background:C.bgInput,border:`1px solid ${C.border}`}}>
              <span className="font-bold shrink-0" style={{color:C.textDim,fontSize:sz.stat,minWidth:'7em'}}>{k}</span>
              <span className="font-mono flex-1 truncate" style={{color:C.text,fontSize:sz.stat}}>{v}</span>
            </div>
          ))}
        </div>
        <div className="rounded-lg p-3 font-mono mb-4" style={{background:C.consoleBg,color:TC.cyan,fontSize:sz.code}}>{bridgeInfo?.bridge_path?`python3 ${bridgeInfo.bridge_path}`:'python3 ~/AIGameMaster/AIGameMaster/bridge.py'}</div>
        <Btn onClick={startBridge} disabled={starting} className="w-full">{starting?'Starting...':'Start Bridge'}</Btn>
      </Card>
    </div>
  )

  // ── TAB NAV ──────────────────────────────────────────────────────────────
  const esc=gm.escalation||0
  const S={fontSize:sz.stat}
  const tBtn=(id,label)=>(
    <button key={id} onClick={()=>setTab(id)} className="px-4 py-2 font-bold cursor-pointer whitespace-nowrap" style={{fontSize:sz.nav,background:tab===id?TC.cyanDim:'transparent',color:tab===id?TC.cyan:TC.textMuted,borderBottom:tab===id?`2px solid ${TC.cyan}`:'2px solid transparent',transition:'color 0.15s'}}>{label}</button>
  )

  return(
    <div className="flex flex-col h-full" style={{background:TC.bg,color:TC.text,fontFamily:"'Inter',-apple-system,sans-serif"}}>

      {/* ── Floating panels ─── */}
      {floating.gameserver&&<FloatingPanel key="gameserver" title="Game Server" onDock={()=>dock('gameserver')} defaultPos={floating.gameserver}>
        <div className="p-4">
          {[['Map',gs?.map?.replace(/^#[A-Za-z]*[-_]?/,'').replace(/_/g,' ').trim()||'—','cyan'],['Players',`${gs?.player_count||0}`,'green'],['Session',`${Math.floor(gs?.session_time_minutes||0)}m`,''],['OPFOR Active',`${gs?.ai_units?.active||0}`,'red'],['Grids',`${gs?.valid_spawn_grids?.length||0}`,'']].map(([l,v,col])=>(
            <div key={l} className="flex justify-between py-0.5" style={{fontSize:bod}}>
              <span style={{color:TC.textDim}}>{l}</span>
              <span className="font-mono font-semibold" style={{color:col==='cyan'?TC.cyan:col==='green'?TC.green:col==='red'?TC.red:TC.text,fontSize:sml}}>{v}</span>
            </div>
          ))}
        </div>
      </FloatingPanel>}
      {floating.bridge&&<FloatingPanel key="bridge" title="Game Master" onDock={()=>dock('bridge')} defaultPos={floating.bridge}>
        <div className="p-4">
          {[['Model',gm.model||'—',''],['Latency',fmtMs(gm.last_ai_latency_ms),'cyan'],['Pending',`${gm.pending_commands||0}`,''],['Dispatched',`${gm.total_spawns||0}`,'cyan']].map(([l,v,col])=>(
            <div key={l} className="flex justify-between py-0.5" style={{fontSize:sz.base}}>
              <span style={{color:TC.textDim}}>{l}</span>
              <span className="font-mono font-semibold" style={{color:col==='cyan'?TC.cyan:TC.text,fontSize:sz.stat}}>{v}</span>
            </div>
          ))}
        </div>
      </FloatingPanel>}
      {floating.escalation&&<FloatingPanel key="escalation" title="Escalation" onDock={()=>dock('escalation')} defaultPos={floating.escalation}>
        <div className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <div style={{flex:1}}>
              <div style={{fontSize:sz.base+3,fontWeight:800,color:ESC_COLORS[esc]||TC.green,letterSpacing:'1px',lineHeight:1}}>{ESC_NAMES[esc]||'QUIET'}</div>
              <div style={{fontSize:sz.label,color:TC.textMuted,marginTop:3,lineHeight:1.4}}>{ESC_DESC[esc]||''}</div>
            </div>
            <div style={{fontSize:sz.base+10,fontWeight:900,color:ESC_COLORS[esc]||TC.green,opacity:0.2,fontFamily:'monospace',lineHeight:1}}>{esc}</div>
          </div>
          <div className="flex gap-1" style={{height:6,marginBottom:4}}>
            {[0,1,2,3,4].map(i=><div key={i} style={{flex:1,borderRadius:3,background:i<=esc?ESC_COLORS[i]:'rgba(255,255,255,0.07)',transition:'background 0.4s',boxShadow:i<=esc?`0 0 5px ${ESC_COLORS[i]}40`:''}}/>)}
          </div>
          <div className="flex">
            {ESC_NAMES.map((n,i)=><div key={i} style={{flex:1,fontSize:7,fontWeight:i===esc?700:400,color:i===esc?ESC_COLORS[i]:TC.textMuted,textAlign:'center'}}>{n.slice(0,3)}</div>)}
          </div>
        </div>
      </FloatingPanel>}
      {floating.component&&(()=>{
        const stateAge=gm.last_state_age??null
        const bridgePlayers=gs?.player_count||0
        const panelPlayers=livePlayers?.players?.length||0
        const mismatch=bridgePlayers!==panelPlayers&&panelPlayers>0
        const ageColor=stateAge===null?TC.textMuted:stateAge<15?TC.green:stateAge<45?TC.yellow:TC.red
        const ageLabel=stateAge===null?'—':stateAge<3?'<1s':`${Math.round(stateAge)}s`
        const componentOk=stateAge!==null&&stateAge<30
        return(<FloatingPanel key="component" title="In-Game Component" onDock={()=>dock('component')} defaultPos={floating.component}>
          <div className="p-4">
            <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-lg" style={{background:componentOk?'rgba(34,197,94,0.06)':'rgba(239,68,68,0.06)',border:`1px solid ${componentOk?TC.greenBorder:TC.redBorder}`}}>
              <div className="w-2 h-2 rounded-full shrink-0" style={{background:componentOk?TC.green:TC.red,boxShadow:`0 0 6px ${componentOk?TC.green:TC.red}`}}/>
              <span style={{color:componentOk?TC.green:TC.red,fontSize:sml,fontWeight:700}}>{componentOk?'POSTING STATE':'NOT POSTING'}</span>
              <span className="ml-auto font-mono" style={{color:ageColor,fontSize:sml,fontWeight:600}}>{ageLabel} ago</span>
            </div>
            <div className="space-y-0.5">
              <div className="flex justify-between" style={{fontSize:sml}}>
                <span style={{color:TC.textDim}}>Bridge players</span>
                <span className="font-mono font-semibold" style={{color:TC.text}}>{bridgePlayers}</span>
              </div>
              <div className="flex justify-between" style={{fontSize:sml}}>
                <span style={{color:TC.textDim}}>Panel players</span>
                <span className="font-mono font-semibold" style={{color:mismatch?TC.yellow:TC.text}}>{panelPlayers}</span>
              </div>
              {mismatch&&<div className="mt-1 text-xs px-2 py-1 rounded" style={{background:'rgba(234,179,8,0.08)',color:TC.yellow,border:`1px solid ${TC.yellowBorder}`}}>Count mismatch — component may not see all players</div>}
              {!componentOk&&<div className="mt-1 text-xs px-2 py-1 rounded" style={{background:'rgba(239,68,68,0.08)',color:TC.red,border:`1px solid ${TC.redBorder}`}}>Auto GM won't trigger — load AIGameMasterComponent mod</div>}
            </div>
          </div>
        </FloatingPanel>)
      })()}
      {floating.hardware&&(()=>{
        const sys=sysData?.system
        const gpu=sys?.gpu;const cpu=sys?.cpu;const ram=sys?.ram
        if(!sys)return null
        return(<FloatingPanel key="hardware" title="Hardware" onDock={()=>dock('hardware')} defaultPos={floating.hardware}>
          <div className="p-4">
            {gpu&&gpu.name!=='N/A'&&<div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold truncate" style={{color:TC.textDim,fontSize:sml,maxWidth:140}} title={gpu.name}>{gpu.name}</span>
                <div className="flex items-center gap-2 shrink-0"><HwTemp t={gpu.temp} sml={sml}/><span className="font-mono" style={{color:TC.textMuted,fontSize:tny}}>{gpu.vram_used}/{gpu.vram_total}GB VRAM</span></div>
              </div>
              <HwBar val={gpu.usage} max={100} color={gpu.usage>=85?TC.red:gpu.usage>=60?TC.yellow:TC.cyan} sml={sml}/>
              <div className="flex justify-between mt-0.5"><span style={{color:TC.textMuted,fontSize:tny}}>GPU · {gpu.power}W</span></div>
              <div className="mt-1"><div className="flex justify-between mb-0.5"><span style={{color:TC.textMuted,fontSize:tny}}>VRAM</span></div><HwBar val={gpu.vram_used} max={gpu.vram_total} color={TC.purple} sml={sml}/></div>
            </div>}
            {cpu&&<div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <span style={{color:TC.textDim,fontSize:sml}}>CPU</span>
                <div className="flex items-center gap-2"><HwTemp t={cpu.temp} sml={sml}/><span className="font-mono" style={{color:TC.textMuted,fontSize:tny}}>{cpu.cores}c · {cpu.freq}MHz</span></div>
              </div>
              <HwBar val={cpu.usage} max={100} color={cpu.usage>=85?TC.red:cpu.usage>=60?TC.yellow:TC.green} sml={sml}/>
            </div>}
            {ram&&<div>
              <div className="flex items-center justify-between mb-1">
                <span style={{color:TC.textDim,fontSize:sml}}>RAM</span>
                <span className="font-mono" style={{color:TC.textMuted,fontSize:tny}}>{ram.used}/{ram.total} GB</span>
              </div>
              <HwBar val={ram.used} max={ram.total} color={ram.used/ram.total>=0.85?TC.red:ram.used/ram.total>=0.65?TC.yellow:TC.cyan} sml={sml}/>
            </div>}
          </div>
        </FloatingPanel>)
      })()}
      {floating.metrics&&<FloatingPanel key="metrics" title="Metrics" onDock={()=>dock('metrics')} defaultPos={floating.metrics}>
        <div className="p-4">
          <div className="grid grid-cols-2 gap-2">
            {[['SPAWNS',gm.total_spawns||0],['DECISIONS',gm.total_decisions||0],['HEARTBEATS',gm.total_heartbeats||0],['UPTIME',`${Math.floor((gm.uptime_seconds||0)/60)}m`]].map(([l,v])=>(
              <div key={l} className="rounded-lg p-3 text-center" style={{background:TC.surface2,border:`1px solid ${TC.borderDim}`}}>
                <div className="font-mono font-bold" style={{color:TC.cyan,fontSize:big,lineHeight:1}}>{v}</div>
                <div style={{fontSize:tny,fontWeight:600,letterSpacing:'1px',color:TC.textMuted,marginTop:4}}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </FloatingPanel>}
      {floating.controls&&<FloatingPanel key="controls" title="Controls" onDock={()=>dock('controls')} defaultPos={floating.controls}>
        <div className="p-4">
          <div className="mb-3">
            <div className="flex justify-between mb-1"><span style={{color:TC.textDim,fontSize:bod}}>Difficulty</span><span className="font-mono font-bold" style={{color:TC.cyan,fontSize:20}}>{localDiff}</span></div>
            <input type="range" min={0} max={100} step={5} value={localDiff}
              onPointerDown={()=>{draggingRef.current=true}}
              onPointerUp={()=>{draggingRef.current=false;setConfig({difficulty:localDiff})}}
              onChange={e=>{const v=parseInt(e.target.value);setLocalDiff(v)}}
              className="w-full" style={{height:6,borderRadius:3,accentColor:TC.cyan,cursor:'pointer',background:`linear-gradient(to right,${TC.cyan} ${localDiff}%,rgba(255,255,255,0.08) ${localDiff}%)`}}/>
          </div>
          <div className="mb-3">
            <div className="flex justify-between mb-1">
              <span style={{color:TC.textDim,fontSize:bod}}>Escalation Override</span>
              <span className="font-mono font-bold" style={{color:localEsc<0?TC.textMuted:ESC_COLORS[Math.min(4,Math.floor(localEsc*5/101))],fontSize:sml}}>{localEsc<0?'AUTO':ESC_NAMES[Math.min(4,Math.floor(localEsc*5/101))]}</span>
            </div>
            <input type="range" min={-1} max={100} step={1} value={localEsc}
              onPointerDown={()=>{escDragRef.current=true}}
              onPointerUp={()=>{escDragRef.current=false;setEscOverride(localEsc)}}
              onChange={e=>setLocalEsc(parseInt(e.target.value))}
              className="w-full" style={{height:6,borderRadius:3,accentColor:localEsc<0?TC.textMuted:ESC_COLORS[Math.min(4,Math.floor(localEsc*5/101))],cursor:'pointer'}}/>
            <div className="flex justify-between mt-0.5"><span style={{color:TC.textMuted,fontSize:tny}}>Auto</span><span style={{color:TC.textMuted,fontSize:tny}}>OVERWHELM</span></div>
          </div>
          <div className="grid grid-cols-2 gap-1.5 mb-2">
            {[['on_demand','On-Demand'],['autonomous','Autonomous']].map(([m,l])=>(
              <button key={m} onClick={()=>setConfig({gm_mode:m})} className="py-2 rounded-md font-semibold" style={{fontSize:sml,letterSpacing:'0.5px',border:'1px solid',background:gm.gm_mode===m?TC.cyanDim:'rgba(255,255,255,0.03)',color:gm.gm_mode===m?TC.cyan:TC.textDim,borderColor:gm.gm_mode===m?TC.cyanBorder:TC.borderDim}}>{l}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <button onClick={()=>setConfig({ai_enabled:!gm.ai_enabled})} className="py-2 rounded-md font-semibold" style={{fontSize:sml,border:'1px solid',background:gm.ai_enabled?TC.redDim:TC.greenDim,color:gm.ai_enabled?TC.red:TC.green,borderColor:gm.ai_enabled?TC.redBorder:TC.greenBorder}}>{gm.ai_enabled?'Disable AI':'Enable AI'}</button>
            <button onClick={triggerAI} className="py-2 rounded-md font-semibold" style={{fontSize:sml,border:`1px solid ${TC.cyanBorder}`,background:TC.cyanDim,color:TC.cyan}}>Trigger Now</button>
          </div>
        </div>
      </FloatingPanel>}
      {floating.model&&(()=>{
        const loaded=ollamaStatus?.loaded||[]
        const hasLoaded=loaded.length>0
        return(<FloatingPanel key="model" title="Model / VRAM" onDock={()=>dock('model')} defaultPos={floating.model}>
          <div className="p-4">
            <div className="flex justify-between py-0.5 mb-2" style={{fontSize:sml}}>
              <span style={{color:TC.textDim}}>Bridge model</span>
              <span className="font-mono font-semibold truncate ml-2" style={{color:TC.cyan,maxWidth:140}}>{gm.model||'—'}</span>
            </div>
            {hasLoaded?(loaded.map((m,i)=>{
              const vramGB=(m.size_vram||0)/(1024**3);const totalGB=(m.size||0)/(1024**3)
              const vramPct=totalGB>0?Math.round(vramGB/totalGB*100):0
              return(<div key={i} className="mb-3 p-3 rounded-lg" style={{background:TC.surface,border:`1px solid ${TC.borderDim}`}}>
                <div className="flex justify-between mb-1">
                  <span className="font-mono font-semibold truncate" style={{color:TC.text,fontSize:sml,maxWidth:130}}>{m.name||m.model}</span>
                  <span className="font-mono shrink-0" style={{color:TC.purple,fontSize:tny,fontWeight:700}}>{vramGB.toFixed(1)}GB VRAM</span>
                </div>
                <div className="rounded-full overflow-hidden mb-1" style={{height:4,background:'rgba(255,255,255,0.06)'}}>
                  <div style={{width:`${vramPct}%`,height:'100%',background:TC.purple,borderRadius:9999}}/>
                </div>
                <div className="flex justify-between">
                  <span style={{color:TC.textMuted,fontSize:tny}}>{m.details?.parameter_size||''} {m.details?.quantization_level||''}</span>
                  <span style={{color:TC.textMuted,fontSize:tny}}>{totalGB.toFixed(1)}GB total</span>
                </div>
              </div>)
            })):(
              <div className="py-3 text-center" style={{color:TC.textMuted,fontSize:sml}}>No model loaded in VRAM</div>
            )}
            <div className="grid grid-cols-2 gap-1.5 mt-2">
              <button onClick={warmUp} disabled={warmingUp} className="py-2 rounded-md font-semibold" style={{fontSize:sml,border:`1px solid ${TC.purpleBorder}`,background:TC.purpleDim,color:TC.purple}}>{warmingUp?'Loading…':'Warmup'}</button>
              <button onClick={unloadModel} disabled={unloading||!hasLoaded} className="py-2 rounded-md font-semibold" style={{fontSize:sml,border:`1px solid ${TC.redBorder}`,background:hasLoaded?TC.redDim:'rgba(255,255,255,0.02)',color:hasLoaded?TC.red:TC.textMuted,cursor:hasLoaded?'pointer':'default'}}>{unloading?'Freeing…':'Unload VRAM'}</button>
            </div>
          </div>
        </FloatingPanel>)
      })()}
      {floating.admin&&<FloatingPanel key="admin" title="Admin + Spawn" onDock={()=>dock('admin')} defaultPos={floating.admin}>
        <div className="p-4">
          <div style={{fontSize:tny,fontWeight:700,letterSpacing:'1.5px',color:TC.textMuted,textTransform:'uppercase',marginBottom:8}}>Admin</div>
          <div className="grid grid-cols-2 gap-1.5 mb-4">
            <button onClick={deleteAllAI} className="py-2 rounded-md font-semibold" style={{fontSize:sml,border:`1px solid ${TC.redBorder}`,background:TC.redDim,color:TC.red}}>Delete All AI</button>
            <button onClick={clearQueue} className="py-2 rounded-md font-semibold" style={{fontSize:sml,border:`1px solid ${TC.cyanBorder}`,background:TC.cyanDim,color:TC.cyan}}>Clear Queue</button>
          </div>
          <div className="flex items-center justify-between mb-2">
            <div style={{fontSize:tny,fontWeight:700,letterSpacing:'1.5px',color:TC.textMuted,textTransform:'uppercase'}}>Manual Spawn</div>
            {catalog.length>0&&<span className="font-mono" style={{fontSize:tny,color:TC.cyan,background:TC.cyanDim,border:`1px solid ${TC.cyanBorder}`,padding:'1px 6px',borderRadius:3}}>{catalog.length} units</span>}
          </div>
          <div className="space-y-1.5">
            <div className="grid grid-cols-2 gap-1.5">
              <input value={spawnSearch} onChange={e=>setSpawnSearch(e.target.value)} placeholder="Search units..." className="rounded-md px-2 py-1.5" style={{background:TC.surface,border:`1px solid ${TC.borderDim}`,color:TC.text,fontSize:sml,fontFamily:'monospace',minWidth:0}}/>
              <select value={spawnCatFilter} onChange={e=>setSpawnCatFilter(e.target.value)} className="rounded-md px-2 py-1.5" style={{background:TC.surface,border:`1px solid ${TC.borderDim}`,color:TC.text,fontSize:sml,minWidth:0}}>
                <option value="all">All types</option>
                {catalogCategories.map(c=><option key={c} value={c}>{c==='fx'?'FX / Effects':c==='static_weapon'?'Static':c.charAt(0).toUpperCase()+c.slice(1)+'s'}</option>)}
              </select>
            </div>
            <select value={spawnUnit} onChange={e=>setSpawnUnit(e.target.value)} className="w-full rounded-md px-2 py-1.5" style={{background:TC.surface,border:`1px solid ${TC.borderDim}`,color:TC.text,fontSize:sml,fontFamily:'monospace',minWidth:0}}>
              {Object.keys(spawnByFaction).sort().map(f=><optgroup key={f} label={f}>{spawnByFaction[f].sort((a,b)=>a.name.localeCompare(b.name)).map((e,i)=><option key={i} value={e.name}>{e.name}</option>)}</optgroup>)}
              {spawnFiltered.length===0&&<option value="">{catalog.length===0?'No catalog (join server)':'No matches'}</option>}
            </select>
            <div className="grid gap-1.5" style={{gridTemplateColumns:'1fr 46px 1fr'}}>
              <input value={spawnGrid} onChange={e=>setSpawnGrid(e.target.value)} placeholder="Grid: 450-680" className="rounded-md px-2 py-1.5" style={{background:TC.surface,border:`1px solid ${TC.borderDim}`,color:TC.text,fontSize:sml,fontFamily:'monospace',minWidth:0}}/>
              <input type="number" value={spawnCount} onChange={e=>setSpawnCount(parseInt(e.target.value)||1)} min={1} max={20} className="rounded-md px-1 py-1.5 text-center" style={{background:TC.surface,border:`1px solid ${TC.borderDim}`,color:TC.text,fontSize:sml,fontFamily:'monospace',minWidth:0}}/>
              <select value={spawnBehavior} onChange={e=>setSpawnBehavior(e.target.value)} className="rounded-md px-2 py-1.5" style={{background:TC.surface,border:`1px solid ${TC.borderDim}`,color:TC.text,fontSize:sml,minWidth:0}}>
                {['patrol','defend','ambush','move','flank','hunt','attack','search','place'].map(b=><option key={b} value={b}>{b.charAt(0).toUpperCase()+b.slice(1)}</option>)}
              </select>
            </div>
            <button onClick={manualSpawn} className="w-full py-2 rounded-md font-semibold" style={{fontSize:sml,border:`1px solid ${TC.greenBorder}`,background:TC.greenDim,color:TC.green}}>Spawn</button>
          </div>
        </div>
      </FloatingPanel>}
      {floating.players&&<FloatingPanel key="players" title="Players" onDock={()=>dock('players')} defaultPos={floating.players}>
        <div className="p-4">
          {allPlayers.length===0
            ?<div className="py-6 text-center" style={{color:TC.textMuted,fontSize:bod}}>No players online</div>
            :allPlayers.map((p,i)=>{
              const alive=p.status==='alive'
              const gx=gs?Math.floor((p.pos.x-(gs.map_offset_x||0))/100):0
              const gz=gs?Math.floor((p.pos.y-(gs.map_offset_z||0))/100):0
              const grid=p.pos.x?`${String(Math.max(0,gx)).padStart(3,'0')}-${String(Math.max(0,gz)).padStart(3,'0')}`:'—'
              return <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg mb-1" style={{background:TC.surface,border:`1px solid ${TC.borderDim}`}}>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{background:alive?TC.green:TC.red}}/>
                  <div>
                    <div className="font-semibold" style={{fontSize:bod}}>{p.name}</div>
                    <div className="font-mono" style={{fontSize:sml,color:TC.textDim}}>{grid}{p.faction&&p.faction!=='Unknown'&&<span style={{color:TC.cyan,marginLeft:8}}>{p.faction}</span>}</div>
                  </div>
                </div>
                <span className="font-bold" style={{fontSize:tny,padding:'2px 6px',borderRadius:3,background:alive?TC.greenDim:TC.redDim,color:alive?TC.green:TC.red,border:`1px solid ${alive?TC.greenBorder:TC.redBorder}`}}>{p.status.toUpperCase()}</span>
              </div>
            })
          }
        </div>
      </FloatingPanel>}

      {/* ── Status bar ─── */}
      <div className="shrink-0 flex items-center gap-4 px-4 py-2.5 flex-wrap" style={{background:TC.surface,borderBottom:`1px solid ${TC.borderDim}`}}>
        <div className="flex items-center gap-2 font-black" style={{color:TC.cyan,fontSize:sz.base+2,letterSpacing:'-0.5px'}}>GAME MASTER</div>
        <div className="flex items-center gap-2 text-xs">
          {[['MODEL',!!(gm.model&&gm.model!=='—')],['BRIDGE',true],['SERVER',(gs?.player_count||0)>0]].map(([l,on])=>(
            <div key={l} className="flex items-center gap-1.5 px-2 py-1 rounded" style={{background:'rgba(255,255,255,0.03)',border:`1px solid rgba(255,255,255,0.06)`}}>
              <div className="w-1.5 h-1.5 rounded-full" style={{background:on?TC.green:TC.red,boxShadow:`0 0 6px ${on?TC.green:TC.red}`}}/>
              <span style={{color:TC.textDim,fontSize:tny,fontWeight:600,letterSpacing:'0.5px'}}>{l}</span>
            </div>
          ))}
          {(gm.ai_thinking||aiThinking)&&<div className="flex items-center gap-1.5 px-2 py-1 rounded" style={{background:TC.yellowDim,border:`1px solid ${TC.yellowBorder}`}}>
            <div className="w-1.5 h-1.5 rounded-full" style={{background:TC.yellow,animation:'pulse 1.2s infinite'}}/>
            <span style={{color:TC.yellow,fontSize:tny,fontWeight:600}}>AI THINKING</span>
            {thinkSecs>0&&<span className="font-mono" style={{color:TC.yellow,fontSize:tny,opacity:0.7}}>{thinkSecs}s</span>}
          </div>}
          {sysData?.system?.gpu?.name&&sysData.system.gpu.name!=='N/A'&&<div className="flex items-center gap-2 px-2 py-1 rounded" style={{background:'rgba(255,255,255,0.03)',border:`1px solid rgba(255,255,255,0.06)`}}>
            <span style={{color:TC.textMuted,fontSize:tny,fontWeight:600,letterSpacing:'0.5px'}}>GPU</span>
            <span className="font-mono" style={{color:sysData.system.gpu.usage>=85?TC.red:sysData.system.gpu.usage>=60?TC.yellow:TC.cyan,fontSize:sml,fontWeight:700}}>{sysData.system.gpu.usage}%</span>
            <span className="font-mono" style={{color:sysData.system.gpu.temp>=80?TC.red:sysData.system.gpu.temp>=65?TC.yellow:TC.textDim,fontSize:sml}}>{sysData.system.gpu.temp}°C</span>
          </div>}
          {sysData?.system?.cpu&&<div className="flex items-center gap-2 px-2 py-1 rounded" style={{background:'rgba(255,255,255,0.03)',border:`1px solid rgba(255,255,255,0.06)`}}>
            <span style={{color:TC.textMuted,fontSize:tny,fontWeight:600,letterSpacing:'0.5px'}}>CPU</span>
            <span className="font-mono" style={{color:sysData.system.cpu.usage>=85?TC.red:sysData.system.cpu.usage>=60?TC.yellow:TC.green,fontSize:sml,fontWeight:700}}>{sysData.system.cpu.usage}%</span>
            <span className="font-mono" style={{color:sysData.system.cpu.temp>=80?TC.red:sysData.system.cpu.temp>=65?TC.yellow:TC.textDim,fontSize:sml}}>{sysData.system.cpu.temp}°C</span>
          </div>}
        </div>
        <div className="flex-1"/>
        <div className="flex items-center gap-1">
          {[['ops','Ops Center'],['opord','OPORD Editor'],['config','Config'],['aar','After Action']].map(([id,lbl])=>tBtn(id,lbl))}
        </div>
        <div className="flex gap-2 items-center" style={{borderLeft:`1px solid ${TC.borderDim}`,paddingLeft:12,marginLeft:4}}>
          <Btn small v="ghost" onClick={startBridge} disabled={starting}>{starting?'Starting…':'Restart'}</Btn>
          <Btn small v="danger" onClick={stopBridge}>Stop</Btn>
        </div>
      </div>

      {/* ── OPS CENTER ─── */}
      {tab==='ops'&&<div className="flex-1 min-h-0 flex" style={{overflow:'hidden'}}>

        {/* LEFT: Stats + Controls */}
        <div className="overflow-y-auto shrink-0" style={{width:mobile?'100%':colWidths.left,borderRight:`1px solid ${TC.borderDim}`,background:TC.bg}}>

          {/* Hidden panels restore bar */}
          {Object.keys(hiddenPanels).length>0&&<div className="flex items-center gap-2 flex-wrap px-3 py-2" style={{background:TC.surface,borderBottom:`1px solid ${TC.borderDim}`}}><span style={{color:TC.textMuted,fontSize:tny,fontWeight:700,letterSpacing:'1px',textTransform:'uppercase'}}>Hidden:</span>{Object.keys(hiddenPanels).map(id=><button key={id} onClick={()=>showPanel(id)} style={{background:TC.cyanDim,color:TC.cyan,border:`1px solid ${TC.cyanBorder||TC.cyan+'30'}`,cursor:'pointer',fontSize:tny,padding:'2px 8px',borderRadius:4,fontWeight:700,display:'flex',alignItems:'center',gap:4}} onMouseEnter={e=>e.currentTarget.style.opacity='0.8'} onMouseLeave={e=>e.currentTarget.style.opacity='1'}>{AIGM_LABELS[id]||id} <span style={{opacity:0.6}}>↩</span></button>)}</div>}

          {/* Game Server section */}
          {!floating.gameserver&&!hiddenPanels.gameserver&&<div className="p-4" style={{borderBottom:`1px solid ${TC.borderDim}`}}>
            <SH label="Game Server" id="gameserver"/>
            {[['Map',gs?.map?.replace(/^#[A-Za-z]*[-_]?/,'').replace(/_/g,' ').trim()||'—','cyan'],['Players',`${gs?.player_count||0}`,'green'],['Session',`${Math.floor(gs?.session_time_minutes||0)}m`,''],['OPFOR Active',`${gs?.ai_units?.active||0}`,'red'],['Grids',`${gs?.valid_spawn_grids?.length||0}`,''],
              ...((gs?.casualties_last_10min||0)>0?[['Casualties (10m)',`${gs.casualties_last_10min}`,'yellow']]:[]),
              ...((gs?.engagement_intensity||0)>0.05?[['Engagement',`${Math.round(gs.engagement_intensity*100)}%`,gs.engagement_intensity>0.6?'red':gs.engagement_intensity>0.3?'yellow':'green']]:[]),
            ].map(([l,v,col])=>(
              <div key={l} className="flex justify-between py-0.5" style={{fontSize:bod}}>
                <span style={{color:TC.textDim}}>{l}</span>
                <span className="font-mono font-semibold" style={{color:col==='cyan'?TC.cyan:col==='green'?TC.green:col==='red'?TC.red:col==='yellow'?TC.yellow:TC.text,fontSize:sml}}>{v}</span>
              </div>
            ))}
            <div style={{height:1,background:TC.borderDim,margin:'6px 0'}}/>
            {[['Model',gm.model||'—',''],['Latency',fmtMs(gm.last_ai_latency_ms),'cyan'],['Pending',`${gm.pending_commands||0}`,''],['Dispatched',`${gm.total_spawns||0}`,'cyan']].map(([l,v,col])=>(
              <div key={l} className="flex justify-between py-0.5" style={{fontSize:bod}}>
                <span style={{color:TC.textDim}}>{l}</span>
                <span className="font-mono font-semibold" style={{color:col==='cyan'?TC.cyan:TC.text,fontSize:sml}}>{v}</span>
              </div>
            ))}
          </div>}

          {/* Bridge stats — folded into Game Server, no separate section */}
          {/* Escalation */}
          {!floating.escalation&&!hiddenPanels.escalation&&<div className="p-4" style={{borderBottom:`1px solid ${TC.borderDim}`}}>
            <SH label="Escalation" id="escalation"/>
            <div className="flex items-center gap-2 mb-2">
              <div style={{flex:1}}>
                <div style={{fontSize:sz.base+3,fontWeight:800,color:ESC_COLORS[esc]||TC.green,letterSpacing:'1px',lineHeight:1}}>{ESC_NAMES[esc]||'QUIET'}</div>
                <div style={{fontSize:sz.label,color:TC.textMuted,marginTop:3,lineHeight:1.4}}>{ESC_DESC[esc]||''}</div>
              </div>
              <div style={{fontSize:sz.base+10,fontWeight:900,color:ESC_COLORS[esc]||TC.green,opacity:0.2,fontFamily:'monospace',lineHeight:1}}>{esc}</div>
            </div>
            <div className="flex gap-1" style={{height:6,marginBottom:4}}>
              {[0,1,2,3,4].map(i=><div key={i} style={{flex:1,borderRadius:3,background:i<=esc?ESC_COLORS[i]:'rgba(255,255,255,0.07)',transition:'background 0.4s',boxShadow:i<=esc?`0 0 5px ${ESC_COLORS[i]}40`:''}}/>)}
            </div>
            <div className="flex">
              {ESC_NAMES.map((n,i)=><div key={i} style={{flex:1,fontSize:7,fontWeight:i===esc?700:400,color:i===esc?ESC_COLORS[i]:TC.textMuted,textAlign:'center'}}>{n.slice(0,3)}</div>)}
            </div>
          </div>}

          {/* Bridge Connectivity / Component Health */}
          {!floating.component&&!hiddenPanels.component&&(()=>{
            const stateAge=gm.last_state_age??null
            const bridgePlayers=gs?.player_count||0
            const panelPlayers=livePlayers?.players?.length||0
            const mismatch=bridgePlayers!==panelPlayers&&panelPlayers>0
            const ageColor=stateAge===null?TC.textMuted:stateAge<15?TC.green:stateAge<45?TC.yellow:TC.red
            const ageLabel=stateAge===null?'—':stateAge<3?'<1s':`${Math.round(stateAge)}s`
            const componentOk=stateAge!==null&&stateAge<30
            return(<div className="p-4" style={{borderBottom:`1px solid ${TC.borderDim}`}}>
              <SH label="In-Game Component" id="component"/>
              <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-lg" style={{background:componentOk?'rgba(34,197,94,0.06)':'rgba(239,68,68,0.06)',border:`1px solid ${componentOk?TC.greenBorder:TC.redBorder}`}}>
                <div className="w-2 h-2 rounded-full shrink-0" style={{background:componentOk?TC.green:TC.red,boxShadow:`0 0 6px ${componentOk?TC.green:TC.red}`}}/>
                <span style={{color:componentOk?TC.green:TC.red,fontSize:sml,fontWeight:700}}>{componentOk?'POSTING STATE':'NOT POSTING'}</span>
                <span className="ml-auto font-mono" style={{color:ageColor,fontSize:sml,fontWeight:600}}>{ageLabel} ago</span>
              </div>
              <div className="space-y-0.5">
                <div className="flex justify-between" style={{fontSize:sml}}>
                  <span style={{color:TC.textDim}}>Bridge players</span>
                  <span className="font-mono font-semibold" style={{color:TC.text}}>{bridgePlayers}</span>
                </div>
                <div className="flex justify-between" style={{fontSize:sml}}>
                  <span style={{color:TC.textDim}}>Panel players</span>
                  <span className="font-mono font-semibold" style={{color:mismatch?TC.yellow:TC.text}}>{panelPlayers}</span>
                </div>
                {mismatch&&<div className="mt-1 text-xs px-2 py-1 rounded" style={{background:'rgba(234,179,8,0.08)',color:TC.yellow,border:`1px solid ${TC.yellowBorder}`}}>Count mismatch — component may not see all players</div>}
                {!componentOk&&<div className="mt-1 text-xs px-2 py-1 rounded" style={{background:'rgba(239,68,68,0.08)',color:TC.red,border:`1px solid ${TC.redBorder}`}}>Auto GM won't trigger — load AIGameMasterComponent mod</div>}
              </div>
            </div>)
          })()}

          {/* Hardware Stats */}
          {!floating.hardware&&!hiddenPanels.hardware&&(()=>{
            const sys=sysData?.system
            const gpu=sys?.gpu;const cpu=sys?.cpu;const ram=sys?.ram
            if(!sys)return null
            return(<div className="p-4" style={{borderBottom:`1px solid ${TC.borderDim}`}}>
              <SH label="Hardware" id="hardware"/>
              {gpu&&gpu.name!=='N/A'&&<div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold truncate" style={{color:TC.textDim,fontSize:sml,maxWidth:140}} title={gpu.name}>{gpu.name}</span>
                  <div className="flex items-center gap-2 shrink-0"><HwTemp t={gpu.temp} sml={sml}/><span className="font-mono" style={{color:TC.textMuted,fontSize:tny}}>{gpu.vram_used}/{gpu.vram_total}GB VRAM</span></div>
                </div>
                <HwBar val={gpu.usage} max={100} color={gpu.usage>=85?TC.red:gpu.usage>=60?TC.yellow:TC.cyan} sml={sml}/>
                <div className="flex justify-between mt-0.5"><span style={{color:TC.textMuted,fontSize:tny}}>GPU · {gpu.power}W</span></div>
                <div className="mt-1"><div className="flex justify-between mb-0.5"><span style={{color:TC.textMuted,fontSize:tny}}>VRAM</span></div><HwBar val={gpu.vram_used} max={gpu.vram_total} color={TC.purple} sml={sml}/></div>
              </div>}
              {cpu&&<div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <span style={{color:TC.textDim,fontSize:sml}}>CPU</span>
                  <div className="flex items-center gap-2"><HwTemp t={cpu.temp} sml={sml}/><span className="font-mono" style={{color:TC.textMuted,fontSize:tny}}>{cpu.cores}c · {cpu.freq}MHz</span></div>
                </div>
                <HwBar val={cpu.usage} max={100} color={cpu.usage>=85?TC.red:cpu.usage>=60?TC.yellow:TC.green} sml={sml}/>
              </div>}
              {ram&&<div>
                <div className="flex items-center justify-between mb-1">
                  <span style={{color:TC.textDim,fontSize:sml}}>RAM</span>
                  <span className="font-mono" style={{color:TC.textMuted,fontSize:tny}}>{ram.used}/{ram.total} GB</span>
                </div>
                <HwBar val={ram.used} max={ram.total} color={ram.used/ram.total>=0.85?TC.red:ram.used/ram.total>=0.65?TC.yellow:TC.cyan} sml={sml}/>
              </div>}
            </div>)
          })()}

          {/* Model / VRAM */}
          {!floating.model&&!hiddenPanels.model&&(()=>{
            const loaded=ollamaStatus?.loaded||[]
            const hasLoaded=loaded.length>0
            return(<div className="p-4" style={{borderBottom:`1px solid ${TC.borderDim}`}}>
              <SH label="Model / VRAM" id="model"/>
              <div className="flex justify-between py-0.5 mb-2" style={{fontSize:sml}}>
                <span style={{color:TC.textDim}}>Active model</span>
                <span className="font-mono font-semibold truncate ml-2" style={{color:TC.cyan,maxWidth:130}}>{gm.model||'—'}</span>
              </div>
              {hasLoaded&&loaded.map((m,i)=>{
                const vramGB=(m.size_vram||0)/(1024**3);const totalGB=(m.size||0)/(1024**3)
                const vramPct=totalGB>0?Math.round(vramGB/totalGB*100):0
                return(<div key={i} className="mb-2 p-2 rounded-lg" style={{background:TC.surface,border:`1px solid ${TC.borderDim}`}}>
                  <div className="flex justify-between mb-1">
                    <span className="font-mono truncate" style={{color:TC.text,fontSize:tny,maxWidth:110}}>{m.name||m.model}</span>
                    <span className="font-mono shrink-0" style={{color:TC.purple,fontSize:tny,fontWeight:700}}>{vramGB.toFixed(1)}GB</span>
                  </div>
                  <div className="rounded-full overflow-hidden" style={{height:3,background:'rgba(255,255,255,0.06)'}}>
                    <div style={{width:`${vramPct}%`,height:'100%',background:TC.purple,borderRadius:9999}}/>
                  </div>
                  <div style={{color:TC.textMuted,fontSize:tny,marginTop:2}}>{m.details?.parameter_size||''} {m.details?.quantization_level||''}</div>
                </div>)
              })}
              {!hasLoaded&&<div className="py-2 text-center rounded-lg mb-2" style={{background:TC.surface,border:`1px solid ${TC.borderDim}`,color:TC.textMuted,fontSize:sml}}>No model in VRAM</div>}
              <div className="grid grid-cols-2 gap-1.5">
                <button onClick={warmUp} disabled={warmingUp} className="py-2 rounded-md font-semibold" style={{fontSize:sml,border:`1px solid ${TC.purpleBorder}`,background:TC.purpleDim,color:TC.purple}}>{warmingUp?'Loading…':'Warmup'}</button>
                <button onClick={unloadModel} disabled={unloading||!hasLoaded} className="py-2 rounded-md font-semibold" style={{fontSize:sml,border:`1px solid ${TC.redBorder}`,background:hasLoaded?TC.redDim:'rgba(255,255,255,0.02)',color:hasLoaded?TC.red:TC.textMuted,cursor:hasLoaded?'pointer':'default'}}>{unloading?'Freeing…':'Unload VRAM'}</button>
              </div>
            </div>)
          })()}

          {/* Active Operation */}
          {(gm.operation||gm.agent?.active_operation)&&(()=>{
  const op=gm.operation
  const stateColors={'IDLE':TC.textMuted,'PLANNING':TC.yellow,'STAGING':TC.yellow,'ACTIVE':TC.green,'EVALUATING':TC.cyan,'ESCALATING':TC.red,'PARSING':TC.yellow}
  const stateColor=stateColors[op?.state]||TC.cyan
  const phaseIdx=(op?.phase_index??0)
  const phases=op?.phases||[]
  const currentPhase=phases[phaseIdx]
  const phaseRemaining=op?.phase_remaining_seconds
  const fmtTime=s=>s!=null?`${Math.floor(s/60)}m ${s%60}s left`:'—'
  return(
    <div className="p-4" style={{borderBottom:`1px solid ${TC.borderDim}`}}>
      <div style={{fontSize:tny,fontWeight:700,letterSpacing:'1.5px',color:TC.textMuted,textTransform:'uppercase',marginBottom:8}}>Active Operation</div>
      <div className="rounded-lg px-3 py-2 mb-2" style={{background:'rgba(34,211,238,0.04)',border:`1px solid ${TC.cyanBorder}`}}>
        <div className="flex items-center justify-between mb-1">
          <div className="font-bold truncate" style={{color:TC.cyan,fontSize:bod}}>{op?.name||gm.agent?.active_operation||'Operation'}</div>
          {op?.state&&<span className="font-mono font-bold shrink-0 ml-2" style={{fontSize:tny,padding:'1px 6px',borderRadius:3,background:`${stateColor}15`,color:stateColor,border:`1px solid ${stateColor}30`}}>{op.state}</span>}
        </div>
        {currentPhase&&<div className="font-mono" style={{color:TC.textDim,fontSize:tny}}>Phase {phaseIdx+1}/{phases.length}: {currentPhase.name}</div>}
        {currentPhase?.objective&&<div style={{color:TC.textMuted,fontSize:tny,marginTop:2,lineHeight:1.4}}>{currentPhase.objective}</div>}
        {phaseRemaining!=null&&<div className="font-mono mt-1" style={{color:phaseRemaining<60?TC.yellow:TC.textMuted,fontSize:tny}}>{fmtTime(phaseRemaining)}</div>}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <button onClick={advancePhase} className="py-1.5 rounded-md font-semibold" style={{fontSize:tny,border:`1px solid ${TC.cyanBorder}`,background:TC.cyanDim,color:TC.cyan}}>Skip Phase</button>
        <button onClick={abortOp} className="py-1.5 rounded-md font-semibold" style={{fontSize:tny,border:`1px solid ${TC.redBorder}`,background:TC.redDim,color:TC.red}}>Abort Op</button>
      </div>
    </div>
  )
})()}

          {/* Metrics */}
          {!floating.metrics&&!hiddenPanels.metrics&&<div className="p-4" style={{borderBottom:`1px solid ${TC.borderDim}`}}>
            <SH label="Metrics" id="metrics"/>
            <div className="space-y-0.5">
              {[['Spawns',gm.total_spawns||0,'cyan'],['Decisions',gm.total_decisions||0,'cyan'],['Heartbeats',gm.total_heartbeats||0,''],['Uptime',`${Math.floor((gm.uptime_seconds||0)/60)}m`,'']].map(([l,v,col])=>(
                <div key={l} className="flex justify-between py-0.5" style={{fontSize:bod}}>
                  <span style={{color:TC.textDim}}>{l}</span>
                  <span className="font-mono font-bold" style={{color:col==='cyan'?TC.cyan:TC.text,fontSize:sml}}>{v}</span>
                </div>
              ))}
            </div>
          </div>}

          {/* Controls */}
          {!floating.controls&&!hiddenPanels.controls&&<div className="p-4" style={{borderBottom:`1px solid ${TC.borderDim}`}}>
            <SH label="Controls" id="controls"/>
            <div className="mb-3">
              <div className="flex justify-between mb-1"><span style={{color:TC.textDim,fontSize:bod}}>Difficulty</span><span className="font-mono font-bold" style={{color:TC.cyan,fontSize:20}}>{localDiff}</span></div>
              <input type="range" min={0} max={100} step={5} value={localDiff}
                onPointerDown={()=>{draggingRef.current=true}}
                onPointerUp={()=>{draggingRef.current=false;setConfig({difficulty:localDiff})}}
                onChange={e=>{const v=parseInt(e.target.value);setLocalDiff(v)}}
                className="w-full" style={{height:6,borderRadius:3,accentColor:TC.cyan,cursor:'pointer',background:`linear-gradient(to right,${TC.cyan} ${localDiff}%,rgba(255,255,255,0.08) ${localDiff}%)`}}/>
            </div>
            <div className="mb-3">
              <div className="flex justify-between mb-1">
                <span style={{color:TC.textDim,fontSize:bod}}>Escalation Override</span>
                <span className="font-mono font-bold" style={{color:localEsc<0?TC.textMuted:ESC_COLORS[Math.min(4,Math.floor(localEsc*5/101))],fontSize:sml}}>{localEsc<0?'AUTO':ESC_NAMES[Math.min(4,Math.floor(localEsc*5/101))]}</span>
              </div>
              <input type="range" min={-1} max={100} step={1} value={localEsc}
                onPointerDown={()=>{escDragRef.current=true}}
                onPointerUp={()=>{escDragRef.current=false;setEscOverride(localEsc)}}
                onChange={e=>setLocalEsc(parseInt(e.target.value))}
                className="w-full" style={{height:6,borderRadius:3,accentColor:localEsc<0?TC.textMuted:ESC_COLORS[Math.min(4,Math.floor(localEsc*5/101))],cursor:'pointer'}}/>
              <div className="flex justify-between mt-0.5"><span style={{color:TC.textMuted,fontSize:tny}}>Auto</span><span style={{color:TC.textMuted,fontSize:tny}}>OVERWHELM</span></div>
            </div>
            <div className="grid grid-cols-2 gap-1.5 mb-2">
              {[['on_demand','On-Demand'],['autonomous','Autonomous']].map(([m,l])=>(
                <button key={m} onClick={()=>setConfig({gm_mode:m})} className="py-2 rounded-md font-semibold" style={{fontSize:sml,letterSpacing:'0.5px',border:'1px solid',background:gm.gm_mode===m?TC.cyanDim:'rgba(255,255,255,0.03)',color:gm.gm_mode===m?TC.cyan:TC.textDim,borderColor:gm.gm_mode===m?TC.cyanBorder:TC.borderDim}}>{l}</button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button onClick={()=>setConfig({ai_enabled:!gm.ai_enabled})} className="py-2 rounded-md font-semibold" style={{fontSize:sml,border:'1px solid',background:gm.ai_enabled?TC.redDim:TC.greenDim,color:gm.ai_enabled?TC.red:TC.green,borderColor:gm.ai_enabled?TC.redBorder:TC.greenBorder}}>{gm.ai_enabled?'Disable AI':'Enable AI'}</button>
              <button onClick={triggerAI} className="py-2 rounded-md font-semibold" style={{fontSize:sml,border:`1px solid ${TC.cyanBorder}`,background:TC.cyanDim,color:TC.cyan}}>Trigger Now</button>
            </div>
          </div>}

          {/* Admin + Manual Spawn */}
          {!floating.admin&&!hiddenPanels.admin&&<div className="p-4" style={{borderBottom:`1px solid ${TC.borderDim}`}}>
            <SH label="Admin" id="admin"/>
            <div className="grid grid-cols-2 gap-1.5 mb-4">
              <button onClick={deleteAllAI} className="py-2 rounded-md font-semibold" style={{fontSize:sml,border:`1px solid ${TC.redBorder}`,background:TC.redDim,color:TC.red}}>Delete All AI</button>
              <button onClick={clearQueue} className="py-2 rounded-md font-semibold" style={{fontSize:sml,border:`1px solid ${TC.cyanBorder}`,background:TC.cyanDim,color:TC.cyan}}>Clear Queue</button>
            </div>
            <div className="flex items-center justify-between mb-2">
              <div style={{fontSize:tny,fontWeight:700,letterSpacing:'1.5px',color:TC.textMuted,textTransform:'uppercase'}}>Manual Spawn</div>
              {catalog.length>0&&<span className="font-mono" style={{fontSize:tny,color:TC.cyan,background:TC.cyanDim,border:`1px solid ${TC.cyanBorder}`,padding:'1px 6px',borderRadius:3}}>{catalog.length} units</span>}
            </div>
            <div className="space-y-1.5">
              <div className="grid grid-cols-2 gap-1.5">
                <input value={spawnSearch} onChange={e=>setSpawnSearch(e.target.value)} placeholder="Search units..." className="rounded-md px-2 py-1.5" style={{background:TC.surface,border:`1px solid ${TC.borderDim}`,color:TC.text,fontSize:sml,fontFamily:'monospace',minWidth:0}}/>
                <select value={spawnCatFilter} onChange={e=>setSpawnCatFilter(e.target.value)} className="rounded-md px-2 py-1.5" style={{background:TC.surface,border:`1px solid ${TC.borderDim}`,color:TC.text,fontSize:sml,minWidth:0}}>
                  <option value="all">All types</option>
                  {catalogCategories.map(c=><option key={c} value={c}>{c==='fx'?'FX / Effects':c==='static_weapon'?'Static':c.charAt(0).toUpperCase()+c.slice(1)+'s'}</option>)}
                </select>
              </div>
              <select value={spawnUnit} onChange={e=>setSpawnUnit(e.target.value)} className="w-full rounded-md px-2 py-1.5" style={{background:TC.surface,border:`1px solid ${TC.borderDim}`,color:TC.text,fontSize:sml,fontFamily:'monospace',minWidth:0}}>
                {Object.keys(spawnByFaction).sort().map(f=><optgroup key={f} label={f}>{spawnByFaction[f].sort((a,b)=>a.name.localeCompare(b.name)).map((e,i)=><option key={i} value={e.name}>{e.name}</option>)}</optgroup>)}
                {spawnFiltered.length===0&&<option value="">{catalog.length===0?'No catalog (join server)':'No matches'}</option>}
              </select>
              <div className="grid gap-1.5" style={{gridTemplateColumns:'1fr 46px 1fr'}}>
                <input value={spawnGrid} onChange={e=>setSpawnGrid(e.target.value)} placeholder="Grid: 450-680" className="rounded-md px-2 py-1.5" style={{background:TC.surface,border:`1px solid ${TC.borderDim}`,color:TC.text,fontSize:sml,fontFamily:'monospace',minWidth:0}}/>
                <input type="number" value={spawnCount} onChange={e=>setSpawnCount(parseInt(e.target.value)||1)} min={1} max={20} className="rounded-md px-1 py-1.5 text-center" style={{background:TC.surface,border:`1px solid ${TC.borderDim}`,color:TC.text,fontSize:sml,fontFamily:'monospace',minWidth:0}}/>
                <select value={spawnBehavior} onChange={e=>setSpawnBehavior(e.target.value)} className="rounded-md px-2 py-1.5" style={{background:TC.surface,border:`1px solid ${TC.borderDim}`,color:TC.text,fontSize:sml,minWidth:0}}>
                  {['patrol','defend','ambush','move','flank','hunt','attack','search','place'].map(b=><option key={b} value={b}>{b.charAt(0).toUpperCase()+b.slice(1)}</option>)}
                </select>
              </div>
              <button onClick={manualSpawn} className="w-full py-2 rounded-md font-semibold" style={{fontSize:sml,border:`1px solid ${TC.greenBorder}`,background:TC.greenDim,color:TC.green}}>Spawn</button>
            </div>
          </div>}

          {/* Agent Intelligence */}
          {(gm.agent&&(Object.keys(gm.agent.player_skills||{}).length>0||gm.agent.deployment_outcomes>0))&&<div className="p-4" style={{borderBottom:`1px solid ${TC.borderDim}`}}>
            <div style={{fontSize:tny,fontWeight:700,letterSpacing:'1.5px',color:TC.textMuted,textTransform:'uppercase',marginBottom:8}}>Agent Intel</div>
            {gm.agent.deployment_success_rate&&<div className="flex justify-between py-0.5 mb-1" style={{fontSize:sml}}>
              <span style={{color:TC.textDim}}>Deploy success rate</span>
              <span className="font-mono font-bold" style={{color:parseFloat(gm.agent.deployment_success_rate)>=60?TC.green:parseFloat(gm.agent.deployment_success_rate)>=35?TC.yellow:TC.red}}>{gm.agent.deployment_success_rate}</span>
            </div>}
            {gm.agent.dynamic_difficulty&&<div className="flex justify-between py-0.5 mb-1" style={{fontSize:sml}}>
              <span style={{color:TC.textDim}}>Dynamic difficulty</span>
              <span className="font-mono font-bold" style={{color:TC.cyan}}>{gm.agent.dynamic_difficulty}<span style={{color:TC.textMuted,fontWeight:400}}>/100</span></span>
            </div>}
            {gm.agent.completed_operations>0&&<div className="flex justify-between py-0.5 mb-2" style={{fontSize:sml}}>
              <span style={{color:TC.textDim}}>Ops completed</span>
              <span className="font-mono font-bold" style={{color:TC.text}}>{gm.agent.completed_operations}</span>
            </div>}
            {Object.entries(gm.agent.player_skills||{}).length>0&&<div>
              <div style={{fontSize:tny,color:TC.textMuted,marginBottom:4}}>Player threat levels</div>
              {Object.entries(gm.agent.player_skills).map(([name,s])=>(
                <div key={name} className="flex items-center justify-between py-1" style={{fontSize:sml,borderTop:`1px solid ${TC.borderDim}`}}>
                  <span className="truncate" style={{color:TC.text,maxWidth:100}}>{name}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono" style={{color:TC.textMuted}}>{s.kd}</span>
                    <span className="font-bold px-1.5 py-0.5 rounded" style={{fontSize:tny,background:s.threat==='elite'?TC.redDim:s.threat==='high'?TC.orangeBg||TC.redDim:s.threat==='low'?TC.greenDim:TC.surface,color:s.threat==='elite'?TC.red:s.threat==='high'?TC.orange||TC.red:s.threat==='low'?TC.green:TC.textDim,border:`1px solid ${s.threat==='elite'?TC.redBorder:s.threat==='high'?TC.redBorder:s.threat==='low'?TC.greenBorder:TC.borderDim}`}}>{(s.threat||'med').toUpperCase()}</span>
                    <span className="font-mono font-bold" style={{color:TC.cyan,minWidth:24,textAlign:'right'}}>{s.skill}</span>
                  </div>
                </div>
              ))}
            </div>}
          </div>}

          {/* Players */}
          {!floating.players&&!hiddenPanels.players&&<div className="p-4">
            <SH label={`Players (${allPlayers.filter(p=>p.status==='alive').length}/${allPlayers.length})`} id="players"/>
            {allPlayers.length===0
              ?<div className="py-6 text-center" style={{color:TC.textMuted,fontSize:bod}}>No players online</div>
              :allPlayers.map((p,i)=>{
                const alive=p.status==='alive'
                const gx=gs?Math.floor((p.pos.x-(gs.map_offset_x||0))/100):0
                const gz=gs?Math.floor((p.pos.y-(gs.map_offset_z||0))/100):0
                const grid=p.pos.x?`${String(Math.max(0,gx)).padStart(3,'0')}-${String(Math.max(0,gz)).padStart(3,'0')}`:'—'
                const pa=(gs?.awareness||[]).find(a=>a.player===p.name)
                const nearLoc=pa?.nearest_location?.name
                const headDir=pa?.heading_dir
                return <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg mb-1" style={{background:TC.surface,border:`1px solid ${TC.borderDim}`}}>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{background:alive?TC.green:TC.red}}/>
                    <div>
                      <div className="font-semibold" style={{fontSize:bod}}>{p.name}</div>
                      <div className="font-mono" style={{fontSize:sml,color:TC.textDim}}>
                        {grid}
                        {headDir&&<span style={{color:TC.cyan,marginLeft:8,fontWeight:700}}>{headDir}</span>}
                        {p.faction&&p.faction!=='Unknown'&&<span style={{color:TC.textMuted,marginLeft:8}}>{p.faction}</span>}
                      </div>
                      {nearLoc&&<div style={{fontSize:tny,color:TC.textMuted,marginTop:1}}>{nearLoc}</div>}
                    </div>
                  </div>
                  <span className="font-bold" style={{fontSize:tny,padding:'2px 6px',borderRadius:3,background:alive?TC.greenDim:TC.redDim,color:alive?TC.green:TC.red,border:`1px solid ${alive?TC.greenBorder:TC.redBorder}`}}>{p.status.toUpperCase()}</span>
                </div>
              })
            }
          </div>}
        </div>

        {!mobile&&<div onMouseDown={e=>startResize('left',e)} style={{width:4,flexShrink:0,cursor:'col-resize',background:'transparent',transition:'background 0.15s'}} onMouseEnter={e=>e.currentTarget.style.background=TC.cyanBorder} onMouseLeave={e=>e.currentTarget.style.background='transparent'}/>}
        {/* CENTER: Tactical Map */}
        {!mobile&&<div className="flex flex-col overflow-hidden flex-1" style={{background:'#09090b'}}>
          <div className="shrink-0 flex items-center justify-between px-4 py-2" style={{background:TC.surface,borderBottom:`1px solid ${TC.borderDim}`}}>
            <span style={{fontSize:tny,fontWeight:700,letterSpacing:'1.5px',color:TC.textMuted,textTransform:'uppercase'}}>Tactical Map</span>
            <div className="flex items-center gap-4" style={{fontSize:tny}}>
              {[['Players',TC.green,false],[' AI Groups',TC.red,true],['Spawn Grids',TC.cyan,false]].map(([l,c,rot])=>(
                <div key={l} className="flex items-center gap-1.5">
                  <div style={{width:8,height:8,borderRadius:rot?0:'50%',background:c,transform:rot?'rotate(45deg)':''}}/>
                  <span style={{color:TC.textMuted}}>{l}</span>
                </div>
              ))}
            </div>
          </div>
          <div ref={containerRef} className="flex-1 relative min-h-0">
            <canvas ref={canvasRef} style={{position:'absolute',inset:0}}/>
          </div>
        </div>}

        {!mobile&&<div onMouseDown={e=>startResize('right',e)} style={{width:4,flexShrink:0,cursor:'col-resize',background:'transparent',transition:'background 0.15s'}} onMouseEnter={e=>e.currentTarget.style.background=TC.cyanBorder} onMouseLeave={e=>e.currentTarget.style.background='transparent'}/>}
        {/* RIGHT: Chat + Logs */}
        <div className="flex flex-col overflow-hidden shrink-0" style={{width:mobile?'100%':colWidths.right,borderLeft:`1px solid ${TC.borderDim}`,background:TC.bg}}>
          {/* Tab bar */}
          <div className="shrink-0 flex overflow-x-auto" style={{background:'rgba(24,24,27,0.3)',borderBottom:`1px solid ${TC.borderDim}`,scrollbarWidth:'none'}}>
            {[['chat','Comms'],['decisions',`Decisions${(decisions||[]).length>0?` (${decisions.length})`:''}`],['commands','Commands'],['broadcasts','Broadcasts'],['logs','Logs'],['console','Console']].map(([id,lbl])=>(
              <button key={id} onClick={()=>setChatTab(id)} className="flex-1 py-3 font-semibold relative whitespace-nowrap px-3" style={{fontSize:tny,letterSpacing:'0.5px',color:chatTab===id?TC.cyan:'rgba(113,113,122,0.5)',background:'transparent',border:'none',cursor:'pointer',minWidth:72}}>
                {lbl}
                {chatTab===id&&<div style={{position:'absolute',bottom:0,left:8,right:8,height:2,background:TC.cyan,borderRadius:1}}/>}
              </button>
            ))}
          </div>

          {/* Chat tab */}
          {chatTab==='chat'&&<div className="flex flex-col flex-1 min-h-0">
            {/* Quick Commands */}
            <div className="shrink-0" style={{borderBottom:`1px solid ${TC.borderDim}`}}>
              <button onClick={()=>setShowQuickCmds(v=>!v)} className="w-full flex items-center justify-between px-4 py-2" style={{background:'none',border:'none',cursor:'pointer',color:TC.textDim,fontSize:sml,fontWeight:600,letterSpacing:'0.5px'}}>
                <span style={{display:'flex',alignItems:'center',gap:6}}>
                  <svg style={{width:12,height:12,transform:showQuickCmds?'rotate(90deg)':'',transition:'transform 0.2s'}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M9 18l6-6-6-6"/></svg>
                  Quick Commands
                </span>
                <span style={{color:TC.cyan,fontSize:tny,letterSpacing:'1px'}}>{showQuickCmds?'HIDE':'SHOW'}</span>
              </button>
              {showQuickCmds&&<div className="px-3 pb-3" style={{maxHeight:350,overflowY:'auto'}}>
                {QUICK_CMDS.map(g=><div key={g.group} className="mb-2">
                  <div style={{fontSize:tny,fontWeight:700,letterSpacing:'1px',color:g.color,marginBottom:4}}>{g.group}</div>
                  <div className="grid grid-cols-2 gap-1">
                    {g.cmds.map(c=><button key={c.label} onClick={()=>sendChat(c.cmd)} disabled={aiThinking} className="flex items-center gap-1.5 px-2.5 py-2 rounded-md text-left" style={{background:TC.surface,border:`1px solid ${TC.borderDim}`,fontSize:tny,fontWeight:600,color:TC.textDim,cursor:'pointer',opacity:aiThinking?0.4:1}}>
                      <span style={{color:TC.cyan,opacity:0.5,width:16,textAlign:'center'}}>+</span>{c.label}
                    </button>)}
                  </div>
                </div>)}
              </div>}
            </div>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 min-h-0 space-y-4">
              {chatHistory.length===0&&<div className="text-center py-12">
                <div className="mx-auto mb-3 rounded-xl flex items-center justify-center" style={{width:48,height:48,background:TC.cyanDim,border:`1px solid ${TC.cyanBorder}`}}>
                  <svg style={{width:24,height:24,color:TC.cyan,opacity:0.3}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"/></svg>
                </div>
                <p style={{fontSize:bod,color:TC.textMuted}}>Send a command to the AI Game Master</p>
                <p style={{fontSize:sml,color:'rgba(82,82,91,0.6)',marginTop:4}}>Try "Deploy infantry patrol near me"</p>
              </div>}
              {chatHistory.map((h,i)=><div key={i}>
                <div className="flex items-center gap-2 mb-1">
                  <div className="flex items-center justify-center rounded-md font-bold" style={{width:20,height:20,fontSize:tny,background:h.role==='user'?TC.cyanDim:TC.redDim,color:h.role==='user'?TC.cyan:TC.red,border:`1px solid ${h.role==='user'?TC.cyanBorder:TC.redBorder}`}}>{h.role==='user'?'U':'Z'}</div>
                  <span style={{fontSize:tny,fontWeight:700,letterSpacing:'0.5px',color:h.role==='user'?TC.cyan:TC.red}}>{h.role==='user'?'YOU':'GM AI'}</span>
                </div>
                <div style={{marginLeft:28,fontSize:bod,lineHeight:1.6,color:h.role==='user'?TC.textDim:TC.text}}>{h.content}</div>
                {h.commands&&h.commands.length>0&&<div className="flex flex-wrap gap-1 mt-1" style={{marginLeft:28}}>
                  {h.commands.map((cmd,j)=>{
                    const ok=cmd.status==='spawned'||cmd.status==='moved'||cmd.status==='behavior_set'
                    const col=ok?TC.green:TC.red
                    return<span key={j} style={{fontSize:tny,fontWeight:700,padding:'1px 6px',borderRadius:3,background:`${col}10`,color:col,border:`1px solid ${col}25`,fontFamily:'monospace'}}>
                      {ok?'+':'-'} {cmd.group_id||''} {cmd.status||'failed'}
                    </span>
                  })}
                </div>}
              </div>)}
              {aiThinking&&<div style={{marginLeft:28,display:'flex',alignItems:'center',gap:6}}>
                {[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:'50%',background:'rgba(113,113,122,0.3)',animation:'pulse 1.5s ease-in-out infinite',animationDelay:`${i*0.2}s`}}/>)}
                <span style={{fontSize:bod,color:TC.textMuted,fontStyle:'italic'}}>GM AI is thinking…{thinkSecs>1?` (${thinkSecs}s)`:''}</span>
              </div>}
              <div ref={chatEndRef}/>
            </div>
            {/* Input */}
            <div className="shrink-0 flex gap-2 p-3" style={{borderTop:`1px solid ${TC.borderDim}`,background:'rgba(24,24,27,0.3)'}}>
              <input value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sendChat()} placeholder="Talk to the Game Master…" disabled={aiThinking} className="flex-1 rounded-lg px-4 py-2.5 font-mono" style={{background:'rgba(255,255,255,0.03)',border:`1px solid ${TC.borderDim}`,color:TC.text,fontSize:bod,outline:'none',opacity:aiThinking?0.4:1}}/>
              <button onClick={()=>sendChat()} disabled={aiThinking||!chatInput.trim()} className="px-4 rounded-lg font-bold uppercase" style={{fontSize:sml,letterSpacing:'0.5px',background:TC.cyanDim,color:TC.cyan,border:`1px solid ${TC.cyanBorder}`,cursor:'pointer',opacity:(aiThinking||!chatInput.trim())?0.3:1}}>SEND</button>
            </div>
          </div>}

          {/* Decisions tab */}
          {chatTab==='decisions'&&<div className="flex-1 overflow-y-auto min-h-0">
            {(!decisions||decisions.length===0)
              ?<div className="text-center py-12" style={{color:TC.textMuted,fontSize:sz.base}}>No decisions yet — trigger the AI or wait for the heartbeat</div>
              :(decisions||[]).slice().reverse().map((d,i)=>{
                const isOpen=expandedDecision===i
                const dTs=d.timestamp?new Date(d.timestamp).getTime():null
                const relatedCmds=dTs?cmdLog.filter(c=>{const cTs=c.timestamp?new Date(c.timestamp).getTime():null;return cTs&&Math.abs(cTs-dTs)<15000}):[]
                return(
                  <div key={i} style={{borderBottom:`1px solid ${TC.borderDim}`}}>
                    <button className="w-full text-left" onClick={()=>setExpandedDecision(isOpen?null:i)} style={{padding:'10px 12px',background:'none',border:'none',cursor:'pointer',display:'block',width:'100%'}}>
                      <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4,flexWrap:'wrap'}}>
                        <span style={{fontFamily:'monospace',fontWeight:700,color:TC.cyan,fontSize:sz.stat}}>{d.timestamp?new Date(d.timestamp).toLocaleTimeString():''}</span>
                        {d.trigger&&<span style={{padding:'1px 5px',borderRadius:3,fontSize:sz.label-1,fontWeight:700,background:TC.cyanDim,color:TC.cyan,border:`1px solid ${TC.cyanBorder}`,textTransform:'uppercase'}}>{d.trigger}</span>}
                        {d.commands_issued>0&&<span style={{color:TC.textMuted,fontSize:sz.stat}}>{d.commands_issued} cmd{d.commands_issued!==1?'s':''}</span>}
                        {d.latency_ms>0&&<span style={{color:TC.textMuted,fontSize:sz.stat}}>{Math.round(d.latency_ms)}ms</span>}
                        <span style={{marginLeft:'auto',color:TC.textMuted,fontSize:sz.label}}>{isOpen?'▲':'▼'}</span>
                      </div>
                      {d.summary&&<div style={{color:TC.textDim,fontSize:sz.base,lineHeight:1.5,textAlign:'left'}}>{d.summary}</div>}
                    </button>
                    {isOpen&&<div style={{padding:'0 12px 10px',background:'rgba(0,0,0,0.2)'}}>
                      {relatedCmds.length>0?(
                        <div>
                          <div style={{fontSize:sz.label-1,fontWeight:700,letterSpacing:'1px',color:TC.textMuted,textTransform:'uppercase',marginBottom:6}}>Commands Issued</div>
                          <div className="space-y-1">
                            {relatedCmds.map((cmd,j)=>{
                              const isSpawn=cmd.type==='SPAWN';const isDel=cmd.type?.startsWith('DELETE');const isBcast=cmd.type==='BROADCAST'
                              const isWx=cmd.type==='SET_WEATHER'||cmd.type==='SET_TIME'
                              const isFp=cmd.type==='FIRE_SUPPORT'||cmd.type==='ARTILLERY'||cmd.type==='SUPPRESS'
                              const isTac=cmd.type==='SMOKE'||cmd.type==='SCOUT'||cmd.type==='SET_FORMATION'||cmd.type==='SET_SKILL'||cmd.type==='MARKER'
                              const col=isSpawn?TC.green:isDel?TC.red:isBcast?TC.purple:isWx?TC.blue:isFp?TC.red:isTac?(TC.amber||'#f59e0b'):TC.cyan
                              return(<div key={j} style={{display:'flex',gap:8,padding:'5px 8px',background:TC.surface,borderRadius:6,border:`1px solid ${TC.borderDim}`}}>
                                <span style={{fontSize:sz.label-1,fontWeight:700,padding:'2px 5px',borderRadius:3,background:`${col}15`,color:col,border:`1px solid ${col}25`,whiteSpace:'nowrap',alignSelf:'flex-start'}}>{cmd.type}</span>
                                <div style={{flex:1,minWidth:0}}>
                                  {isBcast
                                    ?<div style={{fontSize:sz.stat,color:'rgba(228,228,231,0.8)',fontStyle:'italic'}}>"{cmd.message||'—'}"</div>
                                    :<><div style={{fontFamily:'monospace',fontSize:sz.stat,color:'rgba(228,228,231,0.8)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{cmd.units||'—'} {cmd.count>0?`×${cmd.count}`:''} {cmd.grid&&cmd.grid!=='000-000'?`@ ${cmd.grid}`:''}{isWx&&(cmd.type==='SET_TIME'?` ${String(Math.floor(cmd.hour||0)).padStart(2,'0')}:${String(cmd.minute||0).padStart(2,'0')}`:` ${cmd.weather||''}`)}</div>
                                    {(cmd.behavior||cmd.reasoning)&&<div style={{fontFamily:'monospace',fontSize:sz.label,color:TC.textMuted,marginTop:2}}>{cmd.behavior&&`[${cmd.behavior}]`}{cmd.reasoning&&<span style={{fontStyle:'italic'}}> {cmd.reasoning.slice(0,80)}</span>}</div>}</>
                                  }
                                </div>
                              </div>)
                            })}
                          </div>
                        </div>
                      ):(
                        <div style={{fontSize:sz.stat,color:TC.textMuted,fontStyle:'italic'}}>
                          {d.commands_issued>0?'Commands not in recent log window':'No commands issued this decision'}
                        </div>
                      )}
                    </div>}
                  </div>
                )
              })
            }
          </div>}

          {/* Commands tab */}
          {chatTab==='commands'&&<div className="flex-1 overflow-y-auto p-3 min-h-0 space-y-1">
            {cmdLog.length===0&&<div className="text-center py-12" style={{color:TC.textMuted,fontSize:bod}}>No commands executed yet</div>}
            {[...cmdLog].reverse().slice(0,150).map((cmd,i)=>{
              const isBroadcast=cmd.type==='BROADCAST'
              const isDelete=cmd.type==='DELETE_ALL'||cmd.type==='DELETE'
              const isSpawn=cmd.type==='SPAWN'
              const isWeather=cmd.type==='SET_WEATHER'||cmd.type==='SET_TIME'
              const isFirePwr=cmd.type==='FIRE_SUPPORT'||cmd.type==='ARTILLERY'||cmd.type==='SUPPRESS'
              const isTactics=cmd.type==='SMOKE'||cmd.type==='SCOUT'||cmd.type==='SET_FORMATION'||cmd.type==='SET_SKILL'||cmd.type==='MARKER'
              const tagBg=isSpawn?TC.greenDim:isDelete?TC.redDim:isBroadcast?TC.purpleDim:isWeather?`${TC.blue}15`:isFirePwr?`${TC.red}15`:isTactics?`${TC.amber||'#f59e0b'}15`:TC.cyanDim
              const tagCol=isSpawn?TC.green:isDelete?TC.red:isBroadcast?TC.purple:isWeather?TC.blue:isFirePwr?TC.red:isTactics?(TC.amber||'#f59e0b'):TC.cyan
              const tagBorder=isSpawn?TC.greenBorder:isDelete?TC.redBorder:isBroadcast?TC.purpleBorder:isWeather?`${TC.blue}40`:isFirePwr?`${TC.red}40`:isTactics?`${TC.amber||'#f59e0b'}40`:TC.cyanBorder
              const cmdDetail=isWeather?(cmd.type==='SET_TIME'?`${String(Math.floor(cmd.hour||0)).padStart(2,'0')}:${String(cmd.minute||0).padStart(2,'0')}`:`${cmd.weather||''} ${cmd.intensity!=null?`i=${cmd.intensity}`:''}`.trim()):isFirePwr?(cmd.type==='SUPPRESS'?`${cmd.units||'—'} on ${cmd.grid||'—'} ${cmd.duration_seconds?`for ${cmd.duration_seconds}s`:''}`:cmd.type==='ARTILLERY'?`${cmd.units||'—'} ${cmd.rounds||''}x ${cmd.shell_type||''} on ${cmd.grid||'—'}`:cmd.type==='FIRE_SUPPORT'?`${cmd.rounds||''}x ${cmd.weapon_type||''} on ${cmd.grid||'—'}`:null):isTactics?(cmd.type==='MARKER'?`${cmd.label||''} at ${cmd.grid||'—'}`:cmd.type==='SMOKE'?`${cmd.units||'—'} at ${cmd.grid||'—'}`:cmd.type==='SET_FORMATION'?`${cmd.units||'—'} → ${cmd.formation||''}`:cmd.type==='SET_SKILL'?`${cmd.units||'—'} skill=${cmd.skill!=null?cmd.skill:''}`:cmd.type==='SCOUT'?`${cmd.units||'—'} observing ${cmd.grid||'—'}`:null):null
              return(<div key={i} className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg" style={{background:TC.surface,border:`1px solid ${TC.borderDim}`}}>
                <span className="shrink-0 px-1.5 py-0.5 rounded font-bold" style={{fontSize:tny,letterSpacing:'0.5px',background:tagBg,color:tagCol,border:`1px solid ${tagBorder}`}}>{cmd.type}</span>
                <div className="min-w-0 flex-1">
                  {isBroadcast
                    ?<div style={{fontSize:sml,color:'rgba(228,228,231,0.8)',fontStyle:'italic'}}>"{cmd.message||'—'}"</div>
                    :<><div className="font-mono truncate" style={{fontSize:sml,color:'rgba(228,228,231,0.8)'}}>{cmdDetail||<>{cmd.units||'—'} <span style={{color:TC.textMuted}}>{cmd.count>0?`x${cmd.count} `:''}{cmd.grid&&cmd.grid!=='000-000'?`@ ${cmd.grid}`:''}</span></>}</div>
                    <div className="font-mono" style={{fontSize:tny,color:TC.textMuted}}>{cmd.behavior&&`[${cmd.behavior}]`}{cmd.reasoning&&<span style={{fontStyle:'italic'}}> {cmd.reasoning.slice(0,60)}</span>}</div></>}
                </div>
              </div>)
            })}
          </div>}

          {/* Broadcasts tab */}
          {chatTab==='broadcasts'&&<div className="flex-1 overflow-y-auto min-h-0">
  {(!(gm.broadcast_log)||gm.broadcast_log.length===0)
    ?<div className="text-center py-12" style={{color:TC.textMuted,fontSize:sz.base}}>No broadcasts yet — start an operation</div>
    :(gm.broadcast_log||[]).slice().reverse().map((b,i)=>{
      const visColor=b.visibility==='guided'?TC.green:b.visibility==='command'?TC.yellow:TC.textMuted
      return(
        <div key={i} style={{padding:'8px 12px',borderBottom:`1px solid ${TC.borderDim}`}}>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono font-bold" style={{color:visColor,fontSize:tny,padding:'1px 5px',borderRadius:3,background:`${visColor}10`,border:`1px solid ${visColor}30`}}>{(b.visibility||'guided').toUpperCase()}</span>
            {b.type&&<span style={{color:TC.textMuted,fontSize:tny,fontWeight:700}}>{b.type}</span>}
            <span className="ml-auto font-mono" style={{color:TC.textMuted,fontSize:tny}}>{b.timestamp?new Date(b.timestamp).toLocaleTimeString():''}</span>
          </div>
          <div style={{color:TC.text,fontSize:sz.base,lineHeight:1.5}}>{b.message}</div>
        </div>
      )
    })
  }
</div>}

          {/* Bridge Logs tab */}
          {chatTab==='logs'&&<div className="flex-1 overflow-y-auto min-h-0">
            {serverLogs.length===0&&<div className="text-center py-12" style={{color:TC.textMuted,fontSize:bod}}>Waiting for bridge logs…</div>}
            {serverLogs.slice(-500).map((l,i)=><div key={i} className="px-3 py-1 font-mono" style={{fontSize:sml,lineHeight:1.4,borderBottom:`1px solid rgba(255,255,255,0.03)`,wordBreak:'break-all'}}>
              <span style={{color:'rgba(113,113,122,0.5)',marginRight:8}}>{l.time}</span>
              <span style={{fontWeight:700,marginRight:8,color:l.level==='ERROR'?TC.red:l.level==='WARNING'?TC.yellow:l.level==='DEBUG'?TC.textMuted:TC.cyan}}>{l.level}</span>
              <span style={{color:TC.textDim}}>{l.msg}</span>
            </div>)}
            <div ref={logsEndRef}/>
          </div>}

          {/* Console tab */}
          {chatTab==='console'&&<div className="flex-1 overflow-y-auto min-h-0">
            {consoleLogs.length===0
              ?<div className="flex flex-col items-center justify-center py-12 px-6 text-center gap-3">
                <div style={{fontSize:sz.base,fontWeight:700,color:TC.textMuted}}>No game console output</div>
                <div style={{fontSize:sz.stat,color:TC.textMuted,lineHeight:1.6,maxWidth:280}}>
                  The bridge captures game server console logs when configured to forward them.
                  Check that the bridge has console log forwarding enabled and is connected to the server.
                </div>
                <div className="rounded-lg px-3 py-2 font-mono" style={{background:TC.surface,border:`1px solid ${TC.borderDim}`,fontSize:sz.code,color:TC.textMuted}}>
                  bridge console_logs → empty
                </div>
              </div>
              :consoleLogs.slice(-400).map((l,i)=><div key={i} className="px-3 py-1 font-mono" style={{fontSize:sz.code,lineHeight:1.4,borderBottom:`1px solid rgba(255,255,255,0.03)`,wordBreak:'break-all'}}>
                <span style={{color:'rgba(113,113,122,0.5)',marginRight:8}}>{l.time||l.timestamp}</span>
                <span style={{fontWeight:700,marginRight:8,color:l.level==='ERROR'?TC.red:l.level==='WARNING'?TC.yellow:l.source==='game'?TC.green:TC.textMuted}}>{l.source==='game'?'GAME':l.level}</span>
                <span style={{color:TC.textDim}}>{l.msg||l.message||JSON.stringify(l)}</span>
              </div>)
            }
            <div ref={consoleEndRef}/>
          </div>}
        </div>
      </div>}

      {/* ── OPORD EDITOR ─── */}
      {tab==='opord'&&<div className="flex-1 overflow-auto p-6" style={{background:TC.bg}}>
  <div style={{maxWidth:720}}>
    <div className="flex items-center gap-3 mb-4">
      <div className="font-black" style={{color:TC.cyan,fontSize:sz.base+4}}>OPORD Editor</div>
      <span style={{color:TC.textMuted,fontSize:tny,padding:'2px 8px',border:`1px solid ${TC.borderDim}`,borderRadius:4}}>SMEAC FORMAT</span>
      <div className="flex-1"/>
      <button onClick={saveOpord} disabled={opordSaving} className="px-3 py-1.5 rounded-md font-semibold" style={{fontSize:sml,border:`1px solid ${TC.cyanBorder}`,background:TC.cyanDim,color:TC.cyan}}>{opordSaving?'Saving…':'Save OPORD'}</button>
      <button onClick={parseOpord} disabled={opordParsing} className="px-3 py-1.5 rounded-md font-semibold" style={{fontSize:sml,border:`1px solid ${TC.yellowBorder}`,background:TC.yellowDim,color:TC.yellow}}>{opordParsing?'Parsing…':'Parse Preview'}</button>
      {opordPreview&&<button onClick={loadOpord} className="px-3 py-1.5 rounded-md font-semibold" style={{fontSize:sml,border:`1px solid ${TC.greenBorder}`,background:TC.greenDim,color:TC.green}}>Load to AI GM</button>}
    </div>

    {/* Para 1: Situation */}
    <OpordSection title="1. SITUATION">
      <OpordField label="Enemy Forces" value={opord.situation.enemy} rows={3} onChange={v=>setOpord(p=>({...p,situation:{...p.situation,enemy:v}}))} placeholder="Composition, disposition, strength, activity..."/>
      <OpordField label="Friendly Forces" value={opord.situation.friendly} rows={2} onChange={v=>setOpord(p=>({...p,situation:{...p.situation,friendly:v}}))} placeholder="Higher mission, adjacent units..."/>
      <OpordField label="Terrain" value={opord.situation.terrain} rows={2} onChange={v=>setOpord(p=>({...p,situation:{...p.situation,terrain:v}}))} placeholder="Key features, avenues of approach..."/>
      <div className="grid grid-cols-2 gap-3">
        <OpordField label="Weather" value={opord.situation.weather} rows={2} onChange={v=>setOpord(p=>({...p,situation:{...p.situation,weather:v}}))} placeholder="Visibility, lighting..."/>
        <OpordField label="Civil Considerations" value={opord.situation.civil} rows={2} onChange={v=>setOpord(p=>({...p,situation:{...p.situation,civil:v}}))} placeholder="Civilian presence, ROE..."/>
      </div>
    </OpordSection>

    {/* Para 2: Mission */}
    <OpordSection title="2. MISSION">
      <OpordField label="Mission Statement" value={opord.mission.statement} rows={2} onChange={v=>setOpord(p=>({...p,mission:{...p.mission,statement:v}}))} placeholder="Who, what, when, where, why (one sentence)..."/>
      <OpordField label="Commander's Intent" value={opord.mission.intent} rows={3} onChange={v=>setOpord(p=>({...p,mission:{...p.mission,intent:v}}))} placeholder="Desired end state..."/>
    </OpordSection>

    {/* Para 3: Execution */}
    <OpordSection title="3. EXECUTION">
      <OpordField label="Concept of Operations" value={opord.execution.concept} rows={3} onChange={v=>setOpord(p=>({...p,execution:{...p.execution,concept:v}}))} placeholder="Overall scheme of maneuver..."/>

      {/* Phase builder */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-2">
          <label style={{fontSize:sml,fontWeight:700,color:TC.textDim}}>Phases</label>
          <button onClick={()=>setOpord(p=>({...p,execution:{...p.execution,phases:[...p.execution.phases,{name:'',trigger:'operation_start',tasks:'',duration:'10',end_condition:'time_elapsed',escalation:'',broadcasts:''}]}}))} className="px-2 py-1 rounded font-semibold" style={{fontSize:tny,border:`1px solid ${TC.cyanBorder}`,background:TC.cyanDim,color:TC.cyan}}>+ Add Phase</button>
        </div>
        {opord.execution.phases.length===0&&<div className="py-4 text-center rounded-lg" style={{border:`1px dashed ${TC.borderDim}`,color:TC.textMuted,fontSize:sml}}>No phases — add at least one</div>}
        {opord.execution.phases.map((ph,i)=>(
          <div key={i} className="rounded-lg p-3 mb-2" style={{background:TC.surface,border:`1px solid ${TC.borderDim}`}}>
            <div className="flex items-center gap-2 mb-2">
              <div className="font-bold" style={{color:TC.cyan,fontSize:tny,padding:'1px 6px',borderRadius:3,background:TC.cyanDim}}>PHASE {i+1}</div>
              <input value={ph.name} onChange={e=>{const ps=[...opord.execution.phases];ps[i]={...ps[i],name:e.target.value};setOpord(p=>({...p,execution:{...p.execution,phases:ps}}))}} placeholder="Phase name (e.g. Recon Screen)" className="flex-1 rounded px-2 py-1 font-mono" style={{background:TC.bg,border:`1px solid ${TC.borderDim}`,color:TC.text,fontSize:sml,outline:'none'}}/>
              <button onClick={()=>setOpord(p=>({...p,execution:{...p.execution,phases:p.execution.phases.filter((_,j)=>j!==i)}}))} style={{background:'none',border:'none',color:TC.red,cursor:'pointer',fontSize:16,padding:'0 4px'}} title="Remove phase">x</button>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <label style={{fontSize:tny,color:TC.textMuted,display:'block',marginBottom:2}}>Trigger to start</label>
                <select value={ph.trigger} onChange={e=>{const ps=[...opord.execution.phases];ps[i]={...ps[i],trigger:e.target.value};setOpord(p=>({...p,execution:{...p.execution,phases:ps}}))}} className="w-full rounded px-2 py-1" style={{background:TC.bg,border:`1px solid ${TC.borderDim}`,color:TC.text,fontSize:sml,outline:'none'}}>
                  <option value="operation_start">Operation start</option>
                  <option value="phase_complete">Previous phase complete</option>
                  <option value="time_HHmm">Fixed time (HH:mm)</option>
                  <option value="code_word">Code word</option>
                </select>
              </div>
              <div>
                <label style={{fontSize:tny,color:TC.textMuted,display:'block',marginBottom:2}}>Duration (minutes)</label>
                <input type="number" value={ph.duration} min={1} max={120} onChange={e=>{const ps=[...opord.execution.phases];ps[i]={...ps[i],duration:e.target.value};setOpord(p=>({...p,execution:{...p.execution,phases:ps}}))}} className="w-full rounded px-2 py-1 font-mono text-center" style={{background:TC.bg,border:`1px solid ${TC.borderDim}`,color:TC.text,fontSize:sml,outline:'none'}}/>
              </div>
            </div>
            <div>
              <label style={{fontSize:tny,color:TC.textMuted,display:'block',marginBottom:2}}>AI Tasks (natural language — e.g. "2x infantry patrol, 1x sniper team on high ground")</label>
              <textarea rows={2} value={ph.tasks} onChange={e=>{const ps=[...opord.execution.phases];ps[i]={...ps[i],tasks:e.target.value};setOpord(p=>({...p,execution:{...p.execution,phases:ps}}))}} className="w-full rounded px-2 py-1.5 font-mono resize-none outline-none" style={{background:TC.bg,border:`1px solid ${TC.borderDim}`,color:TC.text,fontSize:sml}}/>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <OpordField label="ROE" value={opord.execution.roe} rows={2} onChange={v=>setOpord(p=>({...p,execution:{...p.execution,roe:v}}))} placeholder="Rules of engagement..."/>
        <OpordField label="No-Fire Areas" value={opord.execution.no_fire_areas} rows={2} onChange={v=>setOpord(p=>({...p,execution:{...p.execution,no_fire_areas:v}}))} placeholder="Grid squares or named areas..."/>
      </div>
    </OpordSection>

    {/* Para 4: Admin & Logistics */}
    <OpordSection title="4. ADMIN & LOGISTICS">
      <div className="grid grid-cols-2 gap-3">
        <OpordField label="Resupply Grid" value={opord.admin.resupply} rows={2} onChange={v=>setOpord(p=>({...p,admin:{...p.admin,resupply:v}}))} placeholder="Grid and conditions..."/>
        <OpordField label="Casualty Collection Point" value={opord.admin.casualty_point} rows={2} onChange={v=>setOpord(p=>({...p,admin:{...p.admin,casualty_point:v}}))} placeholder="Grid..."/>
      </div>
      <OpordField label="QRF / Reinforcement Pool" value={opord.admin.qrf_grid} rows={2} onChange={v=>setOpord(p=>({...p,admin:{...p.admin,qrf_grid:v}}))} placeholder="Units staged for QRF, grid, commit condition..."/>
    </OpordSection>

    {/* Para 5: Command & Signal */}
    <OpordSection title="5. COMMAND & SIGNAL">
      <OpordField label="Chain of Command" value={opord.command.chain} rows={2} onChange={v=>setOpord(p=>({...p,command:{...p.command,chain:v}}))} placeholder="Who controls what..."/>
      <OpordField label="Code Words (one per line, format: WORD=effect)" value={opord.command.code_words} rows={3} onChange={v=>setOpord(p=>({...p,command:{...p.command,code_words:v}}))} placeholder="CHECKMATE=operation_complete&#10;WILDFIRE=abort_extract"/>
      <OpordField label="Phase Lines (e.g. ALPHA=grid 450, BRAVO=grid 480)" value={opord.command.phase_lines} rows={2} onChange={v=>setOpord(p=>({...p,command:{...p.command,phase_lines:v}}))} placeholder="Named spatial triggers..."/>
    </OpordSection>

    {/* Parse preview */}
    {opordParsing&&<div className="mt-4 p-4 rounded-lg text-center" style={{border:`1px dashed ${TC.yellowBorder}`,color:TC.yellow,fontSize:sml}}>AI parsing OPORD into operation JSON… (may take 10-20s)</div>}
    {opordPreview&&<div className="mt-4">
      <div className="flex items-center gap-2 mb-2">
        <div style={{fontSize:tny,fontWeight:700,letterSpacing:'1.5px',color:TC.textMuted,textTransform:'uppercase'}}>Parse Preview</div>
        <span className="px-2 py-0.5 rounded font-bold" style={{fontSize:tny,background:TC.greenDim,color:TC.green,border:`1px solid ${TC.greenBorder}`}}>READY TO LOAD</span>
      </div>
      <pre className="rounded-lg p-3 overflow-auto" style={{background:TC.surface,border:`1px solid ${TC.borderDim}`,color:TC.textDim,fontSize:sz.code,maxHeight:300}}>{JSON.stringify(opordPreview,null,2)}</pre>
      <button onClick={loadOpord} className="mt-3 w-full py-2.5 rounded-md font-bold uppercase tracking-wide" style={{fontSize:sml,border:`1px solid ${TC.greenBorder}`,background:TC.greenDim,color:TC.green}}>Load to AI GM — Begin Operation</button>
    </div>}
  </div>
</div>}

      {/* ── SESSION CONFIG ─── */}
      {tab==='config'&&<div className="flex-1 overflow-auto p-6" style={{background:TC.bg}}>
        {scfgLoading&&<div style={{color:TC.textDim,fontSize:sz.base}}>Loading...</div>}
        {!scfgLoading&&!scfg&&<div style={{color:TC.textMuted,fontSize:sz.base}}>Could not load session config.</div>}
        {scfg&&<div style={{maxWidth:560}}>
          <div className="mb-4" style={{fontSize:tny,fontWeight:700,letterSpacing:'1.5px',color:TC.textMuted,textTransform:'uppercase'}}>Session Configuration</div>
          <div className="space-y-4">
            {/* Broadcast Mode */}
            <div>
              <label className="block mb-1" style={{fontSize:sml,fontWeight:700,color:TC.textDim}}>Default Broadcast Mode</label>
              <div className="grid grid-cols-3 gap-1.5">
                {[['guided','Guided — all players'],['command','Command — admins only'],['silent','Silent — panel only']].map(([m,l])=>(
                  <button key={m} onClick={()=>saveBroadcastMode(m)} className="py-2 rounded-md font-semibold" style={{fontSize:tny,border:'1px solid',background:broadcastMode===m?TC.cyanDim:'rgba(255,255,255,0.03)',color:broadcastMode===m?TC.cyan:TC.textDim,borderColor:broadcastMode===m?TC.cyanBorder:TC.borderDim}}>{l}</button>
                ))}
              </div>
              <div className="mt-1" style={{fontSize:tny,color:TC.textMuted}}>Guided: broadcasts appear in-game chat for all players. Command: admins/owners only. Silent: GM panel log only.</div>
            </div>

            {/* Heartbeat interval */}
            <div>
              <label className="block mb-1" style={{fontSize:sml,fontWeight:700,color:TC.textDim}}>Heartbeat Interval (seconds)</label>
              <select className="w-full rounded-md px-3 py-2 outline-none" style={{background:TC.surface,border:`1px solid ${TC.borderDim}`,color:TC.text,fontSize:bod}} value={scfg?.heartbeat_interval||30} onChange={e=>setScfg(p=>({...p,heartbeat_interval:parseInt(e.target.value)}))}>
                {[15,30,45,60,90,120].map(v=><option key={v} value={v}>{v}s{v===30?' (default)':''}</option>)}
              </select>
            </div>

            {/* AI Instructions */}
            <div>
              <label className="block mb-1" style={{fontSize:sml,fontWeight:700,color:TC.textDim}}>AI Instructions (one per line)</label>
              <textarea rows={5} value={(scfg?.ai_instructions||[]).join('\n')} onChange={e=>setScfg(p=>({...p,ai_instructions:e.target.value.split('\n').map(s=>s.trim()).filter(Boolean)}))} className="w-full rounded-md px-3 py-2 font-mono outline-none resize-none" style={{background:TC.surface,border:`1px solid ${TC.borderDim}`,color:TC.text,fontSize:bod}} placeholder="e.g. Prioritize flanking maneuvers&#10;Avoid civilian areas..."/>
            </div>
            <Btn onClick={saveScfg}>Save Session Config</Btn>
          </div>
        </div>}
      </div>}

      {tab==='config'&&modelCfg&&<div className="flex-1 overflow-auto px-6 pb-6" style={{background:TC.bg}}>
        <div style={{maxWidth:560}}>
          <div className="mb-4 mt-2" style={{fontSize:tny,fontWeight:700,letterSpacing:'1.5px',color:TC.textMuted,textTransform:'uppercase'}}>Model Configuration</div>
          <div className="space-y-4">
            <div><label className="block mb-1" style={{fontSize:sml,fontWeight:700,color:TC.textDim}}>Model</label>
              {availableModels.length>0
                ?<select className="w-full rounded-md px-3 py-2 font-mono outline-none" style={{background:TC.surface,border:`1px solid ${TC.borderDim}`,color:TC.text,fontSize:bod}} value={modelCfg.model||''} onChange={e=>saveModelCfg({model:e.target.value})}>
                  {availableModels.map(m=><option key={m} value={m}>{m}</option>)}
                  {!availableModels.includes(modelCfg.model||'')&&modelCfg.model&&<option value={modelCfg.model}>{modelCfg.model} (current)</option>}
                </select>
                :<input className="w-full rounded-md px-3 py-2 font-mono outline-none" style={{background:TC.surface,border:`1px solid ${TC.borderDim}`,color:TC.text,fontSize:bod}} value={modelCfg.model||''} onChange={e=>setModelCfg(p=>({...p,model:e.target.value}))} onBlur={()=>saveModelCfg({model:modelCfg.model})} placeholder="e.g. qwen3:8b"/>}
              <div className="mt-1" style={{fontSize:tny,color:TC.textMuted}}>Backend: {modelCfg.backend_mode} &nbsp;|&nbsp; KV Cache: {modelCfg.kv_cache_type} (set via OLLAMA_KV_CACHE_TYPE env){availableModels.length>0&&` — ${availableModels.length} model${availableModels.length!==1?'s':''} installed`}</div>
            </div>
            <div><label className="block mb-1" style={{fontSize:sml,fontWeight:700,color:TC.textDim}}>Context Window</label>
              <select className="w-full rounded-md px-3 py-2 outline-none" style={{background:TC.surface,border:`1px solid ${TC.borderDim}`,color:TC.text,fontSize:bod}} value={modelCfg.num_ctx||32768} onChange={e=>saveModelCfg({num_ctx:parseInt(e.target.value)})}>
                {[4096,8192,16384,32768,65536].map(v=><option key={v} value={v}>{Math.round(v/1024)}K tokens{v===32768?' (recommended)':''}</option>)}
              </select>
            </div>
            <div><label className="block mb-1" style={{fontSize:sml,fontWeight:700,color:TC.textDim}}>Thinking Mode</label>
              <select className="w-full rounded-md px-3 py-2 outline-none" style={{background:TC.surface,border:`1px solid ${TC.borderDim}`,color:TC.text,fontSize:bod}} value={modelCfg.think_mode||'auto'} onChange={e=>saveModelCfg({think_mode:e.target.value})}>
                <option value="auto">Auto (think on complex queries)</option>
                <option value="on">Always think (slower, smarter)</option>
                <option value="off">Off (fastest)</option>
              </select>
            </div>
            <div><label className="block mb-1" style={{fontSize:sml,fontWeight:700,color:TC.textDim}}>Max Output Tokens</label>
              <input type="number" className="w-full rounded-md px-3 py-2 font-mono outline-none" style={{background:TC.surface,border:`1px solid ${TC.borderDim}`,color:TC.text,fontSize:bod}} value={modelCfg.max_tokens||1024} min={512} max={8192} step={512} onChange={e=>setModelCfg(p=>({...p,max_tokens:parseInt(e.target.value)}))} onBlur={()=>saveModelCfg({max_tokens:modelCfg.max_tokens})}/>
            </div>
            {modelCfgSaving&&<div style={{fontSize:tny,color:TC.textMuted}}>Saving…</div>}
          </div>
        </div>
      </div>}

      {/* ── AFTER ACTION ─── */}
      {tab==='aar'&&<div className="flex-1 overflow-auto p-6" style={{background:TC.bg}}>
        <div style={{maxWidth:720}}>
          <div className="font-black mb-4" style={{color:TC.cyan,fontSize:sz.base+4}}>After Action Review</div>

          {(!gm.aar||(!gm.aar.phase_results?.length&&!gm.aar.event_log?.length))&&(
            <div className="py-16 text-center rounded-lg" style={{border:`1px dashed ${TC.borderDim}`,color:TC.textMuted,fontSize:sz.base}}>
              No AAR data — complete an operation phase to see results here.
            </div>
          )}

          {/* Phase outcome scores */}
          {gm.aar?.phase_results?.length>0&&<div className="mb-6">
            <div style={{fontSize:tny,fontWeight:700,letterSpacing:'1.5px',color:TC.textMuted,textTransform:'uppercase',marginBottom:12}}>Phase Results</div>
            <div className="space-y-2">
              {gm.aar.phase_results.map((ph,i)=>{
                const outcomeColor=ph.outcome==='decisive'?TC.green:ph.outcome==='partial'?TC.yellow:TC.red
                return(
                  <div key={i} className="rounded-lg p-4" style={{background:TC.surface,border:`1px solid ${TC.borderDim}`}}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-mono font-bold" style={{color:TC.textMuted,fontSize:tny}}>PHASE {i+1}</span>
                      <span className="font-bold" style={{color:TC.text,fontSize:bod}}>{ph.phase||'Unknown'}</span>
                      {ph.outcome&&<span className="ml-auto font-bold" style={{fontSize:tny,padding:'2px 8px',borderRadius:3,background:`${outcomeColor}10`,color:outcomeColor,border:`1px solid ${outcomeColor}25`}}>{ph.outcome.toUpperCase()}</span>}
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        ['Forces Engaged',ph.forces_engaged??'—',TC.yellow],
                        ['Forces Wiped',ph.forces_wiped??'—',TC.red],
                        ['Player Casualties',ph.player_casualties??'—',TC.red],
                      ].map(([l,v,c])=>(
                        <div key={l} className="text-center rounded-lg py-2 px-3" style={{background:TC.surface2||TC.surface,border:`1px solid ${TC.borderDim}`}}>
                          <div className="font-mono font-bold" style={{color:c,fontSize:sz.base+4,lineHeight:1}}>{v}</div>
                          <div style={{fontSize:tny,color:TC.textMuted,marginTop:3,fontWeight:600,letterSpacing:'0.5px'}}>{l}</div>
                        </div>
                      ))}
                    </div>
                    {ph.advance_reason&&<div className="mt-2 font-mono" style={{color:TC.textMuted,fontSize:tny}}>Ended: {ph.advance_reason}</div>}
                  </div>
                )
              })}
            </div>
          </div>}

          {/* Event timeline */}
          {gm.aar?.event_log?.length>0&&<div>
            <div style={{fontSize:tny,fontWeight:700,letterSpacing:'1.5px',color:TC.textMuted,textTransform:'uppercase',marginBottom:12}}>Event Timeline</div>
            <div className="space-y-1">
              {[...(gm.aar.event_log||[])].reverse().map((ev,i)=>{
                const typeColors={spawn:TC.green,death:TC.red,broadcast:TC.purple,phase_advance:TC.cyan,escalation:TC.yellow,player_kill:TC.red}
                const col=typeColors[ev.type]||TC.textMuted
                return(
                  <div key={i} className="flex items-start gap-3 py-2 px-3 rounded-lg" style={{background:TC.surface,border:`1px solid ${TC.borderDim}`}}>
                    <span style={{fontSize:tny,fontWeight:700,padding:'2px 6px',borderRadius:3,background:`${col}10`,color:col,border:`1px solid ${col}25`,whiteSpace:'nowrap',marginTop:1}}>{(ev.type||'event').toUpperCase()}</span>
                    <div className="flex-1 min-w-0">
                      <div style={{fontSize:sz.base,color:TC.text,lineHeight:1.5}}>{ev.description||ev.message||JSON.stringify(ev)}</div>
                      {ev.grid&&<div className="font-mono" style={{fontSize:tny,color:TC.textMuted}}>@ {ev.grid}</div>}
                    </div>
                    {ev.session_time&&<span className="font-mono shrink-0" style={{fontSize:tny,color:TC.textMuted}}>{Math.floor(ev.session_time/60)}m{Math.floor(ev.session_time%60)}s</span>}
                  </div>
                )
              })}
            </div>
          </div>}
        </div>
      </div>}

    </div>
  )
}
