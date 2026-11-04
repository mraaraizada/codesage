const BASE='http://localhost:4000/api';
async function request(path,options={}){const res=await fetch(`${BASE}${path}`,{headers:{'content-type':'application/json'},...options});const data=await res.json();if(!res.ok)throw new Error(data.error||'Request failed');return data}
export const taskApi={list:()=>request('/tasks'),summary:()=>request('/summary'),create:title=>request('/tasks',{method:'POST',body:JSON.stringify({title})}),update:(id,patch)=>request(`/tasks/${id}`,{method:'PATCH',body:JSON.stringify(patch)}),remove:id=>request(`/tasks/${id}`,{method:'DELETE'})};
