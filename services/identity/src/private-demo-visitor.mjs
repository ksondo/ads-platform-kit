import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { access, lstat, open, realpath, unlink } from 'node:fs/promises';
import { createDemoAccess } from './demo-access.mjs';
import { hashPassword, normalizeEmail } from './security.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const exists = async p => { try { await access(p); return true; } catch { return false; } };

export function privateVisitorService(pool, config) {
  const audit = (event, data, db = pool) => db.query(`INSERT INTO platform.identity_audit(event_type,user_id,tenant_id,outcome,reason,client_id,metadata)
    VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`, [event, data.userId ?? null, data.tenantId ?? null, data.outcome, data.reason ?? null, data.clientId ?? null, JSON.stringify(data.metadata ?? {})]);
  return createDemoAccess({ pool, config, audit, mailer: { send() { throw new Error('PRIVATE_VISITOR_EMAIL_FORBIDDEN'); } } });
}

// This operator command targets the POSIX Contabo secret store. chmod(0600) is not a
// Windows ACL guarantee; refuse there instead of claiming the file is protected.
export async function protectedCredentialsPath(output) {
  if (process.platform === 'win32') throw new Error('PRIVATE_VISITOR_REQUIRES_POSIX_SECRET_STORAGE');
  if (typeof output !== 'string' || !path.isAbsolute(output)) throw new Error('PRIVATE_VISITOR_ABSOLUTE_CREDENTIAL_PATH_REQUIRED');
  const parent = await realpath(path.dirname(output));
  const stat = await lstat(parent);
  if (!stat.isDirectory() || stat.uid !== process.getuid() || (stat.mode & 0o077)) throw new Error('PRIVATE_VISITOR_SECRET_DIRECTORY_MUST_BE_OWNER_ONLY');
  const relative = path.relative(repoRoot, parent);
  if (!relative.startsWith('..') && !path.isAbsolute(relative)) throw new Error('PRIVATE_VISITOR_SECRET_FILE_MUST_BE_OUTSIDE_REPOSITORY');
  for (let dir = parent; ; dir = path.dirname(dir)) {
    if (await exists(path.join(dir, '.git'))) throw new Error('PRIVATE_VISITOR_SECRET_FILE_MUST_BE_OUTSIDE_REPOSITORY');
    if (path.dirname(dir) === dir) break;
  }
  return path.join(parent, path.basename(output));
}

export async function provisionPrivateVisitor({ pool, config, email, operatorRef, credentialsOut, apply, locale = 'en' }) {
  if (apply !== 'yes') throw new Error('PRIVATE_VISITOR_EXPLICIT_APPLY_REQUIRED');
  if (!config.demo.enabled || !config.demoAccess.privateEnabled || config.demoAccess.publicEnabled) throw new Error('PRIVATE_VISITOR_MODE_REQUIRED');
  const output = await protectedCredentialsPath(credentialsOut);
  const file = await open(output, 'wx', 0o600);
  let credentialsWritten = false;
  try {
    const st = await file.stat();
    if (!st.isFile() || st.uid !== process.getuid() || (st.mode & 0o777) !== 0o600) throw new Error('PRIVATE_VISITOR_SECRET_FILE_PERMISSIONS_INVALID');
    const password = crypto.randomBytes(32).toString('base64url');
    const result = await privateVisitorService(pool, config).provisionPrivate({ email, operatorRef, locale, passwordHash: await hashPassword(password),
      beforeCommit: async result => {
        await file.writeFile(JSON.stringify({ ...result, email: normalizeEmail(email), password }, null, 2) + '\n');
        await file.sync();
        credentialsWritten = true;
      } });
    // Never return the password to the CLI's stdout/logging path.
    return { ...result, credentialsFile: output };
  } finally {
    await file.close();
    // A written credential is retained if COMMIT has an unknown outcome; never lose
    // the only password for a possibly committed account. An empty reservation is safe to remove.
    if (!credentialsWritten) await unlink(output);
  }
}
