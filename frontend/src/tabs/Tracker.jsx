import { useState, useEffect, useRef, useCallback } from 'react'
import { useT } from '../ctx.jsx'
import { API } from '../api.js'

const TRACKER_FIELDS = [
  { id: 'status',   label: 'Status',          on: true  },
  { id: 'faction',  label: 'Faction',          on: true  },
  { id: 'health',   label: 'Health',           on: true  },
  { id: 'grid',     label: 'Grid (8-digit)',    on: true  },
  { id: 'grid_10',  label: 'Grid (10-digit)',   on: false },
  { id: 'heading',  label: 'Heading',           on: true  },
  { id: 'vehicle',  label: 'Vehicle',           on: true  },
  { id: 'squad',    label: 'Squad',             on: true  },
  { id: 'location', label: 'Nearest Location',  on: true  },
  { id: 'elevation',label: 'Elevation',         on: false },
  { id: 'roles',    label: 'Admin / GM',        on: true  },
  { id: 'uid',      label: 'UID',               on: false },
]

const EVENT_COLORS = {
  player_killed:  { text: '#f87171', bg: '#7f1d1d22', label: 'KILL'   },
  player_joined:  { text: '#4ade80', bg: '#14532d22', label: 'JOIN'   },
  player_left:    { text: '#fb923c', bg: '#7c2d1222', label: 'LEFT'   },
  player_spawned: { text: '#60a5fa', bg: '#1e3a5f22', label: 'SPAWN'  },
  vote_started:   { text: '#a78bfa', bg: '#3b0764' + '22', label: 'VOTE'  },
  vote_cast:      { text: '#a78bfa', bg: '#3b076422', label: 'VOTE'   },
  vote_ended:     { text: '#a78bfa', bg: '#3b076422', label: 'VOTE'   },
}

const STATUS_COLOR = { alive: '#4ade80', dead: '#f87171', unspawned: '#6b7280' }

function fmtTs(ts) {
  if (!ts) return '—'
  const d = new Date(ts * 1000)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function HealthBar({ value, C }) {
  const pct = Math.round((value ?? 1) * 100)
  const color = pct > 60 ? '#4ade80' : pct > 30 ? '#fb923c' : '#f87171'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 4, background: C.bgInput, borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.3s' }} />
      </div>
      <span style={{ color: C.textMuted, fontSize: 9, minWidth: 24, textAlign: 'right' }}>{pct}%</span>
    </div>
  )
}

