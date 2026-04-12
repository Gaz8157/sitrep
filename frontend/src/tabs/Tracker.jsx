import { useState, useEffect, useRef, useCallback } from 'react'
import { useT } from '../ctx.jsx'
import { API, authHeaders, getHeaders } from '../api.js'
import { FloatingPanel } from '../components/ui.jsx'

const TRACKER_PANEL_LABELS = { players: 'Players', events: 'Events', fields: 'Fields', filters: 'Filters' }

const TRACKER_FIELDS = [
  { id: 'status',   label: 'Status',    on: true  },
  { id: 'faction',  label: 'Faction',   on: true  },
  { id: 'health',   label: 'Health',    on: true  },
  { id: 'grid',     label: 'Grid 8',    on: true  },
  { id: 'grid_10',  label: 'Grid 10',   on: true  },
  { id: 'heading',  label: 'Heading',   on: true  },
  { id: 'squad',    label: 'Squad',     on: true  },
  { id: 'location', label: 'Location',  on: true  },
  { id: 'elevation',label: 'Elevation', on: true  },
  { id: 'uid',      label: 'UID',       on: true  },
]

// Translate Arma localization keys like "#AR-MapLocation_EntreDeux" into "Entre Deux".
function fmtLocName(name) {
  if (!name) return name
  let n = String(name)
  n = n.replace(/^#AR-?(MapLocation|Location|Area|City|Town|Village|Hill|Landmark)_/i, '')
  n = n.replace(/^#[A-Za-z]+_/, '')  // any other Arma localization prefix
  n = n.replace(/_/g, ' ')
  n = n.replace(/([a-z])([A-Z])/g, '$1 $2')
  n = n.replace(/\s+/g, ' ').trim()
  return n
}

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

function HealthBar({ value, C, slim }) {
  const pct = Math.round((value ?? 1) * 100)
  const color = pct > 60 ? '#4ade80' : pct > 30 ? '#fb923c' : '#f87171'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: slim ? 4 : 6 }}>
      <div style={{ flex: 1, height: slim ? 3 : 4, background: C.bgInput, borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.3s' }} />
      </div>
      <span style={{ color: C.textMuted, fontSize: slim ? 8 : 9, minWidth: slim ? 20 : 24, textAlign: 'right' }}>{pct}%</span>
    </div>
  )
}

function RoleBadges({ player, C, size = 10 }) {
  const badges = []
  if (player.is_admin)        badges.push({ label: 'ADMIN', color: '#60a5fa' })
  if (player.is_gm)           badges.push({ label: 'GM',    color: C.accent  })
  if (player.is_squad_leader) badges.push({ label: 'SL',    color: '#fb923c' })
  if (badges.length === 0) return null
  return (
    <div style={{ display: 'flex', gap: 3, flexShrink: 0, alignItems: 'center' }}>
      {badges.map(r => (
        <span key={r.label} style={{
          fontSize: size,
          fontWeight: 900,
          padding: size >= 11 ? '2px 6px' : '1px 5px',
          borderRadius: 4,
          background: r.color + '22',
          color: r.color,
          border: `1px solid ${r.color}55`,
          lineHeight: 1.2,
          letterSpacing: '0.04em',
        }}>{r.label}</span>
      ))}
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

function TrackerPlayerCard({ player, fields, expanded, onToggle, C, sz }) {
  const on = (id) => fields.find(f => f.id === id)?.on
  const status = player.status || 'unspawned'
  const statusColor = STATUS_COLOR[status] || '#6b7280'
  const isDead = status === 'dead'
  const locName = player.nearest_location?.name ? fmtLocName(player.nearest_location.name) : null
  const locDist = player.nearest_location?.dist_m >= 0 ? Math.round(player.nearest_location.dist_m) : null

  const baseStyle = {
    background: C.bgCard,
    border: `1px solid ${expanded ? C.accent + '70' : C.border}`,
    borderRadius: 7,
    opacity: isDead ? 0.65 : 1,
    cursor: 'pointer',
    transition: 'border-color 150ms',
    minWidth: 0,
    gridColumn: expanded ? 'span 2' : 'span 1',
    gridRow:    expanded ? 'span 2' : 'span 1',
    overflow: 'hidden',
  }

  if (!expanded) {
    return (
      <div onClick={onToggle} style={{ ...baseStyle, padding: '7px 9px', display: 'flex', flexDirection: 'column', gap: 4 }}
        onMouseEnter={e => e.currentTarget.style.borderColor = C.accent + '50'}
        onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
        {/* Name row: status · name · role badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor, flexShrink: 0, boxShadow: `0 0 4px ${statusColor}80` }} />
          <span style={{ color: C.textBright, fontSize: sz.stat + 1, fontWeight: 800, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{player.name || '?'}</span>
          <RoleBadges player={player} C={C} size={9} />
        </div>
        {/* Faction + grid row */}
        {(on('faction') && player.faction) || (on('grid') && player.grid) ? (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: sz.stat, minWidth: 0 }}>
            {on('faction') && player.faction && (
              <span style={{ color: C.accent, fontWeight: 700, flexShrink: 0 }}>{player.faction}</span>
            )}
            {on('grid') && player.grid && (
              <span style={{ fontFamily: 'monospace', color: C.text, fontWeight: 600, marginLeft: 'auto' }}>{player.grid}</span>
            )}
          </div>
        ) : null}
        {/* Squad row (when present) */}
        {on('squad') && player.squad_id >= 0 && (
          <div style={{ fontSize: sz.stat - 1, color: C.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {player.squad_name || `Squad ${player.squad_id}`}
          </div>
        )}
        {/* Nearest location row (when present) */}
        {on('location') && locName && (
          <div style={{ fontSize: sz.stat - 1, color: C.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {locName}{locDist != null ? ` · ${locDist}m` : ''}
          </div>
        )}
        {/* Health bar */}
        {on('health') && player.health != null && <HealthBar value={player.health} C={C} slim />}
      </div>
    )
  }

  return (
    <div onClick={onToggle} style={{ ...baseStyle, padding: '11px 13px', display: 'flex', flexDirection: 'column', gap: 9 }}>
      {/* Name row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <div style={{ width: 9, height: 9, borderRadius: '50%', background: statusColor, flexShrink: 0, boxShadow: `0 0 6px ${statusColor}80` }} />
        <span style={{ color: C.textBright, fontSize: sz.base + 2, fontWeight: 800, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{player.name || '?'}</span>
        <RoleBadges player={player} C={C} size={11} />
      </div>
      {/* Field grid — primary two-column rows */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 14px' }}>
        {on('status') && <Row label="Status" value={<span style={{ color: statusColor, fontWeight: 700 }}>{status}</span>} C={C} sz={sz} />}
        {on('faction') && player.faction && <Row label="Faction" value={<span style={{ color: C.accent, fontWeight: 700 }}>{player.faction}</span>} C={C} sz={sz} />}
        {on('grid') && player.grid && <Row label="Grid 8" value={<span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{player.grid}</span>} C={C} sz={sz} />}
        {on('grid_10') && player.grid_10 && <Row label="Grid 10" value={<span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{player.grid_10}</span>} C={C} sz={sz} />}
        {on('heading') && player.heading != null && <Row label="Heading" value={`${player.heading}° ${player.heading_dir || ''}`} C={C} sz={sz} />}
        {on('elevation') && player.elevation != null && <Row label="Elevation" value={`${Math.round(player.elevation)}m`} C={C} sz={sz} />}
        {on('squad') && player.squad_id >= 0 && <Row label="Squad" value={player.squad_name || `Sqd ${player.squad_id}`} C={C} sz={sz} />}
      </div>
      {/* Full-width rows (wrapping values) */}
      {on('location') && locName && (
        <FullRow label="Near" C={C} sz={sz}>
          {locName}{locDist != null ? <span style={{ color: C.textMuted, marginLeft: 4 }}>({locDist}m)</span> : null}
        </FullRow>
      )}
      {on('uid') && player.uid && (
        <FullRow label="UID" C={C} sz={sz}>
          <span style={{ fontFamily: 'monospace', fontSize: sz.stat - 1, wordBreak: 'break-all', display: 'inline-block' }}>{player.uid}</span>
        </FullRow>
      )}
      {/* Health bar */}
      {on('health') && player.health != null && <HealthBar value={player.health} C={C} />}
    </div>
  )
}

function FullRow({ label, children, C, sz }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
      <span style={{ color: C.textMuted, fontSize: sz.stat - 1, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
      <span style={{ color: C.text, fontSize: sz.stat, wordBreak: 'break-word' }}>{children}</span>
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
  const [modIds, setModIds] = useState([])
  const [modIdInput, setModIdInput] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [modIdMsg, setModIdMsg] = useState(null)

  const loadModIds = useCallback(async () => {
    try {
      const r = await fetch(`${API}/tracker/mod-ids`, { credentials: 'include', headers: getHeaders() })
      const d = await r.json()
      setModIds(d.mod_ids || [])
    } catch {}
  }, [])

  useEffect(() => { loadModIds() }, [loadModIds])

  const assignModId = async (mid) => {
    setAssigning(true); setModIdMsg(null)
    try {
      const r = await fetch(`${API}/tracker/mod-id`, {
        method: 'PUT', credentials: 'include', headers: authHeaders(),
        body: JSON.stringify({ mod_server_id: mid || '' }),
      })
      const d = await r.json()
      if (r.ok) {
        setModIdMsg({ ok: true, text: mid ? `Linked to ${mid}` : 'Unlinked' })
        setModIdInput('')
        loadModIds()
        onRotate()
      } else {
        setModIdMsg({ ok: false, text: d.error || 'Error' })
      }
    } catch (e) {
      setModIdMsg({ ok: false, text: String(e) })
    } finally {
      setAssigning(false)
    }
  }

  const currentModId = status?.mod_server_id || null

  const reveal = async () => {
    setRevealing(true)
    try {
      const r = await fetch(`${API}/tracker/key/reveal`, { credentials: 'include', headers: getHeaders() })
      const d = await r.json()
      setRevealedKey(d.key)
    } finally { setRevealing(false) }
  }

  const rotate = async () => {
    setRotating(true)
    try {
      const r = await fetch(`${API}/tracker/key/rotate`, { method: 'POST', credentials: 'include', headers: getHeaders() })
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
        headers: authHeaders(),
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
      {/* Mod Server Link */}
      <div style={{ background: C.bgInput, borderRadius: 8, padding: '12px 14px', border: `1px solid ${currentModId ? C.border : '#fb923c60'}`, borderLeft: `3px solid ${currentModId ? '#4ade80' : '#fb923c'}` }}>
        <div style={{ color: C.textMuted, fontSize: sz.stat - 1, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Linked Mod Server</div>
        <div style={{ fontFamily: 'monospace', color: currentModId ? C.textBright : C.textMuted, fontSize: sz.base, marginBottom: 8, letterSpacing: '0.03em' }}>
          {currentModId || 'Not linked — tracker will be empty until a mod ID is assigned'}
        </div>
        {currentModId && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button onClick={() => assignModId('')} disabled={assigning}
              style={{ fontSize: sz.stat - 1, padding: '4px 10px', borderRadius: 5, border: `1px solid ${C.red}40`, background: C.redBg || C.red + '12', color: C.red, cursor: 'pointer' }}>
              {assigning ? '…' : 'Unlink'}
            </button>
          </div>
        )}

        <div style={{ color: C.textMuted, fontSize: sz.stat - 1, marginTop: 4, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recently Seen ({modIds.length})</div>
        {modIds.length === 0 ? (
          <div style={{ color: C.textDim, fontSize: sz.stat - 1, padding: '4px 0' }}>No mod servers have reported in recently. Start the Arma server and make sure the PlayerTracker mod's Webhook Base URL points here.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {modIds.map(row => {
              const isCurrent = row.mod_server_id === currentModId
              return (
                <div key={row.mod_server_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 5, background: isCurrent ? '#14532d22' : C.bgCard, border: `1px solid ${isCurrent ? '#4ade8040' : C.border}` }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: isCurrent ? '#4ade80' : (row.assigned ? '#60a5fa' : '#6b7280'), flexShrink: 0 }} />
                  <span style={{ fontFamily: 'monospace', color: C.text, fontSize: sz.stat, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.mod_server_id}</span>
                  <span style={{ color: C.textMuted, fontSize: sz.stat - 2, flexShrink: 0 }}>{fmtTs(row.last_rx)}</span>
                  {isCurrent ? (
                    <span style={{ fontSize: sz.stat - 2, padding: '2px 7px', borderRadius: 4, background: '#4ade8018', color: '#4ade80', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Linked</span>
                  ) : row.assigned ? (
                    <span style={{ fontSize: sz.stat - 2, padding: '2px 7px', borderRadius: 4, background: '#60a5fa18', color: '#60a5fa', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Other server</span>
                  ) : (
                    <button onClick={() => assignModId(row.mod_server_id)} disabled={assigning}
                      style={{ fontSize: sz.stat - 2, padding: '2px 9px', borderRadius: 4, border: `1px solid ${C.accent}50`, background: C.accent + '18', color: C.accent, cursor: 'pointer', fontWeight: 700 }}>
                      Link
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div style={{ marginTop: 10 }}>
          <div style={{ color: C.textMuted, fontSize: sz.stat - 1, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Or Enter Manually</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text" value={modIdInput} onChange={e => { setModIdInput(e.target.value); setModIdMsg(null) }}
              placeholder="host:port (e.g. 10.0.0.1:2001)"
              style={{ flex: 1, background: C.bgCard, border: `1px solid ${C.border}`, color: C.text, borderRadius: 5, padding: '5px 8px', fontSize: sz.stat, outline: 'none', fontFamily: 'monospace' }}
              onKeyDown={e => e.key === 'Enter' && modIdInput.trim() && assignModId(modIdInput.trim())}
            />
            <button onClick={() => assignModId(modIdInput.trim())} disabled={assigning || !modIdInput.trim()}
              style={{ fontSize: sz.stat, padding: '4px 12px', borderRadius: 5, border: `1px solid ${C.accent}40`, background: C.accentBg, color: C.accent, cursor: 'pointer', opacity: !modIdInput.trim() ? 0.45 : 1 }}>
              {assigning ? 'Linking…' : 'Link'}
            </button>
          </div>
        </div>

        {modIdMsg && <div style={{ marginTop: 6, fontSize: sz.stat - 1, color: modIdMsg.ok ? '#4ade80' : '#f87171' }}>{modIdMsg.text}</div>}
      </div>

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
          <StatLine label="Server Running" value={status?.server_running ? 'Yes' : 'No'} ok={status?.server_running} C={C} sz={sz} />
          <StatLine label="Mod Connected" value={status?.wired_up ? 'Yes' : 'No'} ok={status?.wired_up} C={C} sz={sz} />
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
      await fetch(`${API}/tracker/forward/test`, { method: 'POST', credentials: 'include', headers: authHeaders(), body: JSON.stringify({ destination: dest }) })
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

function DangerTab({ onAfterClear, C, sz }) {
  const [confirmTarget, setConfirmTarget] = useState(null)
  const [clearing, setClearing] = useState(false)
  const [result, setResult] = useState(null)

  const TARGETS = [
    { id: 'snapshots', label: 'Player Snapshots',      desc: 'Drops all in-memory player position/state data. Live tracker grid will be empty until next mod ping.', impact: 'medium' },
    { id: 'events',    label: 'Event Ring Buffer',     desc: 'Drops all recent kill/join/leave/vote events from memory. Forwarded destinations unaffected.',            impact: 'medium' },
    { id: 'sqlite',    label: 'SQLite Database',       desc: 'Deletes the entire tracker.db file on disk. All historical snapshots and events are permanently lost.',   impact: 'high'   },
    { id: 'all',       label: 'EVERYTHING',            desc: 'Snapshots + events + SQLite DB. Complete wipe. This cannot be undone.',                                     impact: 'high'   },
  ]

  const doClear = async (target) => {
    setClearing(true); setResult(null)
    try {
      const r = await fetch(`${API}/tracker/clear`, { method: 'POST', credentials: 'include', headers: authHeaders(), body: JSON.stringify({ target, scope: 'server' }) })
      const d = await r.json().catch(() => ({}))
      setResult({ ok: r.ok, text: r.ok ? (d.message || `Cleared ${target}`) : (d.error || 'Failed') })
      if (r.ok && onAfterClear) onAfterClear()
    } catch (e) {
      setResult({ ok: false, text: String(e) })
    } finally {
      setClearing(false); setConfirmTarget(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ background: '#7f1d1d22', border: `1px solid ${C.red}60`, borderRadius: 8, padding: '10px 14px' }}>
        <div style={{ color: C.red, fontSize: sz.stat, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>⚠ DANGER ZONE</div>
        <div style={{ color: C.red, fontSize: sz.stat - 1, lineHeight: 1.4 }}>
          These actions permanently destroy tracker data. There is no undo. Double-check before confirming.
        </div>
      </div>

      {TARGETS.map(t => {
        const isConfirming = confirmTarget === t.id
        const barColor = t.impact === 'high' ? C.red : '#fb923c'
        return (
          <div key={t.id} style={{ background: C.bgInput, border: `1px solid ${isConfirming ? C.red + '80' : C.border}`, borderLeft: `3px solid ${barColor}`, borderRadius: 7, padding: '10px 12px', transition: 'border-color 120ms' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <span style={{ color: t.impact === 'high' ? C.red : C.textBright, fontSize: sz.stat + 1, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{t.label}</span>
              {!isConfirming ? (
                <button
                  onClick={() => setConfirmTarget(t.id)}
                  disabled={clearing}
                  style={{ fontSize: sz.stat - 1, padding: '4px 12px', borderRadius: 5, border: `1px solid ${C.red}50`, background: C.redBg || C.red + '15', color: C.red, cursor: 'pointer', fontWeight: 700 }}
                >Clear…</button>
              ) : (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => doClear(t.id)}
                    disabled={clearing}
                    style={{ fontSize: sz.stat - 1, padding: '4px 12px', borderRadius: 5, border: `1px solid ${C.red}`, background: C.red, color: '#fff', cursor: 'pointer', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}
                  >{clearing ? 'Clearing…' : 'Yes, Destroy'}</button>
                  <button
                    onClick={() => setConfirmTarget(null)}
                    disabled={clearing}
                    style={{ fontSize: sz.stat - 1, padding: '4px 12px', borderRadius: 5, border: `1px solid ${C.border}`, background: 'transparent', color: C.textDim, cursor: 'pointer' }}
                  >Cancel</button>
                </div>
              )}
            </div>
            <div style={{ color: C.textMuted, fontSize: sz.stat - 1, lineHeight: 1.4 }}>{t.desc}</div>
          </div>
        )
      })}

      {result && (
        <div style={{ background: result.ok ? '#14532d22' : '#7f1d1d33', border: `1px solid ${result.ok ? '#4ade8060' : C.red}`, borderRadius: 7, padding: '8px 12px', color: result.ok ? '#4ade80' : C.red, fontSize: sz.stat }}>
          {result.ok ? '✓ ' : '✕ '}{result.text}
        </div>
      )}
    </div>
  )
}

function ModSetupTab({ C, sz }) {
  const [setup, setSetup] = useState(null)
  const [profileInput, setProfileInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API}/tracker/mod-setup`, { credentials: 'include', headers: getHeaders() })
      const d = await r.json()
      setSetup(d)
      if (d.arma_profile_path) setProfileInput(d.arma_profile_path)
    } catch {}
  }, [])

  useEffect(() => { load() }, [load])

  const writeConfig = async () => {
    setSaving(true); setMsg(null)
    try {
      const r = await fetch(`${API}/tracker/mod-setup`, {
        method: 'POST', credentials: 'include', headers: authHeaders(),
        body: JSON.stringify({ arma_profile_path: profileInput.trim() })
      })
      const d = await r.json()
      if (d.ok) { setMsg({ ok: true, text: `Config written to ${d.config_path}` }); load() }
      else setMsg({ ok: false, text: d.error || 'Error' })
    } catch (e) { setMsg({ ok: false, text: String(e) }) }
    finally { setSaving(false) }
  }

  const inp = { width: '100%', background: C.bgInput, border: `1px solid ${C.border}`, color: C.text, borderRadius: 5, padding: '6px 9px', fontSize: sz.stat, outline: 'none', boxSizing: 'border-box' }
  const lbl = (t) => <div style={{ color: C.textMuted, fontSize: sz.stat - 1, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t}</div>

  const steps = [
    { n: 1, text: 'Add Workshop mod to your Arma server mod list', detail: setup?.workshop_id ? `ID: ${setup.workshop_id}` : null },
    { n: 2, text: 'Enter your Arma server profile path below and click Write Config', detail: 'The mod reads $profile:PlayerTracker/config.cfg on startup' },
    { n: 3, text: 'Start (or restart) your Arma server', detail: 'The Tracker tab appears within 8 seconds of the first mod POST' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Setup steps */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {steps.map(s => (
          <div key={s.n} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <div style={{ width: 22, height: 22, borderRadius: '50%', background: C.accent + '20', border: `1px solid ${C.accent}50`, color: C.accent, fontSize: sz.stat - 1, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{s.n}</div>
            <div>
              <div style={{ color: C.text, fontSize: sz.stat }}>{s.text}</div>
              {s.detail && <div style={{ color: C.textMuted, fontSize: sz.stat - 1, fontFamily: 'monospace', marginTop: 2 }}>{s.detail}</div>}
            </div>
          </div>
        ))}
      </div>

      <div style={{ height: 1, background: C.border }} />

      {/* Config file writer */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          {lbl('Arma Server Profile Path')}
          <input value={profileInput} onChange={e => setProfileInput(e.target.value)}
            placeholder='/home/user/.local/share/ArmaReforgerServer/profile'
            style={inp} />
          <div style={{ color: C.textMuted, fontSize: sz.stat - 2, marginTop: 4 }}>
            This is the folder where Arma writes its profile data (used with the -profile launch arg).
            The mod config will be written to PlayerTracker/config.cfg inside this folder.
          </div>
        </div>

        {/* Read-only values being written */}
        {setup && (
          <div style={{ background: C.bgInput + '80', borderRadius: 6, padding: '9px 12px', border: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: sz.stat - 1 }}>
              <span style={{ color: C.textMuted }}>url</span>
              <span style={{ fontFamily: 'monospace', color: C.accent }}>{setup.panel_url}/</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: sz.stat - 1 }}>
              <span style={{ color: C.textMuted }}>api_key</span>
              <span style={{ fontFamily: 'monospace', color: setup.api_key_set ? C.text : '#f87171' }}>{setup.api_key_set ? '••••••••' : 'NOT SET — run installer first'}</span>
            </div>
          </div>
        )}

        <button onClick={writeConfig} disabled={saving || !profileInput.trim()}
          style={{ padding: '7px 16px', borderRadius: 6, border: `1px solid ${C.accent}60`, background: C.accent + '18', color: C.accent, cursor: saving || !profileInput.trim() ? 'not-allowed' : 'pointer', fontSize: sz.stat, fontWeight: 700, opacity: saving || !profileInput.trim() ? 0.5 : 1, alignSelf: 'flex-start' }}>
          {saving ? 'Writing…' : 'Write Config File'}
        </button>

        {msg && <div style={{ color: msg.ok ? '#4ade80' : '#f87171', fontSize: sz.stat - 1 }}>{msg.text}</div>}

        {setup?.config_exists && (
          <div style={{ color: '#4ade80', fontSize: sz.stat - 1, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>✓</span><span>Config file exists at {setup.config_path}</span>
          </div>
        )}
      </div>

      {/* Manual fallback */}
      <div style={{ height: 1, background: C.border }} />
      <div>
        <div style={{ color: C.textMuted, fontSize: sz.stat - 1, marginBottom: 6 }}>
          If your Arma server is on a different machine, drop this file at <span style={{ fontFamily: 'monospace', color: C.accent }}>$profile:PlayerTracker/config.cfg</span> manually:
        </div>
        <pre style={{ background: C.bgInput, border: `1px solid ${C.border}`, borderRadius: 5, padding: '8px 10px', fontSize: sz.stat - 1, color: C.text, margin: 0, overflowX: 'auto' }}>
{`# PlayerTracker config\nurl=${setup?.panel_url || 'https://yourpanel.com'}/\napi_key=${setup?.api_key_set ? '<your key — reveal in Receiver tab>' : 'NOT SET'}\ntrack_path=api/tracker/track\nevent_path=api/tracker/event\nupdate_interval=10`}
        </pre>
      </div>
    </div>
  )
}

function SettingsModal({ open, onClose, role, C, sz }) {
  const [tab, setTab] = useState('mod_setup')
  const [settings, setSettings] = useState(null)
  const [keyInfo, setKeyInfo] = useState(null)
  const [status, setStatus] = useState(null)
  const [forwardStatus, setForwardStatus] = useState(null)

  const load = useCallback(async () => {
    const [s, k, st, fs] = await Promise.all([
      fetch(`${API}/tracker/settings`, { credentials: 'include', headers: getHeaders() }).then(r => r.json()).catch(() => null),
      fetch(`${API}/tracker/key`, { credentials: 'include', headers: getHeaders() }).then(r => r.json()).catch(() => null),
      fetch(`${API}/tracker/status`, { credentials: 'include', headers: getHeaders() }).then(r => r.json()).catch(() => null),
      fetch(`${API}/tracker/forward/status`, { credentials: 'include', headers: getHeaders() }).then(r => r.json()).catch(() => null),
    ])
    setSettings(s); setKeyInfo(k); setStatus(st); setForwardStatus(fs?.destinations)
  }, [])

  useEffect(() => { if (open) load() }, [open, load])

  const saveSettings = async (patch) => {
    await fetch(`${API}/tracker/settings`, { method: 'PUT', credentials: 'include', headers: authHeaders(), body: JSON.stringify(patch) })
    setSettings(patch)
  }

  const MODAL_TABS = [
    { id: 'mod_setup', label: 'Mod Setup' },
    { id: 'receiver', label: 'Receiver' },
    { id: 'forwarding', label: 'Forwarding' },
    { id: 'retention', label: 'Retention' },
    { id: 'storage', label: 'Storage' },
    { id: 'danger', label: 'Danger', danger: true },
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
          {MODAL_TABS.map(t => {
            const isActive = tab === t.id
            const col = t.danger ? C.red : C.textBright
            return (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ fontSize: sz.stat, padding: '5px 12px', borderRadius: '5px 5px 0 0', border: `1px solid ${isActive ? C.border : 'transparent'}`, borderBottom: isActive ? `1px solid ${C.bgCard}` : 'none', background: isActive ? C.bgCard : 'transparent', color: isActive ? col : (t.danger ? C.red + 'B0' : C.textMuted), cursor: 'pointer', fontWeight: isActive || t.danger ? 700 : 400, marginBottom: -1 }}>
                {t.label}
              </button>
            )
          })}
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: 18 }}>
          {tab === 'mod_setup' && <ModSetupTab C={C} sz={sz} />}
          {tab === 'receiver' && <ReceiverTab keyInfo={keyInfo} onRotate={load} status={status} C={C} sz={sz} />}
          {tab === 'forwarding' && <ForwardingTab settings={settings} onSave={saveSettings} forwardStatus={forwardStatus} C={C} sz={sz} />}
          {tab === 'retention' && <RetentionTab settings={settings} onSave={saveSettings} C={C} sz={sz} />}
          {tab === 'storage' && <StorageTab settings={settings} onSave={saveSettings} C={C} sz={sz} />}
          {tab === 'danger' && <DangerTab onAfterClear={load} C={C} sz={sz} />}
        </div>
      </div>
    </div>
  )
}

const DENSITY = { S: 130, M: 170, L: 220 }

export default function Tracker({ role }) {
  const { C, sz } = useT()
  const [data, setData] = useState(null)
  const [fields, setFields] = useState(TRACKER_FIELDS)
  const [showSettings, setShowSettings] = useState(false)
  const [filterFaction, setFilterFaction] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [density, setDensity] = useState(() => localStorage.getItem('tracker-density') || 'M')
  const [expandedCards, setExpandedCards] = useState(() => new Set())
  const [floating, setFloating] = useState(() => { try { const s = localStorage.getItem('tracker-float'); return s ? JSON.parse(s) : {} } catch { return {} } })
  const [hidden, setHidden] = useState(() => { try { const s = localStorage.getItem('tracker-hidden'); return s ? JSON.parse(s) : {} } catch { return {} } })
  const [eventsDockPos, setEventsDockPos] = useState(() => localStorage.getItem('tracker-events-pos') || 'right')
  const [eventsSize, setEventsSize] = useState(() => { const v = parseInt(localStorage.getItem('tracker-events-size') || '', 10); return Number.isFinite(v) && v > 0 ? v : 280 })
  const eventsResizeRef = useRef(null)
  const mainSplitRef = useRef(null)
  const pollRef = useRef(null)
  const wsRef = useRef(null)
  const mountedRef = useRef(true)

  const persistDensity = (d) => { setDensity(d); try { localStorage.setItem('tracker-density', d) } catch {} }
  const persistEventsPos = (p) => { setEventsDockPos(p); try { localStorage.setItem('tracker-events-pos', p) } catch {} }
  const persistEventsSize = (n) => { setEventsSize(n); try { localStorage.setItem('tracker-events-size', String(n)) } catch {} }

  const detach = (id) => setFloating(p => { const n = { ...p, [id]: { x: 140 + Object.keys(p).length * 32, y: 90 + Object.keys(p).length * 32 } }; try { localStorage.setItem('tracker-float', JSON.stringify(n)) } catch {}; return n })
  const dock   = (id) => setFloating(p => { const n = { ...p }; delete n[id]; try { localStorage.setItem('tracker-float', JSON.stringify(n)) } catch {}; return n })
  const hide   = (id) => setHidden(p => { const n = { ...p, [id]: true }; try { localStorage.setItem('tracker-hidden', JSON.stringify(n)) } catch {}; return n })
  const show   = (id) => setHidden(p => { const n = { ...p }; delete n[id]; try { localStorage.setItem('tracker-hidden', JSON.stringify(n)) } catch {}; return n })

  const PanelCtl = ({ id }) => (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
      <button onClick={() => detach(id)} title="Float panel" style={{ background: 'none', border: `1px solid ${C.blue}50`, cursor: 'pointer', color: C.blue, fontSize: 10, padding: '1px 5px', lineHeight: 1, borderRadius: 4 }}>⬡</button>
      <button onClick={() => hide(id)} title="Hide panel (restore from bar above)" style={{ background: 'none', border: `1px solid ${C.border}`, cursor: 'pointer', color: C.textMuted, fontSize: 12, padding: '0 5px', lineHeight: 1.2, borderRadius: 4 }}>×</button>
    </div>
  )

  const isAdmin = ['owner', 'head_admin', 'admin'].includes(role)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API}/tracker/debug`, { credentials: 'include', headers: getHeaders() })
      if (r.ok) setData(await r.json())
    } catch {}
  }, [])

  const connectWs = useCallback(() => {
    if (!mountedRef.current) return
    if (wsRef.current?.readyState === WebSocket.OPEN) return
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${window.location.host}/ws/tracker`)
    wsRef.current = ws
    ws.onopen = () => {}
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'init') {
          setData(prev => {
            if (!prev?.mod_server_id) return prev
            const sid = prev.mod_server_id
            return {
              ...prev,
              snapshots: (msg.snapshots || []).filter(p => p._server_id === sid),
              events:    (msg.events   || []).filter(ev => ev.server_id  === sid),
            }
          })
        } else if (msg.type === 'snapshot') {
          setData(prev => {
            if (!prev?.mod_server_id) return prev
            if (msg.server_id && prev.mod_server_id !== msg.server_id) return prev
            const map = Object.fromEntries((prev.snapshots || []).map(p => [p.uid || p.name, p]))
            for (const p of (msg.players || [])) {
              const key = p.uid || p.name
              if (key) map[key] = p
            }
            return { ...prev, snapshots: Object.values(map) }
          })
        } else if (msg.type === 'event') {
          setData(prev => {
            if (!prev?.mod_server_id) return prev
            if (msg.server_id && prev.mod_server_id !== msg.server_id) return prev
            return { ...prev, events: [...(prev.events || []), msg.event].slice(-200) }
          })
        }
      } catch {}
    }
    ws.onerror = () => {}
    ws.onclose = () => { if (mountedRef.current) setTimeout(connectWs, 5000) }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    load()
    connectWs()
    pollRef.current = setInterval(load, 15000)
    return () => {
      mountedRef.current = false
      clearInterval(pollRef.current)
      wsRef.current?.close()
    }
  }, [load, connectWs])

  const toggleField = (id) => setFields(prev => prev.map(f => f.id === id ? { ...f, on: !f.on } : f))

  const toggleCard = useCallback((uid) => {
    setExpandedCards(prev => {
      const next = new Set(prev)
      if (next.has(uid)) next.delete(uid)
      else next.add(uid)
      return next
    })
  }, [])

  const collapseAll = () => setExpandedCards(new Set())

  const snapshots = data?.snapshots || []
  const events = [...(data?.events || [])].reverse()
  const wiredUp = data?.wired_up
  const serverRunning = data?.server_running
  const configured = data?.configured !== false
  const modServerId = data?.mod_server_id

  const factions = [...new Set(snapshots.map(p => p.faction).filter(Boolean))]
  const statuses = [...new Set(snapshots.map(p => p.status).filter(Boolean))]

  const filteredPlayers = snapshots.filter(p =>
    (!filterFaction || p.faction === filterFaction) &&
    (!filterStatus || p.status === filterStatus)
  )

  const aliveCount = snapshots.filter(p => p.status === 'alive').length
  const deadCount = snapshots.filter(p => p.status === 'dead').length

  const headerBadge = (() => {
    if (!serverRunning) return { color: '#f87171', bg: '#7f1d1d22', border: '#f8717140', dot: '#f87171', label: 'Server Offline', pulse: false }
    if (!wiredUp)       return { color: '#fb923c', bg: '#7c2d1222', border: '#fb923c40', dot: '#fb923c', label: 'Mod Not Connected', pulse: false }
    return                    { color: '#4ade80', bg: '#14532d22', border: '#4ade8040', dot: '#4ade80', label: 'Live', pulse: true }
  })()

  const cardMin = DENSITY[density]
  const expandedAny = expandedCards.size > 0

  const renderFieldsBody = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', padding: '8px' }}>
      <span style={{ color: C.textMuted, fontSize: sz.stat - 1, textTransform: 'uppercase', letterSpacing: '0.04em', marginRight: 4 }}>Fields</span>
      {fields.map(f => (
        <button key={f.id} onClick={() => toggleField(f.id)} style={{ fontSize: sz.stat - 1, padding: '3px 8px', borderRadius: 4, border: `1px solid ${f.on ? C.accent + '50' : C.border}`, background: f.on ? C.accent + '15' : 'transparent', color: f.on ? C.accent : C.textMuted, cursor: 'pointer', fontWeight: f.on ? 700 : 400 }}>{f.label}</button>
      ))}
    </div>
  )

  const renderPlayersBody = () => (
    <div style={{ padding: 8, height: '100%', overflow: 'auto' }}>
      {filteredPlayers.length === 0
        ? <div style={{ color: C.textMuted, fontSize: sz.base, textAlign: 'center', paddingTop: 48 }}>{wiredUp ? 'No players match filter.' : 'Waiting for mod to connect…'}</div>
        : <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${cardMin}px, 1fr))`, gridAutoRows: 'min-content', gap: 6 }}>
            {filteredPlayers.map((p, i) => {
              const cardId = p.uid || `__${i}`
              return <TrackerPlayerCard key={cardId} player={p} fields={fields} expanded={expandedCards.has(cardId)} onToggle={() => toggleCard(cardId)} C={C} sz={sz} />
            })}
          </div>
      }
    </div>
  )

  const renderEventsBody = () => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '8px 10px', gap: 2 }}>
      {events.length === 0
        ? <div style={{ color: C.textMuted, fontSize: sz.stat, padding: 12, textAlign: 'center' }}>{wiredUp ? 'No events yet' : 'Waiting…'}</div>
        : events.map((ev, i) => <TrackerEventRow key={i} event={ev} C={C} sz={sz} />)
      }
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 8 }}>
      {/* Floating panel portals */}
      {floating.fields && <FloatingPanel title="Fields" onDock={() => dock('fields')} defaultPos={floating.fields}>{renderFieldsBody()}</FloatingPanel>}
      {floating.players && <FloatingPanel title={`Players (${filteredPlayers.length})`} onDock={() => dock('players')} defaultPos={floating.players}>{renderPlayersBody()}</FloatingPanel>}
      {floating.events && <FloatingPanel title={`Events (${events.length})`} onDock={() => dock('events')} defaultPos={floating.events}>{renderEventsBody()}</FloatingPanel>}

      {/* Hidden-panels restore bar */}
      {Object.keys(hidden).length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', padding: '6px 10px', borderRadius: 6, background: C.bgInput, border: `1px solid ${C.border}` }}>
          <span style={{ color: C.textMuted, fontSize: sz.stat - 1, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Hidden:</span>
          {Object.keys(hidden).map(id => (
            <button key={id} onClick={() => show(id)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 5, background: C.accentBg, color: C.accent, border: `1px solid ${C.accent}30`, fontSize: sz.stat - 1, fontWeight: 700, cursor: 'pointer' }}>
              {TRACKER_PANEL_LABELS[id] || id} <span style={{ opacity: 0.6, fontSize: 10 }}>↩</span>
            </button>
          ))}
        </div>
      )}

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ color: C.textBright, fontSize: sz.base + 4, fontWeight: 900, margin: 0 }}>Tracker</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px', borderRadius: 5, background: headerBadge.bg, border: `1px solid ${headerBadge.border}` }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: headerBadge.dot, animation: headerBadge.pulse ? 'pulse 2s infinite' : 'none' }} />
          <span style={{ color: headerBadge.color, fontSize: sz.stat, fontWeight: 700 }}>{headerBadge.label}</span>
        </div>
        {wiredUp && <>
          <span style={{ color: C.textMuted, fontSize: sz.stat }}>
            {snapshots.length} players · <span style={{ color: '#4ade80' }}>{aliveCount} alive</span> · <span style={{ color: '#f87171' }}>{deadCount} dead</span>
          </span>
          {data?.last_rx && <span style={{ color: C.textMuted, fontSize: sz.stat - 1 }}>rx {fmtTs(data.last_rx)}</span>}
        </>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingRight: 4 }}>
            <span style={{ color: C.textMuted, fontSize: sz.stat - 1 }}>Density</span>
            <div style={{ display: 'flex', borderRadius: 5, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
              {Object.keys(DENSITY).map(d => (
                <button key={d} onClick={() => persistDensity(d)} style={{ fontSize: sz.stat - 1, padding: '3px 8px', background: density === d ? C.accent + '20' : 'transparent', color: density === d ? C.accent : C.textMuted, border: 'none', cursor: 'pointer', fontWeight: density === d ? 700 : 400 }}>{d}</button>
              ))}
            </div>
          </div>
          {expandedAny && (
            <button onClick={collapseAll} title="Collapse all expanded cards" style={{ fontSize: sz.stat - 1, padding: '3px 8px', borderRadius: 5, border: `1px solid ${C.border}`, background: 'transparent', color: C.textDim, cursor: 'pointer' }}>Collapse all</button>
          )}
          {isAdmin && (
            <button onClick={() => setShowSettings(true)} title="Settings" style={{ fontSize: sz.stat, padding: '4px 10px', borderRadius: 5, border: `1px solid ${C.border}`, background: 'transparent', color: C.textDim, cursor: 'pointer' }}>⚙</button>
          )}
        </div>
      </div>

      {/* Not-configured banner (per-server mod link missing) */}
      {data && !configured && (
        <div style={{ background: '#7c2d1222', border: `1px solid #fb923c60`, borderLeft: `3px solid #fb923c`, borderRadius: 7, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: '#fb923c', fontSize: sz.stat + 1, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Tracker not linked</div>
            <div style={{ color: C.textMuted, fontSize: sz.stat }}>
              This panel server isn't linked to a PlayerTracker mod instance yet. {isAdmin ? 'Open Settings → Receiver to auto-detect or assign a mod server ID.' : 'Ask an admin to link this server in Tracker Settings.'}
            </div>
          </div>
          {isAdmin && (
            <button onClick={() => setShowSettings(true)} style={{ fontSize: sz.stat, padding: '6px 14px', borderRadius: 5, border: `1px solid #fb923c80`, background: '#fb923c18', color: '#fb923c', cursor: 'pointer', fontWeight: 700, flexShrink: 0 }}>Open Settings</button>
          )}
        </div>
      )}

      {/* Inline field strip */}
      {!floating.fields && !hidden.fields && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', padding: '4px 6px', background: C.bgInput + '40', borderRadius: 6, border: `1px solid ${C.border}` }}>
          <span style={{ color: C.textMuted, fontSize: sz.stat - 1, textTransform: 'uppercase', letterSpacing: '0.04em', marginRight: 4 }}>Fields</span>
          {fields.map(f => (
            <button key={f.id} onClick={() => toggleField(f.id)}
              style={{
                fontSize: sz.stat - 1,
                padding: '3px 8px',
                borderRadius: 4,
                border: `1px solid ${f.on ? C.accent + '50' : C.border}`,
                background: f.on ? C.accent + '15' : 'transparent',
                color: f.on ? C.accent : C.textMuted,
                cursor: 'pointer',
                fontWeight: f.on ? 700 : 400,
                transition: 'all 120ms',
              }}>{f.label}</button>
          ))}
          <div style={{ marginLeft: 'auto' }}><PanelCtl id="fields" /></div>
        </div>
      )}

      {/* Filter strip — only when there's something to filter */}
      {(factions.length > 1 || statuses.length > 1) && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ color: C.textMuted, fontSize: sz.stat - 1 }}>Filter:</span>
          {factions.length > 1 && ['', ...factions].map(f => (
            <button key={'f' + (f || '__all')} onClick={() => setFilterFaction(f)} style={{ fontSize: sz.stat - 1, padding: '2px 8px', borderRadius: 4, border: `1px solid ${filterFaction === f ? C.accent + '60' : C.border}`, background: filterFaction === f ? C.accent + '15' : 'transparent', color: filterFaction === f ? C.accent : C.textMuted, cursor: 'pointer' }}>
              {f || 'All factions'}
            </button>
          ))}
          {statuses.length > 1 && ['', ...statuses].map(s => (
            <button key={'s' + (s || '__all')} onClick={() => setFilterStatus(s)} style={{ fontSize: sz.stat - 1, padding: '2px 8px', borderRadius: 4, border: `1px solid ${filterStatus === s ? C.accent + '60' : C.border}`, background: filterStatus === s ? C.accent + '15' : 'transparent', color: filterStatus === s ? C.accent : C.textMuted, cursor: 'pointer' }}>
              {s || 'All statuses'}
            </button>
          ))}
        </div>
      )}

      {/* Main split: players + events (right or bottom) */}
      <div ref={mainSplitRef} style={{ flex: 1, display: 'flex', flexDirection: eventsDockPos === 'bottom' ? 'column' : 'row', gap: 8, minHeight: 0 }}>
        {!floating.players && !hidden.players && (
          <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ color: C.textMuted, fontSize: sz.stat - 1, textTransform: 'uppercase', letterSpacing: '0.05em', flex: 1 }}>Players ({filteredPlayers.length})</span>
              <PanelCtl id="players" />
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
              {filteredPlayers.length === 0
                ? <div style={{ color: C.textMuted, fontSize: sz.base, textAlign: 'center', paddingTop: 48 }}>{wiredUp ? 'No players match filter.' : 'Waiting for mod to connect…'}</div>
                : <div style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(auto-fill, minmax(${cardMin}px, 1fr))`,
                    gridAutoRows: 'min-content',
                    gap: 6,
                  }}>
                    {filteredPlayers.map((p, i) => {
                      const cardId = p.uid || `__${i}`
                      return (
                        <TrackerPlayerCard
                          key={cardId}
                          player={p}
                          fields={fields}
                          expanded={expandedCards.has(cardId)}
                          onToggle={() => toggleCard(cardId)}
                          C={C} sz={sz}
                        />
                      )
                    })}
                  </div>
              }
            </div>
          </div>
        )}
        {!floating.events && !hidden.events && (
          <div style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0,
            background: C.bgInput + '40',
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: '8px 10px',
            minHeight: 0,
            ...(eventsDockPos === 'right'
              ? { width: Math.max(180, eventsSize), height: '100%' }
              : { height: Math.max(120, eventsSize), width: '100%' }),
          }}>
            {/* Resize handle — left edge (right-dock) or top edge (bottom-dock) */}
            <div
              onMouseDown={(e) => {
                e.preventDefault()
                const startX = e.clientX, startY = e.clientY, startSize = eventsSize
                const move = (ev) => {
                  const container = mainSplitRef.current
                  const max = container ? (eventsDockPos === 'right' ? container.clientWidth - 220 : container.clientHeight - 140) : 1200
                  const delta = eventsDockPos === 'right' ? (startX - ev.clientX) : (startY - ev.clientY)
                  const next = Math.min(max, Math.max(eventsDockPos === 'right' ? 180 : 120, startSize + delta))
                  persistEventsSize(next)
                }
                const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); document.body.style.cursor = '' }
                window.addEventListener('mousemove', move)
                window.addEventListener('mouseup', up)
                document.body.style.cursor = eventsDockPos === 'right' ? 'ew-resize' : 'ns-resize'
              }}
              title={eventsDockPos === 'right' ? 'Drag to resize width' : 'Drag to resize height'}
              style={{
                position: 'absolute',
                ...(eventsDockPos === 'right'
                  ? { left: -5, top: 0, bottom: 0, width: 10, cursor: 'ew-resize' }
                  : { top: -5, left: 0, right: 0, height: 10, cursor: 'ns-resize' }),
                zIndex: 2,
              }}
              onMouseEnter={e => e.currentTarget.style.background = C.accent + '20'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ color: C.textMuted, fontSize: sz.stat - 1, textTransform: 'uppercase', letterSpacing: '0.05em', flex: 1 }}>Events ({events.length})</span>
              <button
                onClick={() => persistEventsPos(eventsDockPos === 'right' ? 'bottom' : 'right')}
                title={`Dock ${eventsDockPos === 'right' ? 'to bottom' : 'to right'}`}
                style={{ background: 'none', border: `1px solid ${C.border}`, cursor: 'pointer', color: C.textMuted, fontSize: 10, padding: '1px 5px', lineHeight: 1.2, borderRadius: 4 }}
              >{eventsDockPos === 'right' ? '▼' : '▶'}</button>
              <PanelCtl id="events" />
            </div>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {events.length === 0
                ? <div style={{ color: C.textMuted, fontSize: sz.stat, padding: 12, textAlign: 'center' }}>{wiredUp ? 'No events yet' : 'Waiting…'}</div>
                : events.map((ev, i) => <TrackerEventRow key={i} event={ev} C={C} sz={sz} />)
              }
            </div>
          </div>
        )}
      </div>

      {isAdmin && <SettingsModal open={showSettings} onClose={() => setShowSettings(false)} role={role} C={C} sz={sz} />}
    </div>
  )
}
