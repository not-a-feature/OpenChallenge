import { symmetricDecrypt, symmetricEncrypt } from 'better-auth/crypto';
import { auth } from '../src/lib/server/auth';
import { pool } from '../src/lib/server/db';

const context = await auth.$context;
const client = await pool.connect();
try {
  await client.query('BEGIN');
  const { rows } = await client.query('SELECT id, access_token, refresh_token FROM account WHERE access_token IS NOT NULL OR refresh_token IS NOT NULL FOR UPDATE');
  let updated = 0;
  for (const row of rows) {
    const values = await Promise.all(['access_token', 'refresh_token'].map(async (column) => {
      const token: string | null = row[column];
      if (token === null) return null;
      // Better Auth accepts versioned envelopes and legacy bare hexadecimal ciphertext.
      if (token.startsWith('$ba$') || /^(?:[0-9a-f]{2})+$/i.test(token)) {
        await symmetricDecrypt({ key: context.secretConfig, data: token });
        return token;
      }
      return symmetricEncrypt({ key: context.secretConfig, data: token });
    }));
    if (values[0] !== row.access_token || values[1] !== row.refresh_token) {
      await client.query('UPDATE account SET access_token = $1, refresh_token = $2 WHERE id = $3', [...values, row.id]);
      updated++;
    }
  }
  await client.query('COMMIT');
  console.log(`Encrypted OAuth tokens for ${updated} account(s).`);
} finally {
  client.release();
  await pool.end();
}
