const { Client } = require('pg');
const client = new Client({
  host: '51.159.24.123',
  port: 3035,
  database: 'rdb',
  user: 'Pipeline_Texaswin',
  password: 'PipelineScaleway2026SecureDb4xTexasWin!',
  ssl: { rejectUnauthorized: false }
});
(async () => {
  await client.connect();
  const users = await client.query('SELECT id, email, name FROM users');
  const prospects = await client.query('SELECT COUNT(*) FROM prospects');
  const byUser = await client.query('SELECT user_id, COUNT(*) FROM prospects GROUP BY user_id');
  console.log('=== USERS ===');
  console.table(users.rows);
  console.log('=== TOTAL PROSPECTS ===');
  console.log(prospects.rows);
  console.log('=== PROSPECTS PAR USER_ID ===');
  console.table(byUser.rows);
  await client.end();
})();