import { useState, useEffect, useCallback } from 'react'
import { useT } from '../ctx.jsx'
import { API, authHeaders, on401 } from '../api.js'
import { Btn, Card } from '../components/ui.jsx'

const STATUS_META = {
  ok:   { label: 'OK',   symbol: '●' },
  warn: { label: 'WARN', symbol: '▲' },
  fail: { label: 'FAIL', symbol: '■' },
}

const AUTO_FIXABLE = new Set(['panel_data_writable', 'aigm_bridge_service', 'player_tracker_service'])

const statusColor = (C, status) =>
  status === 'ok'   ? C.accent
  : status === 'warn' ? C.orange
  : status === 'fail' ? C.red
  : C.textMuted

export default function System({toast, authUser}){
  const {C, sz} = useT()
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copiedId, setCopiedId] = useState('')
  const [fixing, setFixing] = useState({})
  const [fixResult, setFixResult] = useState({})

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const r = await fetch(`${API}/system/diagnostics`, {headers: authHeaders()})
      if (r.status === 401) { on401(); return }
      if (r.status === 403) { setError('Access denied'); setReport(null); return }
      const j = await r.json()
      if (j.error) { setError(j.error); setReport(null); return }
      setReport(j)
    } catch (e) {
      setError(e.message || 'Failed to load diagnostics')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const id = setInterval(load, 15000)
    return () => clearInterval(id)
  }, [load])

  const copy = async (text, id) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(id)
      setTimeout(() => setCopiedId(''), 1500)
      toast?.('Copied to clipboard')
    } catch {
      toast?.('Clipboard access denied', 'danger')
    }
  }

  const fix = async (checkId) => {
    setFixing(f => ({...f, [checkId]: true}))
    setFixResult(r => ({...r, [checkId]: null}))
    try {
      const r = await fetch(`${API}/system/fix/${checkId}`, {
        method: 'POST',
        headers: authHeaders(),
      })
      const j = await r.json()
      if (j.ok) {
        setFixResult(fr => ({...fr, [checkId]: {ok: true}}))
        toast?.('Fix applied — refreshing…')
        setTimeout(load, 1200)
      } else {
        setFixResult(fr => ({...fr, [checkId]: {error: j.error || 'Fix failed'}}))
        toast?.(j.error || 'Fix failed', 'danger')
      }
    } catch (e) {
      setFixResult(fr => ({...fr, [checkId]: {error: e.message}}))
      toast?.(e.message, 'danger')
    } finally {
      setFixing(f => ({...f, [checkId]: false}))
    }
  }

  const overall = report?.overall || (loading ? 'loading' : 'fail')
  const overallColor = statusColor(C, overall)

  return <div className="space-y-3">
    <div className="flex items-center justify-between flex-wrap gap-2">
      <h2 className="font-black" style={{color: C.textBright, fontSize: sz.base + 4}}>System Health</h2>
      <div className="flex items-center gap-2">
        {report && <span className="font-mono" style={{color: C.textMuted, fontSize: sz.stat}}>
          {report.fails} fail · {report.warns} warn · {report.checks.length} total
        </span>}
        <Btn small v="ghost" onClick={load} disabled={loading}>{loading ? 'Checking…' : 'Refresh'}</Btn>
      </div>
    </div>

    <Card className="p-5">
      <div className="flex items-center gap-4 flex-wrap">
        <div style={{
          width: 14, height: 14, borderRadius: '50%',
          background: overallColor,
          boxShadow: `0 0 18px ${overallColor}80`,
        }}/>
        <div className="flex-1 min-w-0">
          <div className="font-black uppercase tracking-wide" style={{color: overallColor, fontSize: sz.base}}>
            {overall === 'ok' ? 'All systems operational'
              : overall === 'warn' ? 'Minor issues detected'
              : overall === 'fail' ? 'Action required'
              : 'Loading…'}
          </div>
          <div style={{color: C.textMuted, fontSize: sz.stat}}>
            Auto-refreshes every 15s · diagnostics run on panel startup and on demand
          </div>
        </div>
      </div>
      {error && <div className="mt-3 px-3 py-2 rounded-lg font-mono" style={{
        background: C.red + '18', color: C.red, fontSize: sz.stat,
        border: `1px solid ${C.red}40`
      }}>{error}</div>}
    </Card>

    {report && <div className="space-y-2">
      {report.checks.map(c => {
        const color = statusColor(C, c.status)
        const meta = STATUS_META[c.status] || {label: c.status.toUpperCase(), symbol: '?'}
        const canFix = AUTO_FIXABLE.has(c.id) && c.status !== 'ok'
        const fr = fixResult[c.id]
        return <Card key={c.id} className="p-4">
          <div className="flex items-start gap-3 flex-wrap">
            <div className="flex items-center gap-2" style={{minWidth: 70}}>
              <span style={{color, fontSize: sz.base + 2}}>{meta.symbol}</span>
              <span className="font-black uppercase tracking-wide" style={{color, fontSize: sz.stat}}>{meta.label}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold" style={{color: C.textBright, fontSize: sz.base}}>{c.label}</div>
              {c.detail && <div className="font-mono mt-1" style={{color: C.textMuted, fontSize: sz.stat, wordBreak: 'break-all'}}>{c.detail}</div>}
              {fr?.error && <div className="mt-1 font-mono" style={{color: C.red, fontSize: sz.stat}}>{fr.error}</div>}
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                {canFix && <Btn small v="primary" onClick={() => fix(c.id)} disabled={fixing[c.id]}>
                  {fixing[c.id] ? 'Fixing…' : 'Fix'}
                </Btn>}
                {c.fix && !canFix && <>
                  <div className="font-mono px-2 py-1 rounded" style={{
                    background: C.bgInput, color: C.textBright, fontSize: sz.stat,
                    border: `1px solid ${C.border}`
                  }}>{c.fix}</div>
                  <Btn small v="ghost" onClick={() => copy(c.fix, c.id)}>
                    {copiedId === c.id ? 'Copied' : 'Copy'}
                  </Btn>
                </>}
                {c.fix && canFix && <Btn small v="ghost" onClick={() => copy(c.fix, c.id)}>
                  {copiedId === c.id ? 'Copied' : 'Copy cmd'}
                </Btn>}
              </div>
            </div>
          </div>
        </Card>
      })}
    </div>}

    <Card className="p-4">
      <div className="font-black uppercase tracking-wide mb-2" style={{color: C.textDim, fontSize: sz.label}}>
        Manual update
      </div>
      <div style={{color: C.textMuted, fontSize: sz.stat}} className="mb-2">
        Pull the latest code, refresh the sudoers rule, rebuild, and restart in one shot:
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <code className="font-mono px-3 py-2 rounded flex-1" style={{
          background: C.bgInput, color: C.textBright, fontSize: sz.stat,
          border: `1px solid ${C.border}`
        }}>sudo /opt/panel/scripts/update.sh</code>
        <Btn small v="ghost" onClick={() => copy('sudo /opt/panel/scripts/update.sh', 'update')}>
          {copiedId === 'update' ? 'Copied' : 'Copy'}
        </Btn>
      </div>
    </Card>
  </div>
}
