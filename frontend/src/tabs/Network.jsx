import { useEffect } from 'react'
import { AreaChart, Area, Tooltip, ResponsiveContainer } from 'recharts'
import { useT } from '../ctx.jsx'
import { API } from '../api.js'
import { useFetch, useFetchOnce, useHistory, useMobile } from '../hooks.js'
import { Btn, Card } from '../components/ui.jsx'

export default function Network({toast}){const{C,sz}=useT();const mobile=useMobile();const{data:rcon}=useFetch(`${API}/rcon/status`,5000);const{data:config}=useFetchOnce(`${API}/config`);const{data:net}=useFetch(`${API}/network`,3000);const{data:portsData,loading:portsLoading,reload:reloadPorts}=useFetchOnce(`${API}/server/ports`);const{history:bwHist,push:pushBw}=useHistory(60);const rc=config?.rcon||{},a2s=config?.a2s||{};const fmt=b=>{if(!b)return'0 B';const g=b/(1024**3);if(g>=1)return`${g.toFixed(1)} GB`;const m=b/(1024**2);return m>=1?`${m.toFixed(1)} MB`:`${(b/1024).toFixed(1)} KB`}
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
