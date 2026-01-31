import express from 'express';
import pkg from 'pg';
import cors from 'cors';
import bcryptjs from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const { Pool } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 8080;
const JWT_SECRET = 'ta-clé-secrète-change-en-prod-2024';

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ===================== BD POSTGRESQL =====================
const pool = new Pool({
  host: '34.34.133.198',
  port: 5432,
  database: process.env.DB_NAME || 'pipeline',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'Connect@bdd1286',
  ssl: { rejectUnauthorized: false }
});

pool.on('error', (err) => {
  console.error('❌ Erreur pool BD:', err);
});

// Initialiser les tables
async function initializeDatabase() {
  try {
    const client = await pool.connect();
    
    // Créer les tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        temp_password TEXT,
        name TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS prospects (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        contact_name TEXT,
        email TEXT,
        phone TEXT,
        status TEXT DEFAULT 'Prospection',
        status_date DATE,
        setup_amount NUMERIC(12,2) DEFAULT 0,
        monthly_amount NUMERIC(12,2) DEFAULT 0,
        annual_amount NUMERIC(12,2) DEFAULT 0,
        training_amount NUMERIC(12,2) DEFAULT 0,
        material_amount NUMERIC(12,2) DEFAULT 0,
        chance_percent INTEGER DEFAULT 20,
        assigned_to TEXT,
        next_action TEXT,
        deadline DATE,
        quote_date DATE,
        decision_maker TEXT,
        notes TEXT,
        user_id INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS activities (
        id SERIAL PRIMARY KEY,
        prospect_id INTEGER NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
        activity_type TEXT,
        description TEXT,
        activity_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by TEXT,
        user_id INTEGER REFERENCES users(id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS status_history (
        id SERIAL PRIMARY KEY,
        prospect_id INTEGER NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
        old_status TEXT,
        new_status TEXT,
        status_date DATE,
        notes TEXT,
        user_id INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS next_actions (
        id SERIAL PRIMARY KEY,
        prospect_id INTEGER NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
        action_type TEXT,
        planned_date DATE,
        actor TEXT,
        completed INTEGER DEFAULT 0,
        completed_date DATE,
        completed_note TEXT,
        user_id INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    client.release();
    console.log('✅ Tables créées/vérifiées');
  } catch (err) {
    console.error('❌ Erreur initialisation BD:', err);
  }
}

// ===================== AUTH =====================
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Non authentifié' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.id;
    req.userName = decoded.name;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Token invalide' });
  }
};

// INSCRIPTION
app.post('/api/auth/register', async (req, res) => {
  const { email, password, name } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Champs requis' });
  }

  try {
    const hashedPassword = await bcryptjs.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, password, temp_password, name) VALUES ($1, $2, $3, $4) RETURNING id',
      [email, hashedPassword, password, name]
    );
    
    const token = jwt.sign({ id: result.rows[0].id, name }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: result.rows[0].id, email, name } });
  } catch (err) {
    if (err.message.includes('unique')) {
      return res.status(400).json({ error: 'Email existe déjà' });
    }
    res.status(500).json({ error: err.message });
  }
});

