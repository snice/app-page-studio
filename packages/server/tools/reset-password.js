#!/usr/bin/env node
const path = require('path');
const { Users } = require(path.join(__dirname, '..', 'db'));

const args = process.argv.slice(2);
let username = null;
for (let i = 0; i < args.length; i++) {
  if ((args[i] === '-u' || args[i] === '--username') && args[i + 1]) {
    username = args[i + 1];
    i++;
  }
}

if (!username) {
  console.error('Usage: pnpm reset-password -- -u <username>');
  process.exit(1);
}

const user = Users.getByUsername(username);
if (!user) {
  console.error(`User not found: ${username}`);
  process.exit(1);
}

Users.updatePassword(user.id, '123456');
console.log(`Password reset to 123456 for user: ${username} (id=${user.id})`);
