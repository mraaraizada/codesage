import {useCallback,useEffect,useState} from 'react';import{taskApi}from'../api/tasks.js';
export function useTasks(){
 const [tasks,setTasks]=useState([]);const [summary,setSummary]=useState({total:0,completed:0,pending:0});const [error,setError]=useState('');
 const refresh=useCallback(async()=>{try{const [a,b]=await Promise.all([taskApi.list(),taskApi.summary()]);setTasks(a.tasks);setSummary(b);setError('')}catch(e){setError(e.message)}},[]);
 useEffect(()=>{refresh()},[refresh]);
 const create=async title=>{try{await taskApi.create(title);await refresh()}catch(e){setError(e.message)}};
 const changeStatus=async(id,status)=>{try{await taskApi.update(id,{status});await refresh()}catch(e){setError(e.message)}};
 const remove=async id=>{try{await taskApi.remove(id);/* INTENTIONAL DEFECT: local task list is not refreshed after deletion. */}catch(e){setError(e.message)}};
 return {tasks,summary,error,create,changeStatus,remove};
}