// CONNEXION
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];

    if (!user) {
      return res.status(400).json({ error: 'Identifiants invalides' });
    }

    const validPassword = await bcryptjs.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Identifiants invalides' });
    }

    const token = jwt.sign({ id: user.id, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===================== PROSPECTS ENDPOINTS =====================

app.get('/api/prospects', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM prospects WHERE user_id = $1 ORDER BY created_at DESC',
      [req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/prospects', authenticate, async (req, res) => {
  const { name, contact_name, email, phone, status, setup_amount, monthly_amount, annual_amount, training_amount, material_amount, chance_percent, assigned_to, quote_date, decision_maker, notes } = req.body;
  const today = new Date().toISOString().split('T')[0];

  try {
    const result = await pool.query(
      `INSERT INTO prospects
      (name, contact_name, email, phone, status, status_date, setup_amount, monthly_amount, annual_amount, training_amount, material_amount, chance_percent, assigned_to, quote_date, decision_maker, notes, user_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING id`,
      [name, contact_name, email || null, phone || null, status || 'Prospection', today, setup_amount || 0, monthly_amount || 0, annual_amount || 0, training_amount || 0, material_amount || 0, chance_percent || 20, assigned_to, quote_date || null, decision_maker || null, notes || null, req.userId]
    );
    res.json({ id: result.rows[0].id, message: 'Prospect créé' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/prospects/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { name, contact_name, email, phone, status, setup_amount, monthly_amount, annual_amount, training_amount, material_amount, chance_percent, assigned_to, quote_date, decision_maker, notes } = req.body;
  const today = new Date().toISOString().split('T')[0];

  try {
    const oldResult = await pool.query('SELECT status FROM prospects WHERE id = $1 AND user_id = $2', [id, req.userId]);
    const oldStatus = oldResult.rows[0]?.status;
    const statusChanged = oldStatus && oldStatus !== status;

    await pool.query(
      `UPDATE prospects
      SET name=$1, contact_name=$2, email=$3, phone=$4, status=$5, setup_amount=$6, monthly_amount=$7, annual_amount=$8, training_amount=$9, material_amount=$10, chance_percent=$11, assigned_to=$12, quote_date=$13, decision_maker=$14, notes=$15 ${statusChanged ? ', status_date=$16' : ''}, updated_at=CURRENT_TIMESTAMP
      WHERE id=${statusChanged ? '$17' : '$16'} AND user_id=${statusChanged ? '$18' : '$17'}`,
      statusChanged ? [name, contact_name, email || null, phone || null, status, setup_amount || 0, monthly_amount || 0, annual_amount || 0, training_amount || 0, material_amount || 0, chance_percent || 20, assigned_to, quote_date || null, decision_maker || null, notes || null, today, id, req.userId]
                    : [name, contact_name, email || null, phone || null, status, setup_amount || 0, monthly_amount || 0, annual_amount || 0, training_amount || 0, material_amount || 0, chance_percent || 20, assigned_to, quote_date || null, decision_maker || null, notes || null, id, req.userId]
    );

    if (statusChanged) {
      await pool.query(
        `INSERT INTO status_history (prospect_id, old_status, new_status, status_date, notes, user_id)
        VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, oldStatus, status, today, notes || null, req.userId]
      );
    }

    res.json({ message: 'Prospect modifié' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/prospects/:id', authenticate, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM prospects WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Non trouvé' });
    }

    res.json({ message: 'Prospect et toutes ses données supprimés' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===================== ACTIVITIES ENDPOINTS =====================

app.get('/api/prospects/:id/activities', authenticate, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'SELECT * FROM activities WHERE prospect_id = $1 AND user_id = $2 ORDER BY activity_date DESC',
      [id, req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/prospects/:id/activities', authenticate, async (req, res) => {
  const { id } = req.params;
  const { activity_type, description } = req.body;

  try {
    const result = await pool.query(
      'INSERT INTO activities (prospect_id, activity_type, description, created_by, user_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [id, activity_type, description, req.userName, req.userId]
    );
    res.json({ id: result.rows[0].id, message: 'Activité créée' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===================== NEXT ACTIONS ENDPOINTS =====================

app.get('/api/prospects/:id/next_actions', authenticate, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'SELECT * FROM next_actions WHERE prospect_id = $1 AND user_id = $2 ORDER BY planned_date ASC',
      [id, req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/prospects/:id/next_actions', authenticate, async (req, res) => {
  const { id } = req.params;
  const { action_type, planned_date, actor } = req.body;

  try {
    const result = await pool.query(
      'INSERT INTO next_actions (prospect_id, action_type, planned_date, actor, user_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [id, action_type, planned_date || null, actor, req.userId]
    );
    res.json({ id: result.rows[0].id, message: 'Action créée' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/next_actions/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { completed, completed_notes } = req.body;
  const completedDate = completed ? new Date().toISOString().split('T')[0] : null;

  try {
    await pool.query(
      `UPDATE next_actions
      SET completed = $1, completed_date = $2, completed_note = $3
      WHERE id = $4 AND user_id = $5`,
      [completed ? 1 : 0, completedDate, completed_notes || null, id, req.userId]
    );
    res.json({ message: 'Action mise à jour' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/next_actions/:id', authenticate, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM next_actions WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Non trouvé' });
    }

    res.json({ message: 'Action supprimée' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/prospects/:id/status_history', authenticate, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'SELECT * FROM status_history WHERE prospect_id = $1 AND user_id = $2 ORDER BY created_at DESC',
      [id, req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===================== GESTION DES UTILISATEURS =====================

app.get('/api/users', authenticate, async (req, res) => {
  try {
    const userResult = await pool.query('SELECT name FROM users WHERE id = $1', [req.userId]);
    const user = userResult.rows[0];

    if (!user || user.name !== 'Christian') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const result = await pool.query('SELECT id, email, name, temp_password, created_at FROM users ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', authenticate, async (req, res) => {
  try {
    const userResult = await pool.query('SELECT name FROM users WHERE id = $1', [req.userId]);
    const user = userResult.rows[0];

    if (!user || user.name !== 'Christian') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const { email, password, name } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, mot de passe et nom requis' });
    }

    const hashedPassword = await bcryptjs.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, password, temp_password, name) VALUES ($1, $2, $3, $4) RETURNING id, email, name',
      [email, hashedPassword, password, name]
    );
    
    res.json(result.rows[0]);
  } catch (err) {
    if (err.message.includes('unique')) {
      return res.status(400).json({ error: 'Cet email existe déjà' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/users/:id/password', authenticate, async (req, res) => {
  try {
    const userResult = await pool.query('SELECT name FROM users WHERE id = $1', [req.userId]);
    const user = userResult.rows[0];

    if (!user || user.name !== 'Christian') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const { id } = req.params;
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'Mot de passe requis' });
    }

    const hashedPassword = await bcryptjs.hash(password, 10);
    await pool.query(
      'UPDATE users SET password = $1, temp_password = $2 WHERE id = $3',
      [hashedPassword, password, id]
    );

    res.json({ success: true, temp_password: password });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/users/:id', authenticate, async (req, res) => {
  try {
    const userResult = await pool.query('SELECT name FROM users WHERE id = $1', [req.userId]);
    const user = userResult.rows[0];

    if (!user || user.name !== 'Christian') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const { id } = req.params;
    const targetResult = await pool.query('SELECT name FROM users WHERE id = $1', [id]);
    const targetUser = targetResult.rows[0];

    if (!targetUser) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    if (targetUser.name === 'Christian') {
      return res.status(403).json({ error: 'Impossible de supprimer Christian' });
    }

    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===================== DÉMARRAGE SERVEUR =====================
initializeDatabase().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Serveur lancé sur http://localhost:${PORT}`);
    console.log('📊 BD PostgreSQL connectée (IP publique)\n');
  });
}).catch(err => {
  console.error('❌ Erreur lors de l\'initialisation:', err);
  process.exit(1);
});
