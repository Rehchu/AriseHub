// Generates seed.sql to create the first super_admin user + a default campus.
// Usage: node scripts/make-admin-seed.mjs "Full Name" "email@example.com" "StrongPassword123!" ["Campus Name"]
import { randomBytes, pbkdf2Sync } from "node:crypto";
import { writeFileSync } from "node:fs";

const [name, email, password, campusName = "Main Campus"] = process.argv.slice(2);
if (!name || !email || !password) {
  console.error('Usage: node scripts/make-admin-seed.mjs "Full Name" "email@example.com" "StrongPassword123!" ["Campus Name"]');
  process.exit(1);
}

const ITERATIONS = 100_000;
const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, ITERATIONS, 32, "sha256");

const sql = `INSERT INTO campuses (name) VALUES ('${campusName.replace(/'/g, "''")}');

INSERT INTO users (name, email, password_hash, password_salt, role, active, must_change_password)
VALUES ('${name.replace(/'/g, "''")}', '${email.toLowerCase().replace(/'/g, "''")}', '${hash.toString("base64")}', '${salt.toString(
  "base64"
)}', 'super_admin', 1, 0);
`;

writeFileSync(new URL("../seed.sql", import.meta.url), sql);
console.log("Wrote worker/seed.sql — run `npm run seed:local` (or seed:remote) to apply it.");
console.log(`Login with: ${email} / ${password}`);
