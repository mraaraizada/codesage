const seed=[
 {id:'T-100',title:'Review onboarding flow',status:'pending',priority:'high'},
 {id:'T-101',title:'Fix notification badge',status:'in_progress',priority:'medium'},
 {id:'T-102',title:'Prepare release notes',status:'completed',priority:'low'}
];
let tasks=seed.map(t=>({...t}));
export const repository={
 all(){return tasks.map(t=>({...t}))},
 find(id){const task=tasks.find(t=>t.id===id);return task?{...task}:null},
 create(input){const task={id:`T-${Date.now()}`,status:'pending',priority:'medium',...input};tasks.push(task);return {...task}},
 update(id,patch){const i=tasks.findIndex(t=>t.id===id);if(i<0)return null;tasks[i]={...tasks[i],...patch};return {...tasks[i]}},
 remove(id){const before=tasks.length;tasks=tasks.filter(t=>t.id!==id);return tasks.length<before},
 reset(){tasks=seed.map(t=>({...t}))}
};
