# FIXORA — Test 04: Multi-file Application

A cross-layer task-management sample designed to evaluate multi-file dependency tracing, API/business logic debugging, UI state synchronization, and regression testing.

## Requirements
- Node.js 20+ and npm
- Two terminal processes are started by the root `npm run dev` script.

## Setup
```bash
npm install
npm run install:all
npm run dev
```
Frontend: http://localhost:5173
API: http://localhost:4000

Run checks:
```bash
npm test
npm run build
```

## Architecture
- `client/`: React/Vite interface, API client, task hooks and components.
- `server/`: Node HTTP API, task service, in-memory repository and tests.
- Shared behavior crosses UI components, API client, routes and backend service.

## Intentional challenge defects
1. Task status changes are not persisted correctly by the service.
2. Summary total count excludes completed tasks.
3. Delete succeeds on the server but stale UI state keeps the task visible.
4. `completed` is incorrectly mapped to `pending` in the status adapter.
5. Task creation is the required regression path and must remain functional after fixes.
