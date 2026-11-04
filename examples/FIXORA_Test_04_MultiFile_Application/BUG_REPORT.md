# FIXORA Test 04 — Seeded Bug Register

| ID | Layer | Defect | Expected behavior |
|---|---|---|---|
| M04-01 | Backend service | `updateTask` removes status from the update payload | Persist valid status changes |
| M04-02 | Backend summary | `total` excludes completed tasks | Total equals all task records |
| M04-03 | Frontend hook | Delete does not refresh local state | Deleted task disappears immediately |
| M04-04 | Frontend adapter | `completed` maps to `pending` | Preserve canonical status values |
| M04-05 | Regression | Task creation is a required control | Create still works after all fixes |

## Cross-file trace
`TaskList` → `useTasks` → `taskApi` → HTTP route → `taskService` → `taskRepository`.
Summary travels through `taskApi.summary` → `taskService.getSummary` → `Summary`.
Status display travels through `TaskList` → `statusLabel`.

## Acceptance criteria
- Create a task and verify it appears in the list and summary.
- Change pending → in progress → completed; verify persistence after refresh.
- Total equals the number of all tasks, including completed tasks.
- Delete a task; verify it disappears without a manual page reload.
- Completed tasks display as completed.
- Run tests and production build after fixes.
