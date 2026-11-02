// Minimal fake "backend" for the demo fixture — intentionally simple, this is not the bug.
export function authenticate(username, password) {
  return username === "demo" && password === "password123";
}
