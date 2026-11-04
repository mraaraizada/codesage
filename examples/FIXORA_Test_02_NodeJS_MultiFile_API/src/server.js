const http = require("node:http");
const { handleUserRoute } = require("./routes/users");

function createServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/users/")) {
      handleUserRoute(req, res, url);
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Route not found" }));
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  createServer().listen(port, () => console.log(`User API listening on ${port}`));
}
module.exports = { createServer };
