export const API = '/api'

let _serverId = null
export const setServerId = id => { _serverId = id }
export const authHeaders = () => ({
  'Content-Type': 'application/json',
  ...(_serverId ? {'X-Server-ID': String(_serverId)} : {})
})
export const getHeaders = () => ({
  ...(_serverId ? {'X-Server-ID': String(_serverId)} : {})
})
export const on401 = () => window.dispatchEvent(new Event('sitrep-401'))
let _refreshing = false
export const tryRefresh = async () => {
  if (_refreshing) return false
  _refreshing = true
  try { const r = await fetch(`${API}/auth/refresh`,{method:'POST'}); if(r.ok) return true; on401(); return false }
  catch { on401(); return false }
  finally { _refreshing = false }
}
export const post=async(url,body)=>{try{const r=await fetch(url,{method:'POST',headers:authHeaders(),body:body?JSON.stringify(body):undefined});if(r.status===401){const ok=await tryRefresh();if(ok){const r2=await fetch(url,{method:'POST',headers:authHeaders(),body:body?JSON.stringify(body):undefined});if(r2.status===401){on401();return{error:'Not authenticated'}};return await r2.json()};return{error:'Not authenticated'}};return await r.json()}catch(e){return{error:e.message}}}
export const put=async(url,body)=>{try{const r=await fetch(url,{method:'PUT',headers:authHeaders(),body:JSON.stringify(body)});if(r.status===401){const ok=await tryRefresh();if(ok){const r2=await fetch(url,{method:'PUT',headers:authHeaders(),body:JSON.stringify(body)});if(r2.status===401){on401();return{error:'Not authenticated'}};return await r2.json()};return{error:'Not authenticated'}};return await r.json()}catch(e){return{error:e.message}}}
export const del=async(url)=>{try{const r=await fetch(url,{method:'DELETE',headers:authHeaders()});if(r.status===401){const ok=await tryRefresh();if(ok){const r2=await fetch(url,{method:'DELETE',headers:authHeaders()});if(r2.status===401){on401();return{error:'Not authenticated'}};return await r2.json()};return{error:'Not authenticated'}};return await r.json()}catch(e){return{error:e.message}}}
