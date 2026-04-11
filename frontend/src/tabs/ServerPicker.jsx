import { useState, useEffect, useCallback } from 'react'
import { useT } from '../ctx.jsx'
import { API, post, authHeaders } from '../api.js'
import { Badge, Btn, Input, Modal } from '../components/ui.jsx'
import { ProfileModal } from './Profile.jsx'
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
export default function ServerPicker({authUser, userProfile, setUserProfile, onSelect, onLogout, toast, themeName, setThemeName, textSize, setTextSize}) {
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
