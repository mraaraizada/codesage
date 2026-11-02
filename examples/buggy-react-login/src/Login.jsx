import { useState } from "react";
import { authenticate } from "./auth.js";

// BUG (this is the fixture's deliberate defect — see README for the CodeSage demo scenario):
// handleSubmit calls setLoggedIn(true) and then immediately reads `loggedIn` to decide whether
// to navigate. React state setters are asynchronous: `loggedIn` inside this closure still holds
// the value from the render that triggered this handler (false), not the value just passed to
// setLoggedIn. So authentication succeeds and the auth state DOES update (the UI shows "Logged
// in"), but navigate() is never called because the stale `loggedIn` read is always false on the
// first successful login. This is the "auth state updates but navigation doesn't happen" bug.
export function Login({ navigate }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [error, setError] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    const ok = authenticate(username, password);
    if (ok) {
      setError("");
      setLoggedIn(true);
      if (loggedIn) {
        navigate("/dashboard");
      }
    } else {
      setError("Invalid username or password");
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1>Log in</h1>
      {error && <p role="alert">{error}</p>}
      <label htmlFor="username">Username</label>
      <input id="username" value={username} onChange={(e) => setUsername(e.target.value)} />
      <label htmlFor="password">Password</label>
      <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <button type="submit">Log in</button>
      {loggedIn && <p data-testid="logged-in-indicator">Logged in</p>}
    </form>
  );
}
