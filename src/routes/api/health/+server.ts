import { pool } from '#lib/server/db.js';

export async function GET() { await pool.query('SELECT 1'); return Response.json({ status: 'ok' }); }
