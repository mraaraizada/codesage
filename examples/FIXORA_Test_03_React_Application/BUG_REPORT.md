# FIXORA Test 03 — Seeded Bug Register

| ID | Area | Reproduction | Expected | Actual |
|---|---|---|---|---|
| R03-01 | Login routing | Submit valid login | Navigate to `/dashboard` | Navigates to missing `/home` |
| R03-02 | Logout state | Login, then log out; refresh | Remain signed out | Persisted `fixora_user` restores session |
| R03-03 | Protected route | Login then open dashboard | Authenticated user can access dashboard | Route checks unrelated `fixora_session` key |
| R03-04 | Profile persistence | Rename profile then refresh | Updated name remains | Old name is restored |

## Required regression checks
- Login reaches dashboard.
- Logout clears both in-memory and persisted authentication state.
- Unauthenticated users cannot access protected routes.
- Authenticated users can access protected routes.
- Profile edits survive refresh.
