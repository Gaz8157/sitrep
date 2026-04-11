import { useState, useCallback } from 'react'
import { useT } from '../ctx.jsx'
import { API, post, put, authHeaders, on401 } from '../api.js'
import { useFetchOnce, useMobile } from '../hooks.js'
import { Btn } from '../components/ui.jsx'

export default function Files({toast}){
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
