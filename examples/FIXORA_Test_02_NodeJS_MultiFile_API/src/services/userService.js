const { users } = require("../data/users");

function getUserById(id) {
  // BUG: URL IDs are strings, while stored IDs are numbers.
  return users.find((user) => user.id === id);
}
module.exports = { getUserById };
