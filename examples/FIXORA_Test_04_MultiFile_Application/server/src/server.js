import http from 'node:http';
import {listTasks,createTask,updateTask,deleteTask,getSummary} from './services/taskService.js';
const PORT=4000;
const send=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json','access-control-allow-origin':'*','access-control-allow-headers':'content-type','access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS'});res.end(JSON.stringify(data))};
const server=http.createServer(async(req,res)=>{
 if(req.method==='OPTIONS')return send(res,204,{});
 const url=new URL(req.url,'http://localhost');
 if(req.method==='GET'&&url.pathname==='/api/tasks')return send(res,200,{tasks:listTasks()});
 if(req.method==='GET'&&url.pathname==='/api/summary')return send(res,200,getSummary());
 const match=url.pathname.match(/^\/api\/tasks\/([^/]+)$/);
 if(match&&req.method==='PATCH'){let body='';for await(const chunk of req)body+=chunk;const task=updateTask(match[1],JSON.parse(body||'{}'));return send(res,task?200:404,task||{error:'Task not found'})}
 if(match&&req.method==='DELETE')return send(res,deleteTask(match[1])?200:404,{ok:true});
 if(req.method==='POST'&&url.pathname==='/api/tasks'){let body='';for await(const chunk of req)body+=chunk;try{return send(res,201,createTask(JSON.parse(body||'{}')))}catch(e){return send(res,400,{error:e.message})}}
 return send(res,404,{error:'Not found'});
});
server.listen(PORT,()=>console.log(`FIXORA API listening on http://localhost:${PORT}`));
