import { useState, useEffect, useRef, useCallback } from 'react'
import { getHeaders, on401, tryRefresh } from './api.js'

export function useFetch(url,interval=null){const[data,setData]=useState(null);const[loading,setLoading]=useState(true);const goRef=useRef(null)
  useEffect(()=>{let on=true;const go=async()=>{try{let r=await fetch(url,{headers:getHeaders()});if(r.status===401){const ok=await tryRefresh();if(!ok)return;r=await fetch(url,{headers:getHeaders()});if(r.status===401){on401();return}};const j=await r.json();if(on){setData(j);setLoading(false)}}catch{if(on)setLoading(false)}};goRef.current=go;go()
    if(interval){const id=setInterval(go,interval);return()=>{on=false;clearInterval(id)}};return()=>{on=false}},[url,interval]);const refetch=useCallback(()=>goRef.current?.(),[]);return{data,loading,refetch}}
export function useFetchOnce(url){const[data,setData]=useState(null);const[loading,setLoading]=useState(true);const onRef=useRef(true)
  useEffect(()=>{onRef.current=true;return()=>{onRef.current=false}},[])
  const reload=useCallback(async()=>{try{let r=await fetch(url,{headers:getHeaders()});if(r.status===401){const ok=await tryRefresh();if(!ok)return;r=await fetch(url,{headers:getHeaders()});if(r.status===401){on401();return}};const j=await r.json();if(onRef.current){setData(j);setLoading(false)}}catch{if(onRef.current)setLoading(false)}},[url])
  useEffect(()=>{reload()},[reload]);return{data,loading,reload}}
export function useHistory(maxLen=60){const[history,setHistory]=useState([])
  const push=useCallback(entry=>{setHistory(prev=>{const next=[...prev,{...entry,t:Date.now()}];return next.length>maxLen?next.slice(-maxLen):next})},[maxLen]);return{history,push}}
export function useMobile(){const[m,s]=useState(window.innerWidth<768);useEffect(()=>{const h=()=>s(window.innerWidth<768);window.addEventListener('resize',h);return()=>window.removeEventListener('resize',h)},[]);return m}
let _tid=0
export function useToast(){const[toasts,setToasts]=useState([]);const timers=useRef({});const dismiss=useCallback(id=>{clearTimeout(timers.current[id]);delete timers.current[id];setToasts(p=>p.filter(t=>t.id!==id))},[]);const push=useCallback((msg,v='default')=>{const id=++_tid;setToasts(p=>[...p,{id,msg,v}]);timers.current[id]=setTimeout(()=>{delete timers.current[id];setToasts(p=>p.filter(t=>t.id!==id))},3500)},[]);return{toasts,push,dismiss}}
