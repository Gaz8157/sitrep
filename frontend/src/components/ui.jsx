import { useState, useRef, useEffect } from 'react'
import { useT } from '../ctx.jsx'
import { SRC_COLORS, SRC_LABELS } from '../constants.js'
import { useMobile } from '../hooks.js'

export function Badge({text,v='default',pulse}){const{C}=useT();const vs={default:{bg:C.accentBg,text:C.accent,bd:C.accent+'30'},danger:{bg:C.redBg,text:C.red,bd:C.redBorder},warning:{bg:C.orangeBg,text:C.orange,bd:C.orange+'30'},info:{bg:C.blueBg,text:C.blue,bd:C.blue+'30'},dim:{bg:C.textMuted+'08',text:C.textDim,bd:C.textMuted+'20'}};const s=vs[v]||vs.default
  return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded font-bold uppercase tracking-wider leading-none" style={{background:s.bg,color:s.text,border:`1px solid ${s.bd}`,fontSize:9}}>{pulse&&<span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{background:s.text}}/>}{text}</span>}
export function Btn({children,v='default',small,onClick,disabled,className=''}){const{C,sz}=useT();const vs={default:{bg:C.accentBg,text:C.accent,bd:C.accent+'30'},danger:{bg:C.redBg,text:C.red,bd:C.redBorder},warning:{bg:C.orangeBg,text:C.orange,bd:C.orange+'30'},info:{bg:C.blueBg,text:C.blue,bd:C.blue+'30'},ghost:{bg:'transparent',text:C.textDim,bd:C.border}};const s=vs[v]||vs.default
  return <button onClick={onClick} disabled={disabled} className={`inline-flex items-center justify-center gap-1.5 font-bold rounded-lg transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.97] ${small?'px-3 py-1.5':'px-4 py-2'} ${className}`} style={{background:s.bg,color:s.text,border:`1px solid ${s.bd}`,fontSize:small?sz.label:sz.base-1}} onMouseEnter={e=>e.currentTarget.style.filter='brightness(1.3)'} onMouseLeave={e=>e.currentTarget.style.filter='brightness(1)'}>{children}</button>}
export function Card({children,className='',onClick}){const{C}=useT();return <div onClick={onClick} className={`rounded-xl transition-all ${onClick?'cursor-pointer':''} ${className}`} style={{background:C.bgCard,border:`1px solid ${C.border}`}}>{children}</div>}
export function StatBox({label,value,sub,warn,onFloat,onHide}){const{C,sz}=useT();const mobile=useMobile();return <Card className="p-4 flex-1 min-w-[120px]"><div className="flex items-center justify-between mb-2"><div className="font-bold uppercase tracking-widest" style={{color:C.textDim,fontSize:sz.stat}}>{label}</div>{!mobile&&(onFloat||onHide)&&<div className="flex items-center gap-1"><button onClick={onFloat} title="Float panel" style={{background:'none',border:`1px solid ${C.blue}50`,cursor:'pointer',color:C.blue,fontSize:11,padding:'1px 4px',lineHeight:1,borderRadius:4}}>⬡</button><button onClick={onHide} title="Hide panel" style={{background:'none',border:`1px solid ${C.border}`,cursor:'pointer',color:C.textMuted,fontSize:13,padding:'0px 4px',lineHeight:1.2,borderRadius:4}}>×</button></div>}</div><div className="font-black leading-none tracking-tight" style={{color:warn?C.red:C.textBright,fontSize:sz.value}}>{value||'--'}</div>{sub&&<div className="mt-1.5" style={{color:C.textMuted,fontSize:sz.stat}}>{sub}</div>}</Card>}
export function Bar({pct,color,height=4}){const{C}=useT();return <div className="rounded-full overflow-hidden" style={{height,background:C.border}}><div className="h-full rounded-full transition-all duration-700" style={{width:`${Math.min(100,pct)}%`,background:color||C.accent}}/></div>}
export function Toggle({value,onChange,label}){const{C,sz}=useT();return <div className="flex items-center justify-between mb-3">{label&&<label className="font-bold uppercase tracking-wide" style={{color:C.textDim,fontSize:sz.label}}>{label}</label>}<div onClick={onChange} className="rounded-full cursor-pointer transition-colors relative" style={{background:value?C.accent:C.border,width:40,height:22}}><div className="rounded-full bg-white absolute transition-all" style={{width:16,height:16,top:3,left:value?21:3}}/></div></div>}
export function SrcTag({source}){const color=SRC_COLORS[source]||'#5a6a7a';const label=SRC_LABELS[source]||source?.slice(0,3)||'???';return <span className="inline-flex items-center justify-center min-w-[38px] px-1.5 py-[2px] rounded font-black" style={{color,background:color+'0a',border:`1px solid ${color}25`,fontSize:8}}>{label}</span>}
export function Input({label,value,onChange,type='text',placeholder,mono}){const{C,sz}=useT();const[show,setShow]=useState(false);const isPw=type==='password'
  return <div className="mb-3">{label&&<label className="block font-bold uppercase tracking-wide mb-1.5" style={{color:C.textDim,fontSize:sz.label}}>{label}</label>}<div className="relative"><input type={isPw?(show?'text':'password'):type} value={value??''} onChange={e=>onChange(e.target.value)} placeholder={placeholder} className={`w-full rounded-lg px-3 py-2.5 outline-none transition-colors placeholder:opacity-30 ${isPw?'pr-9':''} ${mono?'font-mono':''}`} style={{background:C.bgInput,border:`1px solid ${C.border}`,color:C.text,fontSize:sz.input}} onFocus={e=>e.target.style.borderColor=C.accent+'80'} onBlur={e=>e.target.style.borderColor=C.border}/>{isPw&&<button type="button" onClick={()=>setShow(!show)} className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer" style={{color:C.textDim,fontSize:sz.label}}>{show?'Hide':'Show'}</button>}</div></div>}
export function Empty({title,sub}){const{C,sz}=useT();return <Card className="p-12 text-center"><div className="mb-1" style={{color:C.textDim,fontSize:sz.base+2}}>{title}</div>{sub&&<div style={{color:C.textMuted,fontSize:sz.base}}>{sub}</div>}</Card>}
export function Modal({open,onClose,title,children}){const{C,sz}=useT();if(!open)return null;return <div onClick={onClose} className="fixed inset-0 z-[1000] flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.7)',backdropFilter:'blur(8px)'}}><div onClick={e=>e.stopPropagation()} className="rounded-xl shadow-2xl max-w-[95vw] w-[480px] max-h-[85vh] overflow-auto" style={{background:C.bgCard,border:`1px solid ${C.border}`}}><div className="flex items-center justify-between px-5 py-4" style={{borderBottom:`1px solid ${C.border}`}}><span className="font-black" style={{color:C.textBright,fontSize:sz.base+2}}>{title}</span><button onClick={onClose} className="cursor-pointer text-lg hover:opacity-70" style={{color:C.textDim}}>X</button></div><div className="p-5">{children}</div></div></div>}
export function Toasts({toasts,dismiss}){const{C}=useT();if(!toasts.length)return null;const vs={default:{bg:C.accentBg,text:C.accent,bd:C.accent+'30'},danger:{bg:C.redBg,text:C.red,bd:C.redBorder},warning:{bg:C.orangeBg,text:C.orange,bd:C.orange+'30'},info:{bg:C.blueBg,text:C.blue,bd:C.blue+'30'}};return <div className="fixed right-4 z-[9999] flex flex-col gap-2" style={{top:60}}>{toasts.map(t=>{const s=vs[t.v]||vs.default;return <div key={t.id} className="toast-item px-4 py-2.5 rounded-lg font-bold shadow-xl" style={{background:s.bg,color:s.text,border:`1px solid ${s.bd}`,fontSize:12,display:'flex',alignItems:'center',gap:10,position:'relative',paddingRight:32}}>{t.msg}<button className="toast-x" onClick={()=>dismiss(t.id)} style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',color:s.text,cursor:'pointer',fontSize:15,fontWeight:900,lineHeight:1,opacity:0,transition:'opacity 0.15s',padding:'2px 4px'}}>x</button></div>})}</div>}

export function FloatingPanel({title,onDock,children,defaultPos}){
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
