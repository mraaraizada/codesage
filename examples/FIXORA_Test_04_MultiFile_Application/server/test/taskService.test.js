import test from 'node:test';import assert from 'node:assert/strict';
import {repository} from '../src/repository/taskRepository.js';
import {listTasks,createTask,updateTask,deleteTask,getSummary} from '../src/services/taskService.js';
test('task creation remains available',()=>{repository.reset();const task=createTask({title:'Regression task'});assert.equal(task.title,'Regression task');assert.ok(listTasks().some(t=>t.id===task.id))});
test('status changes persist',()=>{repository.reset();const task=listTasks()[0];updateTask(task.id,{status:'completed'});assert.equal(repository.find(task.id).status,'completed')});
test('summary total includes every task',()=>{repository.reset();assert.equal(getSummary().total,listTasks().length)});
test('deleting a task removes it',()=>{repository.reset();const task=listTasks()[0];assert.equal(deleteTask(task.id),true);assert.equal(repository.find(task.id),null)});
