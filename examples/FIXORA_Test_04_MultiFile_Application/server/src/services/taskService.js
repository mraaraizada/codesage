import {repository} from '../repository/taskRepository.js';
export function listTasks(){return repository.all()}
export function createTask(input){if(!input?.title?.trim())throw new Error('Task title is required');return repository.create({title:input.title.trim(),priority:input.priority||'medium'})}
export function updateTask(id,patch){
  // INTENTIONAL DEFECT: status updates are acknowledged but the stored status is unchanged.
  const safePatch={...patch};if(safePatch.status)delete safePatch.status;
  return repository.update(id,safePatch);
}
export function deleteTask(id){return repository.remove(id)}
export function getSummary(){
  const tasks=repository.all();
  // INTENTIONAL DEFECT: total excludes completed tasks.
  return {total:tasks.filter(t=>t.status!=='completed').length,completed:tasks.filter(t=>t.status==='completed').length,pending:tasks.filter(t=>t.status==='pending').length};
}
