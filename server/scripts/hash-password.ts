// One-off helper: bun run scripts/hash-password.ts <password>
// Paste the output into AUTH_PASSWORD_HASH in server/.env (or deploy/.env for
// the Docker stack). Never commit the raw password or the hash to the repo.
const password = process.argv[2];
if (!password) {
  console.error('Usage: bun run scripts/hash-password.ts <password>');
  process.exit(1);
}

const hash = await Bun.password.hash(password);
console.log(hash);
