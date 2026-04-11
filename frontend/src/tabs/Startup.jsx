import { useState, useEffect } from 'react'
import { useT } from '../ctx.jsx'
import { API, post, put, del, getHeaders, on401 } from '../api.js'
import { useFetch, useFetchOnce, useMobile } from '../hooks.js'
import { Badge, Btn, Card, StatBox, Toggle } from '../components/ui.jsx'

function StartupDiagnostics({C,sz,toast}){
  const{data:diag,loading,refetch}=useFetch(`${API}/diagnostics`,0)
  const[refreshing,setRefreshing]=useState(false)
  const[removing,setRemoving]=useState(null)
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
    <div className={`grid gap-3 ${mobile?'grid-cols-2':'grid-cols-4'}`}>
      {[
        ['Save Files',status?.file_count??'—',status?.total_size!=null?fmtBytes(status.total_size):null,false],
        ['Last Save',status?fmtAgo(status.last_save):'—',status?.last_save?fmtDate(status.last_save):null,false],
        ['Player Saves',status?.player_count??'—','individual files',false],
        ['Backups',backups.length,'stored locally',false],
      ].map(([label,value,sub,warn])=><StatBox key={label} label={label} value={value} sub={sub} warn={warn}/>)}
    </div>
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

export default function Startup({toast,authUser}){const{C,sz}=useT();const isDemo=authUser?.role==='demo'
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