function FieldToggle({ id, label, checked, onChange, C, sz }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', padding: '3px 6px', borderRadius: 5, transition: 'background 120ms', userSelect: 'none' }}
      onMouseEnter={e => e.currentTarget.style.background = C.bgInput}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
      <div style={{ width: 14, height: 14, borderRadius: 3, border: `1px solid ${checked ? C.accent : C.border}`, background: checked ? C.accent + '18' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'border-color 120ms, background 120ms' }}>
        {checked && <svg width="9" height="9" viewBox="0 0 9 9"><polyline points="1.5,4.5 3.5,6.5 7.5,2.5" fill="none" stroke={C.accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
      </div>
      <span style={{ color: checked ? C.text : C.textMuted, fontSize: sz.stat, transition: 'color 120ms' }}>{label}</span>
    </label>
  )
}

function TrackerPlayerCard({ player, fields, C, sz }) {
  const on = (id) => fields.find(f => f.id === id)?.on
  const status = player.status || 'unspawned'
  const statusColor = STATUS_COLOR[status] || '#6b7280'
  const isDead = status === 'dead'

  return (
    <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 12px', opacity: isDead ? 0.55 : 1, transition: 'opacity 0.2s' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
        <span style={{ color: C.textBright, fontSize: sz.base, fontWeight: 700, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{player.name || '?'}</span>
        {on('roles') && (player.is_admin || player.is_gm) && (
          <div style={{ display: 'flex', gap: 3 }}>
            {player.is_admin && <span style={{ fontSize: 8, fontWeight: 900, padding: '1px 4px', borderRadius: 3, background: C.orange + '20', color: C.orange, border: `1px solid ${C.orange}40` }}>ADM</span>}
            {player.is_gm && <span style={{ fontSize: 8, fontWeight: 900, padding: '1px 4px', borderRadius: 3, background: C.accent + '20', color: C.accent, border: `1px solid ${C.accent}40` }}>GM</span>}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 8px' }}>
        {on('status') && <Row label="Status" value={<span style={{ color: statusColor, fontWeight: 700 }}>{status}</span>} C={C} sz={sz} />}
        {on('faction') && player.faction && <Row label="Faction" value={player.faction} C={C} sz={sz} />}
        {on('grid') && player.grid && <Row label="Grid" value={<span style={{ fontFamily: 'monospace' }}>{player.grid}</span>} C={C} sz={sz} />}
        {on('grid_10') && player.grid_10 && <Row label="Grid 10" value={<span style={{ fontFamily: 'monospace' }}>{player.grid_10}</span>} C={C} sz={sz} />}
        {on('heading') && player.heading != null && <Row label="Hdg" value={`${player.heading}° ${player.heading_dir || ''}`} C={C} sz={sz} />}
        {on('elevation') && player.elevation != null && <Row label="Elev" value={`${Math.round(player.elevation)}m`} C={C} sz={sz} />}
        {on('vehicle') && player.in_vehicle && <Row label="Vehicle" value={player.vehicle_type || 'yes'} C={C} sz={sz} />}
        {on('squad') && player.squad_id >= 0 && <Row label="Squad" value={`${player.squad_name || player.squad_id}${player.is_squad_leader ? ' ★' : ''}`} C={C} sz={sz} />}
        {on('location') && player.nearest_location?.name && <Row label="Near" value={`${player.nearest_location.name} (${player.nearest_location.dist_m < 0 ? '?' : Math.round(player.nearest_location.dist_m) + 'm'})`} C={C} sz={sz} />}
        {on('uid') && player.uid && <Row label="UID" value={<span style={{ fontFamily: 'monospace', fontSize: 8 }}>{player.uid}</span>} C={C} sz={sz} />}
      </div>

      {on('health') && player.health != null && (
        <div style={{ marginTop: 6 }}>
          <HealthBar value={player.health} C={C} />
        </div>
      )}
    </div>
  )
}

function Row({ label, value, C, sz }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, minWidth: 0 }}>
      <span style={{ color: C.textMuted, fontSize: sz.stat - 1, flexShrink: 0 }}>{label}</span>
      <span style={{ color: C.text, fontSize: sz.stat, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  )
}

function TrackerEventRow({ event, C, sz }) {
  const type = event.event_type || 'unknown'
  const cfg = EVENT_COLORS[type] || { text: C.textDim, bg: 'transparent', label: type.slice(0, 6).toUpperCase() }
  const d = event.data || {}
  const ts = event.timestamp || event._rx_ts

  let summary = ''
  if (type === 'player_killed') {
    summary = d.victim_name ? `${d.victim_name} killed by ${d.killer_name || '?'}${d.is_teamkill ? ' [TK]' : ''}` : JSON.stringify(d).slice(0, 80)
  } else if (type === 'player_joined') {
    summary = d.name || d.uid || ''
  } else if (type === 'player_left') {
    summary = d.name || d.uid || ''
  } else if (type === 'player_spawned') {
    summary = d.name ? `${d.name}${d.faction ? ' · ' + d.faction : ''}${d.grid ? ' @ ' + d.grid : ''}` : ''
  } else if (type === 'vote_started' || type === 'vote_cast' || type === 'vote_ended') {
    summary = d.vote_type ? `${d.vote_type}${d.target_name ? ' → ' + d.target_name : ''}` : ''
  } else {
    summary = JSON.stringify(d).slice(0, 100)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', borderRadius: 5, background: cfg.bg }}>
      <span style={{ fontSize: 8, fontWeight: 900, padding: '1px 5px', borderRadius: 3, background: cfg.text + '20', color: cfg.text, border: `1px solid ${cfg.text}40`, flexShrink: 0, minWidth: 34, textAlign: 'center' }}>{cfg.label}</span>
      <span style={{ color: C.text, fontSize: sz.stat, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{summary}</span>
      <span style={{ color: C.textMuted, fontSize: sz.stat - 1, flexShrink: 0 }}>{fmtTs(ts)}</span>
      {event.server_id && <span style={{ color: C.textMuted, fontSize: 8, flexShrink: 0 }}>{event.server_id}</span>}
    </div>
  )
}

function ReceiverTab({ keyInfo, onRotate, status, C, sz }) {
  const [revealing, setRevealing] = useState(false)
  const [revealedKey, setRevealedKey] = useState(null)
  const [rotating, setRotating] = useState(false)
  const [setKeyInput, setSetKeyInput] = useState('')
  const [setting, setSetting] = useState(false)
  const [setMsg, setSetMsg] = useState(null)

  const reveal = async () => {
    setRevealing(true)
    try {
      const r = await fetch(`${API}/tracker/key/reveal`, { credentials: 'include' })
      const d = await r.json()
      setRevealedKey(d.key)
    } finally { setRevealing(false) }
  }

  const rotate = async () => {
    setRotating(true)
    try {
      const r = await fetch(`${API}/tracker/key/rotate`, { method: 'POST', credentials: 'include' })
      const d = await r.json()
      if (d.ok) { setRevealedKey(null); onRotate() }
    } finally { setRotating(false) }
  }

  const saveKey = async () => {
    if (!setKeyInput.trim()) return
    setSetting(true); setSetMsg(null)
    try {
      const r = await fetch(`${API}/tracker/key/set`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: setKeyInput.trim() })
      })
      const d = await r.json()
      if (d.ok) { setSetKeyInput(''); setRevealedKey(null); setSetMsg({ ok: true, text: 'Key saved' }); onRotate() }
      else setSetMsg({ ok: false, text: d.error || 'Error' })
    } finally { setSetting(false) }
  }

  const MOD_CONFIG = [
    { label: 'Webhook Base URL', value: 'http://127.0.0.1:8000/' },
    { label: 'Track Path',       value: 'api/tracker/track' },
    { label: 'Event Path',       value: 'api/tracker/event' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Current key */}
      <div style={{ background: C.bgInput, borderRadius: 8, padding: '12px 14px', border: `1px solid ${C.border}` }}>
        <div style={{ color: C.textMuted, fontSize: sz.stat - 1, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Current API Key</div>
        <div style={{ fontFamily: 'monospace', color: C.textBright, fontSize: sz.base, marginBottom: 8, letterSpacing: '0.05em' }}>
          {revealedKey || keyInfo?.masked || (!keyInfo?.key_configured ? 'Not configured' : '—')}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {keyInfo?.key_configured && !revealedKey && (
            <button onClick={reveal} disabled={revealing} style={{ fontSize: sz.stat, padding: '4px 10px', borderRadius: 5, border: `1px solid ${C.border}`, background: 'transparent', color: C.textDim, cursor: 'pointer' }}>
              {revealing ? 'Loading…' : 'Reveal'}
            </button>
          )}
          {revealedKey && (
            <button onClick={() => setRevealedKey(null)} style={{ fontSize: sz.stat, padding: '4px 10px', borderRadius: 5, border: `1px solid ${C.border}`, background: 'transparent', color: C.textDim, cursor: 'pointer' }}>Hide</button>
          )}
          <button onClick={rotate} disabled={rotating} style={{ fontSize: sz.stat, padding: '4px 10px', borderRadius: 5, border: `1px solid ${C.red}40`, background: C.redBg || C.red + '12', color: C.red, cursor: 'pointer' }}>
            {rotating ? 'Rotating…' : 'Rotate (generate new)'}
          </button>
        </div>
      </div>

      {/* Set key from mod */}
      <div style={{ background: C.bgInput, borderRadius: 8, padding: '12px 14px', border: `1px solid ${C.border}` }}>
        <div style={{ color: C.textMuted, fontSize: sz.stat - 1, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Set Key (paste from mod)</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text" value={setKeyInput} onChange={e => { setSetKeyInput(e.target.value); setSetMsg(null) }}
            placeholder="Paste API key from mod attribute…"
            style={{ flex: 1, background: C.bgCard, border: `1px solid ${C.border}`, color: C.text, borderRadius: 5, padding: '5px 8px', fontSize: sz.stat, outline: 'none', fontFamily: 'monospace' }}
            onKeyDown={e => e.key === 'Enter' && saveKey()}
          />
          <button onClick={saveKey} disabled={setting || !setKeyInput.trim()}
            style={{ fontSize: sz.stat, padding: '4px 12px', borderRadius: 5, border: `1px solid ${C.accent}40`, background: C.accentBg, color: C.accent, cursor: 'pointer', opacity: !setKeyInput.trim() ? 0.45 : 1 }}>
            {setting ? 'Saving…' : 'Save'}
          </button>
        </div>
        {setMsg && <div style={{ marginTop: 6, fontSize: sz.stat - 1, color: setMsg.ok ? '#4ade80' : '#f87171' }}>{setMsg.text}</div>}
      </div>

      {/* Status */}
      <div style={{ background: C.bgInput, borderRadius: 8, padding: '12px 14px', border: `1px solid ${C.border}` }}>
        <div style={{ color: C.textMuted, fontSize: sz.stat - 1, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
          <StatLine label="Wired Up" value={status?.wired_up ? 'Yes' : 'No'} ok={status?.wired_up} C={C} sz={sz} />
          <StatLine label="Last RX" value={fmtTs(status?.last_rx)} C={C} sz={sz} />
          <StatLine label="Snapshots" value={status?.snapshot_count ?? '—'} C={C} sz={sz} />
          <StatLine label="Events" value={status?.event_count ?? '—'} C={C} sz={sz} />
          <StatLine label="SQLite" value={status?.sqlite_enabled ? 'Enabled' : 'Off'} C={C} sz={sz} />
          <StatLine label="Key Set" value={status?.key_configured ? 'Yes' : 'No'} ok={status?.key_configured} C={C} sz={sz} />
        </div>
      </div>

      {/* Mod config reference */}
      <div style={{ background: C.bgInput + '80', borderRadius: 8, padding: '12px 14px', border: `1px solid ${C.border}` }}>
        <div style={{ color: C.textMuted, fontSize: sz.stat - 1, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mod Workbench Config</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {MOD_CONFIG.map(({ label, value }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <span style={{ color: C.textMuted, fontSize: sz.stat - 1, flexShrink: 0 }}>{label}</span>
              <span style={{ fontFamily: 'monospace', color: C.accent, fontSize: sz.stat, textAlign: 'right' }}>{value}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <span style={{ color: C.textMuted, fontSize: sz.stat - 1, flexShrink: 0 }}>API Key</span>
            <span style={{ fontFamily: 'monospace', color: C.textDim, fontSize: sz.stat - 1 }}>← set above</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatLine({ label, value, ok, C, sz }) {
  const color = ok === true ? '#4ade80' : ok === false ? '#f87171' : C.text
  return (
    <div>
      <div style={{ color: C.textMuted, fontSize: sz.stat - 2, marginBottom: 1 }}>{label}</div>
      <div style={{ color, fontSize: sz.stat, fontWeight: 600 }}>{String(value)}</div>
    </div>
  )
}

function DestEditor({ dest, onSave, onCancel, C, sz }) {
  const [form, setForm] = useState({ name: '', url: '', enabled: true, method: 'POST', headers: {}, server_id_glob: '', event_types: [], transform_template: '', retry_count: 0, retry_backoff_sec: 2, timeout_sec: 10, ...dest })
  const [headersRaw, setHeadersRaw] = useState(() => Object.entries(form.headers || {}).map(([k, v]) => `${k}: ${v}`).join('\n'))
  const [showAdv, setShowAdv] = useState(false)
  const EVENT_TYPE_LIST = ['player_killed', 'player_joined', 'player_left', 'player_spawned', 'vote_started', 'vote_cast', 'vote_ended']

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const toggleEventType = (t) => {
    const cur = form.event_types || []
    set('event_types', cur.includes(t) ? cur.filter(x => x !== t) : [...cur, t])
  }

  const save = () => {
    const headers = {}
    headersRaw.split('\n').forEach(line => {
      const idx = line.indexOf(':')
      if (idx > 0) headers[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
    })
    onSave({ ...form, headers })
  }

  const lbl = (t) => <label style={{ display: 'block', color: C.textMuted, fontSize: sz.stat - 1, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t}</label>
  const inp = (k, type = 'text') => (
    <input type={type} value={form[k] ?? ''} onChange={e => set(k, type === 'number' ? Number(e.target.value) : e.target.value)}
      style={{ width: '100%', background: C.bgInput, border: `1px solid ${C.border}`, color: C.text, borderRadius: 5, padding: '5px 8px', fontSize: sz.stat, outline: 'none', boxSizing: 'border-box' }} />
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>{lbl('Name')}{inp('name')}</div>
        <div>
          {lbl('Method')}
          <select value={form.method} onChange={e => set('method', e.target.value)} style={{ width: '100%', background: C.bgInput, border: `1px solid ${C.border}`, color: C.text, borderRadius: 5, padding: '5px 8px', fontSize: sz.stat, outline: 'none' }}>
            <option>POST</option><option>PUT</option>
          </select>
        </div>
      </div>
      <div>{lbl('URL')}{inp('url')}</div>
      <div>
        {lbl('Headers (one per line, key: value)')}
        <textarea value={headersRaw} onChange={e => setHeadersRaw(e.target.value)} rows={3}
          style={{ width: '100%', background: C.bgInput, border: `1px solid ${C.border}`, color: C.text, borderRadius: 5, padding: '5px 8px', fontSize: sz.stat, outline: 'none', resize: 'vertical', fontFamily: 'monospace', boxSizing: 'border-box' }} />
      </div>
      <div>{lbl('Server ID Glob Filter (blank = all, * = wildcard)')}{inp('server_id_glob')}</div>
      <div>
        {lbl('Event Types (blank = all)')}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
          {EVENT_TYPE_LIST.map(t => {
            const checked = !form.event_types?.length || form.event_types.includes(t)
            return (
              <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', padding: '3px 7px', borderRadius: 4, border: `1px solid ${checked ? C.accent + '60' : C.border}`, background: checked ? C.accent + '10' : 'transparent', transition: 'all 120ms' }}>
                <input type="checkbox" checked={form.event_types?.length === 0 || form.event_types?.includes(t)} onChange={() => toggleEventType(t)} style={{ display: 'none' }} />
                <span style={{ fontSize: sz.stat - 1, color: checked ? C.accent : C.textMuted }}>{t}</span>
              </label>
            )
          })}
        </div>
      </div>
      <div>
        {lbl('JSON Transform Template (blank = default wrapper)')}
        <textarea value={form.transform_template} onChange={e => set('transform_template', e.target.value)} rows={3} placeholder={'{"kind":"{{kind}}","ts":{{ts}},"payload":{{payload}}}'}
          style={{ width: '100%', background: C.bgInput, border: `1px solid ${C.border}`, color: C.text, borderRadius: 5, padding: '5px 8px', fontSize: sz.stat, outline: 'none', resize: 'vertical', fontFamily: 'monospace', boxSizing: 'border-box' }} />
      </div>
      <div>
        <button onClick={() => setShowAdv(p => !p)} style={{ background: 'transparent', border: 'none', color: C.textMuted, fontSize: sz.stat, cursor: 'pointer', padding: 0 }}>
          {showAdv ? '▾' : '▸'} Advanced
        </button>
        {showAdv && (
          <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div>{lbl('Retry Count')}{inp('retry_count', 'number')}</div>
            <div>{lbl('Retry Backoff (s)')}{inp('retry_backoff_sec', 'number')}</div>
            <div>{lbl('Timeout (s)')}{inp('timeout_sec', 'number')}</div>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
        <button onClick={onCancel} style={{ fontSize: sz.stat, padding: '5px 12px', borderRadius: 5, border: `1px solid ${C.border}`, background: 'transparent', color: C.textDim, cursor: 'pointer' }}>Cancel</button>
        <button onClick={save} style={{ fontSize: sz.stat, padding: '5px 12px', borderRadius: 5, border: `1px solid ${C.accent}60`, background: C.accent + '18', color: C.accent, cursor: 'pointer', fontWeight: 700 }}>Save</button>
      </div>
    </div>
  )
}

function ForwardingTab({ settings, onSave, forwardStatus, C, sz }) {
  const dests = settings?.forward_destinations || []
  const [editing, setEditing] = useState(null)
  const [testing, setTesting] = useState({})

  const saveDest = (dest) => {
    const newDests = editing === 'new'
      ? [...dests, dest]
      : dests.map((d, i) => i === editing ? dest : d)
    onSave({ ...settings, forward_destinations: newDests })
    setEditing(null)
  }

  const removeDest = (i) => {
    onSave({ ...settings, forward_destinations: dests.filter((_, idx) => idx !== i) })
  }

  const toggleEnabled = (i) => {
    const newDests = dests.map((d, idx) => idx === i ? { ...d, enabled: !d.enabled } : d)
    onSave({ ...settings, forward_destinations: newDests })
  }

  const testDest = async (dest) => {
    const name = dest.name || 'unnamed'
    setTesting(p => ({ ...p, [name]: true }))
    try {
      await fetch(`${API}/tracker/forward/test`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ destination: dest }) })
    } finally { setTesting(p => ({ ...p, [name]: false })) }
  }

  if (editing !== null) {
    return <DestEditor dest={editing === 'new' ? {} : dests[editing]} onSave={saveDest} onCancel={() => setEditing(null)} C={C} sz={sz} />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {dests.length === 0 && <div style={{ color: C.textMuted, fontSize: sz.stat, textAlign: 'center', padding: '20px 0' }}>No forwarding destinations. Add one below.</div>}
      {dests.map((dest, i) => {
        const name = dest.name || 'unnamed'
        const lastResult = forwardStatus?.[name]
        return (
          <div key={i} style={{ background: C.bgInput, borderRadius: 7, padding: '10px 12px', border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: dest.enabled ? (lastResult?.ok === false ? '#f87171' : '#4ade80') : '#6b7280', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: C.textBright, fontSize: sz.stat, fontWeight: 700 }}>{name}</div>
              <div style={{ color: C.textMuted, fontSize: sz.stat - 1, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dest.url}</div>
              {lastResult && <div style={{ color: lastResult.ok ? '#4ade80' : '#f87171', fontSize: sz.stat - 2, marginTop: 2 }}>Last: {lastResult.ok ? '✓' : '✗'} {lastResult.status ? `HTTP ${lastResult.status}` : lastResult.error || ''} @ {fmtTs(lastResult.ts)}</div>}
            </div>
            <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
              <button onClick={() => toggleEnabled(i)} style={{ fontSize: sz.stat - 1, padding: '3px 7px', borderRadius: 4, border: `1px solid ${C.border}`, background: 'transparent', color: C.textDim, cursor: 'pointer' }}>{dest.enabled ? 'Disable' : 'Enable'}</button>
              <button onClick={() => testDest(dest)} disabled={testing[name]} style={{ fontSize: sz.stat - 1, padding: '3px 7px', borderRadius: 4, border: `1px solid ${C.accent}40`, background: C.accent + '10', color: C.accent, cursor: 'pointer' }}>{testing[name] ? '…' : 'Test'}</button>
              <button onClick={() => setEditing(i)} style={{ fontSize: sz.stat - 1, padding: '3px 7px', borderRadius: 4, border: `1px solid ${C.border}`, background: 'transparent', color: C.textDim, cursor: 'pointer' }}>Edit</button>
              <button onClick={() => removeDest(i)} style={{ fontSize: sz.stat - 1, padding: '3px 7px', borderRadius: 4, border: `1px solid ${C.red}40`, background: C.redBg, color: C.red, cursor: 'pointer' }}>✕</button>
            </div>
          </div>
        )
      })}
      <button onClick={() => setEditing('new')} style={{ marginTop: 4, fontSize: sz.stat, padding: '6px 12px', borderRadius: 6, border: `1px solid ${C.accent}50`, background: C.accent + '10', color: C.accent, cursor: 'pointer', fontWeight: 700 }}>+ Add Destination</button>
    </div>
  )
}

function RetentionTab({ settings, onSave, C, sz }) {
  const [cap, setCap] = useState(String(settings?.events_cap ?? 100))
  const [ttl, setTtl] = useState(String(settings?.snapshot_ttl_sec ?? 0))

  const save = () => onSave({ ...settings, events_cap: parseInt(cap) || 100, snapshot_ttl_sec: parseInt(ttl) || 0 })

  const lbl = (t, sub) => (
    <div style={{ marginBottom: 4 }}>
      <div style={{ color: C.textMuted, fontSize: sz.stat - 1, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t}</div>
      {sub && <div style={{ color: C.textMuted, fontSize: sz.stat - 2, marginTop: 1 }}>{sub}</div>}
    </div>
  )
  const numInp = (val, set) => (
    <input type="number" min="1" value={val} onChange={e => set(e.target.value)}
      style={{ width: '100%', background: C.bgInput, border: `1px solid ${C.border}`, color: C.text, borderRadius: 5, padding: '6px 8px', fontSize: sz.stat, outline: 'none', boxSizing: 'border-box' }} />
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>{lbl('Event Ring Buffer Size', 'Events beyond this limit are dropped from memory (oldest first).')}{numInp(cap, setCap)}</div>
      <div>{lbl('Snapshot TTL (seconds)', '0 = keep until overwritten by next snapshot for same player.')}{numInp(ttl, setTtl)}</div>
      <button onClick={save} style={{ alignSelf: 'flex-end', fontSize: sz.stat, padding: '6px 16px', borderRadius: 6, border: `1px solid ${C.accent}60`, background: C.accent + '18', color: C.accent, cursor: 'pointer', fontWeight: 700 }}>Save</button>
    </div>
  )
}

function StorageTab({ settings, onSave, C, sz }) {
  const [enabled, setEnabled] = useState(settings?.sqlite_enabled ?? false)
  const [days, setDays] = useState(String(settings?.sqlite_retention_days ?? 30))

  const save = () => onSave({ ...settings, sqlite_enabled: enabled, sqlite_retention_days: parseInt(days) || 30 })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ background: C.bgInput, borderRadius: 8, padding: '12px 14px', border: `1px solid ${C.border}` }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <div style={{ width: 14, height: 14, borderRadius: 3, border: `1px solid ${enabled ? C.accent : C.border}`, background: enabled ? C.accent + '18' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 120ms' }}
            onClick={() => setEnabled(p => !p)}>
            {enabled && <svg width="9" height="9" viewBox="0 0 9 9"><polyline points="1.5,4.5 3.5,6.5 7.5,2.5" fill="none" stroke={C.accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
          </div>
          <div>
            <div style={{ color: C.textBright, fontSize: sz.base, fontWeight: 700 }}>Enable SQLite Persistence</div>
            <div style={{ color: C.textMuted, fontSize: sz.stat - 1, marginTop: 2 }}>Writes snapshots and events to <span style={{ fontFamily: 'monospace' }}>backend/data/tracker.db</span>. Off by default — in-memory only.</div>
          </div>
        </label>
      </div>
      {enabled && (
        <div>
          <div style={{ color: C.textMuted, fontSize: sz.stat - 1, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Retention (days)</div>
          <input type="number" min="1" value={days} onChange={e => setDays(e.target.value)}
            style={{ width: '100%', background: C.bgInput, border: `1px solid ${C.border}`, color: C.text, borderRadius: 5, padding: '6px 8px', fontSize: sz.stat, outline: 'none', boxSizing: 'border-box' }} />
        </div>
      )}
      <button onClick={save} style={{ alignSelf: 'flex-end', fontSize: sz.stat, padding: '6px 16px', borderRadius: 6, border: `1px solid ${C.accent}60`, background: C.accent + '18', color: C.accent, cursor: 'pointer', fontWeight: 700 }}>Save</button>
    </div>
  )
}

function SettingsModal({ open, onClose, role, C, sz }) {
  const [tab, setTab] = useState('receiver')
  const [settings, setSettings] = useState(null)
  const [keyInfo, setKeyInfo] = useState(null)
  const [status, setStatus] = useState(null)
  const [forwardStatus, setForwardStatus] = useState(null)

  const load = useCallback(async () => {
    const [s, k, st, fs] = await Promise.all([
      fetch(`${API}/tracker/settings`, { credentials: 'include' }).then(r => r.json()).catch(() => null),
      fetch(`${API}/tracker/key`, { credentials: 'include' }).then(r => r.json()).catch(() => null),
      fetch(`${API}/tracker/status`).then(r => r.json()).catch(() => null),
      fetch(`${API}/tracker/forward/status`, { credentials: 'include' }).then(r => r.json()).catch(() => null),
    ])
    setSettings(s); setKeyInfo(k); setStatus(st); setForwardStatus(fs?.destinations)
  }, [])

  useEffect(() => { if (open) load() }, [open, load])

  const saveSettings = async (patch) => {
    await fetch(`${API}/tracker/settings`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
    setSettings(patch)
  }

  const MODAL_TABS = [
    { id: 'receiver', label: 'Receiver' },
    { id: 'forwarding', label: 'Forwarding' },
    { id: 'retention', label: 'Retention' },
    { id: 'storage', label: 'Storage' },
  ]

  if (!open) return null
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, width: '100%', maxWidth: 520, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: `1px solid ${C.border}` }}>
          <span style={{ color: C.textBright, fontSize: sz.base + 2, fontWeight: 900 }}>Tracker Settings</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.textDim, cursor: 'pointer', fontSize: 18, fontWeight: 900, lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ display: 'flex', gap: 2, padding: '10px 18px 0', borderBottom: `1px solid ${C.border}` }}>
          {MODAL_TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ fontSize: sz.stat, padding: '5px 12px', borderRadius: '5px 5px 0 0', border: `1px solid ${tab === t.id ? C.border : 'transparent'}`, borderBottom: tab === t.id ? `1px solid ${C.bgCard}` : 'none', background: tab === t.id ? C.bgCard : 'transparent', color: tab === t.id ? C.textBright : C.textMuted, cursor: 'pointer', fontWeight: tab === t.id ? 700 : 400, marginBottom: -1 }}>
              {t.label}
            </button>
          ))}
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: 18 }}>
          {tab === 'receiver' && <ReceiverTab keyInfo={keyInfo} onRotate={load} status={status} C={C} sz={sz} />}
          {tab === 'forwarding' && <ForwardingTab settings={settings} onSave={saveSettings} forwardStatus={forwardStatus} C={C} sz={sz} />}
          {tab === 'retention' && <RetentionTab settings={settings} onSave={saveSettings} C={C} sz={sz} />}
          {tab === 'storage' && <StorageTab settings={settings} onSave={saveSettings} C={C} sz={sz} />}
        </div>
      </div>
    </div>
  )
}

export default function Tracker({ role }) {
  const { C, sz } = useT()
  const [data, setData] = useState(null)
  const [fields, setFields] = useState(TRACKER_FIELDS)
  const [showFieldPicker, setShowFieldPicker] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showClear, setShowClear] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [view, setView] = useState('players')
  const [filterFaction, setFilterFaction] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const pollRef = useRef(null)

  const isAdmin = ['owner', 'head_admin', 'admin'].includes(role)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API}/tracker/debug`, { credentials: 'include' })
      if (r.ok) setData(await r.json())
    } catch {}
  }, [])

  useEffect(() => {
    load()
    pollRef.current = setInterval(load, 5000)
    return () => clearInterval(pollRef.current)
  }, [load])

  const doClear = async (target) => {
    setClearing(true)
    setShowClear(false)
    try {
      await fetch(`${API}/tracker/clear`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target }) })
      await load()
    } finally { setClearing(false) }
  }

  const toggleField = (id) => setFields(prev => prev.map(f => f.id === id ? { ...f, on: !f.on } : f))

  const snapshots = data?.snapshots || []
  const events = [...(data?.events || [])].reverse()
  const wiredUp = data?.wired_up

  const factions = [...new Set(snapshots.map(p => p.faction).filter(Boolean))]
  const statuses = [...new Set(snapshots.map(p => p.status).filter(Boolean))]

  const filteredPlayers = snapshots.filter(p =>
    (!filterFaction || p.faction === filterFaction) &&
    (!filterStatus || p.status === filterStatus)
  )

  const aliveCount = snapshots.filter(p => p.status === 'alive').length
  const deadCount = snapshots.filter(p => p.status === 'dead').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ color: C.textBright, fontSize: sz.base + 4, fontWeight: 900, margin: 0 }}>Tracker</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px', borderRadius: 5, background: wiredUp ? '#14532d22' : '#7f1d1d22', border: `1px solid ${wiredUp ? '#4ade8040' : '#f8717140'}` }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: wiredUp ? '#4ade80' : '#f87171', animation: wiredUp ? 'pulse 2s infinite' : 'none' }} />
          <span style={{ color: wiredUp ? '#4ade80' : '#f87171', fontSize: sz.stat, fontWeight: 700 }}>{wiredUp ? 'Mod Connected' : 'Not Connected'}</span>
        </div>
        {wiredUp && <>
          <span style={{ color: C.textMuted, fontSize: sz.stat }}>
            {snapshots.length} players · <span style={{ color: '#4ade80' }}>{aliveCount} alive</span> · <span style={{ color: '#f87171' }}>{deadCount} dead</span>
          </span>
          {data?.last_rx && <span style={{ color: C.textMuted, fontSize: sz.stat - 1 }}>last rx {fmtTs(data.last_rx)}</span>}
        </>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <div style={{ display: 'flex', borderRadius: 6, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
            {['players', 'events'].map(v => (
              <button key={v} onClick={() => setView(v)} style={{ fontSize: sz.stat, padding: '4px 12px', background: view === v ? C.accent + '20' : 'transparent', color: view === v ? C.accent : C.textMuted, border: 'none', cursor: 'pointer', fontWeight: view === v ? 700 : 400 }}>
                {v === 'players' ? `Players (${filteredPlayers.length})` : `Events (${events.length})`}
              </button>
            ))}
          </div>
          {view === 'players' && (
            <div style={{ position: 'relative' }}>
              <button onClick={() => setShowFieldPicker(p => !p)} title="Toggle fields" style={{ fontSize: sz.stat, padding: '4px 10px', borderRadius: 5, border: `1px solid ${C.border}`, background: showFieldPicker ? C.bgInput : 'transparent', color: C.textDim, cursor: 'pointer' }}>⊞ Fields</button>
              {showFieldPicker && (
                <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 50, background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8, padding: 8, minWidth: 180, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                  {fields.map(f => <FieldToggle key={f.id} id={f.id} label={f.label} checked={f.on} onChange={() => toggleField(f.id)} C={C} sz={sz} />)}
                </div>
              )}
            </div>
          )}
          {isAdmin && (
            <>
              <div style={{ position: 'relative' }}>
                <button onClick={() => setShowClear(p => !p)} disabled={clearing} style={{ fontSize: sz.stat, padding: '4px 10px', borderRadius: 5, border: `1px solid ${C.border}`, background: 'transparent', color: C.textDim, cursor: 'pointer' }}>
                  {clearing ? 'Clearing…' : 'Clear ▾'}
                </button>
                {showClear && (
                  <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 50, background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8, padding: 6, minWidth: 140, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                    {[['snapshots','Snapshots'], ['events','Events'], ['sqlite','SQLite DB'], ['all','Everything']].map(([t, l]) => (
                      <button key={t} onClick={() => doClear(t)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', borderRadius: 5, background: 'transparent', border: 'none', color: t === 'all' ? C.red : C.textDim, fontSize: sz.stat, cursor: 'pointer' }}
                        onMouseEnter={e => e.currentTarget.style.background = C.bgInput}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        {l}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={() => setShowSettings(true)} title="Settings" style={{ fontSize: sz.stat, padding: '4px 10px', borderRadius: 5, border: `1px solid ${C.border}`, background: 'transparent', color: C.textDim, cursor: 'pointer' }}>⚙</button>
            </>
          )}
        </div>
      </div>

      {view === 'players' && factions.length > 1 && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ color: C.textMuted, fontSize: sz.stat - 1 }}>Filter:</span>
          {['', ...factions].map(f => (
            <button key={f || '__all'} onClick={() => setFilterFaction(f)} style={{ fontSize: sz.stat - 1, padding: '2px 8px', borderRadius: 4, border: `1px solid ${filterFaction === f ? C.accent + '60' : C.border}`, background: filterFaction === f ? C.accent + '15' : 'transparent', color: filterFaction === f ? C.accent : C.textMuted, cursor: 'pointer' }}>
              {f || 'All'}
            </button>
          ))}
          {statuses.length > 1 && ['', ...statuses].map(s => (
            <button key={s || '__all_s'} onClick={() => setFilterStatus(s)} style={{ fontSize: sz.stat - 1, padding: '2px 8px', borderRadius: 4, border: `1px solid ${filterStatus === s ? C.accent + '60' : C.border}`, background: filterStatus === s ? C.accent + '15' : 'transparent', color: filterStatus === s ? C.accent : C.textMuted, cursor: 'pointer' }}>
              {s || 'All statuses'}
            </button>
          ))}
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto' }}>
        {view === 'players' && (
          filteredPlayers.length === 0
            ? <div style={{ color: C.textMuted, fontSize: sz.base, textAlign: 'center', paddingTop: 48 }}>{wiredUp ? 'No players match filter.' : 'Waiting for mod to connect…'}</div>
            : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
                {filteredPlayers.map((p, i) => <TrackerPlayerCard key={p.uid || i} player={p} fields={fields} C={C} sz={sz} />)}
              </div>
        )}
        {view === 'events' && (
          events.length === 0
            ? <div style={{ color: C.textMuted, fontSize: sz.base, textAlign: 'center', paddingTop: 48 }}>{wiredUp ? 'No events yet.' : 'Waiting for mod to connect…'}</div>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {events.map((ev, i) => <TrackerEventRow key={i} event={ev} C={C} sz={sz} />)}
              </div>
        )}
      </div>

      {isAdmin && <SettingsModal open={showSettings} onClose={() => setShowSettings(false)} role={role} C={C} sz={sz} />}
    </div>
  )
}
