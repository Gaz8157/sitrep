import { useState, useEffect, useRef, useMemo, useCallback, createContext, useContext } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

const API = '/api'

const THEMES = {
  dark: { name:'Midnight', bg:'#06090d', bgCard:'#0c1219', bgInput:'#080d13', bgHover:'#111c28',
    border:'#1a2636', borderLight:'#243344', text:'#d0d8e4', textDim:'#8494a8', textMuted:'#506070',
    textBright:'#f0f4f8', accent:'#69f0ae', accentBg:'#69f0ae10', red:'#ff4757', redBg:'#ff475712',
    redBorder:'#ff475730', orange:'#ffa502', orangeBg:'#ffa50212', blue:'#3498ff', blueBg:'#3498ff12',
    purple:'#b388ff', purpleBg:'#b388ff12', cyan:'#4dd0e1', consoleBg:'#040608' },
  light: { name:'Daylight', bg:'#f0f2f5', bgCard:'#ffffff', bgInput:'#f5f6f8', bgHover:'#e8eaee',
    border:'#d0d4da', borderLight:'#e0e4e8', text:'#1a1a2e', textDim:'#505868', textMuted:'#8890a0',
    textBright:'#0a0a1a', accent:'#10b981', accentBg:'#10b98112', red:'#ef4444', redBg:'#ef444412',
    redBorder:'#ef444430', orange:'#f59e0b', orangeBg:'#f59e0b12', blue:'#3b82f6', blueBg:'#3b82f612',
    purple:'#8b5cf6', purpleBg:'#8b5cf612', cyan:'#06b6d4', consoleBg:'#f8f9fa' },
  military: { name:'Tactical', bg:'#0a0f08', bgCard:'#121c10', bgInput:'#0c1209', bgHover:'#162010',
    border:'#1e2e16', borderLight:'#283d1e', text:'#c0d0b0', textDim:'#7a8a68', textMuted:'#4a5a38',
    textBright:'#e8f0d8', accent:'#84cc16', accentBg:'#84cc1610', red:'#ef4444', redBg:'#ef444412',
    redBorder:'#ef444430', orange:'#eab308', orangeBg:'#eab30812', blue:'#22d3ee', blueBg:'#22d3ee12',
    purple:'#a78bfa', purpleBg:'#a78bfa12', cyan:'#22d3ee', consoleBg:'#060a04' },
  ember: { name:'Ember', bg:'#0d0808', bgCard:'#161010', bgInput:'#100c0c', bgHover:'#1e1414',
    border:'#2e1e1e', borderLight:'#3e2828', text:'#e0d0c8', textDim:'#9a8478', textMuted:'#6a5448',
    textBright:'#f8f0e8', accent:'#f97316', accentBg:'#f9731610', red:'#ef4444', redBg:'#ef444412',
    redBorder:'#ef444430', orange:'#f97316', orangeBg:'#f9731612', blue:'#38bdf8', blueBg:'#38bdf812',
    purple:'#c084fc', purpleBg:'#c084fc12', cyan:'#2dd4bf', consoleBg:'#080404' },
  ocean: { name:'Ocean', bg:'#030d18', bgCard:'#051628', bgInput:'#040e1e', bgHover:'#082034',
    border:'#0c2840', borderLight:'#103455', text:'#a8c8e0', textDim:'#5888a8', textMuted:'#305060',
    textBright:'#d0e8f8', accent:'#00b4d8', accentBg:'#00b4d810', red:'#ef4444', redBg:'#ef444412',
    redBorder:'#ef444430', orange:'#f59e0b', orangeBg:'#f59e0b12', blue:'#38bdf8', blueBg:'#38bdf812',
    purple:'#818cf8', purpleBg:'#818cf812', cyan:'#06b6d4', consoleBg:'#02090f' },
  nord: { name:'Nord', bg:'#1a1e2e', bgCard:'#222639', bgInput:'#1c2032', bgHover:'#282d42',
    border:'#333a55', borderLight:'#3d4568', text:'#cdd6f4', textDim:'#a6adc8', textMuted:'#6c7086',
    textBright:'#e6e9f5', accent:'#89b4fa', accentBg:'#89b4fa10', red:'#f38ba8', redBg:'#f38ba812',
    redBorder:'#f38ba830', orange:'#fab387', orangeBg:'#fab38712', blue:'#89dceb', blueBg:'#89dceb12',
    purple:'#cba6f7', purpleBg:'#cba6f712', cyan:'#89dceb', consoleBg:'#141827' },
  cyberpunk: { name:'Cyberpunk', bg:'#090010', bgCard:'#0f0018', bgInput:'#0b0014', bgHover:'#160028',
    border:'#240042', borderLight:'#340060', text:'#e8d0ff', textDim:'#9860c8', textMuted:'#583878',
    textBright:'#f8f0ff', accent:'#e040fb', accentBg:'#e040fb10', red:'#ff2060', redBg:'#ff206012',
    redBorder:'#ff206030', orange:'#ffea00', orangeBg:'#ffea0012', blue:'#00e5ff', blueBg:'#00e5ff12',
    purple:'#b000ff', purpleBg:'#b000ff12', cyan:'#00e5ff', consoleBg:'#050008' },
  rose: { name:'Rose', bg:'#0d0508', bgCard:'#180a10', bgInput:'#110608', bgHover:'#200e18',
    border:'#301525', borderLight:'#402030', text:'#f0d0d8', textDim:'#b08090', textMuted:'#705060',
    textBright:'#fce8f0', accent:'#f472b6', accentBg:'#f472b610', red:'#fb7185', redBg:'#fb718512',
    redBorder:'#fb718530', orange:'#fbbf24', orangeBg:'#fbbf2412', blue:'#60a5fa', blueBg:'#60a5fa12',
    purple:'#e879f9', purpleBg:'#e879f912', cyan:'#f0abfc', consoleBg:'#080304' },
  slate: { name:'Slate', bg:'#0a0c10', bgCard:'#111318', bgInput:'#0d0f14', bgHover:'#181c24',
    border:'#22262e', borderLight:'#2a3040', text:'#c0c8d8', textDim:'#788090', textMuted:'#485060',
    textBright:'#e0e4f0', accent:'#60a5fa', accentBg:'#60a5fa10', red:'#f87171', redBg:'#f8717112',
    redBorder:'#f8717130', orange:'#fbbf24', orangeBg:'#fbbf2412', blue:'#93c5fd', blueBg:'#93c5fd12',
    purple:'#a78bfa', purpleBg:'#a78bfa12', cyan:'#7dd3fc', consoleBg:'#060709' },
  solarized: { name:'Solarized', bg:'#001820', bgCard:'#002030', bgInput:'#001c28', bgHover:'#002a3c',
    border:'#003848', borderLight:'#004858', text:'#839496', textDim:'#586e75', textMuted:'#405860',
    textBright:'#fdf6e3', accent:'#2aa198', accentBg:'#2aa19810', red:'#dc322f', redBg:'#dc322f12',
    redBorder:'#dc322f30', orange:'#cb4b16', orangeBg:'#cb4b1612', blue:'#268bd2', blueBg:'#268bd212',
    purple:'#6c71c4', purpleBg:'#6c71c412', cyan:'#2aa198', consoleBg:'#001018' },
  zinc: { name:'Zinc', bg:'#0f0f12', bgCard:'#1a1a1e', bgInput:'#131316', bgHover:'#202026',
    border:'#2c2c34', borderLight:'#383840', text:'#ededef', textDim:'#a8a8b4', textMuted:'#64646e',
    textBright:'#f8f8fa', accent:'#4d9fff', accentBg:'#4d9fff10', red:'#f87171', redBg:'#f8717112',
    redBorder:'#f8717130', orange:'#fb923c', orangeBg:'#fb923c12', blue:'#60a5fa', blueBg:'#60a5fa12',
    purple:'#a78bfa', purpleBg:'#a78bfa12', cyan:'#22d3ee', consoleBg:'#0a0a0d' },
  charcoal: { name:'Charcoal', bg:'#0f1218', bgCard:'#161d28', bgInput:'#131720', bgHover:'#1d2638',
    border:'#252e42', borderLight:'#303d54', text:'#cdd6e8', textDim:'#7e90b0', textMuted:'#4e5c78',
    textBright:'#e8f0fc', accent:'#818cf8', accentBg:'#818cf810', red:'#f87171', redBg:'#f8717112',
    redBorder:'#f8717130', orange:'#fbbf24', orangeBg:'#fbbf2412', blue:'#60a5fa', blueBg:'#60a5fa12',
    purple:'#c084fc', purpleBg:'#c084fc12', cyan:'#38bdf8', consoleBg:'#080c12' },
  copper: { name:'Copper', bg:'#0f0c09', bgCard:'#1a1510', bgInput:'#130f0c', bgHover:'#221c16',
    border:'#2e2318', borderLight:'#3c3022', text:'#f0ddc8', textDim:'#b09070', textMuted:'#6e5040',
    textBright:'#faf0e0', accent:'#e8902a', accentBg:'#e8902a10', red:'#ef5350', redBg:'#ef535012',
    redBorder:'#ef535030', orange:'#f0a030', orangeBg:'#f0a03012', blue:'#64b5f6', blueBg:'#64b5f612',
    purple:'#ce93d8', purpleBg:'#ce93d812', cyan:'#4dd0e1', consoleBg:'#080806' },
  sage: { name:'Sage', bg:'#0c1210', bgCard:'#131c18', bgInput:'#0f1614', bgHover:'#1a2420',
    border:'#223028', borderLight:'#2c3e34', text:'#c8d8cc', textDim:'#7a9880', textMuted:'#4a6252',
    textBright:'#e2f0e6', accent:'#5aab88', accentBg:'#5aab8810', red:'#f87171', redBg:'#f8717112',
    redBorder:'#f8717130', orange:'#fb923c', orangeBg:'#fb923c12', blue:'#60a5fa', blueBg:'#60a5fa12',
    purple:'#a78bfa', purpleBg:'#a78bfa12', cyan:'#22d3ee', consoleBg:'#080d0b' },
  linen: { name:'Linen', bg:'#f4f0e8', bgCard:'#fefaf2', bgInput:'#ece8d8', bgHover:'#e4dece',
    border:'#cbc5b0', borderLight:'#dcd6c4', text:'#2c2416', textDim:'#5e5040', textMuted:'#9a8a70',
    textBright:'#18100a', accent:'#7b5e28', accentBg:'#7b5e2810', red:'#b83232', redBg:'#b8323212',
    redBorder:'#b8323230', orange:'#c55f0a', orangeBg:'#c55f0a12', blue:'#1e60b0', blueBg:'#1e60b012',
    purple:'#6e38a0', purpleBg:'#6e38a012', cyan:'#137080', consoleBg:'#201c18' },
}
const TEXT_SIZES = { S:{base:10,label:9,value:16,stat:9,input:11,code:10,nav:10}, M:{base:12,label:10,value:20,stat:10,input:12,code:11,nav:11}, L:{base:14,label:12,value:26,stat:12,input:14,code:13,nav:13}, XL:{base:16,label:13,value:32,stat:13,input:16,code:14,nav:14}, XXL:{base:18,label:14,value:38,stat:14,input:18,code:15,nav:15} }
const Ctx = createContext()
const useT = () => useContext(Ctx)

function useFetch(url,interval=null){const[data,setData]=useState(null);const[loading,setLoading]=useState(true);const goRef=useRef(null)
  useEffect(()=>{let on=true;const go=async()=>{try{let r=await fetch(url,{headers:getHeaders()});if(r.status===401){const ok=await tryRefresh();if(!ok)return;r=await fetch(url,{headers:getHeaders()});if(r.status===401){on401();return}};const j=await r.json();if(on){setData(j);setLoading(false)}}catch{if(on)setLoading(false)}};goRef.current=go;go()
    if(interval){const id=setInterval(go,interval);return()=>{on=false;clearInterval(id)}};return()=>{on=false}},[url,interval]);const refetch=useCallback(()=>goRef.current?.(),[]);return{data,loading,refetch}}
function useFetchOnce(url){const[data,setData]=useState(null);const[loading,setLoading]=useState(true);const onRef=useRef(true)
  useEffect(()=>{onRef.current=true;return()=>{onRef.current=false}},[])
  const reload=useCallback(async()=>{try{let r=await fetch(url,{headers:getHeaders()});if(r.status===401){const ok=await tryRefresh();if(!ok)return;r=await fetch(url,{headers:getHeaders()});if(r.status===401){on401();return}};const j=await r.json();if(onRef.current){setData(j);setLoading(false)}}catch{if(onRef.current)setLoading(false)}},[url])
  useEffect(()=>{reload()},[reload]);return{data,loading,reload}}
function useHistory(maxLen=60){const[history,setHistory]=useState([])
  const push=useCallback(entry=>{setHistory(prev=>{const next=[...prev,{...entry,t:Date.now()}];return next.length>maxLen?next.slice(-maxLen):next})},[maxLen]);return{history,push}}
function useMobile(){const[m,s]=useState(window.innerWidth<768);useEffect(()=>{const h=()=>s(window.innerWidth<768);window.addEventListener('resize',h);return()=>window.removeEventListener('resize',h)},[]);return m}
let _serverId = null
const setServerId = id => { _serverId = id }
const authHeaders = () => ({
  'Content-Type': 'application/json',
  ...(_serverId ? {'X-Server-ID': String(_serverId)} : {})
})
const getHeaders = () => ({
  ...(_serverId ? {'X-Server-ID': String(_serverId)} : {})
})
const on401=()=>window.dispatchEvent(new Event('sitrep-401'))
let _refreshing=false
const tryRefresh=async()=>{
  if(_refreshing)return false
  _refreshing=true
  try{const r=await fetch(`${API}/auth/refresh`,{method:'POST'});if(r.ok)return true;on401();return false}
  catch{on401();return false}
  finally{_refreshing=false}
}
const post=async(url,body)=>{try{const r=await fetch(url,{method:'POST',headers:authHeaders(),body:body?JSON.stringify(body):undefined});if(r.status===401){const ok=await tryRefresh();if(ok){const r2=await fetch(url,{method:'POST',headers:authHeaders(),body:body?JSON.stringify(body):undefined});if(r2.status===401){on401();return{error:'Not authenticated'}};return await r2.json()};return{error:'Not authenticated'}};return await r.json()}catch(e){return{error:e.message}}}
const put=async(url,body)=>{try{const r=await fetch(url,{method:'PUT',headers:authHeaders(),body:JSON.stringify(body)});if(r.status===401){const ok=await tryRefresh();if(ok){const r2=await fetch(url,{method:'PUT',headers:authHeaders(),body:JSON.stringify(body)});if(r2.status===401){on401();return{error:'Not authenticated'}};return await r2.json()};return{error:'Not authenticated'}};return await r.json()}catch(e){return{error:e.message}}}
const del=async(url)=>{try{const r=await fetch(url,{method:'DELETE',headers:authHeaders()});if(r.status===401){const ok=await tryRefresh();if(ok){const r2=await fetch(url,{method:'DELETE',headers:authHeaders()});if(r2.status===401){on401();return{error:'Not authenticated'}};return await r2.json()};return{error:'Not authenticated'}};return await r.json()}catch(e){return{error:e.message}}}
const SRC_COLORS={SCRIPT:'#b388ff',WORLD:'#64b5f6',NETWORK:'#4dd0e1',RCON:'#ffa502',SYSTEM:'#90a4ae',AI_GM:'#69f0ae',PLAYER:'#fff176',MOD:'#f48fb1'}
const SRC_LABELS={SCRIPT:'SCR',WORLD:'WLD',NETWORK:'NET',RCON:'RCON',SYSTEM:'SYS',AI_GM:'AI',PLAYER:'PLR',MOD:'MOD'}
const LVL={FATAL:{c:'#ff1744',i:'!!'},ERROR:{c:'#ff4757',i:'X'},WARN:{c:'#ffa502',i:'!'},INFO:{c:'#5a6a7a',i:'.'},DEBUG:{c:'#384858',i:'>'},CMD:{c:'#69f0ae',i:'>'}}

