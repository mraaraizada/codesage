const test = require("node:test");
const assert = require("node:assert/strict");
const { getUserById } = require("../src/services/userService");

test("finds user with ID 1", () => {
  assert.equal(getUserById("1").name, "Aarav Sharma");
});
test("finds user with ID 2", () => {
  assert.equal(getUserById("2").name, "Meera Kapoor");
});
test("returns undefined for an unknown ID", () => {
  assert.equal(getUserById("999"), undefined);
});
