const { getUserById } = require("../services/userService");

function handleUserRoute(req, res, url) {
  const match = url.pathname.match(/^\/users\/(\d+)$/);
  if (!match) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Route not found" }));
    return;
  }

  const user = getUserById(match[1]);
  if (!user) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "User not found" }));
    return;
  }

  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(user));
}
module.exports = { handleUserRoute };
