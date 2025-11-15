const { Client } = require('pg');

// Serverless handler for Vercel/GCP/AWS Lambda-style environments
// Expects environment variables:
// - SUPABASE_DB_CONN : Postgres connection string (preferably a restricted DB user or the Supabase "Connection string (URI)" value)
// - SCHEDULE_SECRET : (optional) a secret token that must be provided in the X-SCHEDULE-SECRET header to invoke this endpoint

module.exports = async function (req, res) {
    // Basic auth via header to avoid accidental public triggers
    const scheduleSecret = process.env.SCHEDULE_SECRET;
    if (scheduleSecret) {
        const provided = req.headers['x-schedule-secret'] || req.headers['x-schedule-secret'.toLowerCase()];
        if (!provided || provided !== scheduleSecret) {
            res.status(401).json({ error: 'Missing or invalid schedule secret' });
            return;
        }
    }

    const conn = process.env.SUPABASE_DB_CONN;
    if (!conn) {
        res.status(500).json({ error: 'SUPABASE_DB_CONN is not configured' });
        return;
    }

    const client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });

    // Delete sessions for users who are not admins. Adjust the join if your users table links differently.
    const sql = `
    WITH to_kick AS (
      SELECT s.id
      FROM auth.sessions s
      JOIN auth.users u ON u.id = s.user_id
      JOIN public.users p ON p.email = u.email
      WHERE p.is_admin = false
    )
    DELETE FROM auth.sessions
    WHERE id IN (SELECT id FROM to_kick);
  `;

    try {
        await client.connect();
        const result = await client.query(sql);
        await client.end();

        res.setHeader('Content-Type', 'application/json');
        res.status(200).json({ success: true, deleted: result.rowCount });
    } catch (err) {
        try { await client.end(); } catch (e) { }
        console.error('midnight-logout error', err);
        res.status(500).json({ error: err.message || String(err) });
    }
};