function Badge({text,v='default',pulse}){const{C}=useT();const vs={default:{bg:C.accentBg,text:C.accent,bd:C.accent+'30'},danger:{bg:C.redBg,text:C.red,bd:C.redBorder},warning:{bg:C.orangeBg,text:C.orange,bd:C.orange+'30'},info:{bg:C.blueBg,text:C.blue,bd:C.blue+'30'},dim:{bg:C.textMuted+'08',text:C.textDim,bd:C.textMuted+'20'}};const s=vs[v]||vs.default
  return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded font-bold uppercase tracking-wider leading-none" style={{background:s.bg,color:s.text,border:`1px solid ${s.bd}`,fontSize:9}}>{pulse&&<span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{background:s.text}}/>}{text}</span>}
function Btn({children,v='default',small,onClick,disabled,className=''}){const{C,sz}=useT();const vs={default:{bg:C.accentBg,text:C.accent,bd:C.accent+'30'},danger:{bg:C.redBg,text:C.red,bd:C.redBorder},warning:{bg:C.orangeBg,text:C.orange,bd:C.orange+'30'},info:{bg:C.blueBg,text:C.blue,bd:C.blue+'30'},ghost:{bg:'transparent',text:C.textDim,bd:C.border}};const s=vs[v]||vs.default
  return <button onClick={onClick} disabled={disabled} className={`inline-flex items-center justify-center gap-1.5 font-bold rounded-lg transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.97] ${small?'px-3 py-1.5':'px-4 py-2'} ${className}`} style={{background:s.bg,color:s.text,border:`1px solid ${s.bd}`,fontSize:small?sz.label:sz.base-1}} onMouseEnter={e=>e.currentTarget.style.filter='brightness(1.3)'} onMouseLeave={e=>e.currentTarget.style.filter='brightness(1)'}>{children}</button>}
function Card({children,className='',onClick}){const{C}=useT();return <div onClick={onClick} className={`rounded-xl transition-all ${onClick?'cursor-pointer':''} ${className}`} style={{background:C.bgCard,border:`1px solid ${C.border}`}}>{children}</div>}
function StatBox({label,value,sub,warn,onFloat,onHide}){const{C,sz}=useT();const mobile=useMobile();return <Card className="p-4 flex-1 min-w-[120px]"><div className="flex items-center justify-between mb-2"><div className="font-bold uppercase tracking-widest" style={{color:C.textDim,fontSize:sz.stat}}>{label}</div>{!mobile&&(onFloat||onHide)&&<div className="flex items-center gap-1"><button onClick={onFloat} title="Float panel" style={{background:'none',border:`1px solid ${C.blue}50`,cursor:'pointer',color:C.blue,fontSize:11,padding:'1px 4px',lineHeight:1,borderRadius:4}}>⬡</button><button onClick={onHide} title="Hide panel" style={{background:'none',border:`1px solid ${C.border}`,cursor:'pointer',color:C.textMuted,fontSize:13,padding:'0px 4px',lineHeight:1.2,borderRadius:4}}>×</button></div>}</div><div className="font-black leading-none tracking-tight" style={{color:warn?C.red:C.textBright,fontSize:sz.value}}>{value||'--'}</div>{sub&&<div className="mt-1.5" style={{color:C.textMuted,fontSize:sz.stat}}>{sub}</div>}</Card>}
function Bar({pct,color,height=4}){const{C}=useT();return <div className="rounded-full overflow-hidden" style={{height,background:C.border}}><div className="h-full rounded-full transition-all duration-700" style={{width:`${Math.min(100,pct)}%`,background:color||C.accent}}/></div>}
function Toggle({value,onChange,label}){const{C,sz}=useT();return <div className="flex items-center justify-between mb-3">{label&&<label className="font-bold uppercase tracking-wide" style={{color:C.textDim,fontSize:sz.label}}>{label}</label>}<div onClick={onChange} className="rounded-full cursor-pointer transition-colors relative" style={{background:value?C.accent:C.border,width:40,height:22}}><div className="rounded-full bg-white absolute transition-all" style={{width:16,height:16,top:3,left:value?21:3}}/></div></div>}
function SrcTag({source}){const color=SRC_COLORS[source]||'#5a6a7a';const label=SRC_LABELS[source]||source?.slice(0,3)||'???';return <span className="inline-flex items-center justify-center min-w-[38px] px-1.5 py-[2px] rounded font-black" style={{color,background:color+'0a',border:`1px solid ${color}25`,fontSize:8}}>{label}</span>}
function Input({label,value,onChange,type='text',placeholder,mono}){const{C,sz}=useT();const[show,setShow]=useState(false);const isPw=type==='password'
  return <div className="mb-3">{label&&<label className="block font-bold uppercase tracking-wide mb-1.5" style={{color:C.textDim,fontSize:sz.label}}>{label}</label>}<div className="relative"><input type={isPw?(show?'text':'password'):type} value={value??''} onChange={e=>onChange(e.target.value)} placeholder={placeholder} className={`w-full rounded-lg px-3 py-2.5 outline-none transition-colors placeholder:opacity-30 ${isPw?'pr-9':''} ${mono?'font-mono':''}`} style={{background:C.bgInput,border:`1px solid ${C.border}`,color:C.text,fontSize:sz.input}} onFocus={e=>e.target.style.borderColor=C.accent+'80'} onBlur={e=>e.target.style.borderColor=C.border}/>{isPw&&<button type="button" onClick={()=>setShow(!show)} className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer" style={{color:C.textDim,fontSize:sz.label}}>{show?'Hide':'Show'}</button>}</div></div>}
function Empty({title,sub}){const{C,sz}=useT();return <Card className="p-12 text-center"><div className="mb-1" style={{color:C.textDim,fontSize:sz.base+2}}>{title}</div>{sub&&<div style={{color:C.textMuted,fontSize:sz.base}}>{sub}</div>}</Card>}
function Modal({open,onClose,title,children}){const{C,sz}=useT();if(!open)return null;return <div onClick={onClose} className="fixed inset-0 z-[1000] flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.7)',backdropFilter:'blur(8px)'}}><div onClick={e=>e.stopPropagation()} className="rounded-xl shadow-2xl max-w-[95vw] w-[480px] max-h-[85vh] overflow-auto" style={{background:C.bgCard,border:`1px solid ${C.border}`}}><div className="flex items-center justify-between px-5 py-4" style={{borderBottom:`1px solid ${C.border}`}}><span className="font-black" style={{color:C.textBright,fontSize:sz.base+2}}>{title}</span><button onClick={onClose} className="cursor-pointer text-lg hover:opacity-70" style={{color:C.textDim}}>X</button></div><div className="p-5">{children}</div></div></div>}
let _tid=0;function useToast(){const[toasts,setToasts]=useState([]);const timers=useRef({});const dismiss=useCallback(id=>{clearTimeout(timers.current[id]);delete timers.current[id];setToasts(p=>p.filter(t=>t.id!==id))},[]);const push=useCallback((msg,v='default')=>{const id=++_tid;setToasts(p=>[...p,{id,msg,v}]);timers.current[id]=setTimeout(()=>{delete timers.current[id];setToasts(p=>p.filter(t=>t.id!==id))},3500)},[]);return{toasts,push,dismiss}}
function Toasts({toasts,dismiss}){const{C}=useT();if(!toasts.length)return null;const vs={default:{bg:C.accentBg,text:C.accent,bd:C.accent+'30'},danger:{bg:C.redBg,text:C.red,bd:C.redBorder},warning:{bg:C.orangeBg,text:C.orange,bd:C.orange+'30'},info:{bg:C.blueBg,text:C.blue,bd:C.blue+'30'}};return <div className="fixed right-4 z-[9999] flex flex-col gap-2" style={{top:60}}>{toasts.map(t=>{const s=vs[t.v]||vs.default;return <div key={t.id} className="toast-item px-4 py-2.5 rounded-lg font-bold shadow-xl" style={{background:s.bg,color:s.text,border:`1px solid ${s.bd}`,fontSize:12,display:'flex',alignItems:'center',gap:10,position:'relative',paddingRight:32}}>{t.msg}<button className="toast-x" onClick={()=>dismiss(t.id)} style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',color:s.text,cursor:'pointer',fontSize:15,fontWeight:900,lineHeight:1,opacity:0,transition:'opacity 0.15s',padding:'2px 4px'}}>x</button></div>})}</div>}

const ROLE_TABS={owner:['dashboard','console','startup','admin','config','mods','files','webhooks','network','aigm','scheduler'],head_admin:['dashboard','console','startup','admin','config','mods','files','webhooks','network','aigm','scheduler'],admin:['dashboard','console','startup','admin','config','mods','files','webhooks','network','aigm','scheduler'],moderator:['dashboard','console','startup','admin','network'],viewer:['dashboard'],demo:['dashboard','console','admin','mods']}
const ROLE_COLORS={owner:'default',head_admin:'danger',admin:'info',moderator:'warning',viewer:'dim',demo:'dim'}

function ResetPassword({token,onDone}){const{C,sz}=useT();const[p,setP]=useState('');const[c,setC]=useState('');const[err,setErr]=useState('');const[ok,setOk]=useState(false);const[loading,setLoading]=useState(false)
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

function Login({onLogin}){const{C,sz}=useT();const[u,setU]=useState('');const[p,setP]=useState('');const[err,setErr]=useState('');const[loading,setLoading]=useState(false);const[remember,setRemember]=useState(false);const[view,setView]=useState('login');const[fpEmail,setFpEmail]=useState('');const[fpMsg,setFpMsg]=useState('');const[fpErr,setFpErr]=useState('');const[fpLoading,setFpLoading]=useState(false);const[pendingToken,setPendingToken]=useState('');const[totpCode,setTotpCode]=useState('');const[totpErr,setTotpErr]=useState('');const[totpLoading,setTotpLoading]=useState(false)
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

function SetupWizard({onComplete}){const{C,sz}=useT()
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
    if(!password){setErr('Password is required');return}
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
            <Input label="Password" value={password} onChange={setPassword} type="password" placeholder="password"/>
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

const DISCORD_BLURPLE='#5865F2'
function DiscordIcon({size=18}){return<svg width={size} height={size} viewBox="0 0 71 55" fill={DISCORD_BLURPLE}><path d="M60.1 4.9A58.5 58.5 0 0 0 45.6.8a.2.2 0 0 0-.2.1 40.7 40.7 0 0 0-1.8 3.7 54 54 0 0 0-16.2 0 37.4 37.4 0 0 0-1.8-3.7.2.2 0 0 0-.2-.1A58.4 58.4 0 0 0 10.9 4.9a.2.2 0 0 0-.1.1C1.6 18.2-.9 31.1.3 43.8a.2.2 0 0 0 .1.2 58.8 58.8 0 0 0 17.7 9 .2.2 0 0 0 .2-.1 42 42 0 0 0 3.6-5.9.2.2 0 0 0-.1-.3 38.7 38.7 0 0 1-5.5-2.6.2.2 0 0 1 0-.4c.4-.3.7-.6 1.1-.9a.2.2 0 0 1 .2 0c11.5 5.3 24 5.3 35.4 0a.2.2 0 0 1 .2 0c.4.3.7.6 1.1.9a.2.2 0 0 1 0 .4 36.2 36.2 0 0 1-5.5 2.6.2.2 0 0 0-.1.3 47.1 47.1 0 0 0 3.6 5.9.2.2 0 0 0 .2.1 58.6 58.6 0 0 0 17.8-9 .2.2 0 0 0 .1-.2c1.5-15.1-2.5-28-10.5-39.5a.2.2 0 0 0-.1-.1zM23.7 36.1c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2c3.6 0 6.5 3.3 6.4 7.2 0 4-2.8 7.2-6.4 7.2zm23.6 0c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2c3.6 0 6.5 3.3 6.4 7.2 0 4-2.9 7.2-6.4 7.2z"/></svg>}

const SectionHeader=({title,sub,open,onToggle,action,C,sz})=><div className="flex items-center justify-between mb-3 cursor-pointer" onClick={onToggle}>
  <div><div className="font-black flex items-center gap-2" style={{color:C.textBright,fontSize:sz.base+2}}><span style={{color:C.textMuted,fontSize:sz.base}}>{open?'▾':'▸'}</span>{title}</div>{sub&&<div style={{color:C.textMuted,fontSize:sz.stat}}>{sub}</div>}</div>
  {action&&<div onClick={e=>e.stopPropagation()}>{action}</div>}
</div>

function Permissions({toast,authUser}){const{C,sz}=useT()
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

const PeriodSel=({period,setPeriod,C,sz})=><div className="flex items-center gap-1 ml-auto">{['7d','30d','all'].map(p=><button key={p} onClick={()=>setPeriod(p)} className="font-bold uppercase cursor-pointer px-2 py-0.5 rounded" style={{fontSize:sz.stat,background:period===p?C.accentBg:'transparent',color:period===p?C.accent:C.textMuted,border:`1px solid ${period===p?C.accent+'40':C.border}`}}>{p}</button>)}</div>

function ServerStats(){const{C,sz}=useT();const[tab,setTab]=useState('feed');const[period,setPeriod]=useState('7d');const{data:feed}=useFetch(`${API}/stats/feed?limit=50`,10000);const{data:board}=useFetch(`${API}/stats/leaderboard?period=${period}`,30000);const{data:wpns}=useFetch(`${API}/stats/weapons?period=${period}`,30000);const{data:hist}=useFetch(`${API}/stats/player-history`,60000);const{data:ov}=useFetch(`${API}/stats/overview`,30000);const tabs=[['feed','Kill Feed'],['leaderboard','Leaderboard'],['weapons','Weapons'],['overview','Overview']];const fmtAgo=ts=>{const s=Math.floor(Date.now()/1000-ts);if(s<60)return`${s}s ago`;if(s<3600)return`${Math.floor(s/60)}m ago`;return`${Math.floor(s/3600)}h ago`};return(<div><div className="flex items-center gap-1 mb-3 flex-wrap">{tabs.map(([id,label])=><button key={id} onClick={()=>setTab(id)} className="font-bold uppercase tracking-wide cursor-pointer px-3 py-1 rounded-lg" style={{fontSize:sz.stat,background:tab===id?C.accentBg:'transparent',color:tab===id?C.accent:C.textMuted,border:`1px solid ${tab===id?C.accent+'40':'transparent'}`}}>{label}</button>)}{(tab==='leaderboard'||tab==='weapons')&&<PeriodSel period={period} setPeriod={setPeriod} C={C} sz={sz}/>}{tab==='overview'&&ov&&<span className="ml-auto font-mono" style={{color:C.textMuted,fontSize:sz.stat}}>{ov.uptime_pct_30d}% uptime (30d)</span>}</div>{tab==='feed'&&<div style={{maxHeight:320,overflowY:'auto'}}>{ (!feed?.events?.length)&&<div className="py-8 text-center" style={{color:C.textMuted,fontSize:sz.base}}>No kills recorded yet</div>}{feed?.events?.map((ev,i)=><div key={i} className="flex items-center gap-2 py-2 px-1" style={{borderBottom:`1px solid ${C.border}`,fontSize:sz.base}}><span className="font-bold" style={{color:ev.team_kill?C.red:C.textBright}}>{ev.killer}</span><span style={{color:C.textMuted}}>{'→'}</span><span style={{color:C.textDim}}>{ev.victim}</span><span className="flex-1"/><span style={{color:C.textMuted,fontSize:sz.stat}}>{ev.weapon}</span><span className="font-mono" style={{color:C.textMuted,fontSize:sz.stat}}>{parseFloat(ev.distance).toFixed(0)}m</span><span style={{color:C.textMuted,fontSize:sz.stat}}>{fmtAgo(ev.ts)}</span></div>)}</div>}{tab==='leaderboard'&&<div style={{maxHeight:320,overflowY:'auto'}}>{(!board?.leaderboard?.length)&&<div className="py-8 text-center" style={{color:C.textMuted,fontSize:sz.base}}>No player data yet</div>}{board?.leaderboard?.map((p,i)=><div key={i} className="flex items-center gap-3 py-2 px-1" style={{borderBottom:`1px solid ${C.border}`}}><span className="w-6 text-right font-black" style={{color:C.textMuted,fontSize:sz.stat}}>{i+1}</span><span className="flex-1 font-bold" style={{color:C.textBright,fontSize:sz.base}}>{p.name}</span><span className="font-mono" style={{color:C.accent,fontSize:sz.base}}>{p.kills}K</span><span className="font-mono" style={{color:C.textMuted,fontSize:sz.stat}}>{p.deaths}D</span><span className="font-mono w-12 text-right" style={{color:C.textDim,fontSize:sz.stat}}>{p.kd} K/D</span></div>)}</div>}{tab==='weapons'&&<div style={{maxHeight:320,overflowY:'auto'}}>{(!wpns?.weapons?.length)&&<div className="py-8 text-center" style={{color:C.textMuted,fontSize:sz.base}}>No weapon data yet</div>}{wpns?.weapons?.map((w,i)=><div key={i} className="flex items-center gap-3 py-2 px-1" style={{borderBottom:`1px solid ${C.border}`}}><span className="w-5 text-right font-black" style={{color:C.textMuted,fontSize:sz.stat}}>{i+1}</span><span className="flex-1" style={{color:C.textDim,fontSize:sz.base}}>{w.weapon}</span><span className="font-mono font-bold" style={{color:C.accent,fontSize:sz.base}}>{w.kills}</span><span className="font-mono w-10 text-right" style={{color:C.textMuted,fontSize:sz.stat}}>{w.pct}%</span></div>)}</div>}{tab==='overview'&&<div>{!ov&&<div className="py-8 text-center" style={{color:C.textMuted,fontSize:sz.base}}>Loading...</div>}{ov&&<div className="grid grid-cols-2 gap-3 mb-4">{[['Total Kills',ov.total_kills,C.accent],['Total Deaths',ov.total_deaths,C.red],['K/D Ratio',ov.kd_ratio,C.textBright],['Unique Players',ov.unique_players,C.blue]].map(([label,val,color])=><div key={label} className="p-3 rounded-lg" style={{background:C.bgInput,border:`1px solid ${C.border}`}}><div className="font-bold uppercase tracking-widest mb-1" style={{color:C.textMuted,fontSize:sz.stat}}>{label}</div><div className="font-black" style={{color,fontSize:sz.base+6}}>{val??'--'}</div></div>)}</div>}{hist?.history&&<div><div className="font-bold uppercase tracking-widest mb-2" style={{color:C.textDim,fontSize:sz.stat}}>7-Day Player History</div><ResponsiveContainer width="100%" height={120}><AreaChart data={hist.history} margin={{top:0,right:0,left:-20,bottom:0}}><defs><linearGradient id="phG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.accent} stopOpacity={0.3}/><stop offset="100%" stopColor={C.accent} stopOpacity={0}/></linearGradient></defs><YAxis tick={false} axisLine={false}/><Tooltip contentStyle={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:8,fontSize:sz.base,color:C.text}} formatter={(v)=>[v,'Players']} labelFormatter={(ts)=>new Date(ts*1000).toLocaleDateString()}/><Area type="monotone" dataKey="count" stroke={C.accent} fill="url(#phG)" strokeWidth={1.5} dot={false} name="Players"/></AreaChart></ResponsiveContainer></div>}</div>}</div>)}
function Dashboard({toast}){const{C,sz}=useT();const mobile=useMobile();const{data:d,loading,refetch:refetchStatus}=useFetch(`${API}/status`,3000);const{data:logData,refetch:refetchLogs}=useFetch(`${API}/logs?lines=500`,4000);const{data:cfg}=useFetch(`${API}/config`,30000);const{data:settings}=useFetch(`${API}/settings`,30000);const{data:liveData,refetch:refetchLive}=useFetch(`${API}/players/live`,5000);const{data:diagData,refetch:refetchDiag}=useFetch(`${API}/diagnostics`,5000);const logRef=useRef(null);const scrolledUp=useRef(false);const[showReset,setShowReset]=useState(false);const[resetOpts,setResetOpts]=useState({update:true,clearSaves:false,clearLogs:false});const[resetting,setResetting]=useState(false);const[serverActing,setServerActing]=useState(false);const{history:cpuHist,push:pushCpu}=useHistory(40);const{history:netHist,push:pushNet}=useHistory(40)
  useEffect(()=>{const h=()=>{refetchStatus();refetchLogs();refetchLive()};window.addEventListener('sitrep-refresh',h);return()=>window.removeEventListener('sitrep-refresh',h)},[refetchStatus,refetchLogs,refetchLive])
  useEffect(()=>{if(!d?.system)return;pushCpu({cpu:d.system.cpu.usage,gpu:d.system.gpu.usage});pushNet({up:d.system.network_rate?.up_mbps||0,down:d.system.network_rate?.down_mbps||0})},[d])
  const doReset=async()=>{setResetting(true);setShowReset(false);toast('Stopping server...','warning');await post(`${API}/server/stop`)
    if(resetOpts.clearSaves){const r=await post(`${API}/server/reset`,{action:'clear_saves'});if(r.error){toast(r.error,'danger');setResetting(false);return};toast(r.message,'info')}
    if(resetOpts.clearLogs){const r=await post(`${API}/server/reset`,{action:'clear_logs'});if(r.error){toast(r.error,'danger');setResetting(false);return};toast(r.message,'info')}
    if(resetOpts.update){toast('Updating via SteamCMD — please wait...','info');const ur=await post(`${API}/server/update`);if(ur.error){toast(ur.error,'danger');setResetting(false);return};toast('Update complete','info')}
    toast('Starting...','info');await post(`${API}/server/start`);toast('Reset complete');setResetting(false)}
  useEffect(()=>{if(!logRef.current||scrolledUp.current)return;logRef.current.scrollTop=logRef.current.scrollHeight},[logData])
  const[floating,setFloating]=useState(()=>{try{const s=localStorage.getItem('dash-float');return s?JSON.parse(s):{}}catch{return{}}})
  const[hidden,setHidden]=useState(()=>{try{const s=localStorage.getItem('dash-hidden');return s?JSON.parse(s):{}}catch{return{}}})
  const[bannerDismissed,setBannerDismissed]=useState(false)
  useEffect(()=>{if(!diagData?.script_module_failed&&!diagData?.mission_load_failed)setBannerDismissed(false)},[diagData?.script_module_failed,diagData?.mission_load_failed])
  const dock=id=>{setFloating(p=>{const n={...p};delete n[id];try{localStorage.setItem('dash-float',JSON.stringify(n))}catch{};return n})}
  useEffect(()=>{if(mobile&&Object.keys(floating).length>0){Object.keys(floating).forEach(id=>dock(id))}},[mobile,floating])
  const chartData=useMemo(()=>cpuHist.map((h,i)=>({i,cpu:h.cpu,gpu:h.gpu,up:netHist[i]?.up||0,down:netHist[i]?.down||0})),[cpuHist,netHist])
  if(loading)return <div className="animate-pulse" style={{color:C.textDim,fontSize:sz.base}}>Connecting...</div>;if(!d)return <div style={{color:C.red,fontSize:sz.base}}>Backend unreachable</div>
  const s=d.server,sys=d.system,mat=d.mat||{},on=s.status==='online',disks=sys.disks||[],rate=sys.network_rate||{up_mbps:0,down_mbps:0},logs=(logData||[]).slice(-50)
  const act=async(a,silent=false)=>{setServerActing(true);if(!silent)toast(`${a[0].toUpperCase()+a.slice(1)}ing...`,'warning');const r=await post(`${API}/server/${a}`);setServerActing(false);if(r.error)toast(r.error,'danger');else if(!silent)toast(r.message||`${a} done`);if(a==='start'){refetchDiag();setTimeout(refetchDiag,5000);setTimeout(refetchDiag,15000)}}
  const toggleServer=async()=>{if(serverActing)return;if(on)act('stop');else act('start')}
  const detach=id=>{setFloating(p=>{const n={...p,[id]:{x:120+Object.keys(p).length*30,y:80+Object.keys(p).length*30}};try{localStorage.setItem('dash-float',JSON.stringify(n))}catch{};return n})}
  const hide=id=>{setHidden(p=>{const n={...p,[id]:true};try{localStorage.setItem('dash-hidden',JSON.stringify(n))}catch{};return n})}
  const show=id=>{setHidden(p=>{const n={...p};delete n[id];try{localStorage.setItem('dash-hidden',JSON.stringify(n))}catch{};return n})}
  const PANEL_LABELS={'perf':'Performance','bw':'Bandwidth','storage':'Storage','bwest':'BW Estimate','players':'Players','console':'Console','stat-uptime':'Uptime','stat-players':'Players (stat)','stat-fps':'Server FPS','stat-cpu':'CPU','stat-gpu':'GPU','stat-ram':'RAM','serverstats':'Server Stats'}
  const DH=(label,id)=><div className="flex items-center justify-between mb-2"><span className="font-bold uppercase tracking-widest" style={{color:C.textDim,fontSize:sz.label}}>{label}</span><div className="flex items-center gap-1">{!mobile&&<button onClick={()=>detach(id)} title="Detach / float panel" style={{background:'none',border:`1px solid ${C.blue}50`,cursor:'pointer',color:C.blue,fontSize:11,padding:'1px 4px',lineHeight:1,borderRadius:4}} onMouseEnter={e=>{e.currentTarget.style.color=C.textBright;e.currentTarget.style.borderColor=C.blue}} onMouseLeave={e=>{e.currentTarget.style.color=C.blue;e.currentTarget.style.borderColor=C.blue+'50'}}>⬡</button>}<button onClick={()=>hide(id)} title="Hide panel (restore from bar above)" style={{background:'none',border:`1px solid ${C.border}`,cursor:'pointer',color:C.textMuted,fontSize:13,padding:'0px 4px',lineHeight:1.2,borderRadius:4}} onMouseEnter={e=>{e.currentTarget.style.color=C.red;e.currentTarget.style.borderColor=C.red+'50'}} onMouseLeave={e=>{e.currentTarget.style.color=C.textMuted;e.currentTarget.style.borderColor=C.border}}>×</button></div></div>
  return <div className="flex flex-col h-full gap-3">
    {Object.keys(hidden).length>0&&<div className="flex items-center gap-2 flex-wrap px-3 py-2 rounded-lg" style={{background:C.bgInput,border:`1px solid ${C.border}`}}><span className="font-bold uppercase tracking-widest shrink-0" style={{color:C.textMuted,fontSize:sz.stat}}>Hidden:</span>{Object.keys(hidden).map(id=><button key={id} onClick={()=>show(id)} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md font-bold cursor-pointer" style={{background:C.accentBg,color:C.accent,border:`1px solid ${C.accent}30`,fontSize:sz.stat}} onMouseEnter={e=>e.currentTarget.style.background=C.accent+'25'} onMouseLeave={e=>e.currentTarget.style.background=C.accentBg}>{PANEL_LABELS[id]||id} <span style={{opacity:0.6,fontSize:10}}>↩</span></button>)}</div>}
    {floating.perf&&<FloatingPanel title="Performance" onDock={()=>dock('perf')} defaultPos={floating.perf}><div className="p-4"><div className="flex gap-6 justify-around"><div className="text-center"><div className="font-black" style={{color:C.accent,fontSize:sz.base+14}}>{sys.cpu.usage}%</div><div style={{color:C.textMuted,fontSize:sz.stat}}>CPU · {sys.cpu.temp}°C</div></div><div className="text-center"><div className="font-black" style={{color:C.purple,fontSize:sz.base+14}}>{sys.gpu.usage}%</div><div style={{color:C.textMuted,fontSize:sz.stat}}>GPU · {sys.gpu.temp}°C</div></div></div></div></FloatingPanel>}
    {floating.bw&&<FloatingPanel title="Bandwidth" onDock={()=>dock('bw')} defaultPos={floating.bw}><div className="p-4"><div className="flex gap-6 justify-around"><div className="text-center"><div className="font-black" style={{color:C.accent,fontSize:sz.base+14}}>{rate.up_mbps}</div><div style={{color:C.textMuted,fontSize:sz.stat}}>Up Mbps</div></div><div className="text-center"><div className="font-black" style={{color:C.blue,fontSize:sz.base+14}}>{rate.down_mbps}</div><div style={{color:C.textMuted,fontSize:sz.stat}}>Down Mbps</div></div></div></div></FloatingPanel>}
    {floating.storage&&<FloatingPanel title="Storage" onDock={()=>dock('storage')} defaultPos={floating.storage}><div className="p-4">{disks.map((dk,i)=>{const pct=dk.total>0?Math.round(dk.used/dk.total*100):0;return <div key={i} className="mb-3 last:mb-0"><div className="flex justify-between mb-1"><span style={{color:C.textDim,fontSize:sz.stat}}>{dk.name}</span><span className="font-mono" style={{color:C.text,fontSize:sz.stat}}>{dk.used}/{dk.total}G</span></div><Bar pct={pct} color={pct>90?C.red:pct>70?C.orange:C.accent+'60'}/></div>})}</div></FloatingPanel>}
    {floating.bwest&&(()=>{const cap=settings?.uploadCapMbps||120;const mp=cfg?.game?.maxPlayers||0;const nvd=cfg?.game?.gameProperties?.networkViewDistance||1000;const ai=cfg?.operating?.aiLimit||0;const estMbps=Math.round((mp*0.12+(nvd/1000)*mp*0.02+ai*0.003)*10)/10;const pct=cap>0?Math.min(100,Math.round(estMbps/cap*100)):0;const over=estMbps>cap*0.8;return<FloatingPanel title="Bandwidth Est." onDock={()=>dock('bwest')} defaultPos={floating.bwest}><div className="p-4"><div className="flex justify-between mb-2"><span className="font-black" style={{color:over?C.orange:C.text,fontSize:sz.base+6}}>{estMbps} <span style={{color:C.textMuted,fontSize:sz.stat}}>Mbps</span></span><span style={{color:C.textMuted,fontSize:sz.stat}}>cap {cap}</span></div><Bar pct={pct} color={over?C.orange:C.accent}/></div></FloatingPanel>})()}
    {floating.players&&(()=>{const players=liveData?.players||[];return<FloatingPanel title={`Players ${players.length}/${s.maxPlayers}`} onDock={()=>dock('players')} defaultPos={floating.players}><div style={{height:'100%',overflowY:'auto'}}>{players.length===0?<div className="px-4 py-6 text-center" style={{color:C.textMuted,fontSize:sz.base}}>No players</div>:players.map((p,i)=><div key={i} className="flex items-center gap-2 px-4 py-2" style={{borderBottom:`1px solid ${C.border}`}}><div className="w-6 h-6 rounded flex items-center justify-center font-black shrink-0" style={{background:C.accentBg,color:C.accent,fontSize:sz.stat}}>{(p.player_name||'?')[0].toUpperCase()}</div><span style={{color:C.text,fontSize:sz.base}}>{p.player_name}</span></div>)}</div></FloatingPanel>})()}
    {floating.console&&<FloatingPanel title="Console" onDock={()=>dock('console')} defaultPos={floating.console}><div style={{height:'100%',overflowY:'auto',fontFamily:'monospace',background:C.consoleBg,fontSize:sz.code,padding:'4px 0'}}>{logs.slice(-30).map((l,i)=>{const lv=LVL[l.level]||LVL.INFO;return <div key={i} className="flex gap-2 px-2 py-[1px]"><span style={{color:lv.c}}>{lv.i}</span><span style={{color:C.textMuted,fontSize:sz.code-1}}>{l.ts}</span><span style={{color:C.textDim,wordBreak:'break-all'}}>{l.msg}</span></div>})}</div></FloatingPanel>}
    {floating['stat-uptime']&&<FloatingPanel title="Uptime" onDock={()=>dock('stat-uptime')} defaultPos={floating['stat-uptime']}><div className="p-4"><StatBox label="Uptime" value={on?s.uptime:'---'} sub={on?'online':'offline'} warn={!on}/></div></FloatingPanel>}{floating['stat-players']&&<FloatingPanel title="Players" onDock={()=>dock('stat-players')} defaultPos={floating['stat-players']}><div className="p-4"><StatBox label="Players" value={`${s.players??0}/${s.maxPlayers}`} sub={mat.ai_characters>0?`${mat.ai_characters} AI`:undefined}/></div></FloatingPanel>}{mat.available&&mat.fps!=null&&floating['stat-fps']&&<FloatingPanel title="Server FPS" onDock={()=>dock('stat-fps')} defaultPos={floating['stat-fps']}><div className="p-4"><StatBox label="Server FPS" value={mat.fps} sub={mat.registered_vehicles>0?`${mat.registered_vehicles} vehicles`:undefined} warn={mat.fps<20}/></div></FloatingPanel>}{floating['stat-cpu']&&<FloatingPanel title="CPU" onDock={()=>dock('stat-cpu')} defaultPos={floating['stat-cpu']}><div className="p-4"><StatBox label="CPU" value={`${sys.cpu.usage}%`} sub={`${sys.cpu.temp}C`} warn={sys.cpu.usage>85}/></div></FloatingPanel>}{floating['stat-gpu']&&<FloatingPanel title="GPU" onDock={()=>dock('stat-gpu')} defaultPos={floating['stat-gpu']}><div className="p-4"><StatBox label="GPU" value={`${sys.gpu.usage}%`} sub={`${sys.gpu.temp}C  |  ${sys.gpu.vram_used}/${sys.gpu.vram_total}G VRAM`} warn={sys.gpu.temp>80}/></div></FloatingPanel>}{floating['stat-ram']&&<FloatingPanel title="RAM" onDock={()=>dock('stat-ram')} defaultPos={floating['stat-ram']}><div className="p-4"><StatBox label="RAM" value={`${sys.ram.used}G`} sub={`/ ${sys.ram.total}G`} warn={sys.ram.used/sys.ram.total>0.85}/></div></FloatingPanel>}
{floating.serverstats&&<FloatingPanel title="Server Stats" onDock={()=>dock('serverstats')} defaultPos={floating.serverstats}><div className="p-4"><ServerStats/></div></FloatingPanel>}
    <div className={`flex items-center gap-3 ${mobile?'flex-col items-start':''} flex-wrap`}>
      <div className="flex items-center gap-2.5">
        <div className="relative cursor-pointer" onClick={toggleServer} title={on?'Click to Stop':'Click to Start'}>
          <div className="w-3.5 h-3.5 rounded-full transition-colors" style={{background:serverActing?C.orange:on?C.accent:C.red}}/>
          {on&&!serverActing&&<div className="absolute inset-0 w-3.5 h-3.5 rounded-full animate-ping opacity-30" style={{background:C.accent}}/>}
          {serverActing&&<div className="absolute inset-0 w-3.5 h-3.5 rounded-full animate-spin opacity-60" style={{borderTop:`2px solid ${C.orange}`,borderRadius:'50%'}}/>}
        </div>
        <h1 className="font-black tracking-wide" style={{color:C.textBright,fontSize:sz.base+6}}>{s.name}</h1>
      </div>
      <Badge text={serverActing?'WORKING...':(on?'LIVE':'OFFLINE')} v={serverActing?'warning':(on?'default':'danger')} pulse={on&&!serverActing}/>
      {s.battlEye&&<Badge text="BattlEye" v="info"/>}
      <Badge text={`${s.modsLoaded} mods`} v="dim"/>
      {on&&<Badge text={`${s.players??0}/${s.maxPlayers} players`} v="default"/>}
      <div className="flex-1"/>
      <div className={`flex gap-1.5 ${mobile?'w-full':''} flex-wrap items-center`}>
        <button onClick={toggleServer} disabled={serverActing} className={`flex items-center gap-2 px-4 rounded-lg font-black transition-all cursor-pointer ${mobile?'w-full justify-center py-3':'py-2'}`} style={{
          background:serverActing?`${C.orange}18`:on?`${C.red}18`:`${C.accent}18`,
          color:serverActing?C.orange:on?C.red:C.accent,
          border:`1.5px solid ${serverActing?C.orange:on?C.red:C.accent}40`,
          fontSize:sz.base,opacity:serverActing?0.7:1}}>
          <span style={{fontSize:sz.base+2}}>{serverActing?'⟳':on?'■':'▶'}</span>
          {serverActing?'Working...':(on?'Stop Server':'Start Server')}
        </button>
        {on&&<Btn small v="warning" onClick={()=>act('restart')} disabled={serverActing}>Restart</Btn>}
        <Btn small v="info" onClick={()=>setShowReset(true)} disabled={resetting||serverActing}>{resetting?'Resetting...':'Reset'}</Btn>
      </div>
    </div>
    {!on&&!bannerDismissed&&diagData&&(diagData.script_module_failed||diagData.mission_load_failed)&&<div className="flex items-start gap-3 p-3 rounded-xl cursor-pointer" style={{background:C.redBg,border:`1px solid ${C.redBorder}`}} onClick={()=>{window.location.hash='startup';window.dispatchEvent(new CustomEvent('sitrep-startup-tab',{detail:'diagnostics'}))}}>
      <span style={{color:C.red,fontSize:sz.base+2,flexShrink:0,marginTop:1}}>⚠</span>
      <div className="flex-1 min-w-0">
        <div className="font-black" style={{color:C.red,fontSize:sz.base}}>Server startup failed — {diagData.script_errors.length} script error{diagData.script_errors.length!==1?'s':''} detected</div>
        <div style={{color:C.orange,fontSize:sz.stat,marginTop:2}}>{(diagData.broken_mods||[]).length>0?`Broken mods: ${(diagData.broken_mods||[]).map(m=>m.name).join(', ')} — update via Workshop`:diagData.issues[0]||'Check Startup → Diagnostics for details'}</div>
      </div>
      <span className="font-bold shrink-0" style={{color:C.textDim,fontSize:sz.stat}}>View →</span>
      <button onClick={e=>{e.stopPropagation();setBannerDismissed(true)}} title="Dismiss" style={{background:'none',border:`1px solid ${C.red}50`,cursor:'pointer',color:C.red,fontSize:14,padding:'0px 6px',lineHeight:1.2,borderRadius:4,flexShrink:0}} onMouseEnter={e=>{e.currentTarget.style.background=C.red+'15'}} onMouseLeave={e=>{e.currentTarget.style.background='none'}}>×</button>
    </div>}
    <div className={mobile?'grid grid-cols-2 gap-2':'flex gap-2.5 flex-nowrap'}>{!floating['stat-uptime']&&!hidden['stat-uptime']&&<StatBox label="Uptime" value={on?s.uptime:'---'} sub={on?'online':'offline'} warn={!on} onFloat={()=>detach('stat-uptime')} onHide={()=>hide('stat-uptime')}/>}{!floating['stat-players']&&!hidden['stat-players']&&<StatBox label="Players" value={`${s.players??0}/${s.maxPlayers}`} sub={mat.ai_characters>0?`${mat.ai_characters} AI`:undefined} onFloat={()=>detach('stat-players')} onHide={()=>hide('stat-players')}/>}{mat.available&&mat.fps!=null&&!floating['stat-fps']&&!hidden['stat-fps']&&<StatBox label="Server FPS" value={mat.fps} sub={mat.registered_vehicles>0?`${mat.registered_vehicles} vehicles`:undefined} warn={mat.fps<20} onFloat={()=>detach('stat-fps')} onHide={()=>hide('stat-fps')}/>}{!floating['stat-cpu']&&!hidden['stat-cpu']&&<StatBox label="CPU" value={`${sys.cpu.usage}%`} sub={`${sys.cpu.temp}C`} warn={sys.cpu.usage>85} onFloat={()=>detach('stat-cpu')} onHide={()=>hide('stat-cpu')}/>}{!floating['stat-gpu']&&!hidden['stat-gpu']&&<StatBox label="GPU" value={`${sys.gpu.usage}%`} sub={`${sys.gpu.temp}C  |  ${sys.gpu.vram_used}/${sys.gpu.vram_total}G VRAM`} warn={sys.gpu.temp>80} onFloat={()=>detach('stat-gpu')} onHide={()=>hide('stat-gpu')}/>}{!floating['stat-ram']&&!hidden['stat-ram']&&<StatBox label="RAM" value={`${sys.ram.used}G`} sub={`/ ${sys.ram.total}G`} warn={sys.ram.used/sys.ram.total>0.85} onFloat={()=>detach('stat-ram')} onHide={()=>hide('stat-ram')}/>}</div>
    <div className={`flex-1 flex ${mobile?'flex-col':'flex-row'} gap-3 min-h-0`}><div className={`${mobile?'w-full':'w-[380px]'} shrink-0 flex flex-col gap-3`}>{!floating.perf&&!hidden.perf&&<Card className="p-4 flex-1">{DH('Performance','perf')}<ResponsiveContainer width="100%" height={mobile?80:110}><AreaChart data={chartData} margin={{top:0,right:0,left:-20,bottom:0}}><defs><linearGradient id="cpuG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.accent} stopOpacity={0.3}/><stop offset="100%" stopColor={C.accent} stopOpacity={0}/></linearGradient><linearGradient id="gpuG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.purple} stopOpacity={0.3}/><stop offset="100%" stopColor={C.purple} stopOpacity={0}/></linearGradient></defs><YAxis domain={[0,100]} tick={false} axisLine={false}/><Tooltip contentStyle={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:8,fontSize:sz.base,color:C.text}}/><Area type="monotone" dataKey="cpu" stroke={C.accent} fill="url(#cpuG)" strokeWidth={1.5} dot={false} name="CPU"/><Area type="monotone" dataKey="gpu" stroke={C.purple} fill="url(#gpuG)" strokeWidth={1.5} dot={false} name="GPU"/></AreaChart></ResponsiveContainer><div className="flex gap-4 mt-1"><span className="font-bold" style={{color:C.accent,fontSize:sz.stat}}>CPU {sys.cpu.usage}%</span><span className="font-bold" style={{color:C.purple,fontSize:sz.stat}}>GPU {sys.gpu.usage}%</span></div></Card>}{!floating.bw&&!hidden.bw&&<Card className="p-4 flex-1">{DH('Bandwidth','bw')}<ResponsiveContainer width="100%" height={mobile?80:110}><AreaChart data={chartData} margin={{top:0,right:0,left:-20,bottom:0}}><defs><linearGradient id="upG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.accent} stopOpacity={0.3}/><stop offset="100%" stopColor={C.accent} stopOpacity={0}/></linearGradient><linearGradient id="dnG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.blue} stopOpacity={0.3}/><stop offset="100%" stopColor={C.blue} stopOpacity={0}/></linearGradient></defs><Tooltip contentStyle={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:8,fontSize:sz.base,color:C.text}}/><Area type="monotone" dataKey="up" stroke={C.accent} fill="url(#upG)" strokeWidth={1.5} dot={false} name="Upload"/><Area type="monotone" dataKey="down" stroke={C.blue} fill="url(#dnG)" strokeWidth={1.5} dot={false} name="Download"/></AreaChart></ResponsiveContainer><div className="flex gap-4 mt-1"><span className="font-bold" style={{color:C.accent,fontSize:sz.stat}}>Up {rate.up_mbps} Mbps</span><span className="font-bold" style={{color:C.blue,fontSize:sz.stat}}>Down {rate.down_mbps} Mbps</span></div></Card>}{!floating.storage&&!hidden.storage&&<Card className="p-4">{DH('Storage','storage')}{disks.map((dk,i)=>{const pct=dk.total>0?Math.round(dk.used/dk.total*100):0;return <div key={i} className="mb-2.5 last:mb-0"><div className="flex justify-between mb-1"><span className="font-bold" style={{color:C.textDim,fontSize:sz.stat}}>{dk.name}</span><span className="font-mono" style={{color:C.text,fontSize:sz.stat}}>{dk.used}/{dk.total}G</span></div><Bar pct={pct} color={pct>90?C.red:pct>70?C.orange:C.accent+'60'}/></div>})}</Card>}{!floating.bwest&&!hidden.bwest&&(()=>{const cap=settings?.uploadCapMbps||120;const mp=cfg?.game?.maxPlayers||0;const nvd=cfg?.game?.gameProperties?.networkViewDistance||1000;const ai=cfg?.operating?.aiLimit||0;const estMbps=Math.round((mp*0.12+(nvd/1000)*mp*0.02+ai*0.003)*10)/10;const pct=cap>0?Math.min(100,Math.round(estMbps/cap*100)):0;const over=estMbps>cap*0.8;return <Card className="p-4">{DH('Bandwidth Est.','bwest')}<div className="flex justify-between mb-1.5"><span className="font-bold" style={{color:over?C.orange:C.text,fontSize:sz.base+2}}>{estMbps} <span style={{color:C.textDim,fontSize:sz.stat}}>Mbps</span></span><span style={{color:C.textMuted,fontSize:sz.stat}}>cap {cap}</span></div><Bar pct={pct} color={over?C.orange:C.accent}/><div className="mt-2 space-y-0.5">{[[`${mp} players`,`${(mp*0.12).toFixed(1)} Mbps`],[`AI limit ${ai>0?ai:'off'}`,`${(ai*0.003).toFixed(2)} Mbps`],[`NetViewDist ${nvd}`,`${((nvd/1000)*mp*0.02).toFixed(2)} Mbps`]].map(([k,v])=><div key={k} className="flex justify-between" style={{fontSize:sz.stat}}><span style={{color:C.textMuted}}>{k}</span><span className="font-mono" style={{color:C.textDim}}>{v}</span></div>)}{over&&<div className="mt-1.5 font-bold" style={{color:C.orange,fontSize:sz.stat}}>Warning: may approach cap</div>}</div></Card>})()}</div>
      <div className="flex-1 flex flex-col min-h-0 gap-3">
        {/* Live players */}
        {!floating.players&&!hidden.players&&(()=>{const players=liveData?.players||[];return<Card className="shrink-0 p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-black uppercase tracking-widest" style={{color:C.textDim,fontSize:sz.label}}>Online Players</span>
            <Badge text={`${players.length} / ${s.maxPlayers}`} v={players.length>0?'default':'dim'} pulse={players.length>0}/>
            <div className="flex-1"/>
            <div className="flex items-center gap-1.5">
              {!mobile&&<button onClick={()=>detach('players')} title="Detach / float panel" style={{background:'none',border:`1px solid ${C.blue}50`,cursor:'pointer',color:C.blue,fontSize:11,padding:'1px 4px',lineHeight:1,borderRadius:4}} onMouseEnter={e=>{e.currentTarget.style.color=C.textBright;e.currentTarget.style.borderColor=C.blue}} onMouseLeave={e=>{e.currentTarget.style.color=C.blue;e.currentTarget.style.borderColor=C.blue+'50'}}>⬡</button>}
              <button onClick={()=>hide('players')} title="Hide panel (restore from bar above)" style={{background:'none',border:`1px solid ${C.border}`,cursor:'pointer',color:C.textMuted,fontSize:13,padding:'0px 4px',lineHeight:1.2,borderRadius:4}} onMouseEnter={e=>{e.currentTarget.style.color=C.red;e.currentTarget.style.borderColor=C.red+'50'}} onMouseLeave={e=>{e.currentTarget.style.color=C.textMuted;e.currentTarget.style.borderColor=C.border}}>×</button>
            </div>
          </div>
          {players.length===0
            ?<div style={{color:C.textMuted,fontSize:sz.base}}>No players connected</div>
            :<div className="space-y-1.5">{players.map((p,i)=>{
              const joinedMins=p.joined_at?Math.round((Date.now()/1000-p.joined_at)/60):null
              return <div key={p.player_guid||i} className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{background:C.bgInput,border:`1px solid ${C.border}`}}>
                <div className="w-7 h-7 rounded flex items-center justify-center font-black shrink-0" style={{background:C.accentBg,color:C.accent,fontSize:sz.base+1}}>{(p.player_name||'?')[0].toUpperCase()}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold truncate" style={{color:C.textBright,fontSize:sz.base}}>{p.player_name}</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {p.faction_name&&<span className="font-mono" style={{color:C.accent,fontSize:sz.stat-1}}>{p.faction_name}</span>}
                    {p.rank&&<span style={{color:C.textMuted,fontSize:sz.stat-1}}>{p.rank}</span>}
                    {p.platform&&<span style={{color:C.textDim,fontSize:sz.stat-1}}>{p.platform}</span>}
                    {!p.faction_name&&<span className="font-mono" style={{color:C.textMuted,fontSize:sz.stat-1}}>{p.player_guid?.slice(0,8)||p.ip||''}</span>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {joinedMins!=null&&<div className="font-mono" style={{color:C.textMuted,fontSize:sz.stat}}>{joinedMins}m</div>}
                  {(p.kills!=null||p.deaths!=null)&&<div className="font-mono" style={{color:C.textDim,fontSize:sz.stat}}>{p.kills||0}K/{p.deaths||0}D</div>}
                </div>
              </div>
            })}</div>}
        </Card>})()}
        {/* Live Console */}
        {!floating.console&&!hidden.console&&<div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center gap-2 mb-1.5"><span className="font-black uppercase tracking-widest" style={{color:C.textDim,fontSize:sz.label}}>Live Console</span><div className="flex-1"/><span className="font-mono" style={{color:C.textMuted,fontSize:sz.stat}}>{logs.length} lines</span><div className="flex items-center gap-1" style={{marginLeft:4}}>{!mobile&&<button onClick={()=>detach('console')} title="Detach / float panel" style={{background:'none',border:`1px solid ${C.blue}50`,cursor:'pointer',color:C.blue,fontSize:11,padding:'1px 4px',lineHeight:1,borderRadius:4}} onMouseEnter={e=>{e.currentTarget.style.color=C.textBright;e.currentTarget.style.borderColor=C.blue}} onMouseLeave={e=>{e.currentTarget.style.color=C.blue;e.currentTarget.style.borderColor=C.blue+'50'}}>⬡</button>}<button onClick={()=>hide('console')} title="Hide panel (restore from bar above)" style={{background:'none',border:`1px solid ${C.border}`,cursor:'pointer',color:C.textMuted,fontSize:13,padding:'0px 4px',lineHeight:1.2,borderRadius:4}} onMouseEnter={e=>{e.currentTarget.style.color=C.red;e.currentTarget.style.borderColor=C.red+'50'}} onMouseLeave={e=>{e.currentTarget.style.color=C.textMuted;e.currentTarget.style.borderColor=C.border}}>×</button></div></div>
          <div ref={logRef} onScroll={()=>{if(logRef.current){scrolledUp.current=logRef.current.scrollHeight-logRef.current.scrollTop-logRef.current.clientHeight>40}}} className={`rounded-lg overflow-auto leading-[1.8] font-mono py-1 ${mobile?'':'flex-1 min-h-0'}`} style={{background:C.consoleBg,border:`1px solid ${C.border}`,fontSize:sz.code,...(mobile?{maxHeight:150}:{})}}>{logs.map((l,i)=>{const lv=LVL[l.level]||LVL.INFO;const sev=l.level==='ERROR'||l.level==='FATAL';return <div key={i} className="flex items-start gap-1.5 px-3 py-[2px]" style={sev?{background:'#ff475706',borderLeft:`2px solid ${lv.c}`}:{borderLeft:'2px solid transparent'}}><span className="w-3 text-center shrink-0" style={{color:lv.c}}>{lv.i}</span><span className="w-[68px] shrink-0" style={{color:C.textMuted,fontSize:sz.code-1}}>{l.ts}</span><SrcTag source={l.source}/><span className="flex-1 break-words" style={{color:sev?lv.c:l.level==='WARN'?C.orange:C.textDim,fontWeight:sev?700:400}}>{l.msg}</span></div>})}<div className="px-3 py-[2px]"><span className="animate-[blink_1s_step-end_infinite]" style={{color:C.accent}}>_</span></div></div>
        </div>}
      </div>
    {!floating.serverstats&&!hidden.serverstats&&<Card className="p-4">{DH('Server Stats','serverstats')}<ServerStats/></Card>}
    </div>
    <Modal open={showReset} onClose={()=>!resetting&&setShowReset(false)} title="Reset Server"><div className="mb-4" style={{color:C.textDim,fontSize:sz.base}}>Stop, clean, update, start</div><div className="space-y-2">{[['update','Update via SteamCMD','Download latest files'],['clearSaves','Wipe Saves','Irreversible'],['clearLogs','Clear Logs','Delete logs']].map(([key,label,desc])=><div key={key} onClick={()=>!resetting&&setResetOpts(p=>({...p,[key]:!p[key]}))} className="flex items-center gap-3 p-3 rounded-lg cursor-pointer" style={{background:resetOpts[key]?C.accentBg:C.bgInput,border:`1px solid ${resetOpts[key]?C.accent+'30':C.border}`}}><div className="w-4 h-4 rounded flex items-center justify-center" style={{border:`2px solid ${resetOpts[key]?C.accent:C.textMuted}`,background:resetOpts[key]?C.accent:'transparent',color:resetOpts[key]?'#000':'transparent',fontSize:10}}>ok</div><div className="flex-1"><div className="font-bold" style={{color:resetOpts[key]?C.textBright:C.textDim,fontSize:sz.base}}>{label}</div><div style={{color:C.textMuted,fontSize:sz.stat}}>{desc}</div></div></div>)}</div><div className="flex gap-2 justify-end mt-4"><Btn v="ghost" onClick={()=>setShowReset(false)}>Cancel</Btn><Btn v="info" onClick={doReset} disabled={resetting}>{resetting?'Running...':'Execute'}</Btn></div></Modal></div>}

function Console({toast}){const{C,sz}=useT();const mobile=useMobile()
  const{data,loading}=useFetch(`${API}/logs?lines=0`,4000)
  const[filter,setFilter]=useState('');const[cmd,setCmd]=useState('');const[useRegex,setUseRegex]=useState(false)
  const[lvls,setLvls]=useState({FATAL:true,ERROR:true,WARN:true,INFO:true,DEBUG:false})
  const[srcF,setSrcF]=useState(null);const[autoScroll,setAutoScroll]=useState(true);const[tab,setTab]=useState(()=>{try{return localStorage.getItem('console-tab')||'logs'}catch{return 'logs'}})
  useEffect(()=>{try{localStorage.setItem('console-tab',tab)}catch{}},[tab])
  const[showFilters,setShowFilters]=useState(false)
  useEffect(()=>{if(tab!=='logs')setShowFilters(false)},[tab])
  const[eventF,setEventF]=useState(null)
  const EVENT_FILTERS={connect:['Authenticated player','Player connected','Creating player','player_joined','authenticating'],disconnect:['Player disconnected','disconnected','player_left'],kill:['player_killed','killed','teamkill'],chat:['chat message','said:','SCR_Global_Chat','ChatMessage']}
  const ref=useRef(null);const iRef=useRef(null)
  const[broadcast,setBroadcast]=useState('');const[broadcasting,setBroadcasting]=useState(false)
  const[cmdHistory,setCmdHistory]=useState([]);const[cmdHistIdx,setCmdHistIdx]=useState(-1)
  useEffect(()=>{if(!ref.current||!autoScroll)return;ref.current.scrollTop=ref.current.scrollHeight},[data,autoScroll])
  const sendCmd=async()=>{if(!cmd.trim())return;const c=cmd.trim();setCmdHistory(h=>[c,...h.slice(0,49)]);setCmdHistIdx(-1);toast(`> ${c}`,'info');await post(`${API}/rcon/command`,{command:c});setCmd('');iRef.current?.focus()}
  const sendBroadcast=async()=>{if(!broadcast.trim()||broadcasting)return;setBroadcasting(true);const r=await post(`${API}/admin/rcon/message`,{message:broadcast.trim()});setBroadcasting(false);r?.error?toast(r.error,'danger'):(toast('Broadcast sent'),setBroadcast(''))}
  const compiledRegex=useMemo(()=>{if(!filter||!useRegex)return null;if(filter.length>200)return null;try{return new RegExp(filter,'i')}catch{return null}},[filter,useRegex])
  const matchFilter=(msg)=>{if(!filter)return true;if(useRegex){if(!compiledRegex)return true;return compiledRegex.test(msg)};return msg.toLowerCase().includes(filter.toLowerCase())}
  const matchEvent=(msg)=>{if(!eventF)return true;const kws=EVENT_FILTERS[eventF]||[];return kws.some(k=>msg.toLowerCase().includes(k.toLowerCase()))}
  const logs=useMemo(()=>(data||[]).filter(l=>lvls[l.level]!==false&&(!srcF||l.source===srcF)&&matchFilter(l.msg)&&matchEvent(l.msg)),[data,lvls,srcF,filter,useRegex,eventF])
  const stats=useMemo(()=>{const s={};(data||[]).forEach(l=>{s[l.level]=(s[l.level]||0)+1});return s},[data])
  // Player events extracted from logs
  const playerEvents=useMemo(()=>{const events=[];(data||[]).forEach(l=>{const m=l.msg;if(m.includes('Player joined')||m.includes('player_joined')||m.includes('Updating player:')){const nm=m.match(/[Nn]ame[=:\s]+([^,\s|]+)/);const id=m.match(/[Ii]dentity[Ii]d[=:\s]+([0-9a-f-]{20,})/i)||m.match(/identity[=:\s]+([0-9a-f-]{20,})/i);events.push({type:'join',name:nm?nm[1]:'Unknown',id:id?id[1]:'',ts:l.ts,raw:m})}
    else if(m.includes('Player left')||m.includes('player_left')||m.includes('disconnected')){const nm=m.match(/[Nn]ame[=:\s]+([^,\s|]+)/);events.push({type:'leave',name:nm?nm[1]:'Unknown',ts:l.ts,raw:m})}
    else if(m.includes('Players connected:')){const ct=m.match(/Players connected:\s*(\d+)\s*\/\s*(\d+)/);if(ct)events.push({type:'count',current:ct[1],max:ct[2],ts:l.ts})}});return events},[data])
  // Error grouping
  const errorGroups=useMemo(()=>{const groups={};(data||[]).filter(l=>l.level==='ERROR'||l.level==='FATAL').forEach(l=>{const key=l.msg.slice(0,80);if(!groups[key])groups[key]={msg:l.msg,count:0,first:l.ts,last:l.ts};groups[key].count++;groups[key].last=l.ts});return Object.values(groups).sort((a,b)=>b.count-a.count)},[data])
  const exportLogs=()=>{const text=logs.map(l=>`${l.ts} [${l.level}] [${l.source}] ${l.msg}`).join('\n');const blob=new Blob([text],{type:'text/plain'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`server-logs-${new Date().toISOString().slice(0,10)}.txt`;a.click();URL.revokeObjectURL(url);toast('Logs exported')}
  return <div className="flex flex-col h-full">
    {/* Tab bar */}
    <div className="flex items-center gap-3 mb-2 flex-wrap">
      <div className="flex rounded-lg overflow-hidden" style={{background:C.bgInput,border:`1px solid ${C.border}`}}>
        {['logs','players','errors'].map(t=><button key={t} onClick={()=>setTab(t)} className="px-4 py-1.5 font-bold capitalize cursor-pointer" style={{background:tab===t?C.accentBg:'transparent',color:tab===t?C.accent:C.textDim,fontSize:sz.nav}}>{t==='players'?`Players (${playerEvents.filter(e=>e.type==='join').length})`:t==='errors'?`Errors (${errorGroups.length})`:t}</button>)}
      </div>
      <div className="flex-1"/>
      <Btn small v="ghost" onClick={exportLogs}>Export</Btn>
      <Btn small v={autoScroll?'default':'ghost'} onClick={()=>setAutoScroll(p=>!p)}>{autoScroll?'Auto-scroll ON':'Auto-scroll OFF'}</Btn>
    </div>
    {tab==='logs'&&<>
      {mobile&&<button onClick={()=>setShowFilters(p=>!p)} className="flex items-center gap-2 px-3 py-2 rounded-lg font-bold cursor-pointer mb-2 w-full" style={{background:C.bgInput,border:`1px solid ${C.border}`,color:C.textDim,fontSize:sz.stat}}>⚙ Filters {showFilters?'▲':'▼'}{(Object.values(lvls).some(v=>!v)||srcF||eventF||filter)&&<span style={{color:C.accent}}>●</span>}</button>}
      {(!mobile||showFilters)&&<div className="flex gap-1.5 mb-2 items-center flex-wrap">
        {['FATAL','ERROR','WARN','INFO','DEBUG'].map(l=>{const ct=stats[l]||0;if(l==='FATAL'&&ct===0)return null;const lv=LVL[l];return <button key={l} onClick={()=>setLvls(p=>({...p,[l]:!p[l]}))} className="px-2.5 py-1 rounded font-black cursor-pointer transition-opacity" style={{color:lv.c,border:`1px solid ${lv.c}25`,background:lv.c+'0a',opacity:lvls[l]?1:0.2,fontSize:sz.stat}}>{l} {ct}</button>})}
        {srcF&&<button onClick={()=>setSrcF(null)} className="px-2.5 py-1 rounded font-black cursor-pointer" style={{color:C.accent,background:C.accentBg,border:`1px solid ${C.accent}30`,fontSize:sz.stat}}>{SRC_LABELS[srcF]} x</button>}
        <div className="flex-1"/>
        {/* Event type quick filters */}
        {[['connect',C.accent],['disconnect',C.red],['kill',C.orange],['chat',C.blue]].map(([ev,col])=><button key={ev} onClick={()=>setEventF(p=>p===ev?null:ev)} className="px-2.5 py-1 rounded font-bold capitalize cursor-pointer" style={{color:eventF===ev?col:C.textMuted,background:eventF===ev?col+'18':'transparent',border:`1px solid ${eventF===ev?col+'40':C.border}`,fontSize:sz.stat}}>{ev}</button>)}
        {eventF&&<button onClick={()=>setEventF(null)} className="px-2 py-1 rounded font-bold cursor-pointer" style={{color:C.textMuted,background:C.bgInput,border:`1px solid ${C.border}`,fontSize:sz.stat}}>all</button>}
        <button onClick={()=>setUseRegex(p=>!p)} className="px-2 py-1 rounded font-bold cursor-pointer" style={{color:useRegex?C.accent:C.textMuted,background:useRegex?C.accentBg:'transparent',border:`1px solid ${useRegex?C.accent+'30':C.border}`,fontSize:sz.stat}}>.*</button>
        <input value={filter} onChange={e=>setFilter(e.target.value)} placeholder={useRegex?"Regex...":"Player / keyword..."} className={`rounded-lg px-3 py-1.5 outline-none placeholder:opacity-30 ${mobile?'flex-1':'w-44'}`} style={{background:C.bgInput,border:`1px solid ${filter?C.accent+'60':C.border}`,color:C.text,fontSize:sz.input}}/>
      </div>}
      <div ref={ref} className="flex-1 rounded-lg overflow-auto leading-[1.8] py-1 font-mono min-h-0" style={{background:C.consoleBg,border:`1px solid ${C.border}`,fontSize:sz.code}}>
        {loading&&<div className="p-4 animate-pulse" style={{color:C.textMuted}}>Loading...</div>}
        {logs.map((l,i)=>{const lv=LVL[l.level]||LVL.INFO;const sev=l.level==='ERROR'||l.level==='FATAL';return <div key={i} onClick={()=>setSrcF(l.source===srcF?null:l.source)} className="flex items-start gap-1.5 px-3 py-[2px] cursor-pointer transition-colors" style={sev?{background:'#ff475706',borderLeft:`2px solid ${lv.c}`}:{borderLeft:'2px solid transparent'}} onMouseEnter={e=>{if(!sev)e.currentTarget.style.background=C.bgHover}} onMouseLeave={e=>{if(!sev)e.currentTarget.style.background='transparent'}}>
          <span className="w-3 text-center shrink-0" style={{color:lv.c}}>{lv.i}</span>{!mobile&&<span className="w-[72px] shrink-0" style={{color:C.textMuted,fontSize:sz.code-1}}>{l.ts}</span>}<SrcTag source={l.source}/><span className="flex-1 break-words" style={{color:sev?lv.c:l.level==='WARN'?C.orange:C.textDim,fontWeight:sev?700:400}}>{l.msg}</span></div>})}
        <div className="px-3 py-[2px]"><span className="animate-[blink_1s_step-end_infinite]" style={{color:C.accent}}>_</span></div>
      </div>
      <div className="flex gap-2 mt-2 items-center px-2 py-1.5 rounded-xl" style={{background:C.bgInput,border:`1px solid ${C.border}`}}>
        <span className="font-black shrink-0 px-1" style={{color:C.accent,fontSize:sz.base+2}}>📢</span>
        <input value={broadcast} onChange={e=>setBroadcast(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sendBroadcast()} placeholder="Broadcast to all players..." className="flex-1 rounded-lg px-2 py-1.5 outline-none placeholder:opacity-30" style={{background:'transparent',color:C.text,fontSize:sz.input}}/>
        <Btn small onClick={sendBroadcast} disabled={broadcasting}>{broadcasting?'Sending...':'Broadcast'}</Btn>
      </div>
      <div className={`grid gap-1.5 mt-1.5 ${mobile?'grid-cols-2':'grid-cols-4'}`}>
        {[['#restart','Restart',C.orange],['#shutdown','Shutdown',C.red],['#missions','List Missions',C.blue],['#monitor1','Monitor',C.accent]].map(([c,label,col])=>
          <button key={c} onClick={()=>{setCmd(c);iRef.current?.focus()}} className="px-3 py-1.5 rounded-lg font-bold cursor-pointer" style={{background:col+'12',color:col,border:`1px solid ${col}30`,fontSize:sz.stat}}>{label}</button>)}
      </div>
      <div className="flex gap-2 mt-1.5 items-center">
        <span className="font-black" style={{color:C.accent,fontSize:sz.base+4}}>$</span>
        <input ref={iRef} value={cmd} onChange={e=>setCmd(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')sendCmd();if(e.key==='ArrowUp'&&cmdHistory.length>0){const i=Math.min(cmdHistIdx+1,cmdHistory.length-1);setCmdHistIdx(i);setCmd(cmdHistory[i])};if(e.key==='ArrowDown'){const i=Math.max(cmdHistIdx-1,-1);setCmdHistIdx(i);setCmd(i<0?'':cmdHistory[i])}}} placeholder="RCON command... (↑↓ history)" className="flex-1 rounded-lg px-3 outline-none font-mono placeholder:opacity-30" style={{paddingTop:mobile?12:10,paddingBottom:mobile?12:10,background:C.bgInput,border:`1px solid ${C.border}`,color:C.text,fontSize:sz.input}}/>
        <Btn onClick={sendCmd}>Execute</Btn>
      </div>
      {cmdHistory.length>0&&<div className="flex gap-1 flex-wrap mt-1">{cmdHistory.slice(0,8).map((h,i)=><button key={i} onClick={()=>{setCmd(h);iRef.current?.focus()}} className="px-2 py-0.5 rounded font-mono cursor-pointer" style={{background:C.bgInput,color:C.textMuted,border:`1px solid ${C.border}`,fontSize:sz.stat}}>{h}</button>)}</div>}
      <div className="flex justify-between mt-1">
        <span style={{color:C.textMuted,fontSize:sz.stat}}>Click source tags to filter | full session log | {eventF?`Event: ${eventF} | `:''}{ useRegex?'Regex':'Keyword'} search</span>
        <span className="font-mono" style={{color:C.textMuted,fontSize:sz.stat}}>{logs.length}/{(data||[]).length}</span>
      </div>
    </>}
    {tab==='players'&&<div className="flex-1 overflow-auto">
      {playerEvents.length===0?<Empty title="No player events detected" sub="Player joins/leaves will appear here as they happen"/>:
        <div className="space-y-1">{playerEvents.slice().reverse().map((ev,i)=><Card key={i} className="px-4 py-3 flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full" style={{background:ev.type==='join'?C.accent:ev.type==='leave'?C.red:C.blue}}/>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2"><span className="font-bold" style={{color:C.text,fontSize:sz.base}}>{ev.name||'Player'}</span>
              <span className="font-bold uppercase" style={{color:ev.type==='join'?C.accent:ev.type==='leave'?C.red:C.blue,fontSize:sz.stat}}>{ev.type==='count'?`${ev.current}/${ev.max} online`:ev.type}</span></div>
            {ev.id&&<div className="font-mono mt-0.5 truncate" style={{color:C.textMuted,fontSize:sz.stat}}>{ev.id}</div>}
          </div>
          <span className="font-mono shrink-0" style={{color:C.textMuted,fontSize:sz.stat}}>{ev.ts}</span>
        </Card>)}</div>}
    </div>}
    {tab==='errors'&&<div className="flex-1 overflow-auto">
      {errorGroups.length===0?<Empty title="No errors" sub="Errors will be grouped and counted here"/>:
        <div className="space-y-1.5">{errorGroups.map((eg,i)=><Card key={i} className="px-4 py-3">
          <div className="flex items-center gap-3 mb-1">
            <span className="px-2 py-0.5 rounded font-black" style={{background:C.redBg,color:C.red,border:`1px solid ${C.redBorder}`,fontSize:sz.stat}}>x{eg.count}</span>
            <span className="font-mono" style={{color:C.textMuted,fontSize:sz.stat}}>{eg.first}{eg.first!==eg.last?` - ${eg.last}`:''}</span>
          </div>
          <div className="font-mono break-words" style={{color:C.red,fontSize:sz.code}}>{eg.msg}</div>
        </Card>)}</div>}
    </div>}
  </div>}


// ═══════════════════════════════════════════════════════════
// PLAYERS & ADMIN — combined operations center
// ═══════════════════════════════════════════════════════════
function StartupDiagnostics({C,sz,toast}){
  const{data:diag,loading,refetch}=useFetch(`${API}/diagnostics`,0)
  const[refreshing,setRefreshing]=useState(false)
  const[removing,setRemoving]=useState(null) // mod id being removed, or 'all'
  const refresh=async()=>{setRefreshing(true);await refetch();setRefreshing(false)}
  const removeMod=async(modId)=>{
    setRemoving(modId)
    const r=await post(`${API}/diagnostics/remove-mods`,{mod_ids:[modId]})
    setRemoving(null)
    if(r.error){toast(r.error,'danger');return}
    toast(r.message||'Mod removed','warning')
    refetch()
  }
  const removeAll=async()=>{
    const mods=diag?.config_mods_to_remove||[]
    if(!mods.length)return
    setRemoving('all')
    const r=await post(`${API}/diagnostics/remove-mods`,{mod_ids:mods.map(m=>m.id)})
    setRemoving(null)
    if(r.error){toast(r.error,'danger');return}
    toast(r.message||'Mods removed','warning')
    refetch()
  }
  if(loading)return<div className="py-12 text-center" style={{color:C.textMuted,fontSize:sz.base}}>Analyzing startup log...</div>
  if(!diag||!diag.log_found)return<Card className="p-6"><div style={{color:C.textMuted,fontSize:sz.base}}>No server startup log found. Start the server at least once to generate diagnostics.</div></Card>
  const hasCritical=diag.script_module_failed||diag.mission_load_failed
  const statusColor=hasCritical?C.red:C.accent
  return<div className="flex flex-col gap-3">
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full" style={{background:statusColor}}/>
        <span className="font-black uppercase tracking-widest" style={{color:statusColor,fontSize:sz.stat}}>
          {hasCritical?'CRITICAL ERRORS DETECTED':'NO CRITICAL ERRORS'}
        </span>
      </div>
      <span style={{color:C.textMuted,fontSize:sz.stat}}>Engine v{diag.engine_version||'?'} · {diag.addons_loaded} addons discovered</span>
      <button onClick={refresh} disabled={refreshing} className="ml-auto font-bold cursor-pointer px-3 py-1 rounded-lg" style={{background:C.bgInput,color:C.textDim,border:`1px solid ${C.border}`,fontSize:sz.stat,opacity:refreshing?0.5:1}}>
        {refreshing?'Refreshing...':'Refresh'}
      </button>
    </div>
    {diag.issues.length>0&&<Card className="p-4">
      <div className="font-black uppercase tracking-widest mb-3" style={{color:C.textDim,fontSize:sz.stat}}>Issues</div>
      <div className="flex flex-col gap-2">
        {diag.issues.map((issue,i)=><div key={i} className="flex items-start gap-2 p-2.5 rounded-lg" style={{background:hasCritical?C.redBg:C.accentBg,border:`1px solid ${hasCritical?C.redBorder:C.accent+'30'}`}}>
          <span style={{color:hasCritical?C.red:C.accent,fontSize:sz.base,lineHeight:1.4,fontWeight:700}}>{issue}</span>
        </div>)}
      </div>
    </Card>}
    {diag.recommendations.length>0&&<Card className="p-4">
      <div className="font-black uppercase tracking-widest mb-3" style={{color:C.textDim,fontSize:sz.stat}}>Recommendations</div>
      <div className="flex flex-col gap-2">
        {diag.recommendations.map((rec,i)=><div key={i} className="flex items-start gap-2 p-2.5 rounded-lg" style={{background:C.bgInput,border:`1px solid ${C.border}`}}>
          <span style={{color:C.orange,fontWeight:900,fontSize:sz.base,marginTop:1,flexShrink:0}}>→</span>
          <span style={{color:C.textDim,fontSize:sz.base,lineHeight:1.4}}>{rec}</span>
        </div>)}
      </div>
    </Card>}
    {(diag.broken_mods||diag.broken_mod_ids||[]).length>0&&<Card className="p-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="font-black uppercase tracking-widest flex-1" style={{color:C.textDim,fontSize:sz.stat}}>Broken Mods</span>
      </div>
      <div className="mb-3" style={{color:C.textMuted,fontSize:sz.stat}}>Addon(s) containing broken scripts (may be auto-pulled dependencies):</div>
      <div className="flex flex-col gap-1 mb-4">
        {(diag.broken_mods||diag.broken_mod_ids.map(id=>({id,name:id}))).map(m=><div key={m.id} className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{background:C.redBg,border:`1px solid ${C.redBorder}`}}>
          <span className="font-bold" style={{color:C.red,fontSize:sz.base}}>{m.name}</span>
          <span className="font-mono ml-auto" style={{color:C.orange,fontSize:sz.stat-1}}>{m.id}</span>
        </div>)}
      </div>
      {(diag.config_mods_to_remove||[]).length>0&&<>
        <div className="flex items-center gap-2 mb-2">
          <span className="font-black uppercase tracking-widest flex-1" style={{color:C.textDim,fontSize:sz.stat}}>Remove from config.json</span>
          {(diag.config_mods_to_remove||[]).length>1&&<button onClick={removeAll} disabled={!!removing} className="font-bold cursor-pointer px-3 py-1 rounded-lg" style={{background:C.redBg,color:C.red,border:`1px solid ${C.redBorder}`,fontSize:sz.stat,opacity:removing?0.5:1}}>
            {removing==='all'?'Removing...':'Remove All'}
          </button>}
        </div>
        <div className="flex flex-col gap-2">
          {(diag.config_mods_to_remove||[]).map(m=><div key={m.id} className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{background:C.bgInput,border:`1px solid ${C.border}`}}>
            <div className="flex-1 min-w-0">
              <div className="font-bold" style={{color:C.textBright,fontSize:sz.base}}>{m.name}</div>
              <div className="font-mono" style={{color:C.textMuted,fontSize:sz.stat-1}}>{m.id}</div>
            </div>
            <button onClick={()=>removeMod(m.id)} disabled={!!removing} className="font-bold cursor-pointer px-3 py-1 rounded-lg shrink-0" style={{background:C.redBg,color:C.red,border:`1px solid ${C.redBorder}`,fontSize:sz.stat,opacity:removing?0.5:1}}>
              {removing===m.id?'Removing...':'Remove'}
            </button>
          </div>)}
        </div>
        <div className="mt-3 p-2.5 rounded-lg" style={{background:C.bgInput,border:`1px solid ${C.border}`}}>
          <div style={{color:C.textMuted,fontSize:sz.stat}}>Edits <span className="font-mono">config.json</span> and backs up the original. Restart the server to apply.</div>
        </div>
      </>}
    </Card>}
    {diag.script_errors.length>0&&<Card className="p-4">
      <div className="font-black uppercase tracking-widest mb-3" style={{color:C.textDim,fontSize:sz.stat}}>Script Errors ({diag.script_errors.length})</div>
      <div className="flex flex-col gap-1" style={{maxHeight:300,overflowY:'auto'}}>
        {diag.script_errors.map((err,i)=><div key={i} className="flex items-start gap-2 py-1.5 px-2 rounded font-mono" style={{background:i%2===0?C.bgInput:'transparent',fontSize:sz.stat}}>
          <span style={{color:C.red,flexShrink:0,fontWeight:700}}>ERR</span>
          <span style={{color:C.textMuted,flexShrink:0}}>{err.file.split('/').pop()}:{err.line}</span>
          <span style={{color:C.textDim,flex:1,wordBreak:'break-word'}}>{err.message}</span>
        </div>)}
      </div>
    </Card>}
    {diag.mission_load_failed&&<Card className="p-4">
      <div className="font-black uppercase tracking-widest mb-2" style={{color:C.textDim,fontSize:sz.stat}}>Mission Load</div>
      <div className="flex items-center gap-2">
        <span className="font-bold px-2 py-1 rounded" style={{background:C.redBg,color:C.red,border:`1px solid ${C.redBorder}`,fontSize:sz.stat}}>FAILED</span>
        <span className="font-mono" style={{color:C.textMuted,fontSize:sz.stat}}>{diag.mission_id||'unknown'}</span>
      </div>
      {diag.script_module_failed&&<div className="mt-2" style={{color:C.textMuted,fontSize:sz.stat}}>Caused by script module failure — fix the mod scripts first.</div>}
    </Card>}
    <div className="mt-1" style={{color:C.textMuted,fontSize:sz.stat-1}}>Log: {diag.log_path}</div>
  </div>
}

function Startup({toast,authUser}){const{C,sz}=useT();const isDemo=authUser?.role==='demo'
  const[startupTab,setStartupTab]=useState(()=>{try{return localStorage.getItem('startup-tab')||'params'}catch{return'params'}})
  useEffect(()=>{try{localStorage.setItem('startup-tab',startupTab)}catch{}},[startupTab])
  useEffect(()=>{const h=e=>setStartupTab(e.detail||'diagnostics');window.addEventListener('sitrep-startup-tab',h);return()=>window.removeEventListener('sitrep-startup-tab',h)},[])
  const{data:startupData,reload:reloadStartup}=useFetchOnce(`${API}/server/startup-params`)
  const{data:diagQuick}=useFetch(`${API}/diagnostics`,30000)
  const[startupEdits,setStartupEdits]=useState({})
  const[startupSaving,setStartupSaving]=useState(false)
  const[startupCategory,setStartupCategory]=useState('Performance')
  const startupParams=startupData?.params||[]
  const startupCategories=[...new Set(startupParams.map(p=>p.category))]
  const shownParams=startupParams.filter(p=>p.category===startupCategory)
  const getParamVal=(key)=>{if(key in startupEdits)return startupEdits[key];const p=startupParams.find(x=>x.key===key);return p?.active?p.value:p?.type==='flag'?false:p?.type==='int'?0:''}
  const saveStartup=async()=>{
    setStartupSaving(true)
    const payload={}
    startupParams.forEach(p=>{const v=getParamVal(p.key);if(p.type==='flag')payload[p.key]=!!v;else if(p.type==='int')payload[p.key]=Number(v)||0;else payload[p.key]=v||''})
    const r=await put(`${API}/server/startup-params`,{params:payload})
    setStartupSaving(false)
    r.error?toast(r.error,'danger'):(toast('Startup params saved. Restart server to apply.'),reloadStartup(),setStartupEdits({}))
  }
  const hasDiagWarning=diagQuick&&(diagQuick.script_module_failed||diagQuick.mission_load_failed)
  return <div className="flex flex-col h-full gap-3">
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex rounded-lg overflow-hidden" style={{background:C.bgInput,border:`1px solid ${C.border}`}}>
        {[{id:'params',label:'Startup Params'},{id:'diagnostics',label:hasDiagWarning?'Diagnostics ⚠':'Diagnostics'},{id:'saves',label:'Save Management'}].map(t=><button key={t.id} onClick={()=>setStartupTab(t.id)} className="px-4 py-1.5 font-bold cursor-pointer" style={{background:startupTab===t.id?C.accentBg:'transparent',color:startupTab===t.id?(t.id==='diagnostics'&&hasDiagWarning?C.red:C.accent):t.id==='diagnostics'&&hasDiagWarning?C.orange:C.textDim,fontSize:sz.nav}}>{t.label}</button>)}
      </div>
      {startupTab==='params'&&<div className="ml-auto flex gap-2 items-center">
        {!isDemo&&Object.keys(startupEdits).length>0&&<Btn v="ghost" onClick={()=>setStartupEdits({})}>Discard</Btn>}
        {!isDemo&&<Btn onClick={saveStartup} disabled={startupSaving}>{startupSaving?'Saving...':'Save & Apply'}</Btn>}
        {isDemo&&<span className="font-bold px-2" style={{color:C.textMuted,fontSize:sz.stat}}>View only</span>}
      </div>}
    </div>
    {startupTab==='params'&&<>
      <Card className="p-4"><div style={{color:C.textMuted,fontSize:sz.stat}}>Control Arma Reforger command-line flags. Changes take effect after a server restart. The executable path and <span className="font-mono">-config</span>/<span className="font-mono">-profile</span> are managed automatically.</div></Card>
      <div className="flex gap-2 flex-wrap">
        {startupCategories.map(cat=><button key={cat} onClick={()=>setStartupCategory(cat)} className="px-3 py-1.5 rounded-lg font-bold cursor-pointer" style={{background:startupCategory===cat?C.accentBg:C.bgInput,color:startupCategory===cat?C.accent:C.textDim,border:`1px solid ${startupCategory===cat?C.accent+'40':C.border}`,fontSize:sz.nav}}>{cat}</button>)}
      </div>
      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-4">
          {shownParams.map(p=>{
            const val=getParamVal(p.key)
            return <Card key={p.key} className="p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold" style={{color:C.textBright,fontSize:sz.base}}>{p.label}</span>
                    {p.description&&<div className="relative group inline-block">
                      <span className="cursor-help select-none leading-none" style={{color:C.textMuted,fontSize:sz.stat+1}}>ⓘ</span>
                      <div className="absolute left-0 top-full mt-1 z-[9999] hidden group-hover:block w-64 rounded-lg p-2.5 shadow-xl" style={{background:C.bgCard,border:`1px solid ${C.border}`,color:C.textDim,fontSize:sz.stat,lineHeight:1.5}}>{p.description}</div>
                    </div>}
                  </div>
                  <div className="font-mono mt-0.5" style={{color:C.textMuted,fontSize:sz.stat}}>-{p.key}</div>
                </div>
                {p.active&&!(p.key in startupEdits)?<Badge text="ACTIVE" v="default"/>:p.key in startupEdits?<Badge text="MODIFIED" v="warning"/>:null}
              </div>
              {p.type==='flag'&&<Toggle value={!!val} onChange={()=>setStartupEdits(e=>({...e,[p.key]:!val}))}/>}
              {p.type==='int'&&<div className="flex items-center gap-2">
                <input type="number" value={val||0} min={p.min??undefined} max={p.max??undefined} onChange={e=>setStartupEdits(x=>({...x,[p.key]:Number(e.target.value)}))} className="flex-1 rounded-lg px-3 py-2 outline-none font-mono" style={{background:C.bgInput,border:`1px solid ${C.border}`,color:C.text,fontSize:sz.input}}/>
                {p.min!==undefined&&p.max!==undefined&&<span style={{color:C.textMuted,fontSize:sz.stat}}>{p.min}–{p.max}</span>}
              </div>}
              {p.type==='string'&&<input value={val||''} onChange={e=>setStartupEdits(x=>({...x,[p.key]:e.target.value}))} className="w-full rounded-lg px-3 py-2 outline-none" style={{background:C.bgInput,border:`1px solid ${C.border}`,color:C.text,fontSize:sz.input}} placeholder={`e.g. ${p.default||''}`}/>}
              {p.type==='enum'&&<div className="flex rounded-lg overflow-hidden" style={{background:C.bgInput,border:`1px solid ${C.border}`}}>{(p.options||[]).map(o=><button key={o} onClick={()=>setStartupEdits(x=>({...x,[p.key]:o}))} className="flex-1 px-3 py-1.5 font-bold cursor-pointer" style={{background:val===o?C.accentBg:'transparent',color:val===o?C.accent:C.textDim,fontSize:sz.nav}}>{o}</button>)}</div>}
            </Card>
          })}
        </div>
      </div>
    </>}
    {startupTab==='diagnostics'&&<div className="flex-1 overflow-auto"><StartupDiagnostics C={C} sz={sz} toast={toast}/></div>}
    {startupTab==='saves'&&<Saves toast={toast}/>}
  </div>
}

// ═══════════════════════════════════════════════════════════
const safeParse=(str,fallback=[])=>{try{return JSON.parse(str)}catch{return fallback}}
const KNOWN_ADMIN_MODS={'5AAAC70D754245DD':'sat','68DC33B21E340EA1':'mat'}
const SortBtn=({col,label,dbSort,setDbSort,setDbSortDir,dbSortDir,C,sz})=><button onClick={()=>{if(dbSort===col)setDbSortDir(d=>d==='desc'?'asc':'desc');else{setDbSort(col);setDbSortDir('desc')}}} className="cursor-pointer font-black uppercase tracking-wide flex items-center gap-1" style={{color:dbSort===col?C.accent:C.textDim,fontSize:sz.stat}}>{label}{dbSort===col&&<span style={{fontSize:sz.stat}}>{dbSortDir==='desc'?'↓':'↑'}</span>}</button>

function Admin({toast,authUser}){const{C,sz}=useT();const mobile=useMobile()
  // Core data
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
  // Detected mods
  const hasSat=modData?.sat||false
  const hasMat=modData?.mat||false
  const{data:rconLogs}=useFetch(`${API}/logs?lines=500`,5000)
  const[broadcastMsg,setBroadcastMsg]=useState('');const[broadcastSending,setBroadcastSending]=useState(false)
  const[adminLogFilter,setAdminLogFilter]=useState('')
  const sendBroadcast=async()=>{if(!broadcastMsg.trim()||broadcastSending)return;setBroadcastSending(true);const r=await post(`${API}/admin/rcon/message`,{message:broadcastMsg.trim()});setBroadcastSending(false);r.error?toast(r.error,'danger'):(toast('Broadcast sent'),setBroadcastMsg(''))}
  // Player notes modal
  const[showNotes,setShowNotes]=useState(false);const[notesTarget,setNotesTarget]=useState(null);const[notesText,setNotesText]=useState('')
  const openNotes=async(p)=>{setNotesTarget(p);setNotesText('');setShowNotes(true);try{const r=await fetch(`${API}/players/${p.guid}/notes`,{headers:authHeaders()});if(r.status===401){on401();return};const j=await r.json();setNotesText(j.notes||'')}catch{toast('Failed to load notes','danger')}}
  const saveNotes=async()=>{if(!notesTarget)return;const r=await put(`${API}/players/${notesTarget.guid}/notes`,{notes:notesText});if(r?.error){toast(r.error,'danger');return};toast('Notes saved');setShowNotes(false);reloadHistory()}
  // Database sort/filter state
  const[dbSort,setDbSort]=useState('last_seen');const[dbSortDir,setDbSortDir]=useState('desc');const[dbPage,setDbPage]=useState(0)
  const DB_PAGE_SIZE=50
  const[expandedPlayer,setExpandedPlayer]=useState(null)
  // State
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

  // Player actions
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

  // History players from SQLite backend
  const histPlayers=historyData?.players||[]
  const filteredHist=useMemo(()=>histSearch?histPlayers.filter(p=>(p.name||'').toLowerCase().includes(histSearch.toLowerCase())||p.guid.includes(histSearch)||(p.ips_seen||'').includes(histSearch)):histPlayers,[histPlayers,histSearch])
  const sortedHist=useMemo(()=>[...filteredHist].sort((a,b)=>{const av=a[dbSort]||'';const bv=b[dbSort]||'';const cmp=typeof av==='number'?av-bv:String(av).localeCompare(String(bv));return dbSortDir==='desc'?-cmp:cmp}),[filteredHist,dbSort,dbSortDir])

  // Combined ban list
  const matBans=matBansData?.bans||[]
  const ipBans=ipBansData?.bans||[]
  const allGuids=useMemo(()=>{const g={...satBans};matBans.forEach(b=>{if(b.reforger_id&&!g[b.reforger_id])g[b.reforger_id]={source:'mat',reason:b.reason||'Banned',name:b.player_name,banned_at:b.banned_at}});Object.keys(satBans).forEach(id=>{if(!g[id]||g[id].source!=='mat')g[id]={source:'sat',reason:satBans[id]}});return g},[satBans,matBans])
  const trollAlerts=trollData?.alerts||[]
  const playerCount=status?.server?.players||0;const maxPlayers=status?.server?.maxPlayers||0

  const PLATFORM_ICON={PC:'PC',Xbox:'XB',PlayStation:'PS',Unknown:'?'}


  // Audit log
  const{data:auditData,reload:reloadAudit}=useFetchOnce(`${API}/admin/audit-log`)
  // User settings (IP visibility)
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
    {/* Header */}
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
    {/* Tab bar */}
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

    {/* LIVE */}
    {tab==='live'&&<div className="flex-1 overflow-auto space-y-3">
      {/* Broadcast bar */}
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

    {/* DATABASE */}
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

    {/* BANS */}
    {tab==='bans'&&<div className="flex-1 overflow-auto space-y-4">
      {/* GUID Bans */}
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
      {/* IP Bans */}
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

    {/* TROLL ALERTS */}
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

    {/* SERVER LOGS */}
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

    {/* ADMINS */}
    {tab==='admins'&&<div className="flex-1 overflow-auto space-y-4">
      {/* Panel + SAT admins */}
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
      {/* MAT admins */}
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

    {/* SAT CONFIG */}
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

    {/* MAT CONFIG */}
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

    {/* PERMISSIONS */}
    {tab==='permissions'&&(isOwner||isHeadAdmin||isDemo)&&<div className="flex-1 overflow-auto"><Permissions toast={toast} authUser={authUser}/></div>}

    {/* AUDIT LOG */}
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

    {/* Modals */}
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

const VANILLA_SCENARIOS = [
  { id:'{ECC61978EDCC2B5A}Missions/23_Campaign.conf',              label:'Conflict — Everon',                    mode:'Conflict' },
  { id:'{C700DB41F0C546E1}Missions/23_Campaign_NorthCentral.conf', label:'Conflict — Northern Everon',           mode:'Conflict' },
  { id:'{28802845ADA64D52}Missions/23_Campaign_SWCoast.conf',      label:'Conflict — Southern Everon',           mode:'Conflict' },
  { id:'{94992A3D7CE4FF8A}Missions/23_Campaign_Western.conf',      label:'Conflict — Western Everon',            mode:'Conflict' },
  { id:'{FDE33AFE2ED7875B}Missions/23_Campaign_Montignac.conf',    label:'Conflict — Montignac',                 mode:'Conflict' },
  { id:'{C41618FD18E9D714}Missions/23_Campaign_Arland.conf',       label:'Conflict — Arland',                    mode:'Conflict' },
  { id:'{59AD59368755F41A}Missions/21_GM_Eden.conf',               label:'Game Master — Everon',                 mode:'GM' },
  { id:'{2BBBE828037C6F4B}Missions/22_GM_Arland.conf',             label:'Game Master — Arland',                 mode:'GM' },
  { id:'{F45C6C15D31252E6}Missions/27_GM_Cain.conf',               label:'Game Master — Kolguyev',               mode:'GM' },
  { id:'{DFAC5FABD11F2390}Missions/26_CombatOpsEveron.conf',       label:'Combat Ops — Everon',                  mode:'CombatOps' },
  { id:'{DAA03C6E6099D50F}Missions/24_CombatOps.conf',             label:'Combat Ops — Arland',                  mode:'CombatOps' },
  { id:'{CB347F2F10065C9C}Missions/CombatOpsCain.conf',            label:'Combat Ops — Kolguyev',                mode:'CombatOps' },
  { id:'{0220741028718E7F}Missions/23_Campaign_HQC_Everon.conf',   label:'Conflict: HQ Commander — Everon',      mode:'HQC' },
  { id:'{68D1240A11492545}Missions/23_Campaign_HQC_Arland.conf',   label:'Conflict: HQ Commander — Arland',      mode:'HQC' },
  { id:'{BB5345C22DD2B655}Missions/23_Campaign_HQC_Cain.conf',     label:'Conflict: HQ Commander — Kolguyev',    mode:'HQC' },
  { id:'{3F2E005F43DBD2F8}Missions/CAH_Briars_Coast.conf',         label:'Capture & Hold — Briars Coast',        mode:'C&H' },
  { id:'{F1A1BEA67132113E}Missions/CAH_Castle.conf',               label:'Capture & Hold — Montfort Castle',     mode:'C&H' },
  { id:'{589945FB9FA7B97D}Missions/CAH_Concrete_Plant.conf',       label:'Capture & Hold — Concrete Plant',      mode:'C&H' },
  { id:'{9405201CBD22A30C}Missions/CAH_Factory.conf',              label:'Capture & Hold — Almara Factory',      mode:'C&H' },
  { id:'{1CD06B409C6FAE56}Missions/CAH_Forest.conf',               label:"Capture & Hold — Simon's Wood",        mode:'C&H' },
  { id:'{7C491B1FCC0FF0E1}Missions/CAH_LeMoule.conf',              label:'Capture & Hold — Le Moule',            mode:'C&H' },
  { id:'{6EA2E454519E5869}Missions/CAH_Military_Base.conf',        label:'Capture & Hold — Camp Blake',          mode:'C&H' },
  { id:'{2B4183DF23E88249}Missions/CAH_Morton.conf',               label:'Capture & Hold — Morton',              mode:'C&H' },
  { id:'{C47A1A6245A13B26}Missions/SP01_ReginaV2.conf',            label:'Elimination',                          mode:'SP' },
  { id:'{0648CDB32D6B02B3}Missions/SP02_AirSupport.conf',          label:'Air Support',                          mode:'SP' },
  { id:'{10B8582BAD9F7040}Missions/Scenario01_Intro.conf',         label:'Omega 01 — Over The Hills',            mode:'Omega' },
  { id:'{1D76AF6DC4DF0577}Missions/Scenario02_Steal.conf',         label:'Omega 02 — Radio Check',               mode:'Omega' },
  { id:'{D1647575BCEA5A05}Missions/Scenario03_Villa.conf',         label:'Omega 03 — Light In The Dark',         mode:'Omega' },
  { id:'{6D224A109B973DD8}Missions/Scenario04_Sabotage.conf',      label:'Omega 04 — Red Silence',               mode:'Omega' },
  { id:'{FA2AB0181129CB16}Missions/Scenario05_Hill.conf',          label:'Omega 05 — Cliffhanger',               mode:'Omega' },
  { id:'{002AF7323E0129AF}Missions/Tutorial.conf',                  label:'Training',                             mode:'Tutorial' },
]

function ScenarioField({val,onChange}){const{C,sz}=useT()
  const matched=VANILLA_SCENARIOS.find(s=>s.id===val)
  return <div className="mb-3">
    <label className="block font-bold uppercase tracking-wide mb-1.5" style={{color:C.textDim,fontSize:sz.label}}>Scenario</label>
    <select value={matched?val:''} onChange={e=>{if(e.target.value)onChange(e.target.value)}} className="w-full rounded-lg px-3 py-2.5 outline-none mb-2" style={{background:C.bgInput,border:`1px solid ${C.border}`,color:matched?C.text:C.textMuted,fontSize:sz.input}} onFocus={e=>e.target.style.borderColor=C.accent+'80'} onBlur={e=>e.target.style.borderColor=C.border}>
      <option value="">-- Select vanilla scenario... --</option>
      {VANILLA_SCENARIOS.map(s=><option key={s.id} value={s.id}>[{s.mode}] {s.label}</option>)}
    </select>
    <input value={val??''} onChange={e=>onChange(e.target.value)} placeholder="{modId}Missions/ScenarioName.conf" className="w-full rounded-lg px-3 py-2.5 outline-none font-mono" style={{background:C.bgInput,border:`1px solid ${matched?C.accent+'30':C.border}`,color:C.text,fontSize:sz.input}} onFocus={e=>e.target.style.borderColor=C.accent+'80'} onBlur={e=>e.target.style.borderColor=matched?C.accent+'30':C.border}/>
    {matched&&<div className="mt-1.5 flex items-center gap-2"><span className="px-2 py-0.5 rounded font-bold" style={{background:C.accentBg,color:C.accent,fontSize:sz.stat}}>{matched.mode}</span><span style={{color:C.textMuted,fontSize:sz.stat}}>{matched.label}</span></div>}
  </div>
}

function DynVal({label,val,onChange}){const{C,sz}=useT();const[open,setOpen]=useState(true);const[nk,setNk]=useState('');const[nv,setNv]=useState('')
  if(typeof val==='boolean')return <div className="mb-2"><Toggle label={label} value={val} onChange={()=>onChange(!val)}/></div>
  if(typeof val==='number')return <div className="mb-2"><label className="block font-bold uppercase tracking-wide mb-1" style={{color:C.textDim,fontSize:sz.label}}>{label}</label><input type="number" value={val} onChange={e=>onChange(Number(e.target.value))} className="w-full rounded-lg px-3 py-2 outline-none font-mono" style={{background:C.bgInput,border:`1px solid ${C.border}`,color:C.text,fontSize:sz.input}}/></div>
  if(typeof val==='string')return <div className="mb-2"><label className="block font-bold uppercase tracking-wide mb-1" style={{color:C.textDim,fontSize:sz.label}}>{label}</label>{val.length>80?<textarea value={val} onChange={e=>onChange(e.target.value)} rows={3} spellCheck={false} className="w-full rounded-lg px-3 py-2 outline-none font-mono resize-y" style={{background:C.bgInput,border:`1px solid ${C.border}`,color:C.text,fontSize:sz.input}}/>:<input value={val} onChange={e=>onChange(e.target.value)} className="w-full rounded-lg px-3 py-2 outline-none" style={{background:C.bgInput,border:`1px solid ${C.border}`,color:C.text,fontSize:sz.input}}/>}</div>
  if(Array.isArray(val)){
    const allPrim=val.length===0||val.every(x=>x===null||typeof x!=='object')
    if(allPrim)return <div className="mb-3"><div className="flex items-center justify-between mb-1"><label className="font-bold uppercase tracking-wide" style={{color:C.textDim,fontSize:sz.label}}>{label} <span style={{color:C.textMuted}}>({val.length})</span></label><Btn small v="ghost" onClick={()=>onChange([...val,typeof val[0]==='number'?0:''])}>+ Add</Btn></div><div className="space-y-1">{val.map((item,i)=><div key={i} className="flex gap-1.5 items-center">{typeof item==='number'?<input type="number" value={item} onChange={e=>onChange(val.map((v,j)=>j===i?Number(e.target.value):v))} className="flex-1 rounded-lg px-3 py-1.5 outline-none font-mono" style={{background:C.bgInput,border:`1px solid ${C.border}`,color:C.text,fontSize:sz.input}}/>:<input value={item??''} onChange={e=>onChange(val.map((v,j)=>j===i?e.target.value:v))} className="flex-1 rounded-lg px-3 py-1.5 outline-none" style={{background:C.bgInput,border:`1px solid ${C.border}`,color:C.text,fontSize:sz.input}}/>}<Btn small v="danger" onClick={()=>onChange(val.filter((_,j)=>j!==i))}>X</Btn></div>)}{val.length===0&&<div className="py-2 text-center" style={{color:C.textMuted,fontSize:sz.stat}}>Empty</div>}</div></div>
    const tmpl=val.length>0?Object.fromEntries(Object.keys(val[0]).map(k=>[k,typeof val[0][k]==='number'?0:typeof val[0][k]==='boolean'?false:''])):null
    return <div className="mb-3"><div className="flex items-center justify-between mb-1"><label className="font-bold uppercase tracking-wide" style={{color:C.textDim,fontSize:sz.label}}>{label} <span style={{color:C.textMuted}}>({val.length})</span></label>{tmpl&&<Btn small v="ghost" onClick={()=>onChange([...val,{...tmpl}])}>+ Add</Btn>}</div><div className="space-y-2">{val.map((item,i)=><Card key={i} className="p-3"><div className="flex items-center justify-between mb-2"><span className="font-mono" style={{color:C.textMuted,fontSize:sz.stat}}>#{i+1}</span><Btn small v="danger" onClick={()=>onChange(val.filter((_,j)=>j!==i))}>X</Btn></div><DynObj obj={item} onChange={ni=>onChange(val.map((v,j)=>j===i?ni:v))}/></Card>)}{val.length===0&&<div className="py-2 text-center" style={{color:C.textMuted,fontSize:sz.stat}}>Empty</div>}</div></div>
  }
  if(val!==null&&typeof val==='object'){
    const keys=Object.keys(val);const allPrim=keys.every(k=>val[k]===null||typeof val[k]!=='object')
    if(allPrim)return <div className="mb-3"><div className="flex items-center justify-between mb-1"><label className="font-bold uppercase tracking-wide" style={{color:C.textDim,fontSize:sz.label}}>{label} <span style={{color:C.textMuted}}>({keys.length})</span></label></div><div className="space-y-1">{keys.map(k=><div key={k} className="flex gap-1.5 items-center"><span className="font-mono px-2 py-1.5 rounded-lg truncate" style={{background:C.accentBg,color:C.accent,fontSize:sz.stat,minWidth:'8em',maxWidth:'16em'}}>{k}</span>{typeof val[k]==='boolean'?<button onClick={()=>onChange({...val,[k]:!val[k]})} className="px-3 py-1.5 rounded-lg font-bold cursor-pointer" style={{background:val[k]?C.accentBg:C.bgInput,color:val[k]?C.accent:C.textMuted,border:`1px solid ${val[k]?C.accent+'30':C.border}`,fontSize:sz.stat}}>{val[k]?'true':'false'}</button>:typeof val[k]==='number'?<input type="number" value={val[k]} onChange={e=>onChange({...val,[k]:Number(e.target.value)})} className="flex-1 rounded-lg px-3 py-1.5 outline-none font-mono" style={{background:C.bgInput,border:`1px solid ${C.border}`,color:C.text,fontSize:sz.input}}/>:<input value={val[k]??''} onChange={e=>onChange({...val,[k]:e.target.value})} className="flex-1 rounded-lg px-3 py-1.5 outline-none" style={{background:C.bgInput,border:`1px solid ${C.border}`,color:C.text,fontSize:sz.input}}/>}<Btn small v="danger" onClick={()=>{const n={...val};delete n[k];onChange(n)}}>X</Btn></div>)}<div className="flex gap-1.5 mt-1.5"><input value={nk} onChange={e=>setNk(e.target.value)} placeholder="key" className="flex-1 rounded-lg px-3 py-1.5 outline-none font-mono" style={{background:C.bgInput,border:`1px solid ${C.border}`,color:C.text,fontSize:sz.input}}/><input value={nv} onChange={e=>setNv(e.target.value)} placeholder="value" className="flex-1 rounded-lg px-3 py-1.5 outline-none" style={{background:C.bgInput,border:`1px solid ${C.border}`,color:C.text,fontSize:sz.input}}/><Btn small onClick={()=>{if(!nk.trim())return;onChange({...val,[nk.trim()]:nv});setNk('');setNv('')}}>Add</Btn></div></div></div>
    return <div className="mb-3"><button onClick={()=>setOpen(p=>!p)} className="flex items-center gap-2 w-full text-left mb-2 cursor-pointer font-bold uppercase tracking-wide" style={{color:C.textDim,fontSize:sz.label}}><span style={{fontSize:sz.base}}>{open?'v':'>'}</span>{label} <span style={{color:C.textMuted}}>({keys.length} fields)</span></button>{open&&<div className="pl-3" style={{borderLeft:`2px solid ${C.border}`}}><DynObj obj={val} onChange={onChange}/></div>}</div>
  }
  return null
}
function DynObj({obj,onChange}){return <>{Object.entries(obj).map(([k,v])=><DynVal key={k} label={k} val={v} onChange={nv=>onChange({...obj,[k]:nv})}/>)}</>}

const DEFAULT_SERVER_CONFIG={bindAddress:"",bindPort:2001,publicAddress:"",publicPort:2001,game:{name:"My Arma Server",password:"",passwordAdmin:"",maxPlayers:64,visible:true,crossPlatform:true,scenarioId:"{59AD59368755F41A}Missions/21_GM_Eden.conf",gameProperties:{serverMaxViewDistance:1600,networkViewDistance:500,disableThirdPerson:false,battlEye:true,persistence:{autoSaveInterval:5,hiveId:0}}},operating:{lobbyPlayerSynchronise:true,playerSaveTime:120,aiLimit:-1,disableAI:false},rcon:{address:"127.0.0.1",port:19999,password:"",permission:"admin",maxClients:16}}

function Config({toast}){const{C,sz}=useT();const{data:initial,loading:mainLoading,reload:reloadMain}=useFetchOnce(`${API}/config`);const{data:cfgList,loading:listLoading}=useFetchOnce(`${API}/configs/list`);const[sel,setSel]=useState(null);const[raw,setRaw]=useState('');const[dynObj,setDynObj]=useState(null);const[dirty,setDirty]=useState(false);const[mode,setMode]=useState('visual');const[fileLoading,setFileLoading]=useState(false);const[pwVis,setPwVis]=useState({})
  const isMain=sel?.key==='main'
  useEffect(()=>{if(initial!=null&&isMain&&!dirty){const effective=Object.keys(initial).length===0?DEFAULT_SERVER_CONFIG:initial;const s=JSON.stringify(effective,null,2);setRaw(s);setDynObj(JSON.parse(s))}},[initial,isMain])
  useEffect(()=>{if(!sel||isMain)return;let cancelled=false;setFileLoading(true);setDirty(false);fetch(`${API}/files/read?path=${encodeURIComponent(sel.path)}`,{headers:authHeaders()}).then(r=>r.json()).then(d=>{if(cancelled)return;if(d.content){setRaw(d.content);try{setDynObj(JSON.parse(d.content))}catch{setDynObj(null)}};setFileLoading(false)}).catch(()=>{if(!cancelled)setFileLoading(false)});return()=>{cancelled=true}},[sel?.path])
  const parsed=useMemo(()=>{try{return JSON.parse(raw)}catch{return null}},[raw])
  const save=async()=>{if(!parsed){toast('Invalid JSON','danger');return};let r;if(isMain){r=await put(`${API}/config`,parsed)}else{r=await put(`${API}/files/write`,{path:sel.path,content:JSON.stringify(parsed,null,2)})};if(r.error){toast(r.error,'danger');return};toast('Saved');setDirty(false);if(isMain)reloadMain()}
  const updateField=(path,val)=>{if(!parsed)return;const c=JSON.parse(raw);const keys=path.split('.');let o=c;for(let i=0;i<keys.length-1;i++){if(!o[keys[i]])o[keys[i]]={};o=o[keys[i]]};o[keys[keys.length-1]]=val;const s=JSON.stringify(c,null,2);setRaw(s);setDynObj(c);setDirty(true)}
  const getField=path=>{if(!parsed)return undefined;const keys=path.split('.');let v=parsed;for(const k of keys){v=v?.[k];if(v===undefined)return undefined};return v}
  const F=(label,path,type='text')=>{const val=getField(path);if(val===undefined)return null;if(type==='toggle')return <Toggle key={path} label={label} value={val} onChange={()=>updateField(path,!val)}/>;const isPw=type==='password';const shown=pwVis[path];return <div key={path} className="mb-3"><label className="block font-bold uppercase tracking-wide mb-1.5" style={{color:C.textDim,fontSize:sz.label}}>{label}</label><div className="relative"><input type={isPw?(shown?'text':'password'):type==='number'?'number':'text'} value={val??''} onChange={e=>updateField(path,type==='number'?Number(e.target.value):e.target.value)} className={`w-full rounded-lg px-3 py-2.5 outline-none ${isPw?'pr-9':''} ${type==='number'?'font-mono':''}`} style={{background:C.bgInput,border:`1px solid ${C.border}`,color:C.text,fontSize:sz.input}} onFocus={e=>e.target.style.borderColor=C.accent+'80'} onBlur={e=>e.target.style.borderColor=C.border}/>{isPw&&<button type="button" onClick={()=>setPwVis(p=>({...p,[path]:!p[path]}))} className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer" style={{color:C.textDim,fontSize:sz.label}}>{shown?'Hide':'Show'}</button>}</div></div>}
  if(!sel)return <div><h2 className="font-black mb-4" style={{color:C.textBright,fontSize:sz.base+4}}>Config Files</h2>{listLoading?<div className="animate-pulse" style={{color:C.textDim,fontSize:sz.base}}>Loading...</div>:<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">{(cfgList||[]).map((c,i)=><Card key={i} className="p-5 cursor-pointer" onClick={()=>{setSel(c);setMode(c.key==='main'?'visual':'form');setDirty(false)}} onMouseEnter={e=>e.currentTarget.style.borderColor=C.accent+'60'} onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}><div className="font-bold mb-1" style={{color:C.text,fontSize:sz.base+1}}>{c.label}</div><div className="font-mono truncate" style={{color:C.textMuted,fontSize:sz.stat}}>{c.path}</div></Card>)}</div>}</div>
  const modes=isMain?['visual','form','raw']:['form','raw']
  return <div className="flex flex-col h-full"><div className="flex items-center gap-2 mb-3 flex-wrap"><button onClick={()=>setSel(null)} className="font-bold cursor-pointer px-2.5 py-1.5 rounded-lg" style={{color:C.accent,background:C.accentBg,fontSize:sz.nav}}>Config</button><span style={{color:C.textMuted,fontSize:sz.nav}}>/</span><span className="font-bold truncate" style={{color:C.text,fontSize:sz.nav}}>{sel.label}</span>{dirty&&<span className="font-bold" style={{color:C.orange,fontSize:sz.stat}}>* unsaved</span>}<div className="flex-1"/><div className="flex rounded-lg overflow-hidden" style={{background:C.bgInput,border:`1px solid ${C.border}`}}>{modes.map(m=><button key={m} onClick={()=>setMode(m)} className="px-3 py-1.5 font-bold capitalize cursor-pointer" style={{background:mode===m?C.accentBg:'transparent',color:mode===m?C.accent:C.textDim,fontSize:sz.nav}}>{m==='raw'?'JSON':m==='visual'?'Visual':'Form'}</button>)}</div><Btn onClick={save}>{dirty?'Save':'Saved'}</Btn></div>
    {fileLoading||mainLoading?<div className="animate-pulse" style={{color:C.textDim,fontSize:sz.base}}>Loading...</div>:mode==='raw'?<textarea value={raw} onChange={e=>{setRaw(e.target.value);setDirty(true)}} spellCheck={false} className="flex-1 rounded-lg p-4 font-mono outline-none resize-none" style={{background:C.consoleBg,border:`1px solid ${C.border}`,color:C.text,fontSize:sz.code}}/>:mode==='visual'&&isMain?<div className="flex-1 overflow-auto grid grid-cols-1 md:grid-cols-2 gap-3"><Card className="p-5"><h3 className="font-black uppercase tracking-wide mb-4" style={{color:C.text,fontSize:sz.base}}>Server</h3>{F("Name","game.name")}{F("Bind Port","bindPort","number")}{F("Public Address","publicAddress")}{F("Public Port","publicPort","number")}{F("Max Players","game.maxPlayers","number")}{F("Password","game.password","password")}{F("Admin Password","game.passwordAdmin","password")}<ScenarioField val={getField('game.scenarioId')||''} onChange={v=>updateField('game.scenarioId',v)}/></Card><Card className="p-5"><h3 className="font-black uppercase tracking-wide mb-4" style={{color:C.text,fontSize:sz.base}}>Game</h3>{F("Visible","game.visible","toggle")}{F("CrossPlay","game.crossPlatform","toggle")}{F("BattlEye","game.gameProperties.battlEye","toggle")}{F("No 3rd Person","game.gameProperties.disableThirdPerson","toggle")}{F("View Dist","game.gameProperties.serverMaxViewDistance","number")}{F("Net View Dist","game.gameProperties.networkViewDistance","number")}</Card><Card className="p-5"><h3 className="font-black uppercase tracking-wide mb-4" style={{color:C.text,fontSize:sz.base}}>RCON</h3>{F("Port","rcon.port","number")}{F("Password","rcon.password","password")}{F("Permission","rcon.permission")}{F("Max Clients","rcon.maxClients","number")}</Card><Card className="p-5"><h3 className="font-black uppercase tracking-wide mb-4" style={{color:C.text,fontSize:sz.base}}>Operating</h3>{F("AI Limit","operating.aiLimit","number")}{F("Disable AI","operating.disableAI","toggle")}{F("Player Save Time (s)","operating.playerSaveTime","number")}{F("Lobby Sync","operating.lobbyPlayerSynchronise","toggle")}</Card><Card className="p-5"><h3 className="font-black uppercase tracking-wide mb-4" style={{color:C.text,fontSize:sz.base}}>Persistence</h3><div className="text-xs mb-3 leading-relaxed" style={{color:C.textMuted}}>Auto-save interval controls how often the world state (vehicles, bases, placed objects) is saved. Player Save Time controls how often individual player data (inventory, position) is written. Both require a server restart to take effect.</div>{F("Auto-Save Interval (min)","game.gameProperties.persistence.autoSaveInterval","number")}{F("Hive ID","game.gameProperties.persistence.hiveId","number")}</Card></div>:<div className="flex-1 overflow-auto">{dynObj?<DynObj obj={dynObj} onChange={o=>{setDynObj(o);setRaw(JSON.stringify(o,null,2));setDirty(true)}}/>:<div className="py-8 text-center" style={{color:C.textMuted,fontSize:sz.base}}>Invalid JSON - switch to JSON tab to fix</div>}</div>}</div>}

function ModCard({mod,installed,onClick}){const{C,sz}=useT()
  const fmtSize=s=>s>0?s>=1048576?`${(s/1048576).toFixed(0)} MB`:s>=1024?`${(s/1024).toFixed(0)} KB`:'':''
  const size=fmtSize(mod.size||0)
  return <div onClick={onClick} className="rounded-xl overflow-hidden cursor-pointer group" style={{background:C.bgCard,border:`1px solid ${installed?C.accent+'50':C.border}`,transition:'transform 0.15s,box-shadow 0.15s'}} onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-3px)';e.currentTarget.style.boxShadow=`0 8px 24px ${C.accent}15`}} onMouseLeave={e=>{e.currentTarget.style.transform='';e.currentTarget.style.boxShadow=''}}>
  <div className="relative overflow-hidden" style={{paddingTop:'56.25%',background:C.bgInput}}>
    {mod.image?<img src={mod.image} alt={mod.name} className="absolute inset-0 w-full h-full object-cover" loading="lazy" style={{transition:'transform 0.2s'}} onMouseEnter={e=>e.target.style.transform='scale(1.04)'} onMouseLeave={e=>e.target.style.transform=''}/>:<div className="absolute inset-0 flex items-center justify-center font-black" style={{color:C.textMuted,fontSize:24}}>{(mod.name||'?')[0]}</div>}
    {installed&&<div className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md font-black" style={{background:C.accent,color:'#000',fontSize:8,letterSpacing:1}}>ON SERVER</div>}
    {size&&<div className="absolute top-2 right-2 px-2 py-1 rounded-md font-mono font-bold" style={{background:'rgba(0,0,0,0.75)',color:'#fff',fontSize:sz.stat}}>{size}</div>}
  </div>
  <div className="p-3">
    <div className="font-bold truncate mb-0.5" style={{color:C.text,fontSize:sz.base}}>{mod.name}</div>
    <div className="truncate mb-1.5" style={{color:C.textMuted,fontSize:sz.stat}}>by {mod.author}</div>
    <div className="flex items-center justify-between" style={{fontSize:sz.stat}}>
      <span style={{color:C.textDim}}>{mod.subscribers>=1000?`${(mod.subscribers/1000).toFixed(1)}k`:mod.subscribers} DL</span>
      <span style={{color:C.orange}}>{mod.rating>0?`${mod.rating}/5`:''}</span>
      <span className="font-mono" style={{color:C.textMuted}}>v{mod.version}</span>
    </div>
    <a href={`https://reforger.armaplatform.com/workshop/${mod.id}`} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} className="mt-2 flex items-center gap-1 font-bold" style={{color:C.accent,fontSize:sz.stat,textDecoration:'none'}}>↗ View on Workshop</a>
  </div>
</div>}

const WS_TAGS=['terrains','weapons','vehicles','structures','characters','animals','vegetation','props','compositions','scenarios_SP','Scenarios_MP','systems','effects','misc']

function Mods({toast}){const{C,sz}=useT();const mobile=useMobile()
  const{data:config,loading:cfgLoading,reload:reloadConfig}=useFetchOnce(`${API}/config`)
  const{data:deployments,reload:reloadDeps}=useFetchOnce(`${API}/deployments`)
  const[view,setView]=useState(()=>{try{return localStorage.getItem('mods-view')||'workshop'}catch{return 'workshop'}})
  useEffect(()=>{try{localStorage.setItem('mods-view',view)}catch{}},[view])
  const[depName,setDepName]=useState('')
  const[dispSearch,setDispSearch]=useState('');const[search,setSearch]=useState('')
  const[sort,setSort]=useState(()=>{try{return localStorage.getItem('ws-sort')||'downloads'}catch{return 'downloads'}})
  const[page,setPage]=useState(()=>{try{return parseInt(localStorage.getItem('ws-page')||'1',10)}catch{return 1}})
  const[tags,setTags]=useState(()=>{try{return JSON.parse(localStorage.getItem('ws-tags')||'[]')}catch{return []}})
  const[wsData,setWsData]=useState(null);const[wsLoading,setWsLoading]=useState(false)
  const[selected,setSelected]=useState(null);const[detail,setDetail]=useState(null);const[detailLoading,setDetailLoading]=useState(false)
  const[manualId,setManualId]=useState('');const[showManualAdd,setShowManualAdd]=useState(false)
  const[instSearch,setInstSearch]=useState('')
  const[instSort,setInstSort]=useState(()=>{try{return localStorage.getItem('inst-sort')||'order'}catch{return 'order'}})
  const[instDetails,setInstDetails]=useState({})
  const[instLoading,setInstLoading]=useState(false)
  const debRef=useRef(null)
  useEffect(()=>()=>clearTimeout(debRef.current),[])
  useEffect(()=>{try{localStorage.setItem('ws-page',String(page));localStorage.setItem('ws-sort',sort);localStorage.setItem('ws-tags',JSON.stringify(tags));localStorage.setItem('inst-sort',instSort)}catch{}},[page,sort,tags,instSort])
  const toggleTag=t=>{setTags(p=>p.includes(t)?p.filter(x=>x!==t):[...p,t])}
  const lookupById=()=>{
    const id=manualId.trim().replace(/[{}]/g,'').toUpperCase()
    if(!id){toast('Enter a mod ID','danger');return}
    setShowManualAdd(false);setManualId('')
    openMod({id,name:id,version:'',image:null,author:'',rating:0,ratingCount:0,subscribers:0,tags:[],summary:''})
  }
  const mods=config?.game?.mods||[]
  const installedIds=useMemo(()=>new Set(mods.map(m=>m.modId)),[mods])

  // Load workshop details for installed mods (image, author, tags, size etc.)
  useEffect(()=>{
    if(view!=='installed'||!mods.length)return
    const missing=mods.filter(m=>m.modId&&!instDetails[m.modId])
    if(!missing.length)return
    let cancelled=false
    setInstLoading(true)
    const fetchBatch=async()=>{
      for(let i=0;i<missing.length;i+=5){
        if(cancelled)break
        await Promise.all(missing.slice(i,i+5).map(m=>
          fetch(`${API}/workshop/mod/${m.modId}`,{headers:authHeaders()})
            .then(r=>r.json())
            .then(d=>{if(!cancelled&&d&&!d.error)setInstDetails(p=>({...p,[m.modId]:d}))})
            .catch(()=>{})
        ))
      }
      if(!cancelled)setInstLoading(false)
    }
    fetchBatch()
    return()=>{cancelled=true}
  },[view,mods])

  const filteredInstalled=useMemo(()=>{
    let r=[...mods]
    if(instSearch){const q=instSearch.toLowerCase();r=r.filter(m=>(m.name||'').toLowerCase().includes(q)||m.modId.toLowerCase().includes(q))}
    if(instSort==='name')r.sort((a,b)=>(a.name||'').localeCompare(b.name||''))
    else if(instSort==='version')r.sort((a,b)=>(a.version||'').localeCompare(b.version||''))
    else if(instSort==='size')r.sort((a,b)=>(instDetails[b.modId]?.size||0)-(instDetails[a.modId]?.size||0))
    return r
  },[mods,instSearch,instSort,instDetails])
  const displayedMods=useMemo(()=>{
    if(!wsData?.mods)return []
    if(!tags.length||wsData.from_index)return wsData.mods
    // Fallback client-side filter when index not yet ready
    return wsData.mods.filter(m=>(m.tags||[]).some(t=>tags.some(tag=>t.toLowerCase().includes(tag.toLowerCase())||tag.toLowerCase().includes(t.toLowerCase()))))
  },[wsData?.mods,wsData?.from_index,tags])

  useEffect(()=>{
    if(view!=='workshop')return
    const ac=new AbortController()
    setWsLoading(true)
    const params=new URLSearchParams({page,sort})
    if(search)params.set('q',search)
    if(tags.length)params.set('tags',tags.join(','))
    fetch(`${API}/workshop/search?${params}`,{headers:authHeaders(),signal:ac.signal})
      .then(r=>{if(r.status===401){on401();return null};return r.json()})
      .then(d=>{if(d)setWsData(d)}).catch(()=>{}).finally(()=>setWsLoading(false))
    return()=>ac.abort()
  },[view,search,page,sort,tags])

  const handleSearch=v=>{setDispSearch(v);clearTimeout(debRef.current);debRef.current=setTimeout(()=>{setSearch(v);setPage(1)},500)}

  const openMod=async mod=>{
    if(!mod?.id){toast('Mod ID missing','danger');return}
    setSelected(mod);setDetail(null);setDetailLoading(true)
    fetch(`${API}/workshop/mod/${mod.id}`,{headers:authHeaders()})
      .then(r=>r.json())
      .then(d=>{if(d&&!d.error)setDetail(d);else setDetail(null)})
      .catch(()=>setDetail(null))
      .finally(()=>setDetailLoading(false))
  }

  // eff = loaded detail if valid, otherwise fall back to selected
  const addMod=async(mod,version)=>{
    if(!mod?.id){toast('Mod ID missing — try reloading the mod','danger');return}
    if(installedIds.has(mod.id)){toast('Already on server','warning');return}
    const c=JSON.parse(JSON.stringify(config));if(!c.game.mods)c.game.mods=[]
    const e={modId:mod.id,name:mod.name||mod.id}
    if(version&&version!=='?')e.version=version
    c.game.mods.push(e);const r=await put(`${API}/config`,c)
    if(r.error){toast(r.error,'danger');return};toast(`Added ${mod.name||mod.id}`);reloadConfig()
  }
  const removeMod=async modId=>{
    const c=JSON.parse(JSON.stringify(config));c.game.mods=c.game.mods.filter(m=>m.modId!==modId)
    const r=await put(`${API}/config`,c);if(r.error){toast(r.error,'danger');return};toast('Removed','warning');reloadConfig()
  }
  const deleteAllMods=async()=>{
    if(!window.confirm(`Remove all ${mods.length} mods from the server config?`))return
    const c=JSON.parse(JSON.stringify(config));c.game.mods=[]
    const r=await put(`${API}/config`,c);if(r.error){toast(r.error,'danger');return};toast(`Cleared all mods`,'warning');reloadConfig()
  }
  const useScenario=async scenarioId=>{
    const c=JSON.parse(JSON.stringify(config));if(!c.game)c.game={};c.game.scenarioId=scenarioId
    const r=await put(`${API}/config`,c);if(r.error){toast(r.error,'danger');return}
    toast(`Scenario set`);reloadConfig()
  }

  const saveDep=async()=>{if(!depName.trim()){toast('Name required','danger');return};const r=await post(`${API}/deployments`,{name:depName.trim()});if(r.error){toast(r.error,'danger');return};toast(`Saved "${depName}"`);setDepName('');reloadDeps()}
  const deleteDep=async id=>{const r=await del(`${API}/deployments/${id}`);if(r?.error){toast(r.error,'danger');return};toast('Deleted','warning');reloadDeps()}
  const applyDep=async id=>{const r=await post(`${API}/deployments/${id}/apply`);if(r.error){toast(r.error,'danger');return};toast(r.message||'Applied');reloadConfig()}

  // Export / Import
  const [importOpen, setImportOpen] = useState(false)
  const [importMods, setImportMods] = useState([])
  const [importMode, setImportMode] = useState('merge') // 'merge' | 'replace'
  const importRef = useRef(null)

  const exportMods = () => {
    if (!mods.length) { toast('No mods to export', 'warning'); return }
    const blob = new Blob([JSON.stringify(mods, null, 2)], {type: 'application/json'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `mods-${new Date().toISOString().slice(0,10)}.json`
    a.click(); URL.revokeObjectURL(url)
    toast(`Exported ${mods.length} mods`)
  }

  const handleImportFile = e => {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = evt => {
      try {
        let parsed = JSON.parse(evt.target.result)
        let list = Array.isArray(parsed) ? parsed : parsed?.game?.mods
        if (!Array.isArray(list)) { toast('Invalid format — expected mods array or config.json', 'danger'); return }
        // Normalise entries: must have modId
        list = list.filter(m => m?.modId || m?.id).map(m => ({modId: m.modId||m.id, name: m.name||m.modId||m.id, ...(m.version?{version:m.version}:{})}))
        if (!list.length) { toast('No valid mod entries found', 'danger'); return }
        setImportMods(list); setImportMode('merge'); setImportOpen(true)
      } catch { toast('Invalid JSON file', 'danger') }
    }
    reader.readAsText(file)
  }

  const applyImport = async () => {
    const c = JSON.parse(JSON.stringify(config))
    if (importMode === 'replace') {
      c.game.mods = importMods
    } else {
      const existing = new Set((c.game.mods||[]).map(m => m.modId))
      const toAdd = importMods.filter(m => !existing.has(m.modId))
      c.game.mods = [...(c.game.mods||[]), ...toAdd]
    }
    const r = await put(`${API}/config`, c)
    if (r.error) { toast(r.error, 'danger'); return }
    const added = importMode === 'replace' ? importMods.length : importMods.filter(m => !(new Set(mods.map(x=>x.modId))).has(m.modId)).length
    toast(importMode === 'replace' ? `Replaced with ${importMods.length} mods` : `Added ${added} new mod${added!==1?'s':''}`)
    setImportOpen(false); reloadConfig()
  }
  if(cfgLoading)return <div className="animate-pulse" style={{color:C.textDim,fontSize:sz.base}}>Loading...</div>
  return <div className="flex flex-col h-full">
    <div className="flex items-center gap-3 mb-3 flex-wrap">
      <h2 className="font-black" style={{color:C.textBright,fontSize:sz.base+4}}>Mods</h2>
      <Badge text={`${mods.length} on server`}/>
      <div className="flex-1"/>
      <div className="flex rounded-lg overflow-hidden" style={{background:C.bgInput,border:`1px solid ${C.border}`}}>
        {['workshop','installed','deployments'].map(v=><button key={v} onClick={()=>setView(v)} className="px-4 font-bold capitalize cursor-pointer" style={{paddingTop:mobile?10:6,paddingBottom:mobile?10:6,background:view===v?C.accentBg:'transparent',color:view===v?C.accent:C.textDim,fontSize:sz.nav}}>{v==='installed'?`Installed (${mods.length})`:v==='deployments'?`Packages (${(deployments||[]).length})`:v[0].toUpperCase()+v.slice(1)}</button>)}
      </div>
    </div>

    {view==='workshop'&&<>
      <div className={`flex mb-3 items-center ${mobile?'flex-col gap-2':'flex-wrap gap-2'}`}>
        <input value={dispSearch} onChange={e=>handleSearch(e.target.value)} placeholder="Search 34,000+ mods..." className="flex-1 min-w-[180px] rounded-lg px-3 py-2 outline-none placeholder:opacity-30" style={{background:C.bgInput,border:`1px solid ${dispSearch?C.accent+'60':C.border}`,color:C.text,fontSize:sz.input}}/>
        <div className={`flex rounded-lg overflow-hidden ${mobile?'w-full':''}`} style={{background:C.bgInput,border:`1px solid ${C.border}`}}>
          {[['downloads','Popular'],['newest','Newest'],['popular','Trending']].map(([s,l])=><button key={s} onClick={()=>{setSort(s);setPage(1)}} className={`px-3 py-1.5 font-bold cursor-pointer ${mobile?'flex-1':''}`} style={{background:sort===s?C.accentBg:'transparent',color:sort===s?C.accent:C.textDim,fontSize:sz.nav}}>{l}</button>)}
        </div>
        {showManualAdd
          ?<div className="flex gap-2 items-center">
            <input value={manualId} onChange={e=>setManualId(e.target.value)} onKeyDown={e=>e.key==='Enter'&&lookupById()} placeholder="Paste mod ID..." autoFocus className={`rounded-lg px-3 py-2 outline-none font-mono placeholder:opacity-30 ${mobile?'flex-1':'w-52'}`} style={{background:C.bgInput,border:`1px solid ${C.accent+'60'}`,color:C.text,fontSize:sz.input}}/>
            <Btn small onClick={lookupById}>Lookup</Btn>
            <Btn small v="ghost" onClick={()=>{setShowManualAdd(false);setManualId('')}}>X</Btn>
          </div>
          :<Btn small v="ghost" onClick={()=>setShowManualAdd(true)}>+ Add by ID</Btn>}
      </div>
      <div className="flex gap-1.5 mb-2 flex-wrap items-center">
        {WS_TAGS.map(t=><button key={t} onClick={()=>toggleTag(t)} className="px-2.5 py-1 rounded-full font-bold cursor-pointer" style={{background:tags.includes(t)?C.accentBg:'transparent',color:tags.includes(t)?C.accent:C.textMuted,border:`1px solid ${tags.includes(t)?C.accent+'50':C.border}`,fontSize:sz.stat}}>{t}</button>)}
        {tags.length>0&&<button onClick={()=>{setTags([]);setPage(1)}} className="px-2.5 py-1 rounded-full font-bold cursor-pointer" style={{background:'transparent',color:C.textDim,border:`1px solid ${C.border}`,fontSize:sz.stat}}>✕ Clear</button>}
        <div className="flex-1"/>
        {tags.length>0&&wsData?.index_status==='building'&&<span className="animate-pulse" style={{color:C.textMuted,fontSize:sz.stat}}>Building index...</span>}
        {tags.length>0&&wsData?.index_status==='idle'&&<button onClick={async()=>{const r=await post(`${API}/workshop/index/build`);r?.error?toast(r.error,'danger'):toast('Index build started','info')}} className="px-2.5 py-1 rounded-full font-bold cursor-pointer" style={{background:C.accentBg,color:C.accent,border:`1px solid ${C.accent+'50'}`,fontSize:sz.stat}}>Build Index</button>}
        {tags.length>0&&wsData?.from_index&&<span style={{color:C.textMuted,fontSize:sz.stat}}>{wsData.index_count?.toLocaleString()} mods indexed</span>}
      </div>
      {wsLoading?<div className="flex-1 flex items-center justify-center"><div className="text-center"><div className="animate-pulse mb-2" style={{color:C.textDim,fontSize:sz.base+2}}>Loading workshop...</div><div style={{color:C.textMuted,fontSize:sz.stat}}>Fetching from Bohemia servers</div></div></div>:
       wsData?.error?<Empty title="Workshop unavailable" sub={wsData.error}/>:
      <div className="flex-1 overflow-auto">
        {wsData&&<div className="flex items-center justify-between mb-2"><span style={{color:C.textMuted,fontSize:sz.stat}}>{wsData.total?.toLocaleString()} mods{tags.length&&wsData.from_index?' (tag filtered)':''}</span><span style={{color:C.textMuted,fontSize:sz.stat}}>Page {page} of {wsData.pages?.toLocaleString()}</span></div>}
        <div className={`grid gap-3 mb-3 ${mobile?'grid-cols-2':'grid-cols-3 lg:grid-cols-4'}`}>
          {displayedMods.map(mod=><ModCard key={mod.id} mod={mod} installed={installedIds.has(mod.id)} onClick={()=>openMod(mod)}/>)}
        </div>
        {wsData&&wsData.pages>1&&<div className="flex items-center justify-center gap-3 py-4">
          <Btn small v="ghost" onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page<=1}>Prev</Btn>
          <div className="flex gap-1">{Array.from({length:Math.min(5,wsData.pages)},(_,i)=>{const p=Math.max(1,Math.min(wsData.pages-4,page-2))+i;return <button key={p} onClick={()=>setPage(p)} className={`${mobile?'w-10 h-10':'w-8 h-8'} rounded-lg font-bold cursor-pointer`} style={{background:p===page?C.accentBg:'transparent',color:p===page?C.accent:C.textDim,border:`1px solid ${p===page?C.accent+'30':C.border}`,fontSize:sz.stat}}>{p}</button>})}</div>
          <Btn small v="ghost" onClick={()=>setPage(p=>Math.min(wsData.pages,p+1))} disabled={page>=wsData.pages}>Next</Btn>
        </div>}
      </div>}
    </>}

    {view==='installed'&&<div className="flex flex-col flex-1 min-h-0">
      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-3 flex-wrap shrink-0">
        <input value={instSearch} onChange={e=>setInstSearch(e.target.value)} placeholder="Search installed mods..." className="flex-1 min-w-[160px] rounded-lg px-3 py-2 outline-none placeholder:opacity-30" style={{background:C.bgInput,border:`1px solid ${instSearch?C.accent+'60':C.border}`,color:C.text,fontSize:sz.input}}/>
        <div className="flex rounded-lg overflow-hidden" style={{background:C.bgInput,border:`1px solid ${C.border}`}}>
          {[['order','Load Order'],['name','Name'],['size','Size']].map(([s,l])=><button key={s} onClick={()=>setInstSort(s)} className="px-3 py-1.5 font-bold cursor-pointer" style={{background:instSort===s?C.accentBg:'transparent',color:instSort===s?C.accent:C.textDim,fontSize:sz.nav}}>{l}</button>)}
        </div>
        {instLoading&&<span className="animate-pulse" style={{color:C.textMuted,fontSize:sz.stat}}>Loading artwork...</span>}
        <div className="flex-1"/>
        <span style={{color:C.textMuted,fontSize:sz.stat}}>{mods.length} mods</span>
        <Btn small v="ghost" onClick={exportMods}>Export JSON</Btn>
        <Btn small v="ghost" onClick={()=>importRef.current?.click()}>Import JSON</Btn>
        <input ref={importRef} type="file" accept=".json" style={{display:'none'}} onChange={handleImportFile}/>
        {mods.length>0&&<Btn small v="danger" onClick={deleteAllMods}>Clear All</Btn>}
      </div>
      {/* Grid */}
      {mods.length===0?<Empty title="No mods installed" sub="Browse the workshop to add mods to your server"/>:
      filteredInstalled.length===0?<Empty title="No results" sub={`No mods match "${instSearch}"`}/>:
      <div className="flex-1 overflow-auto">
        <div className={`grid gap-3 ${mobile?'grid-cols-2':'grid-cols-3 lg:grid-cols-4'}`}>
          {filteredInstalled.map((m,i)=>{
            const d=instDetails[m.modId]
            const img=d?.image||null
            const author=d?.author||''
            const modTags=(d?.tags||[]).slice(0,3)
            const fmtSize=s=>s>0?s>=1048576?`${(s/1048576).toFixed(0)} MB`:s>=1024?`${(s/1024).toFixed(0)} KB`:'':'—'
            const size=fmtSize(d?.size||m.size||0)
            return <div key={m.modId} className="rounded-xl overflow-hidden flex flex-col" style={{background:C.bgCard,border:`1px solid ${C.accent}40`,transition:'transform 0.15s,box-shadow 0.15s'}} onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-2px)';e.currentTarget.style.boxShadow=`0 8px 24px ${C.accent}15`}} onMouseLeave={e=>{e.currentTarget.style.transform='';e.currentTarget.style.boxShadow=''}}>
              {/* Thumbnail */}
              <div className="relative overflow-hidden shrink-0" style={{paddingTop:'56.25%',background:C.bgInput}} onClick={()=>openMod({id:m.modId,name:m.name||d?.name,version:m.version||d?.version,image:img,author,rating:d?.rating||0,ratingCount:d?.ratingCount||0,subscribers:d?.subscribers||0,tags:d?.tags||[],summary:d?.summary||''})}>
                {img?<img src={img} alt={m.name} className="absolute inset-0 w-full h-full object-cover cursor-pointer" loading="lazy"/>
                  :<div className="absolute inset-0 flex items-center justify-center font-black cursor-pointer" style={{color:C.textMuted,fontSize:28}}>{(m.name||'?')[0].toUpperCase()}</div>}
                <div className="absolute inset-0 cursor-pointer" style={{background:'linear-gradient(to top,rgba(0,0,0,0.55) 0%,transparent 55%)'}}/>
                <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md font-black" style={{background:C.accent,color:'#000',fontSize:8,letterSpacing:1}}>ON SERVER</div>
                {size&&size!=='—'&&<div className="absolute top-2 right-2 px-2 py-1 rounded-md font-mono font-bold" style={{background:'rgba(0,0,0,0.75)',color:'#fff',fontSize:sz.stat}}>{size}</div>}
              </div>
              {/* Info */}
              <div className="p-3 flex flex-col flex-1 cursor-pointer" onClick={()=>openMod({id:m.modId,name:m.name||d?.name,version:m.version||d?.version,image:img,author,rating:d?.rating||0,ratingCount:d?.ratingCount||0,subscribers:d?.subscribers||0,tags:d?.tags||[],summary:d?.summary||''})}>
                <div className="font-bold truncate mb-0.5" style={{color:C.text,fontSize:sz.base}}>{m.name||d?.name||'Unnamed'}</div>
                {author&&<div className="truncate mb-1" style={{color:C.textMuted,fontSize:sz.stat}}>by {author}</div>}
                <div className="flex items-center justify-between mb-1.5" style={{fontSize:sz.stat}}>
                  <span className="font-mono" style={{color:C.textMuted}}>{m.version?`v${m.version}`:'latest'}</span>
                  {d?.subscribers>0&&<span style={{color:C.textDim}}>{d.subscribers>=1000?`${(d.subscribers/1000).toFixed(1)}k`:d.subscribers} DL</span>}
                  {d?.rating>0&&<span style={{color:C.orange}}>{d.rating}/5</span>}
                </div>
                {modTags.length>0&&<div className="flex gap-1 flex-wrap">{modTags.map(t=><span key={t} style={{background:C.bgInput,color:C.textMuted,border:`1px solid ${C.border}`,borderRadius:4,fontSize:Math.max(7,sz.stat-2),padding:'1px 5px'}}>{t}</span>)}</div>}
              </div>
              {/* Footer actions */}
              <div className="flex gap-1.5 px-3 pb-3 shrink-0">
                <button onClick={()=>openMod({id:m.modId,name:m.name||d?.name,version:m.version||d?.version,image:img,author,rating:d?.rating||0,ratingCount:d?.ratingCount||0,subscribers:d?.subscribers||0,tags:d?.tags||[],summary:d?.summary||''})} className="flex-1 py-1.5 rounded-lg font-bold cursor-pointer" style={{background:C.bgInput,color:C.textDim,border:`1px solid ${C.border}`,fontSize:sz.stat}}>Details</button>
                <button onClick={()=>removeMod(m.modId)} className="px-3 py-1.5 rounded-lg font-bold cursor-pointer" style={{background:C.redBg,color:C.red,border:`1px solid ${C.redBorder}`,fontSize:sz.stat}}>Remove</button>
              </div>
            </div>
          })}
        </div>
      </div>}
    </div>}

    {view==='deployments'&&<div className="flex-1 overflow-auto space-y-3">
      <Card className="p-4"><div className="font-black uppercase tracking-wide mb-3" style={{color:C.textDim,fontSize:sz.label}}>Save Current Mod List</div><div className="flex gap-2"><input value={depName} onChange={e=>setDepName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&saveDep()} placeholder={`e.g. "Milsim Standard" (${mods.length} mods)`} className="flex-1 rounded-lg px-3 py-2 outline-none placeholder:opacity-30" style={{background:C.bgInput,border:`1px solid ${C.border}`,color:C.text,fontSize:sz.input}}/><Btn onClick={saveDep}>Save Package</Btn></div></Card>
      {(deployments||[]).length===0?<Empty title="No packages saved" sub="Save your current mod list as a named package to quickly restore it later"/>:
        <div className="space-y-2">{(deployments||[]).map((dep,i)=><Card key={dep.id||i} className="px-5 py-4"><div className="flex items-center gap-4"><div className="flex-1 min-w-0"><div className="font-bold" style={{color:C.textBright,fontSize:sz.base+1}}>{dep.name}</div><div className="flex items-center gap-3 mt-1 flex-wrap"><span style={{color:C.textMuted,fontSize:sz.stat}}>{dep.mods?.length||0} mods</span><span style={{color:C.textMuted,fontSize:sz.stat}}>{dep.savedAt?new Date(dep.savedAt).toLocaleDateString():''}</span></div><div className="font-mono mt-1 truncate" style={{color:C.textMuted,fontSize:sz.stat-1}}>{(dep.mods||[]).slice(0,5).map(m=>m.name||m.modId).join(', ')}{(dep.mods?.length||0)>5?` +${dep.mods.length-5} more`:''}</div></div><div className="flex gap-1.5 shrink-0"><Btn small v="info" onClick={()=>applyDep(dep.id)}>Apply</Btn><Btn small v="danger" onClick={()=>deleteDep(dep.id)}>X</Btn></div></div></Card>)}</div>}
    </div>}

    {/* Import preview modal */}
    {importOpen&&<div onClick={()=>setImportOpen(false)} className="fixed inset-0 z-[1001] flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.8)',backdropFilter:'blur(8px)'}}>
      <div onClick={e=>e.stopPropagation()} className="rounded-2xl shadow-2xl flex flex-col" style={{background:C.bgCard,border:`1px solid ${C.border}`,width:'min(560px,95vw)',maxHeight:'80vh'}}>
        <div className="px-6 pt-5 pb-4" style={{borderBottom:`1px solid ${C.border}`}}>
          <div className="font-black mb-1" style={{color:C.textBright,fontSize:sz.base+3}}>Import Mod List</div>
          <div style={{color:C.textMuted,fontSize:sz.stat}}>{importMods.length} mod{importMods.length!==1?'s':''} in file</div>
        </div>
        <div className="px-6 py-4 flex-1 overflow-auto">
          {/* Mode toggle */}
          <div className="flex rounded-lg overflow-hidden mb-4" style={{background:C.bgInput,border:`1px solid ${C.border}`}}>
            {[['merge','Merge (keep existing)'],['replace','Replace all']].map(([m,l])=>(
              <button key={m} onClick={()=>setImportMode(m)} className="flex-1 px-4 py-2 font-bold cursor-pointer" style={{background:importMode===m?C.accentBg:'transparent',color:importMode===m?C.accent:C.textDim,fontSize:sz.stat}}>
                {l}
              </button>
            ))}
          </div>
          {importMode==='merge'&&(()=>{
            const existing = new Set(mods.map(m=>m.modId))
            const newOnes = importMods.filter(m=>!existing.has(m.modId))
            const dupes = importMods.filter(m=>existing.has(m.modId))
            return <div className="mb-3 rounded-lg px-4 py-3" style={{background:C.bgInput,border:`1px solid ${C.border}`}}>
              <div style={{color:C.accent,fontSize:sz.stat,fontWeight:700}}>{newOnes.length} new mod{newOnes.length!==1?'s':''} will be added</div>
              {dupes.length>0&&<div style={{color:C.textMuted,fontSize:sz.stat,marginTop:2}}>{dupes.length} already installed, skipped</div>}
            </div>
          })()}
          {importMode==='replace'&&<div className="mb-3 rounded-lg px-4 py-3" style={{background:C.redBg,border:`1px solid ${C.redBorder}`}}>
            <div style={{color:C.red,fontSize:sz.stat,fontWeight:700}}>Current {mods.length} mods will be removed and replaced with {importMods.length} from this file</div>
          </div>}
          {/* Preview list */}
          <div className="space-y-1.5 max-h-56 overflow-auto">
            {importMods.map((m,i)=>{
              const isNew = !new Set(mods.map(x=>x.modId)).has(m.modId)
              return <div key={m.modId+i} className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{background:C.bg,border:`1px solid ${C.border}`}}>
                <div className="flex-1 min-w-0">
                  <div className="font-bold truncate" style={{color:C.text,fontSize:sz.stat}}>{m.name||m.modId}</div>
                  <div className="font-mono truncate" style={{color:C.textMuted,fontSize:sz.stat-1}}>{m.modId}{m.version?` · v${m.version}`:''}</div>
                </div>
                {importMode==='merge'&&<span className="px-2 py-0.5 rounded font-bold shrink-0" style={{background:isNew?C.accentBg:C.bgInput,color:isNew?C.accent:C.textMuted,border:`1px solid ${isNew?C.accent+'30':C.border}`,fontSize:sz.stat-2}}>
                  {isNew?'NEW':'SKIP'}
                </span>}
              </div>
            })}
          </div>
        </div>
        <div className="px-6 py-4 flex gap-3 justify-end" style={{borderTop:`1px solid ${C.border}`}}>
          <Btn v="ghost" onClick={()=>setImportOpen(false)}>Cancel</Btn>
          <Btn v={importMode==='replace'?'danger':'default'} onClick={applyImport}>
            {importMode==='replace'?'Replace Mods':'Add Mods'}
          </Btn>
        </div>
      </div>
    </div>}

    {/* Mod detail modal */}
    {selected&&<div onClick={()=>setSelected(null)} className="fixed inset-0 z-[1000] flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.85)',backdropFilter:'blur(12px)'}}>
      <div onClick={e=>e.stopPropagation()} className="rounded-2xl overflow-hidden shadow-2xl flex flex-col" style={{background:C.bgCard,border:`1px solid ${C.border}`,width:'min(680px,95vw)',maxHeight:'88vh'}}>
        <div className="relative shrink-0" style={{paddingTop:'38%',background:C.bgInput}}>
          {(detail?.image||selected.image)?<img src={detail?.image||selected.image} alt={selected.name} className="absolute inset-0 w-full h-full object-cover"/>:<div className="absolute inset-0 flex items-center justify-center font-black" style={{color:C.textMuted,fontSize:48}}>{(selected.name||'?')[0]}</div>}
          <div className="absolute inset-0" style={{background:'linear-gradient(to top,rgba(0,0,0,0.7) 0%,transparent 50%)'}}/>
          <button onClick={()=>setSelected(null)} className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center cursor-pointer font-bold" style={{background:'rgba(0,0,0,0.6)',color:'#fff',fontSize:sz.base}}>X</button>
          {installedIds.has(selected.id)&&<div className="absolute top-3 left-3 px-2 py-1 rounded-md font-black" style={{background:C.accent,color:'#000',fontSize:sz.stat}}>ON SERVER</div>}
          <div className="absolute bottom-3 left-4 right-4">
            <div className="font-black" style={{color:'#fff',fontSize:sz.base+6,textShadow:'0 2px 8px rgba(0,0,0,0.8)'}}>{selected.name}</div>
            <div style={{color:'rgba(255,255,255,0.7)',fontSize:sz.base}}>by {selected.author||detail?.author}</div>
          </div>
        </div>
        <div className="p-5 overflow-auto flex-1">
          {/* Stats row */}
          <div className="flex items-center gap-4 mb-4 flex-wrap">
            {(selected.subscribers||detail?.subscribers)>0&&<div className="text-center px-4 py-2 rounded-lg" style={{background:C.bgInput,border:`1px solid ${C.border}`}}><div className="font-black" style={{color:C.textBright,fontSize:sz.base+2}}>{((selected.subscribers||detail?.subscribers||0)/1000).toFixed(1)}k</div><div style={{color:C.textMuted,fontSize:sz.stat}}>downloads</div></div>}
            {(selected.rating||detail?.rating)>0&&<div className="text-center px-4 py-2 rounded-lg" style={{background:C.bgInput,border:`1px solid ${C.border}`}}><div className="font-black" style={{color:C.orange,fontSize:sz.base+2}}>{selected.rating||detail?.rating}/5</div><div style={{color:C.textMuted,fontSize:sz.stat}}>{(selected.ratingCount||detail?.ratingCount||0).toLocaleString()} ratings</div></div>}
            {(selected.tags||detail?.tags||[]).slice(0,6).map(t=><span key={t} className="px-2.5 py-1 rounded-lg font-bold" style={{background:C.bgInput,color:C.textDim,border:`1px solid ${C.border}`,fontSize:sz.stat}}>{t}</span>)}
          </div>
          {/* Action buttons — at top so no scrolling needed */}
          {(()=>{
            const eff=(detail&&detail.id)?detail:selected
            const ver=eff.version||''
            return <div className="flex gap-2 mb-4 flex-wrap">
              {!installedIds.has(selected.id)
                ?<><Btn onClick={()=>addMod(selected,selected.version||'')} disabled={!selected.id}>+ Add Latest</Btn>
                  {ver&&detailLoading===false&&ver!==(selected.version||'')&&<Btn v="ghost" onClick={()=>addMod(eff,ver)}>+ Add v{ver}</Btn>}</>
                :<><div className="flex items-center gap-2 px-4 py-2 rounded-lg font-bold" style={{background:C.accentBg,color:C.accent,border:`1px solid ${C.accent}30`,fontSize:sz.base}}>On Server</div><Btn v="danger" onClick={()=>{removeMod(selected.id);setSelected(null)}}>Remove from Server</Btn></>}
            </div>
          })()}
          {/* Dependencies */}
          {detail&&!detailLoading&&detail.dependencies?.length>0&&(()=>{
            const fmtMB=s=>s>0?`${(s/1048576).toFixed(0)} MB`:''
            return <div className="mb-4">
              <div className="font-black uppercase tracking-wide mb-2" style={{color:C.textDim,fontSize:sz.label}}>Dependencies ({detail.dependencies.length})</div>
              <div className="space-y-1">{detail.dependencies.map((dep,i)=>{
                const on=installedIds.has(dep.id)
                return <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg" style={{background:C.bgInput,border:`1px solid ${on?C.accent+'35':C.border}`}}>
                  <div className="w-2 h-2 rounded-full shrink-0" style={{background:on?C.accent:C.textMuted+'60'}}/>
                  <div className="flex-1 min-w-0">
                    <span className="font-bold block truncate" style={{color:on?C.accent:C.text,fontSize:sz.base}}>{dep.name||dep.id}</span>
                    <span className="font-mono block truncate" style={{color:C.textMuted,fontSize:sz.stat-1}}>{dep.id}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {dep.version&&<span className="font-mono" style={{color:C.textMuted,fontSize:sz.stat}}>v{dep.version}</span>}
                    {dep.size>0&&<span className="font-mono" style={{color:C.textMuted,fontSize:sz.stat}}>{fmtMB(dep.size)}</span>}
                    {on&&<Badge text="On Server" v="default"/>}
                    <Btn small v="ghost" onClick={()=>{setSelected(null);setTimeout(()=>openMod({id:dep.id,name:dep.name,version:dep.version||'',image:null,author:'',rating:0,ratingCount:0,subscribers:0,tags:[],summary:''}),50)}}>View</Btn>
                  </div>
                </div>
              })}</div>
            </div>
          })()}
          {/* Scenarios */}
          {detail&&!detailLoading&&detail.scenarios?.length>0&&<div className="mb-4"><div className="font-black uppercase tracking-wide mb-2" style={{color:C.textDim,fontSize:sz.label}}>Scenarios in this mod</div><div className="space-y-2">{detail.scenarios.map((s,i)=><div key={i} className="rounded-xl overflow-hidden" style={{background:C.bgInput,border:`1px solid ${C.border}`}}>{s.image&&<img src={s.image} alt={s.name} className="w-full object-cover" style={{maxHeight:120}}/>}<div className="p-3"><div className="font-bold mb-1" style={{color:C.text,fontSize:sz.base+1}}>{s.name}</div>{s.description&&<div className="mb-1.5 leading-relaxed" style={{color:C.textDim,fontSize:sz.stat}}>{s.description}</div>}<div className="flex items-center gap-3 flex-wrap mb-2" style={{fontSize:sz.stat}}>{s.gameMode&&<span className="font-mono px-2 py-0.5 rounded" style={{background:C.accentBg,color:C.accent}}>{s.gameMode.replace('#AR-Scenario_GameMode_','')}</span>}{s.playerCount>0&&<span style={{color:C.textMuted}}>{s.playerCount} players</span>}</div><div className="flex items-center gap-2"><code className="flex-1 px-2 py-1 rounded text-xs font-mono truncate" style={{background:C.consoleBg,color:C.textDim}}>{s.id}</code><Btn small onClick={()=>useScenario(s.id)}>Use</Btn></div></div></div>)}</div></div>}
          {/* Version History */}
          {detail?.versions&&detail.versions.length>1&&<div className="mb-4">
            <div className="font-black uppercase tracking-wide mb-2" style={{color:C.textDim,fontSize:sz.label}}>Version History</div>
            <div className="space-y-1.5 max-h-56 overflow-auto pr-1">
              {detail.versions.map((v,i)=><div key={i} className="flex items-center gap-3 px-4 py-2.5 rounded-lg" style={{background:C.bgInput,border:`1px solid ${i===0?C.accent+'30':C.border}`}}>
                <div className="flex-1 flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-bold" style={{color:i===0?C.accent:C.text,fontSize:sz.base}}>v{v.version}</span>
                  {i===0&&<Badge text="Latest" v="default"/>}
                  {v.gameVersion&&<span style={{color:C.textMuted,fontSize:sz.stat}}>game {v.gameVersion}</span>}
                  {v.size>0&&<span style={{color:C.textMuted,fontSize:sz.stat}}>{(v.size/1024).toFixed(0)}KB</span>}
                </div>
                <span style={{color:C.textMuted,fontSize:sz.stat}}>{v.date?new Date(v.date).toLocaleDateString():''}</span>
                {!installedIds.has(selected.id)&&i>0&&<Btn small v="ghost" onClick={()=>addMod((detail&&detail.id)?detail:selected,v.version)}>+ Pin v{v.version}</Btn>}
              </div>)}
            </div>
          </div>}
          {detailLoading&&<div className="animate-pulse mb-4" style={{color:C.textDim,fontSize:sz.base}}>Loading details...</div>}
          {/* Description — last */}
          {(()=>{const desc=detail?.description||selected.summary||'';const name=detail?.name||selected.name||'';const useful=desc&&desc.trim()!==name.trim()&&desc.length>name.length;return useful&&<div className="mb-4 leading-relaxed" style={{color:C.textDim,fontSize:sz.base}}>{desc}</div>})()}
        </div>
      </div>
    </div>}
  </div>
}

function Files({toast}){
  const{C,sz}=useT()
  const mobile=useMobile()
  const{data:locations}=useFetchOnce(`${API}/files/locations`)
  const[path,setPath]=useState(null)
  const[listing,setListing]=useState(null)
  const[listLoading,setListLoading]=useState(false)
  const[fc,setFc]=useState(null)
  const[editMode,setEditMode]=useState(false)
  const[editContent,setEditContent]=useState('')
  const[saving,setSaving]=useState(false)
  const[checked,setChecked]=useState(new Set())
  const[showMkdir,setShowMkdir]=useState(false)
  const[mkdirName,setMkdirName]=useState('')
  const[filter,setFilter]=useState('')
  const[locationPickerOpen,setLocationPickerOpen]=useState(false)

  const browse=useCallback(async p=>{
    setPath(p);setFc(null);setEditMode(false);setChecked(new Set());setShowMkdir(false);setFilter('')
    setListLoading(true)
    try{const r=await fetch(`${API}/files?path=${encodeURIComponent(p)}`,{headers:authHeaders()})
      if(r.status===401){on401();return}
      setListing(await r.json())
    }catch{toast('Failed to load directory','danger')}finally{setListLoading(false)}
  },[])

  const openFile=async(fp)=>{
    try{const r=await fetch(`${API}/files/read?path=${encodeURIComponent(fp)}`,{headers:authHeaders()})
      if(r.status===401){on401();return}
      const d=await r.json()
      if(d.error){toast(d.error,'danger');return}
      setFc({...d,path:fp});setEditContent(d.content);setEditMode(false)
    }catch{toast('Read failed','danger')}
  }

  const saveFile=async()=>{if(!fc)return;setSaving(true)
    const r=await put(`${API}/files/write`,{path:fc.path,content:editContent});setSaving(false)
    if(r.error){toast(r.error,'danger');return}
    toast('Saved');setFc(p=>({...p,content:editContent}));setEditMode(false)
  }

  const toggleCheck=(name,e)=>{e?.stopPropagation();setChecked(prev=>{const n=new Set(prev);n.has(name)?n.delete(name):n.add(name);return n})}
  const toggleAll=()=>{const all=visItems.map(i=>i.name);setChecked(prev=>prev.size===all.length&&all.length>0?new Set():new Set(all))}

  const deleteChecked=async()=>{if(!checked.size)return
    if(!confirm(`Permanently delete ${checked.size} item(s)?`))return
    const paths=[...checked].map(n=>path?`${path}/${n}`:n)
    const r=await post(`${API}/files/delete`,{paths})
    if(r.error&&!r.message){toast(r.error,'danger');return}
    toast(r.message||'Deleted','warning');setChecked(new Set());browse(path)
  }

  const mkdir=async()=>{if(!mkdirName.trim())return
    const p=path?`${path}/${mkdirName.trim()}`:mkdirName.trim()
    const r=await post(`${API}/files/mkdir`,{path:p})
    if(r.error){toast(r.error,'danger');return}
    toast('Created');setMkdirName('');setShowMkdir(false);browse(path)
  }

  const fmt=s=>s>=1073741824?`${(s/1073741824).toFixed(1)} GB`:s>=1048576?`${(s/1048576).toFixed(1)} MB`:s>=1024?`${(s/1024).toFixed(1)} KB`:`${s} B`
  const fmtDate=ts=>{if(!ts)return'';const d=new Date(ts*1000);const now=Date.now();const diff=now-d;if(diff<86400000)return d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});if(diff<604800000)return d.toLocaleDateString([],{weekday:'short'});return d.toLocaleDateString([],{month:'short',day:'numeric'})}

  // file type classification
  const fileExt=name=>{const d=name.lastIndexOf('.');return d>0?name.slice(d+1).toLowerCase():''}
  const typeInfo=name=>{
    const ext=fileExt(name)
    if(!ext)return{label:'FILE',color:'#6b7a8d'}
    const map={
      json:{label:'JSON',color:'#69f0ae'},conf:{label:'CONF',color:'#69f0ae'},
      log:{label:'LOG', color:'#ffa502'},txt:{label:'TXT', color:'#b0bec5'},
      bin:{label:'BIN', color:'#b388ff'},pbo:{label:'PBO', color:'#b388ff'},
      sqf:{label:'SQF', color:'#4dd0e1'},py:{label:'PY',  color:'#4dd0e1'},
      sh: {label:'SH',  color:'#ffa502'},xml:{label:'XML', color:'#80cbc4'},
      zip:{label:'ZIP', color:'#f48fb1'},gz:{label:'GZ',  color:'#f48fb1'},
      dll:{label:'DLL', color:'#90a4ae'},so:{label:'SO',  color:'#90a4ae'},
    }
    return map[ext]||{label:ext.slice(0,4).toUpperCase(),color:'#6b7a8d'}
  }

  const pathParts=path?path.split('/').filter(Boolean):[]
  const navTo=i=>{if(i<0){setPath(null);setFc(null);setListing(null);setLocationPickerOpen(false)}else{browse(pathParts.slice(0,i+1).join('/'))}}

  const rawItems=listing?.items||[]
  const visItems=filter?rawItems.filter(it=>it.name.toLowerCase().includes(filter.toLowerCase())):rawItems

  const allChecked=checked.size>0&&checked.size===visItems.length&&visItems.length>0
  const anyChecked=checked.size>0

  return <div className={mobile?'flex flex-col h-full':'flex gap-3 h-full'} style={{minHeight:0}}>

    {/* ── LOCATION PICKER — sidebar on desktop, dropdown on mobile ── */}
    {!mobile&&<div className="shrink-0 flex flex-col rounded-xl overflow-hidden" style={{width:176,background:C.bgCard,border:`1px solid ${C.border}`}}>
      <div className="px-4 py-3 font-black uppercase tracking-widest shrink-0" style={{borderBottom:`1px solid ${C.border}`,color:C.textDim,fontSize:sz.label,letterSpacing:'0.12em'}}>Locations</div>
      <div className="flex-1 overflow-auto">
        {(locations||[]).map((loc,i)=>{
          const active=path!==null&&(path===loc.path||path.startsWith(loc.path.length>0?loc.path+'/':'___'))
          return <div key={i} onClick={()=>loc.exists&&browse(loc.path)} className="relative px-4 py-3 cursor-pointer select-none"
            style={{background:active?C.accentBg:'transparent',borderLeft:`3px solid ${active?C.accent:'transparent'}`,opacity:loc.exists?1:0.3,cursor:loc.exists?'pointer':'default'}}
            onMouseEnter={e=>{if(!active&&loc.exists)e.currentTarget.style.background=C.bgHover}}
            onMouseLeave={e=>{if(!active)e.currentTarget.style.background='transparent'}}
          >
            <div className="font-bold truncate" style={{color:active?C.accent:C.textDim,fontSize:sz.nav}}>{loc.label}</div>
            <div className="font-mono truncate mt-0.5" style={{color:C.textMuted,fontSize:Math.max(7,sz.stat-2)}}>{loc.path||'/'}</div>
          </div>
        })}
      </div>
    </div>}
    {mobile&&<div className="shrink-0 mb-2">
      <button onClick={()=>setLocationPickerOpen(p=>!p)} className="w-full flex items-center justify-between px-4 py-3 rounded-xl font-bold cursor-pointer" style={{background:C.bgCard,border:`1px solid ${C.border}`,color:C.textDim,fontSize:sz.nav}}>
        <span>{path?(locations||[]).find(loc=>path===loc.path||path.startsWith(loc.path.length>0?loc.path+'/':'___'))?.label||pathParts[0]||'Root':'Select Location'}</span>
        <span style={{fontSize:10}}>{locationPickerOpen?'▲':'▼'}</span>
      </button>
      {locationPickerOpen&&<div className="mt-1 rounded-xl overflow-hidden" style={{background:C.bgCard,border:`1px solid ${C.border}`}}>
        {(locations||[]).map((loc,i)=>{
          const active=path!==null&&(path===loc.path||path.startsWith(loc.path.length>0?loc.path+'/':'___'))
          return <div key={i} onClick={()=>{if(loc.exists){browse(loc.path);setLocationPickerOpen(false)}}} className="px-4 py-3 cursor-pointer" style={{background:active?C.accentBg:'transparent',borderLeft:`3px solid ${active?C.accent:'transparent'}`,opacity:loc.exists?1:0.3}}>
            <div className="font-bold" style={{color:active?C.accent:C.textDim,fontSize:sz.nav}}>{loc.label}</div>
          </div>
        })}
      </div>}
    </div>}

    {/* ── RIGHT PANE ── */}
    <div className="flex-1 flex flex-col min-w-0" style={{minHeight:0}}>

      {/* BREADCRUMB + TOOLBAR */}
      <div className="flex items-center gap-1.5 mb-2 flex-wrap shrink-0">
        <button onClick={()=>navTo(-1)} className="font-black px-2.5 py-1.5 rounded-lg cursor-pointer" style={{background:C.bgCard,border:`1px solid ${C.border}`,color:C.textDim,fontSize:sz.nav}}>~</button>
        {pathParts.map((part,i)=><span key={i} className="flex items-center gap-1">
          <span style={{color:C.textMuted,fontSize:sz.nav}}>/</span>
          {(i===pathParts.length-1&&!fc)?<span className="font-bold" style={{color:C.text,fontSize:sz.nav}}>{part}</span>
            :<button onClick={()=>navTo(i)} className="font-bold cursor-pointer" style={{color:C.accent,fontSize:sz.nav}} onMouseEnter={e=>e.target.style.textDecoration='underline'} onMouseLeave={e=>e.target.style.textDecoration=''}>{part}</button>}
        </span>)}
        {fc&&<><span style={{color:C.textMuted,fontSize:sz.nav}}>/</span><span className="font-bold" style={{color:C.orange,fontSize:sz.nav}}>{fc.name}</span></>}
        <div className="flex-1"/>
        {/* file editor controls */}
        {fc&&<>
          <Btn small v="ghost" onClick={()=>setFc(null)}>Back</Btn>
          {!editMode?<Btn small onClick={()=>{setEditContent(fc.content);setEditMode(true)}}>Edit</Btn>
            :<><Btn small v="ghost" onClick={()=>setEditMode(false)}>Cancel</Btn><Btn small onClick={saveFile} disabled={saving}>{saving?'Saving...':'Save'}</Btn></>}
        </>}
        {/* directory controls */}
        {!fc&&path!==null&&<>
          {anyChecked&&<Btn small v="danger" onClick={deleteChecked}>Delete ({checked.size})</Btn>}
          <Btn small v="ghost" onClick={()=>{setShowMkdir(p=>!p);setMkdirName('')}}>+ Folder</Btn>
          <input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Filter..." className="rounded-lg px-2.5 py-1.5 outline-none placeholder:opacity-30" style={{width:120,background:C.bgInput,border:`1px solid ${filter?C.accent+'60':C.border}`,color:C.text,fontSize:sz.input}}/>
          <Btn small v="ghost" onClick={()=>browse(path)}>Refresh</Btn>
        </>}
      </div>

      {/* NEW FOLDER ROW */}
      {showMkdir&&!fc&&<div className="flex gap-2 mb-2 items-center shrink-0">
        <input value={mkdirName} onChange={e=>setMkdirName(e.target.value)}
          onKeyDown={e=>{if(e.key==='Enter')mkdir();else if(e.key==='Escape'){setShowMkdir(false);setMkdirName('')}}}
          placeholder="New folder name" autoFocus className="flex-1 rounded-lg px-3 py-2 outline-none"
          style={{background:C.bgInput,border:`1px solid ${C.accent}60`,color:C.text,fontSize:sz.input}}/>
        <Btn small onClick={mkdir}>Create</Btn>
        <Btn small v="ghost" onClick={()=>{setShowMkdir(false);setMkdirName('')}}>Cancel</Btn>
      </div>}

      {/* NO PATH */}
      {path===null&&<div className="flex-1 overflow-auto">
        <div className="font-black uppercase tracking-wide mb-3" style={{color:C.textDim,fontSize:sz.label}}>Quick Access</div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {(locations||[]).filter(l=>l.exists).map((loc,i)=><div key={i} onClick={()=>browse(loc.path)} className="rounded-xl p-4 cursor-pointer" style={{background:C.bgCard,border:`1px solid ${C.border}`}} onMouseEnter={e=>e.currentTarget.style.borderColor=C.accent+'60'} onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
            <div className="font-bold mb-1" style={{color:C.text,fontSize:sz.base+1}}>{loc.label}</div>
            <div className="font-mono truncate" style={{color:C.textMuted,fontSize:sz.stat}}>{loc.path}</div>
          </div>)}
        </div>
      </div>}

      {/* LOADING */}
      {listLoading&&<div className="flex-1 flex items-center justify-center"><div className="animate-pulse font-bold" style={{color:C.textDim,fontSize:sz.base}}>Loading...</div></div>}

      {/* FILE EDITOR */}
      {!listLoading&&fc&&<div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center gap-3 mb-2 px-1 shrink-0">
          <span className="font-bold" style={{color:C.text,fontSize:sz.base}}>{fc.name}</span>
          {fc.size!=null&&<span className="font-mono" style={{color:C.textMuted,fontSize:sz.stat}}>{fmt(fc.size)}</span>}
          {editMode&&<span className="font-bold" style={{color:C.orange,fontSize:sz.stat}}>* editing</span>}
        </div>
        {editMode
          ?<textarea value={editContent} onChange={e=>setEditContent(e.target.value)} spellCheck={false}
              className="flex-1 rounded-xl p-4 font-mono outline-none resize-none"
              style={{background:C.consoleBg,border:`1px solid ${C.accent}40`,color:C.text,fontSize:sz.code,lineHeight:1.75,minHeight:0}}/>
          :<pre className="flex-1 rounded-xl p-4 overflow-auto whitespace-pre-wrap font-mono"
              style={{background:C.consoleBg,border:`1px solid ${C.border}`,color:C.textDim,fontSize:sz.code,lineHeight:1.75,minHeight:0}}>{fc.content}</pre>
        }
      </div>}

      {/* DIRECTORY LISTING */}
      {!listLoading&&!fc&&path!==null&&listing?.type==='dir'&&<div className="flex-1 flex flex-col rounded-xl min-h-0" style={{background:C.bgCard,border:`1px solid ${C.border}`,overflow:'hidden'}}>
        {/* header */}
        <div className="flex items-center gap-3 px-4 py-2 shrink-0" style={{borderBottom:`1px solid ${C.border}`,background:C.bgInput}}>
          <input type="checkbox" checked={allChecked} onChange={toggleAll} className="cursor-pointer shrink-0" style={{accentColor:C.accent,width:14,height:14}}/>
          <span className="shrink-0" style={{minWidth:'2.6em'}}/>
          <span className="flex-1 font-black uppercase tracking-widest" style={{color:C.textMuted,fontSize:sz.label}}>Name</span>
          <span className="font-black uppercase tracking-widest text-right" style={{color:C.textMuted,fontSize:sz.label,width:60}}>Size</span>
          {!mobile&&<span className="font-black uppercase tracking-widest text-right" style={{color:C.textMuted,fontSize:sz.label,width:56}}>Modified</span>}
        </div>
        {/* rows — THIS is the scrollable part */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {visItems.length===0&&<div className="py-12 text-center" style={{color:C.textMuted,fontSize:sz.base}}>{filter?`No items matching "${filter}"`:'Empty folder'}</div>}
          {visItems.map((it,i)=>{
            const isChk=checked.has(it.name)
            const isDir=it.type==='dir'
            const fp=path?`${path}/${it.name}`:it.name
            const ti=isDir?{label:'DIR',color:C.accent}:typeInfo(it.name)
            const handleClick=()=>{if(anyChecked){toggleCheck(it.name)}else if(isDir){browse(fp)}else{openFile(fp)}}
            return <div key={i} className="flex items-center gap-3 px-4 select-none"
              style={{height:40,borderBottom:`1px solid ${C.border}12`,background:isChk?C.accentBg:i%2===0?'transparent':C.bgInput+'30',cursor:'pointer',transition:'background 0.08s'}}
              onMouseEnter={e=>{if(!isChk)e.currentTarget.style.background=C.bgHover}}
              onMouseLeave={e=>{e.currentTarget.style.background=isChk?C.accentBg:i%2===0?'transparent':C.bgInput+'30'}}
              onClick={handleClick}
            >
              <input type="checkbox" checked={isChk} onChange={()=>toggleCheck(it.name)} onClick={e=>e.stopPropagation()} className="cursor-pointer shrink-0" style={{accentColor:C.accent,width:14,height:14}}/>
              <span className="shrink-0 font-black rounded px-1.5 py-0.5 text-center" style={{fontSize:Math.max(7,sz.stat-1),minWidth:'2.6em',letterSpacing:'0.04em',background:ti.color+'18',color:ti.color,border:`1px solid ${ti.color}30`}}>{ti.label}</span>
              <span className="flex-1 font-mono truncate" style={{color:isDir?C.accent:C.text,fontSize:sz.base,fontWeight:isDir?600:400}}>{it.name}</span>
              {!isDir&&<span className="font-mono shrink-0 text-right" style={{color:C.textMuted,fontSize:sz.stat,width:60}}>{fmt(it.size)}</span>}
              {isDir&&<span className="shrink-0" style={{width:60}}/>}
              {!mobile&&<span className="font-mono shrink-0 text-right" style={{color:C.textMuted,fontSize:sz.stat,width:56}}>{fmtDate(it.modified)}</span>}
            </div>
          })}
        </div>
        {/* status bar */}
        <div className="px-4 py-2 shrink-0 flex items-center gap-4" style={{borderTop:`1px solid ${C.border}`,background:C.bgInput}}>
          <span style={{color:C.textMuted,fontSize:sz.stat}}>
            {visItems.filter(i=>i.type==='dir').length} folders, {visItems.filter(i=>i.type==='file').length} files
            {filter&&<span style={{color:C.orange}}> (filtered)</span>}
          </span>
          {anyChecked&&<span className="font-bold" style={{color:C.accent,fontSize:sz.stat}}>{checked.size} selected</span>}
          {listing?.type==='error'&&<span className="font-bold" style={{color:C.red,fontSize:sz.stat}}>{listing.error}</span>}
        </div>
      </div>}

      {/* LISTING ERROR */}
      {!listLoading&&!fc&&path!==null&&listing?.type==='error'&&<div className="flex-1 flex items-center justify-center"><div className="text-center"><div className="font-bold mb-1" style={{color:C.red,fontSize:sz.base+2}}>Error</div><div style={{color:C.textDim,fontSize:sz.base}}>{listing.error}</div></div></div>}

    </div>
  </div>
}

function Webhooks({toast}){const{C,sz}=useT();const{data:initial,reload}=useFetchOnce(`${API}/webhooks`);const[hooks,setHooks]=useState(null);const[editing,setEditing]=useState(null);useEffect(()=>{if(initial&&!hooks)setHooks(initial)},[initial]);const update=(id,field,val)=>setHooks(p=>p.map(h=>h.id===id?{...h,[field]:val}:h));const saveAll=async()=>{const r=await put(`${API}/webhooks`,hooks);r.error?toast(r.error,'danger'):toast('Saved')};const testHook=async url=>{if(!url){toast('Set URL','danger');return};const r=await post(`${API}/webhooks/test`,{url});r.error?toast(r.error,'danger'):toast('Sent!')}
  if(!hooks)return <div className="animate-pulse" style={{color:C.textDim}}>Loading...</div>
  return <div><div className="flex items-center gap-3 mb-4 flex-wrap"><h2 className="font-black" style={{color:C.textBright,fontSize:sz.base+4}}>Webhooks</h2><Badge text={`${hooks.filter(h=>h.enabled&&h.url).length} active`}/><div className="flex-1"/><Btn v="ghost" onClick={()=>setHooks(p=>[...p,{id:Date.now(),name:'New',url:'',events:[],enabled:false}])}>+ Add</Btn><Btn onClick={saveAll}>Save</Btn></div><div className="space-y-2">{hooks.map(h=><Card key={h.id} className="p-4"><div className="flex items-center gap-3 mb-2"><Toggle value={h.enabled} onChange={()=>update(h.id,'enabled',!h.enabled)}/><div className="flex-1"><div className="font-bold" style={{color:C.text,fontSize:sz.base+1}}>{h.name}</div></div><Btn small v="ghost" onClick={()=>setEditing(editing===h.id?null:h.id)}>{editing===h.id?'Close':'Edit'}</Btn><Btn small v="danger" onClick={()=>setHooks(p=>p.filter(x=>x.id!==h.id))}>X</Btn></div>{editing===h.id&&<div className="pt-3 mt-2 space-y-3" style={{borderTop:`1px solid ${C.border}`}}><Input label="Name" value={h.name} onChange={v=>update(h.id,'name',v)}/><Input label="Discord URL" value={h.url} onChange={v=>update(h.id,'url',v)} placeholder="https://discord.com/api/webhooks/..." mono/><div><label className="block font-bold uppercase tracking-wide mb-2" style={{color:C.textDim,fontSize:sz.label}}>Events</label><div className="flex gap-1.5 flex-wrap">{['connect','disconnect','kick','ban','kill','chat','start','stop','crash'].map(ev=><button key={ev} onClick={()=>update(h.id,'events',h.events.includes(ev)?h.events.filter(x=>x!==ev):[...h.events,ev])} className="px-2.5 py-1 rounded font-bold cursor-pointer" style={{background:h.events.includes(ev)?C.accentBg:'transparent',color:h.events.includes(ev)?C.accent:C.textMuted,border:`1px solid ${h.events.includes(ev)?C.accent+'30':C.border}`,fontSize:sz.stat}}>{ev}</button>)}</div></div><Btn v="info" onClick={()=>testHook(h.url)}>Test</Btn></div>}{editing!==h.id&&h.url&&<div className="font-mono truncate" style={{color:C.textMuted,fontSize:sz.stat}}>{h.url}</div>}</Card>)}</div></div>}

function Network({toast}){const{C,sz}=useT();const mobile=useMobile();const{data:rcon}=useFetch(`${API}/rcon/status`,5000);const{data:config}=useFetchOnce(`${API}/config`);const{data:net}=useFetch(`${API}/network`,3000);const{data:portsData,loading:portsLoading,reload:reloadPorts}=useFetchOnce(`${API}/server/ports`);const{history:bwHist,push:pushBw}=useHistory(60);const rc=config?.rcon||{},a2s=config?.a2s||{};const fmt=b=>{if(!b)return'0 B';const g=b/(1024**3);if(g>=1)return`${g.toFixed(1)} GB`;const m=b/(1024**2);return m>=1?`${m.toFixed(1)} MB`:`${(b/1024).toFixed(1)} KB`}
  useEffect(()=>{if(net?.rate)pushBw({up:net.rate.up_mbps,down:net.rate.down_mbps})},[net]);const chartData=bwHist.map((h,i)=>({i,up:h.up,down:h.down}));const activeIfaces=(net?.interfaces||[]).filter(i=>i.is_up&&net?.per_nic?.[i.name]&&(net.per_nic[i.name].bytes_sent>0||net.per_nic[i.name].bytes_recv>0))
  return <div className="space-y-3"><h2 className="font-black" style={{color:C.textBright,fontSize:sz.base+4}}>Network</h2>
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="font-black uppercase tracking-wide" style={{color:C.textDim,fontSize:sz.label}}>Port Status</div>
        <div className="flex items-center gap-2">
          {portsData?.upnp?.external_ip&&<span className="font-mono" style={{color:C.textMuted,fontSize:sz.stat}}>External IP: {portsData.upnp.external_ip}</span>}
          <Btn small v="ghost" onClick={reloadPorts}>Refresh</Btn>
        </div>
      </div>
      {portsLoading?<div style={{color:C.textMuted,fontSize:sz.stat}}>Checking ports...</div>:
      portsData?<div className="space-y-1.5">{Object.entries(portsData.ufw||{}).map(([spec,ufwVal])=>{
        const upnpVal=portsData.upnp?.mappings?.[spec]
        const upnpAvail=portsData.upnp?.available
        const ufwOk=ufwVal==='allowed'
        const upnpOk=upnpVal==='ok'||upnpVal==='mapped'
        return<div key={spec} className="flex items-center gap-2 px-3 py-2 rounded-lg flex-wrap" style={{background:C.bgInput,border:`1px solid ${C.border}`}}>
          <span className="font-mono font-bold" style={{color:C.textBright,fontSize:sz.base}}>{spec}</span>
          <div className="flex-1"/>
          <span className="px-2 py-0.5 rounded font-bold" style={{background:ufwOk?C.accent+'18':C.red+'18',color:ufwOk?C.accent:C.red,fontSize:sz.stat}}>ufw: {ufwVal}</span>
          <span className="px-2 py-0.5 rounded font-bold" style={{background:upnpAvail&&upnpOk?C.accent+'18':C.bgInput,color:upnpAvail&&upnpOk?C.accent:C.textMuted,fontSize:sz.stat}}>{upnpAvail?`UPnP: ${upnpOk?'mapped':'not mapped'}`:'UPnP: N/A'}</span>
        </div>
      })}</div>:<div style={{color:C.textMuted,fontSize:sz.stat}}>Port data unavailable</div>}
    </Card>
    <Card className="p-5"><div className="font-black uppercase tracking-wide mb-3" style={{color:C.textDim,fontSize:sz.label}}>Live Bandwidth</div><div className="flex gap-8 mb-3 flex-wrap"><div><div style={{color:C.textDim,fontSize:sz.stat}}>Upload</div><div className="font-black" style={{color:C.accent,fontSize:sz.value}}>{net?.rate?.up_mbps||0} <span style={{color:C.textDim,fontSize:sz.base}}>Mbps</span></div></div><div><div style={{color:C.textDim,fontSize:sz.stat}}>Download</div><div className="font-black" style={{color:C.blue,fontSize:sz.value}}>{net?.rate?.down_mbps||0} <span style={{color:C.textDim,fontSize:sz.base}}>Mbps</span></div></div></div>{chartData.length>2&&<ResponsiveContainer width="100%" height={120}><AreaChart data={chartData} margin={{top:0,right:0,left:-20,bottom:0}}><defs><linearGradient id="nUpG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.accent} stopOpacity={0.3}/><stop offset="100%" stopColor={C.accent} stopOpacity={0}/></linearGradient><linearGradient id="nDnG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.blue} stopOpacity={0.3}/><stop offset="100%" stopColor={C.blue} stopOpacity={0}/></linearGradient></defs><Tooltip contentStyle={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:8,fontSize:sz.base,color:C.text}}/><Area type="monotone" dataKey="up" stroke={C.accent} fill="url(#nUpG)" strokeWidth={1.5} dot={false} name="Upload"/><Area type="monotone" dataKey="down" stroke={C.blue} fill="url(#nDnG)" strokeWidth={1.5} dot={false} name="Download"/></AreaChart></ResponsiveContainer>}</Card>
    {activeIfaces.length>0&&<div className={`grid ${mobile?'grid-cols-1':'grid-cols-2'} gap-2.5`}>{activeIfaces.map((iface,i)=><Card key={i} className="p-4"><div className="flex items-center gap-2 mb-2"><div className="w-2.5 h-2.5 rounded-full" style={{background:C.accent}}/><span className="font-bold" style={{color:C.text,fontSize:sz.base+1}}>{iface.name}</span></div>{iface.addresses?.filter(a=>a.type==='IPv4').map((a,j)=><div key={j} className="font-mono" style={{color:C.textDim,fontSize:sz.stat}}>{a.address}</div>)}{net.per_nic?.[iface.name]&&<div className="mt-2 pt-2 flex justify-between" style={{borderTop:`1px solid ${C.border}`,fontSize:sz.stat}}><span style={{color:C.accent}}>Up {fmt(net.per_nic[iface.name].bytes_sent)}</span><span style={{color:C.blue}}>Down {fmt(net.per_nic[iface.name].bytes_recv)}</span></div>}</Card>)}</div>}
    <div className={`grid ${mobile?'grid-cols-1':'grid-cols-2'} gap-2.5`}><Card className="p-4"><div className="font-black uppercase tracking-wide mb-3" style={{color:C.textDim,fontSize:sz.label}}>Ports</div>{[['Game (UDP)',config?.bindPort||null],['Query (UDP)',config?.bindPort?config.bindPort+15776:null],['RCON (TCP)',rc.port||null],['Panel (TCP)',parseInt(window.location.port)||8000]].map(([n,p])=><div key={n} className="flex justify-between py-1.5" style={{borderBottom:`1px solid ${C.border}`,fontSize:sz.base}}><span style={{color:C.textDim}}>{n}</span><span className="font-mono font-bold" style={{color:C.text}}>{p||'--'}</span></div>)}</Card><Card className="p-4"><div className="font-black uppercase tracking-wide mb-3" style={{color:C.textDim,fontSize:sz.label}}>RCON</div><div className="flex items-center gap-2 mb-3"><div className="w-2.5 h-2.5 rounded-full" style={{background:rcon?.status==='reachable'?C.accent:C.red}}/><span className="font-bold" style={{color:C.text,fontSize:sz.base}}>{rcon?.status==='reachable'?'Connected':'Unreachable'}</span></div><div style={{color:C.textDim,fontSize:sz.base}}>Port: <span className="font-mono" style={{color:C.text}}>{rcon?.port||'--'}</span></div></Card></div></div>}

// Tactical color palette (matches dashboard.html exactly)
const TC={cyan:'#22d3ee',red:'#ef4444',green:'#22c55e',yellow:'#eab308',orange:'#f97316',purple:'#a78bfa',blue:'#60a5fa',
  cyanDim:'rgba(34,211,238,0.1)',redDim:'rgba(239,68,68,0.1)',greenDim:'rgba(34,197,94,0.1)',
  yellowDim:'rgba(234,179,8,0.1)',purpleDim:'rgba(167,139,250,0.1)',
  cyanBorder:'rgba(34,211,238,0.25)',redBorder:'rgba(239,68,68,0.25)',greenBorder:'rgba(34,197,94,0.25)',
  yellowBorder:'rgba(234,179,8,0.25)',purpleBorder:'rgba(167,139,250,0.25)',
  bg:'#09090b',surface:'rgba(24,24,27,0.95)',surface2:'#27272a',border:'rgba(63,63,70,0.6)',borderDim:'rgba(39,39,42,0.8)',
  text:'#e4e4e7',textDim:'#71717a',textMuted:'#52525b'}
const ESC_NAMES=['QUIET','PROBING','ENGAGED','ASSAULT','OVERWHELM']
const ESC_DESC=['AI holds back — minimal activity','Light patrols — testing boundaries','Active contact — threats escalating','Full assault — multi-element attack','Maximum pressure — overwhelming force']
const ESC_COLORS=[TC.green,TC.cyan,TC.yellow,TC.red,TC.purple]
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

function FloatingPanel({title,onDock,children,defaultPos}){
  const{C}=useT()
  const[pos,setPos]=useState(defaultPos||{x:120,y:100})
  const outerRef=useRef(null)
  const headerRef=useRef(null)
  const[contentH,setContentH]=useState(null)
  const drag=useRef(null)
  useEffect(()=>{
    const el=outerRef.current
    if(!el)return
    const ro=new ResizeObserver(()=>{
      const hdr=headerRef.current
      if(el&&hdr)setContentH(el.clientHeight-hdr.offsetHeight)
    })
    ro.observe(el)
    return()=>ro.disconnect()
  },[])
  const onDown=(e)=>{
    if(e.target.closest('button[data-nodrag]'))return
    if(drag.current)return
    drag.current={ox:e.clientX-pos.x,oy:e.clientY-pos.y}
    const mv=(e)=>setPos({x:e.clientX-drag.current.ox,y:e.clientY-drag.current.oy})
    const up=()=>{drag.current=null;window.removeEventListener('mousemove',mv);window.removeEventListener('mouseup',up)}
    window.addEventListener('mousemove',mv);window.addEventListener('mouseup',up)
  }
  return(
    <div ref={outerRef} style={{position:'fixed',left:pos.x,top:pos.y,zIndex:200,minWidth:200,minHeight:80,background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:8,boxShadow:'0 8px 32px rgba(0,0,0,0.6)',resize:'both',overflow:'hidden'}}>
      <div ref={headerRef} onMouseDown={onDown} style={{cursor:'grab',padding:'7px 10px',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:8,userSelect:'none'}}>
        <span style={{flex:1,fontSize:9,fontWeight:700,letterSpacing:'1.5px',color:C.textMuted,textTransform:'uppercase'}}>{title}</span>
        <button data-nodrag onClick={onDock} style={{background:`${C.cyan}18`,border:`1px solid ${C.cyan}50`,borderRadius:4,cursor:'pointer',color:C.cyan,fontSize:9,padding:'2px 7px',fontWeight:700}}>↩ Dock</button>
      </div>
      <div style={contentH!=null?{height:contentH,overflowY:'auto'}:{maxHeight:'60vh',overflowY:'auto'}}>{children}</div>
    </div>
  )
}

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

function AiGm({toast}){
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

function Scheduler({toast}){const{C,sz}=useT();const{data,loading,reload}=useFetchOnce(`${API}/crontab`);const[showAdd,setShowAdd]=useState(false);const[newJob,setNewJob]=useState({cron:'',command:'',comment:''})
  const addJob=async()=>{if(!newJob.cron||!newJob.command){toast('Cron+command required','danger');return};const r=await post(`${API}/crontab/add`,newJob);if(r.error){toast(r.error,'danger');return};toast(r.message||'Added');setShowAdd(false);setNewJob({cron:'',command:'',comment:''});reload()}
  const removeJob=async raw=>{const r=await post(`${API}/crontab/remove`,{raw});if(r.error){toast(r.error,'danger');return};toast('Removed','warning');reload()}
  const presets=[{label:'Daily Restart 4AM',cron:'0 4 * * *',cmd:'sudo systemctl restart arma-reforger'},{label:'Update Check 6hr',cron:'0 */6 * * *',cmd:'/usr/games/steamcmd +force_install_dir /opt/arma-server +login anonymous +app_update 1874900 validate +quit'},{label:'Log Cleanup 3AM',cron:'0 3 * * *',cmd:'find /opt/arma-server/profile/logs -name "*.log" -mtime +7 -delete'},{label:'Weekly Restart Sun 5AM',cron:'0 5 * * 0',cmd:'sudo systemctl restart arma-reforger'}]
  if(loading)return <div className="animate-pulse" style={{color:C.textDim,fontSize:sz.base}}>Loading...</div>;const jobs=data?.jobs||[]
  return <div><div className="flex items-center gap-3 mb-4 flex-wrap"><h2 className="font-black" style={{color:C.textBright,fontSize:sz.base+4}}>Scheduler</h2><Badge text={`${jobs.length} active`}/><div className="flex-1"/><Btn onClick={()=>setShowAdd(true)}>+ Add</Btn></div>
    {jobs.length===0?<Empty title="No cron jobs" sub="Add scheduled tasks"/>:<div className="space-y-1.5 mb-4">{jobs.map((j,i)=><Card key={i} className="px-5 py-3 flex items-center gap-3"><div className="w-2.5 h-2.5 rounded-full" style={{background:C.accent}}/><div className="flex-1 min-w-0"><div className="font-mono font-bold truncate" style={{color:C.text,fontSize:sz.base}}>{j.command}</div><div className="flex items-center gap-2 mt-0.5"><span className="font-mono px-2 py-0.5 rounded" style={{background:C.accentBg,color:C.accent,fontSize:sz.stat}}>{j.cron}</span>{j.comment&&<span style={{color:C.textMuted,fontSize:sz.stat}}>{j.comment}</span>}</div></div><Btn small v="danger" onClick={()=>removeJob(j.raw)}>X</Btn></Card>)}</div>}
    <Card className="p-5 mt-4"><div className="font-black uppercase tracking-wide mb-3" style={{color:C.textDim,fontSize:sz.label}}>Quick Add</div><div className="flex gap-2 flex-wrap">{presets.map((p,i)=>{const exists=jobs.some(j=>j.cron===p.cron);return <Btn key={i} small v={exists?'dim':'ghost'} disabled={exists} onClick={async()=>{const r=await post(`${API}/crontab/add`,{cron:p.cron,command:p.cmd,comment:p.label});if(r.error)toast(r.error,'danger');else{toast(`Added ${p.label}`);reload()}}}>{exists?'OK ':'+ '}{p.label}</Btn>})}</div></Card>
    {data?.raw&&<Card className="p-5 mt-3"><div className="font-black uppercase tracking-wide mb-2" style={{color:C.textDim,fontSize:sz.label}}>Raw</div><pre className="rounded-lg p-3 font-mono overflow-auto" style={{background:C.consoleBg,color:C.textDim,fontSize:sz.code,lineHeight:'1.9'}}>{data.raw}</pre></Card>}
    <Modal open={showAdd} onClose={()=>setShowAdd(false)} title="Add Cron Job"><Input label="Schedule" value={newJob.cron} onChange={v=>setNewJob(p=>({...p,cron:v}))} placeholder="*/5 * * * *" mono/><Input label="Command" value={newJob.command} onChange={v=>setNewJob(p=>({...p,command:v}))} placeholder="sudo systemctl restart arma-reforger" mono/><Input label="Comment" value={newJob.comment} onChange={v=>setNewJob(p=>({...p,comment:v}))} placeholder="Daily restart"/><div className="mb-3" style={{color:C.textMuted,fontSize:sz.stat}}>Format: minute hour day month weekday</div><div className="flex gap-2 justify-end"><Btn v="ghost" onClick={()=>setShowAdd(false)}>Cancel</Btn><Btn onClick={addJob}>Add</Btn></div></Modal></div>}

function Saves({toast}){
  const{C,sz}=useT();const mobile=useMobile()
  const{data:status,reload:reloadStatus}=useFetchOnce(`${API}/persistence/status`)
  const{data:backupsData,reload:reloadBackups}=useFetchOnce(`${API}/persistence/backups`)
  const[autoSave,setAutoSave]=useState('')
  const[playerSave,setPlayerSave]=useState('')
  const[configSaving,setConfigSaving]=useState(false)
  const[creating,setCreating]=useState(false)
  const[restoringFile,setRestoringFile]=useState(null)
  const[deletingFile,setDeletingFile]=useState(null)
  const[wipeConfirm,setWipeConfirm]=useState(false)
  const[wiping,setWiping]=useState(false)
  useEffect(()=>{if(status){setAutoSave(String(status.auto_save_interval??0));setPlayerSave(String(status.player_save_time??120))}},[status])
  const fmtBytes=n=>{if(!n)return'0 B';if(n<1024)return`${n} B`;if(n<1048576)return`${(n/1024).toFixed(1)} KB`;return`${(n/1048576).toFixed(1)} MB`}
  const fmtAgo=ts=>{if(!ts)return'Never';const s=Math.floor(Date.now()/1000-ts);if(s<60)return`${s}s ago`;if(s<3600)return`${Math.floor(s/60)}m ago`;if(s<86400)return`${Math.floor(s/3600)}h ago`;return new Date(ts*1000).toLocaleDateString()}
  const fmtDate=ts=>ts?new Date(ts*1000).toLocaleString():'—'
  const saveCfg=async()=>{
    setConfigSaving(true)
    try{
      const r=await fetch(`${API}/config`,{headers:getHeaders()})
      if(r.status===401){on401();return}
      const cfg=await r.json()
      if(cfg.error){toast(cfg.error,'danger');return}
      if(!cfg.game)cfg.game={}
      if(!cfg.game.gameProperties)cfg.game.gameProperties={}
      if(!cfg.game.gameProperties.persistence)cfg.game.gameProperties.persistence={}
      cfg.game.gameProperties.persistence.autoSaveInterval=Number(autoSave)||0
      if(!cfg.operating)cfg.operating={}
      cfg.operating.playerSaveTime=Number(playerSave)||120
      const wr=await put(`${API}/config`,cfg)
      wr?.error?toast(wr.error,'danger'):toast('Config saved — restart server to apply','info')
      reloadStatus()
    }catch{toast('Failed to save config','danger')}
    finally{setConfigSaving(false)}
  }
  const createBackup=async()=>{
    setCreating(true)
    const r=await post(`${API}/persistence/backup`)
    setCreating(false)
    r?.error?toast(r.error,'danger'):toast(r.message||'Backup created')
    reloadBackups();reloadStatus()
  }
  const restoreBackup=async filename=>{
    setRestoringFile(filename)
    const r=await post(`${API}/persistence/restore`,{filename})
    setRestoringFile(null)
    r?.error?toast(r.error,'danger'):toast(r.message||'Restored')
    reloadStatus()
  }
  const deleteBackup=async filename=>{
    setDeletingFile(filename)
    const r=await del(`${API}/persistence/backup/${encodeURIComponent(filename)}`)
    setDeletingFile(null)
    r?.error?toast(r.error,'danger'):toast('Backup deleted','warning')
    reloadBackups()
  }
  const wipeAll=async()=>{
    setWiping(true)
    const r=await post(`${API}/server/reset`,{action:'clear_saves'})
    setWiping(false);setWipeConfirm(false)
    r?.error?toast(r.error,'danger'):toast('Save data wiped — restart server to apply','warning')
    reloadStatus()
  }
  const backups=backupsData?.backups||[]
  return <div className="flex flex-col gap-4 overflow-auto">
    <div className={`flex items-center gap-3 flex-wrap`}>
      <h2 className="font-black" style={{color:C.textBright,fontSize:sz.base+4}}>Save Management</h2>
      {status&&<Badge text={status.enabled?`AUTO-SAVE ${status.auto_save_interval}min`:'AUTO-SAVE OFF'} v={status.enabled?'default':'danger'}/>}
      <div className="flex-1"/>
      <Btn v="ghost" small onClick={()=>{reloadStatus();reloadBackups()}}>Refresh</Btn>
    </div>
    {/* Status grid */}
    <div className={`grid gap-3 ${mobile?'grid-cols-2':'grid-cols-4'}`}>
      {[
        ['Save Files',status?.file_count??'—',status?.total_size!=null?fmtBytes(status.total_size):null,false],
        ['Last Save',status?fmtAgo(status.last_save):'—',status?.last_save?fmtDate(status.last_save):null,false],
        ['Player Saves',status?.player_count??'—','individual files',false],
        ['Backups',backups.length,'stored locally',false],
      ].map(([label,value,sub,warn])=><StatBox key={label} label={label} value={value} sub={sub} warn={warn}/>)}
    </div>
    {/* Persistence config */}
    <Card className="p-5">
      <div className="font-black uppercase tracking-widest mb-3" style={{color:C.textDim,fontSize:sz.label}}>Persistence Settings</div>
      <div className="mb-4 leading-relaxed" style={{color:C.textMuted,fontSize:sz.stat}}>
        <strong style={{color:C.textDim}}>Auto-Save Interval</strong> — how often world state (vehicles, bases, placed objects) is committed to disk (minutes). Set to 0 to disable.<br/>
        <strong style={{color:C.textDim}}>Player Save Time</strong> — how often individual player data (inventory, position) is written (seconds). Both require a server restart.
      </div>
      <div className={`flex gap-4 items-end flex-wrap ${mobile?'flex-col':''}`}>
        <div className={mobile?'w-full':'flex-1'}>
          <label className="block font-bold uppercase tracking-wide mb-1.5" style={{color:C.textDim,fontSize:sz.label}}>Auto-Save Interval (min) · 0 = off</label>
          <input type="number" min="0" value={autoSave} onChange={e=>setAutoSave(e.target.value)} className="w-full rounded-lg px-3 py-2.5 outline-none font-mono" style={{background:C.bgInput,border:`1px solid ${C.border}`,color:C.text,fontSize:sz.input}}/>
        </div>
        <div className={mobile?'w-full':'flex-1'}>
          <label className="block font-bold uppercase tracking-wide mb-1.5" style={{color:C.textDim,fontSize:sz.label}}>Player Save Time (sec) · default 120</label>
          <input type="number" min="1" value={playerSave} onChange={e=>setPlayerSave(e.target.value)} className="w-full rounded-lg px-3 py-2.5 outline-none font-mono" style={{background:C.bgInput,border:`1px solid ${C.border}`,color:C.text,fontSize:sz.input}}/>
        </div>
        <Btn onClick={saveCfg} disabled={configSaving} className={mobile?'w-full':''}>{configSaving?'Saving...':'Save Config'}</Btn>
      </div>
    </Card>
    {/* Backups */}
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="font-black uppercase tracking-widest" style={{color:C.textDim,fontSize:sz.label}}>Backups <span className="font-normal normal-case" style={{color:C.textMuted}}>({backups.length})</span></div>
        <Btn small onClick={createBackup} disabled={creating}>{creating?'Creating...':'+ Create Backup'}</Btn>
      </div>
      {backups.length===0
        ?<div className="py-6 text-center" style={{color:C.textMuted,fontSize:sz.base}}>No backups yet — create one before making changes</div>
        :<div className="space-y-2">
          {backups.map(b=><div key={b.filename} className="flex items-center gap-3 px-4 py-2.5 rounded-xl" style={{background:C.bgInput,border:`1px solid ${C.border}`}}>
            <div className="flex-1 min-w-0">
              <div className="font-mono font-bold truncate" style={{color:C.textBright,fontSize:sz.base}}>{b.filename}</div>
              <div className="flex items-center gap-3 mt-0.5">
                <span style={{color:C.textMuted,fontSize:sz.stat}}>{fmtBytes(b.size)}</span>
                <span style={{color:C.textMuted,fontSize:sz.stat}}>{fmtDate(b.created)}</span>
              </div>
            </div>
            <Btn small v="ghost" onClick={()=>restoreBackup(b.filename)} disabled={!!restoringFile}>{restoringFile===b.filename?'Restoring...':'Restore'}</Btn>
            <Btn small v="danger" onClick={()=>deleteBackup(b.filename)} disabled={!!deletingFile}>{deletingFile===b.filename?'...':'Del'}</Btn>
          </div>)}
        </div>}
      <div className="mt-3 leading-relaxed" style={{color:C.textMuted,fontSize:sz.stat}}>Restore requires the server to be stopped first. Backups stored in <span className="font-mono">profile/saves_backup/</span>.</div>
    </Card>
    {/* Danger zone */}
    <Card className="p-5" style={{border:`1px solid ${C.redBorder}`}}>
      <div className="font-black uppercase tracking-widest mb-3" style={{color:C.red,fontSize:sz.label}}>Danger Zone</div>
      {!wipeConfirm
        ?<div className="flex items-center justify-between gap-4 flex-wrap">
          <div style={{color:C.textDim,fontSize:sz.base}}>
            Permanently delete all save data — player inventories, world state, placed objects.
            {status?.file_count>0&&<span style={{color:C.textMuted}}> ({status.file_count} files, {fmtBytes(status.total_size||0)})</span>}
          </div>
          <Btn v="danger" onClick={()=>setWipeConfirm(true)}>Wipe All Saves</Btn>
        </div>
        :<div className="flex items-center justify-between gap-4 flex-wrap">
          <div style={{color:C.red,fontSize:sz.base}}>This cannot be undone. Back up first if you want to preserve this data.</div>
          <div className="flex gap-2">
            <Btn v="ghost" onClick={()=>setWipeConfirm(false)}>Cancel</Btn>
            <Btn v="danger" onClick={wipeAll} disabled={wiping}>{wiping?'Wiping...':'Confirm Wipe'}</Btn>
          </div>
        </div>}
    </Card>
  </div>
}

const TABS=[{id:'dashboard',label:'Dashboard',group:'Server',icon:'⊡',short:'Dash'},{id:'console',label:'Console',group:'Server',icon:'▦',short:'Logs'},{id:'startup',label:'Startup',group:'Server',icon:'▶',short:'Start'},{id:'config',label:'Config',group:'Configuration',icon:'⊙',short:'Config'},{id:'mods',label:'Mods',group:'Configuration',icon:'⊞',short:'Mods'},{id:'files',label:'Files',group:'Configuration',icon:'⊟',short:'Files'},{id:'admin',label:'Admin',group:'Tools',icon:'⊕',short:'Admin'},{id:'webhooks',label:'Webhooks',group:'Tools',icon:'⊗',short:'Hooks'},{id:'network',label:'Network',group:'Tools',icon:'⊘',short:'Net'},{id:'aigm',label:'AI GM',group:'Tools',icon:'⊛',short:'AI GM'},{id:'scheduler',label:'Scheduler',group:'Tools',icon:'⊚',short:'Sched'}]
const ROUTES={dashboard:Dashboard,console:Console,startup:Startup,admin:Admin,config:Config,mods:Mods,files:Files,webhooks:Webhooks,network:Network,aigm:AiGm,scheduler:Scheduler}

function NewServerCard({servers, onCreated, toast}) {
  const {C, sz} = useT()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({name: '', description: '', port: '', tags: '', clone_from_id: null})
  const [provisioning, setProvisioning] = useState(false)
  const [provisionLog, setProvisionLog] = useState('')

  const usedPorts = servers.map(s => s.port)
  const nextPort = usedPorts.length > 0 ? Math.max(...usedPorts) + 1 : 2001

  const reset = () => { setOpen(false); setStep(1); setForm({name:'',description:'',port:'',tags:'',clone_from_id:null}); setProvisioning(false); setProvisionLog('') }

  const create = async () => {
    setProvisioning(true)
    setProvisionLog('Creating server entry...\n')
    const port = parseInt(form.port) || nextPort
    const tags = form.tags.split(',').map(t => t.trim()).filter(Boolean)
    const r = await post(`${API}/servers`, {
      name: form.name, description: form.description, port, tags,
      clone_from_id: form.clone_from_id || null
    })
    if (r.error) { toast(r.error, 'danger'); setProvisioning(false); return }
    if (!r.server?.id) { toast('Unexpected response from server creation', 'danger'); setProvisioning(false); return }
    setProvisionLog(p => p + `Server #${r.server.id} registered.\nProvisioning...\n`)
    const pr = await post(`${API}/servers/${r.server.id}/provision`, {})
    if (pr.error) { toast(pr.error, 'danger'); setProvisioning(false); return }
    setProvisionLog(p => p + `Done! ${pr.message}\n`)
    if (pr.ports) {
      const ufw = pr.ports.ufw || {}
      const ufwOk = Object.entries(ufw).filter(([,v]) => v === 'allowed').map(([k]) => k)
      const ufwFail = Object.entries(ufw).filter(([,v]) => v.startsWith('error')).map(([k]) => k)
      if (ufwOk.length) setProvisionLog(p => p + `✓ ufw: ${ufwOk.join(' · ')} allowed\n`)
      if (ufwFail.length) setProvisionLog(p => p + `✗ ufw errors: ${ufwFail.join(', ')}\n`)
      const upnp = pr.ports.upnp || {}
      if (upnp.available) {
        setProvisionLog(p => p + `✓ UPnP: mapped — external IP ${upnp.external_ip}\n`)
      } else {
        setProvisionLog(p => p + `— UPnP: not available (direct connection or UPnP disabled)\n`)
      }
    }
    toast('Server provisioned', 'default')
    onCreated()
    setTimeout(reset, 2000)
  }

  if (!open) return (
    <div onClick={() => setOpen(true)}
      className="rounded-2xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all"
      style={{background: 'transparent', border: `2px dashed ${C.border}`, minHeight: 180}}
      onMouseEnter={e => e.currentTarget.style.borderColor = C.accent + '60'}
      onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
      <div style={{color: C.textDim, fontSize: sz.base + 4, fontWeight: 800}}>+ New Server</div>
      <div style={{color: C.textMuted, fontSize: sz.stat}}>Clone an existing server or start fresh</div>
    </div>
  )

  return (
    <Modal open={open} onClose={reset} title="New Server Instance">
      {!provisioning ? (
        <div className="space-y-4">
          {step === 1 && <>
            <Input label="Server Name" value={form.name} onChange={v => setForm(p=>({...p,name:v}))} placeholder="e.g. EU PvP Server"/>
            <Input label="Description (optional)" value={form.description} onChange={v => setForm(p=>({...p,description:v}))} placeholder="Short description"/>
            <Input label="Tags (comma-separated)" value={form.tags} onChange={v => setForm(p=>({...p,tags:v}))} placeholder="PvP, EU, 64-slot"/>
            <Btn onClick={() => form.name.trim() && setStep(2)} disabled={!form.name.trim()}>Next &rarr;</Btn>
          </>}
          {step === 2 && <>
            <Input label={`Port Number (next available: ${nextPort})`} value={form.port || String(nextPort)} onChange={v => setForm(p=>({...p,port:v}))} placeholder={String(nextPort)}/>
            {usedPorts.includes(parseInt(form.port)) && <div style={{color: C.red, fontSize: sz.stat}}>Port already in use</div>}
            <div className="flex gap-2">
              <Btn v="ghost" onClick={() => setStep(1)}>&larr; Back</Btn>
              <Btn onClick={() => setStep(3)}>Next &rarr;</Btn>
            </div>
          </>}
          {step === 3 && <>
            <div className="font-bold mb-2" style={{color: C.textDim, fontSize: sz.label}}>STARTING POINT</div>
            <div className="space-y-2">
              <div onClick={() => setForm(p=>({...p,clone_from_id:null}))}
                className="p-4 rounded-xl cursor-pointer transition-all"
                style={{background: form.clone_from_id===null ? C.accentBg : C.bgInput, border: `1px solid ${form.clone_from_id===null ? C.accent+'50' : C.border}`}}>
                <div className="font-bold" style={{color: form.clone_from_id===null ? C.accent : C.text}}>Fresh Start</div>
                <div style={{color: C.textMuted, fontSize: sz.stat}}>Blank config, default panel users</div>
              </div>
              {servers.map(s => (
                <div key={s.id} onClick={() => setForm(p=>({...p,clone_from_id:s.id}))}
                  className="p-4 rounded-xl cursor-pointer transition-all"
                  style={{background: form.clone_from_id===s.id ? C.accentBg : C.bgInput, border: `1px solid ${form.clone_from_id===s.id ? C.accent+'50' : C.border}`}}>
                  <div className="font-bold" style={{color: form.clone_from_id===s.id ? C.accent : C.text}}>
                    Clone from {s.name} (#{s.id})
                  </div>
                  <div style={{color: C.textMuted, fontSize: sz.stat}}>Copy config, users, permissions, settings</div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <Btn v="ghost" onClick={() => setStep(2)}>&larr; Back</Btn>
              <Btn onClick={() => setStep(4)}>Review &rarr;</Btn>
            </div>
          </>}
          {step === 4 && <>
            <div className="space-y-2 p-4 rounded-xl" style={{background: C.bgInput, border: `1px solid ${C.border}`}}>
              {[
                ['Name', form.name],
                ['Port', form.port || String(nextPort)],
                ['Tags', form.tags || 'none'],
                ['Based on', form.clone_from_id ? `Clone of #${form.clone_from_id}` : 'Fresh start'],
              ].map(([k,v]) => (
                <div key={k} className="flex justify-between">
                  <span style={{color: C.textMuted, fontSize: sz.stat}}>{k}</span>
                  <span className="font-bold" style={{color: C.text, fontSize: sz.stat}}>{v}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <Btn v="ghost" onClick={() => setStep(3)}>&larr; Back</Btn>
              <Btn onClick={create}>Create Server</Btn>
            </div>
          </>}
        </div>
      ) : (
        <div>
          <div className="font-bold mb-3" style={{color: C.textDim, fontSize: sz.label}}>PROVISIONING</div>
          <pre className="rounded-xl p-4 font-mono overflow-auto" style={{background: C.bgInput, color: C.accent, fontSize: sz.stat, maxHeight: 200}}>{provisionLog}</pre>
        </div>
      )}
    </Modal>
  )
}

function ServerPicker({authUser, userProfile, setUserProfile, onSelect, onLogout, toast, themeName, setThemeName, textSize, setTextSize}) {
  const {C, sz} = useT()
  const [servers, setServers] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editServer, setEditServer] = useState(null)
  const [editForm, setEditForm] = useState({name:'',description:'',tags:''})
  const [editSaving, setEditSaving] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const isOwner = authUser?.role === 'owner'
  const isHeadAdmin = authUser?.role === 'head_admin'
  const canManage = isOwner || isHeadAdmin
  const AVATAR_COLORS = [C.accent, C.blue, C.purple, C.red, C.orange]
  const avatarBg = AVATAR_COLORS[(authUser?.username?.charCodeAt(0) || 0) % AVATAR_COLORS.length]
  const hasAvatar = userProfile?.avatar_ext
  const displayedName = userProfile?.display_name || authUser?.username || '?'
  const initial = displayedName[0].toUpperCase()

  const fetchServers = useCallback(async () => {
    try {
      const r = await fetch(`${API}/servers`, {headers: authHeaders()})
      if (r.status === 401) { onLogout(); return }
      const d = await r.json()
      setServers(d.servers || [])
      setLoading(false)
    } catch { setLoading(false) }
  }, [])

  useEffect(() => {
    fetchServers()
    const iv = setInterval(fetchServers, 5000)
    return () => clearInterval(iv)
  }, [fetchServers])

  const openEdit = (server, e) => {
    e.stopPropagation()
    setEditServer(server)
    setEditForm({name: server.name, description: server.description||'', tags: (server.tags||[]).join(', ')})
  }
  const saveEdit = async () => {
    if (!editServer) return
    setEditSaving(true)
    const tags = editForm.tags.split(',').map(t=>t.trim()).filter(Boolean)
    const r = await fetch(`${API}/servers/${editServer.id}`, {
      method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({name: editForm.name, description: editForm.description, tags})
    }).then(res=>res.json()).catch(e=>({error: e.message}))
    setEditSaving(false)
    if (r?.error) toast(r.error, 'danger')
    else { toast('Server updated'); setEditServer(null); fetchServers() }
  }
  const deleteServer = async (server, e) => {
    e.stopPropagation()
    if (!confirm(`Remove "${server.name}" from the panel?\n\nPort rules for ${server.port}/udp, ${server.port + 1}/udp, ${server.port}/tcp will be removed automatically.\n(Server files are not deleted)`)) return
    const r = await fetch(`${API}/servers/${server.id}`, {method:'DELETE',headers:authHeaders()}).then(res=>res.json()).catch(e=>({error:e.message}))
    if (r?.error) toast(r.error, 'danger')
    else { toast('Server removed', 'warning'); fetchServers() }
  }

  const quickAction = async (server, action) => {
    const r = await fetch(`${API}/server/${action}`, {
      method: 'POST',
      headers: {...authHeaders(), 'X-Server-ID': String(server.id)},
      body: JSON.stringify({})
    }).then(res => res.json()).catch(e => ({error: e.message}))
    if (r?.error) toast(r.error, 'danger')
    else { toast(`Server ${action}ed`); setTimeout(fetchServers, 1500) }
  }

  return (
    <div className="min-h-screen" style={{background: C.bg, color: C.text, fontFamily: "'JetBrains Mono','Fira Code',monospace"}}>
      {/* Header */}
      <div className="px-6 h-16 flex items-center gap-4" style={{background: C.bgCard, borderBottom: `1px solid ${C.border}`}}>
        <span className="font-black tracking-widest" style={{color: C.textBright, fontSize: sz.base + 4}}>SITREP</span>
        <span style={{color: C.textMuted, fontSize: sz.stat}}>Arma Reforger Panel</span>
        <div className="flex-1"/>
        {/* Avatar + identity — clickable to open profile */}
        <button onClick={()=>setProfileOpen(true)} className="cursor-pointer"
          style={{display:'flex',alignItems:'center',gap:10,background:'none',border:`1px solid ${C.border}`,borderRadius:10,padding:'6px 12px 6px 6px',transition:'border-color 0.15s,background 0.15s'}}
          onMouseEnter={e=>{e.currentTarget.style.borderColor=avatarBg+'80';e.currentTarget.style.background=avatarBg+'10'}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.background='none'}}>
          <div style={{width:36,height:36,borderRadius:'50%',overflow:'hidden',display:'flex',alignItems:'center',justifyContent:'center',background:hasAvatar?'transparent':avatarBg,border:`2px solid ${avatarBg}50`,flexShrink:0}}>
            {hasAvatar
              ? <img src={`${API}/users/${authUser.username}/avatar?v=${userProfile.avatar_ext}`} style={{width:'100%',height:'100%',objectFit:'cover'}} alt=""/>
              : <span style={{color:'#fff',fontSize:14,fontWeight:800}}>{initial}</span>}
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:1,textAlign:'left'}}>
            <span style={{color:C.textBright,fontSize:sz.stat,fontWeight:700,lineHeight:1.2}}>{displayedName}</span>
            {userProfile?.display_name && <span style={{color:C.textMuted,fontSize:sz.stat-1,fontFamily:'monospace'}}>@{authUser.username}</span>}
          </div>
          <Badge text={authUser.role} v={ROLE_COLORS[authUser.role] || 'dim'}/>
        </button>
        <button onClick={onLogout} className="px-3 py-1.5 rounded-lg font-bold cursor-pointer"
          style={{background: C.redBg, color: C.red, border: `1px solid ${C.redBorder}`, fontSize: sz.stat}}>
          Logout
        </button>
      </div>

      {/* Content */}
      <div className="p-8 max-w-[1200px] mx-auto">
        <div className="flex items-end gap-4 mb-6">
          <div>
            <div className="font-black tracking-tight mb-1" style={{color: C.textBright, fontSize: sz.base + 8}}>Choose a Server</div>
            {servers && (
              <div style={{color: C.textMuted, fontSize: sz.stat}}>
                {servers.length} server{servers.length !== 1 ? 's' : ''} &nbsp;&middot;&nbsp;
                {servers.filter(s => s.running).length} online
              </div>
            )}
          </div>
        </div>

        {loading && <div style={{color: C.textMuted, fontSize: sz.base}}>Loading servers...</div>}

        {servers && (
          <div className="grid gap-4" style={{gridTemplateColumns: 'repeat(auto-fill, minmax(480px, 1fr))'}}>
            {servers.map(server => (
              <div key={server.id} className="rounded-2xl p-6 cursor-pointer transition-all"
                style={{background: C.bgCard, border: `1px solid ${server.running ? C.accent + '40' : C.border}`}}
                onClick={() => onSelect(server)}
                onMouseEnter={e => e.currentTarget.style.borderColor = C.accent + '80'}
                onMouseLeave={e => e.currentTarget.style.borderColor = server.running ? C.accent + '40' : C.border}>

                {/* Status + name */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-2.5 h-2.5 rounded-full" style={{background: server.running ? C.accent : C.red,
                    boxShadow: server.running ? `0 0 8px ${C.accent}` : 'none'}}/>
                  <span className="font-black" style={{color: C.textBright, fontSize: sz.base + 2}}>{server.name}</span>
                  <span className="px-2 py-0.5 rounded font-bold" style={{background: C.accentBg, color: C.accent,
                    border: `1px solid ${C.accent}30`, fontSize: sz.stat - 1}}>#{server.id}</span>
                  {server.tags?.map(tag => (
                    <span key={tag} className="px-2 py-0.5 rounded font-bold"
                      style={{background: C.blueBg, color: C.blue, border: `1px solid ${C.blue}30`, fontSize: sz.stat - 1}}>
                      {tag}
                    </span>
                  ))}
                  <div className="flex-1"/>
                  <span className="font-mono font-bold" style={{color: C.textMuted, fontSize: sz.stat}}>:{server.port}</span>
                </div>

                <div className="flex items-center gap-2 mb-1" style={{color: server.running ? C.accent : C.red, fontSize: sz.stat}}>
                  {server.running ? 'ONLINE' : 'OFFLINE'}
                  {server.running && server.pid && <span style={{color: C.textMuted}}>&middot; PID {server.pid}</span>}
                </div>
                {server.description && (
                  <div className="mb-4" style={{color: C.textMuted, fontSize: sz.stat}}>{server.description}</div>
                )}

                {/* Action buttons */}
                <div className="flex gap-2 mt-4 flex-wrap" onClick={e => e.stopPropagation()}>
                  <Btn onClick={() => onSelect(server)} v={server.running ? 'default' : 'ghost'}>
                    Manage &rarr;
                  </Btn>
                  {server.running
                    ? <Btn v="danger" small onClick={() => quickAction(server, 'stop')}>Stop</Btn>
                    : <Btn v="default" small onClick={() => quickAction(server, 'start')} style={{background: C.accentBg, color: C.accent}}>
                        &#9654; Start
                      </Btn>
                  }
                  {canManage && <Btn v="ghost" small onClick={e => openEdit(server, e)}>&#9998; Edit</Btn>}
                  {isOwner && server.id !== 1 && <Btn v="danger" small onClick={e => deleteServer(server, e)}>&#10005;</Btn>}
                </div>
              </div>
            ))}

            {/* New Server card - owner only */}
            {isOwner && (
              <NewServerCard servers={servers} onCreated={fetchServers} toast={toast}/>
            )}
          </div>
        )}
      </div>

      {/* Profile Modal */}
      <ProfileModal
        open={profileOpen}
        initialTab="profile"
        onClose={()=>setProfileOpen(false)}
        authUser={authUser}
        userProfile={userProfile}
        setUserProfile={setUserProfile}
        toast={toast}
        themeName={themeName}
        setThemeName={setThemeName}
        textSize={textSize}
        setTextSize={setTextSize}
      />

      {/* Edit Server Modal */}
      <Modal open={!!editServer} onClose={()=>setEditServer(null)} title={`Edit — ${editServer?.name||''}`}>
        <Input label="Server Name" value={editForm.name} onChange={v=>setEditForm(p=>({...p,name:v}))} placeholder="e.g. EU PvP Server"/>
        <Input label="Description" value={editForm.description} onChange={v=>setEditForm(p=>({...p,description:v}))} placeholder="Short description (optional)"/>
        <Input label="Tags (comma-separated)" value={editForm.tags} onChange={v=>setEditForm(p=>({...p,tags:v}))} placeholder="PvP, EU, 64-slot"/>
        <div className="flex gap-2 justify-end mt-4">
          <Btn v="ghost" onClick={()=>setEditServer(null)}>Cancel</Btn>
          <Btn onClick={saveEdit} disabled={editSaving||!editForm.name.trim()}>{editSaving?'Saving...':'Save Changes'}</Btn>
        </div>
      </Modal>
    </div>
  )
}

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

function ProfileModal({open, initialTab, onClose, authUser, userProfile, setUserProfile, toast, themeName, setThemeName, textSize, setTextSize}) {
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

function AvatarWidget({authUser, userProfile, onClick}) {
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

function ProfileDropdown({authUser, userProfile, onClose, onOpen, onLogout}) {
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
  const visibleTabs=TABS.filter(t=>(ROLE_TABS[authUser.role]||['dashboard']).includes(t.id))
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
          <Tab toast={toast} authUser={authUser}/>
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
