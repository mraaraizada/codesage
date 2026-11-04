// Convert backend status into the UI's status vocabulary.
export function statusLabel(status){
  // INTENTIONAL DEFECT: completed status is displayed as pending.
  if(status==='completed')return 'pending';
  return status;
}
