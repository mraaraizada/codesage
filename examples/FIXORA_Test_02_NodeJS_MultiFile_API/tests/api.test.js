const test = require("node:test");
const assert = require("node:assert/strict");
const { createServer } = require("../src/server");

async function withServer(run) {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try { await run(`http://127.0.0.1:${address.port}`); }
  finally {
    await new Promise((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve()));
  }
}

test("GET /users/1 returns first user", async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/users/1`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      id: 1, name: "Aarav Sharma", email: "aarav@example.test"
    });
  });
});
test("GET /users/2 returns second user", async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/users/2`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.id, 2);
    assert.equal(body.name, "Meera Kapoor");
  });
});
test("GET /users/999 returns JSON 404", async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/users/999`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "User not found" });
  });
});
