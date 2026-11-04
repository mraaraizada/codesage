# Bug Report — User API cannot find existing users

## Summary
The Node.js User API returns 404 for valid user IDs.

## Steps to reproduce
1. Start the API using `npm start`.
2. Send `GET /users/1`.
3. The API responds with 404 even though user 1 exists.
4. `GET /users/2` also responds with 404.

## Expected behavior
- GET /users/1 returns HTTP 200 and user ID 1.
- GET /users/2 returns HTTP 200 and user ID 2.
- GET /users/999 returns HTTP 404 and `{ "error": "User not found" }`.

## Investigation request
Inspect the entire repository, not just the route file. Trace the request from the HTTP route through the service layer to the user data. Identify the root cause with file and line evidence.

Propose and apply the smallest safe patch in an isolated working copy. Run the full test suite before and after the patch, show actual terminal output and exit codes, and produce an engineering report.

Do not guess, fabricate test results, or report success unless post-patch tests actually pass.
