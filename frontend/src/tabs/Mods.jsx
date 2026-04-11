import { useState, useEffect, useMemo, useRef } from 'react'
import { useT } from '../ctx.jsx'
import { API, post, put, del, authHeaders, on401 } from '../api.js'
import { useFetchOnce, useMobile } from '../hooks.js'
import { Badge, Btn, Card, Empty } from '../components/ui.jsx'
import { WS_TAGS } from '../constants.js'

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

export default function Mods({toast}){const{C,sz}=useT();const mobile=useMobile()
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
