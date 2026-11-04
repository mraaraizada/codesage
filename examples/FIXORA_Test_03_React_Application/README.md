# FIXORA — Test 03: React Application

A deliberately imperfect React/Vite application for evaluating FIXORA's ability to inspect component logic, state management, authentication, and client-side routing.

## Run
```bash
npm install
npm run dev
npm test
npm run build
```
Open the Vite URL shown in the terminal. Demo credentials are prefilled on the login screen.

## Evaluation scope
- React component composition and props/state
- Context-based authentication
- Local-storage persistence
- Protected routes and navigation
- Profile update flow
- Regression tests

## Seeded defects (expected to be discovered and fixed)
1. Login redirects to `/home`, which is not a registered route.
2. Logout clears React state but leaves the persisted user session.
3. ProtectedRoute checks `fixora_session` while AuthContext stores `fixora_user`.
4. Profile edits update React state but not local storage.

These defects are intentional challenge fixtures, not claims of a production-ready app. Use the test suite as a regression baseline; tests covering the defects will fail until corrected.
