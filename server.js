import express from 'express';
import pkg from 'pg';
import cors from 'cors';
import bcryptjs from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fileUpload from 'express-fileupload';
import { Storage } from '@google-cloud/storage';

const { Pool } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 8080;
const JWT_SECRET = 'secret-key-2024';

// ===================== Google Cloud Storage =====================
const storage = new Storage({
  projectId: process.env.GCP_PROJECT_ID || 'project-731c3f29-bb12-43c5-a4d'
});
const bucket = storage.bucket('pipeline-devis');

app.use(cors());
app.use(express.json());
app.use(fileUpload());
app.use(express.static(__dirname));

// ===================== DATABASE =====================
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'pipeline',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  ssl: { rejectUnauthorized: false },
  connect_timeout: 30000
});

pool.on('error', (err) => console.error('Pool error:', err));

async function initDB() {
  try {
    const client = await pool.connect();
    console.log('✅ Connecté à PostgreSQL');

    await client.query(`CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS prospects (
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
      chance_percent INTEGER DEFAULT 20,
      assigned_to TEXT,
      quote_date DATE,
      decision_maker TEXT,
      notes TEXT,
      pdf_url TEXT,
      user_id INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`);

    // Migration: Ajouter pdf_url si elle n'existe pas
    await client.query(`
      ALTER TABLE prospects 
      ADD COLUMN IF NOT EXISTS pdf_url TEXT
    `);

    await client.query(`CREATE TABLE IF NOT EXISTS next_actions (
      id SERIAL PRIMARY KEY,
      prospect_id INTEGER REFERENCES prospects(id) ON DELETE CASCADE,
      action_type TEXT,
      planned_date DATE,
      actor TEXT,
      completed INTEGER DEFAULT 0,
      completed_date DATE,
      completed_note TEXT,
      user_id INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW()
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS status_history (
      id SERIAL PRIMARY KEY,
      prospect_id INTEGER REFERENCES prospects(id) ON DELETE CASCADE,
      old_status TEXT,
      new_status TEXT,
      status_date DATE,
      notes TEXT,
      user_id INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW()
    )`);

    // ============ SYSTÈME ADMIN ============
    // Ajouter le champ role si n'existe pas
    await client.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user'
    `);

    // Définir cdaumer92@gmail.com comme admin
    await client.query(`
      UPDATE users 
      SET role = 'admin' 
      WHERE email = 'cdaumer92@gmail.com' AND role IS NULL
    `);

    // Créer la table des sessions
    await client.query(`CREATE TABLE IF NOT EXISTS user_sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      user_email VARCHAR(255),
      user_name VARCHAR(255),
      login_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      ip_address VARCHAR(50),
      is_active BOOLEAN DEFAULT true
    )`);

    client.release();
    console.log('✅ Tables créées + Système admin initialisé');
  } catch (err) {
    console.error('❌ Erreur BD:', err.message);
  }
}

// ===================== AUTH =====================
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Non authentifié' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.id;
    req.userName = decoded.name;
    next();
  } catch {
    res.status(401).json({ error: 'Token invalide' });
  }
};

// REGISTER
app.post('/api/auth/register', async (req, res) => {
  const { email, password, name } = req.body;
  try {
    const hashedPassword = await bcryptjs.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, password, name) VALUES ($1, $2, $3) RETURNING id',
      [email, hashedPassword, name]
    );
    const token = jwt.sign({ id: result.rows[0].id, name }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: result.rows[0].id, email, name } });
  } catch (err) {
    res.status(400).json({ error: 'Email existe déjà' });
  }
});

// LOGIN
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user) return res.status(400).json({ error: 'Identifiants invalides' });
    const valid = await bcryptjs.compare(password, user.password);
    if (!valid) return res.status(400).json({ error: 'Identifiants invalides' });
    
    const token = jwt.sign({ id: user.id, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
    
    // Désactiver les anciennes sessions puis créer la nouvelle
    try {
      await pool.query(`
        UPDATE user_sessions 
        SET is_active = false 
        WHERE user_id = $1 AND is_active = true
      `, [user.id]);
      
      await pool.query(`
        INSERT INTO user_sessions (user_id, user_email, user_name, ip_address)
        VALUES ($1, $2, $3, $4)
      `, [user.id, user.email, user.name, req.ip || 'unknown']);
    } catch (sessionErr) {
      console.error('Erreur enregistrement session:', sessionErr);
    }
    
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// LOGOUT
app.post('/api/auth/logout', auth, async (req, res) => {
  try {
    await pool.query(`
      UPDATE user_sessions 
      SET is_active = false 
      WHERE user_id = $1 AND is_active = true
    `, [req.userId]);
    
    res.json({ ok: true });
  } catch (err) {
    console.error('Erreur logout:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===================== PROSPECTS =====================
app.get('/api/prospects', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM prospects ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/prospects', auth, async (req, res) => {
  const { 
    name, contact_name, email, phone, adresse, tel_standard, statut_societe,
    status, setup_amount, monthly_amount, annual_amount, 
    training_amount, chance_percent, assigned_to, quote_date, 
    decision_maker, solutions_en_place, notes 
  } = req.body;
  
  try {
    const result = await pool.query(
      `INSERT INTO prospects (
        name, contact_name, email, phone, adresse, tel_standard, statut_societe,
        status, setup_amount, monthly_amount, annual_amount, 
        training_amount, chance_percent, assigned_to, quote_date, 
        decision_maker, solutions_en_place, notes, user_id, status_date
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, CURRENT_DATE) 
      RETURNING id`,
      [
        name, contact_name, email || null, phone || null, adresse || null, tel_standard || null, statut_societe || 'Prospect',
        status || 'Prospection', setup_amount || 0, monthly_amount || 0, annual_amount || 0, 
        training_amount || 0, chance_percent || 20, assigned_to, quote_date || null, 
        decision_maker || null, solutions_en_place || null, notes || null, req.userId
      ]
    );
    res.json({ id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/prospects/:id', auth, async (req, res) => {
  const { id } = req.params;
  const { 
    name, contact_name, email, phone, adresse, tel_standard, statut_societe,
    status, setup_amount, monthly_amount, annual_amount, 
    training_amount, chance_percent, assigned_to, quote_date, 
    decision_maker, solutions_en_place, notes, pdf_url 
  } = req.body;
  
  try {
    await pool.query(
      `UPDATE prospects SET 
        name=$1, contact_name=$2, email=$3, phone=$4, adresse=$5, tel_standard=$6, statut_societe=$7,
        status=$8, setup_amount=$9, monthly_amount=$10, annual_amount=$11, 
        training_amount=$12, chance_percent=$13, assigned_to=$14, quote_date=$15, 
        decision_maker=$16, solutions_en_place=$17, notes=$18, pdf_url=$19, 
        updated_at=NOW() 
      WHERE id=$20`,
      [
        name, contact_name, email || null, phone || null, adresse || null, tel_standard || null, statut_societe || 'Prospect',
        status, setup_amount || 0, monthly_amount || 0, annual_amount || 0, 
        training_amount || 0, chance_percent || 20, assigned_to, quote_date || null, 
        decision_maker || null, solutions_en_place || null, notes || null, pdf_url || null, 
        id
      ]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/prospects/:id', auth, async (req, res) => {
  try {
    await pool.query('DELETE FROM prospects WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===================== NEXT ACTIONS =====================
app.get('/api/prospects/:id/next_actions', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM next_actions WHERE prospect_id = $1 ORDER BY planned_date ASC', [req.params.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/prospects/:id/next_actions', auth, async (req, res) => {
  const { action_type, planned_date, actor, completed_note } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO next_actions (prospect_id, action_type, planned_date, actor, completed_note, user_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [req.params.id, action_type, planned_date || null, actor, completed_note || null, req.userId]
    );
    res.json({ id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/next_actions/:id', auth, async (req, res) => {
  const { completed, completed_notes, saveNotesOnly } = req.body;
  try {
    if (saveNotesOnly) {
      await pool.query(
        `UPDATE next_actions SET completed_note=$1 WHERE id=$2 AND user_id=$3`,
        [completed_notes || null, req.params.id, req.userId]
      );
    } else {
      await pool.query(
        `UPDATE next_actions SET completed=$1, completed_date=$2, completed_note=$3 WHERE id=$4 AND user_id=$5`,
        [completed ? 1 : 0, completed ? new Date().toISOString().split('T')[0] : null, completed_notes || null, req.params.id, req.userId]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/next_actions/:id', auth, async (req, res) => {
  try {
    await pool.query('DELETE FROM next_actions WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===================== STATUS HISTORY =====================
app.get('/api/prospects/:id/status_history', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM status_history WHERE prospect_id = $1 ORDER BY created_at DESC', [req.params.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===================== ACTIVITIES =====================
app.get('/api/prospects/:id/activities', auth, async (req, res) => {
  res.json([]);
});

// ===================== USERS =====================
app.get('/api/users', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, email, name, created_at FROM users ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', auth, async (req, res) => {
  const { email, password, name } = req.body;
  try {
    const hashedPassword = await bcryptjs.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, password, name) VALUES ($1, $2, $3) RETURNING id, email, name',
      [email, hashedPassword, name]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(400).json({ error: 'Email existe déjà' });
  }
});

app.delete('/api/users/:id', auth, async (req, res) => {
  try {
    await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===================== GENERATE TEMP PASSWORD =====================
app.post('/api/users/:id/temp-password', auth, async (req, res) => {
  try {
    const tempPassword = Math.random().toString(36).slice(-12).toUpperCase();
    const hashedPassword = await bcryptjs.hash(tempPassword, 10);
    
    await pool.query(
      'UPDATE users SET password = $1, temp_password = $2 WHERE id = $3',
      [hashedPassword, tempPassword, req.params.id]
    );
    
    res.json({ temp_password: tempPassword });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===================== CHANGE PASSWORD =====================
app.put('/api/users/:id/password', auth, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'Mot de passe requis' });
    }

    const hashedPassword = await bcryptjs.hash(password, 10);
    await pool.query(
      'UPDATE users SET password = $1 WHERE id = $2',
      [hashedPassword, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===================== PDF UPLOAD =====================
app.post('/api/prospects/:id/upload-pdf', auth, async (req, res) => {
  try {
    if (!req.files || !req.files.pdf) {
      return res.status(400).json({ error: 'Pas de fichier PDF' });
    }

    const pdfFile = req.files.pdf;
    
    if (pdfFile.mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'Le fichier doit être un PDF' });
    }

    const fileName = `prospect-${req.params.id}-${Date.now()}.pdf`;
    const blob = bucket.file(fileName);

    await blob.save(pdfFile.data);

    await pool.query(
      `UPDATE prospects SET pdf_url = $1 WHERE id = $2`,
      [fileName, req.params.id]
    );

    res.json({ pdf_url: fileName, success: true });
  } catch (err) {
    console.error('PDF Upload Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===================== PDF DELETE =====================
app.delete('/api/prospects/:id/pdf', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT pdf_url FROM prospects WHERE id = $1`,
      [req.params.id]
    );

    if (result.rows[0]?.pdf_url) {
      const fileName = result.rows[0].pdf_url;
      await bucket.file(fileName).delete();
    }

    await pool.query(
      `UPDATE prospects SET pdf_url = NULL WHERE id = $1`,
      [req.params.id]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('PDF Delete Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===================== PDF DOWNLOAD/VIEW =====================
app.get('/api/prospects/:id/download-pdf', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT pdf_url FROM prospects WHERE id = $1`,
      [req.params.id]
    );

    if (!result.rows[0]?.pdf_url) {
      return res.status(404).json({ error: 'Pas de PDF pour ce prospect' });
    }

    const fileName = result.rows[0].pdf_url;
    const blob = bucket.file(fileName);

    const [exists] = await blob.exists();
    if (!exists) {
      return res.status(404).json({ error: 'Fichier PDF non trouvé' });
    }

    const [fileContent] = await blob.download();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.send(fileContent);
  } catch (err) {
    console.error('PDF Download Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// ROUTES INTERLOCUTEURS
// ==========================================

app.get('/api/prospects/:id/interlocuteurs', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM interlocuteurs WHERE prospect_id = $1 ORDER BY principal DESC, nom ASC',
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Erreur fetch interlocuteurs:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/prospects/:id/interlocuteurs', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { nom, fonction, email, telephone, principal, decideur } = req.body;

    if (principal) {
      await pool.query(
        'UPDATE interlocuteurs SET principal = false WHERE prospect_id = $1',
        [id]
      );
    }

    const result = await pool.query(
      `INSERT INTO interlocuteurs (prospect_id, nom, fonction, email, telephone, principal, decideur) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING *`,
      [id, nom, fonction, email, telephone, principal || false, decideur || false]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erreur create interlocuteur:', err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/prospects/:prospectId/interlocuteurs/:id', auth, async (req, res) => {
  try {
    const { prospectId, id } = req.params;
    const { nom, fonction, email, telephone, principal, decideur } = req.body;

    if (principal) {
      await pool.query(
        'UPDATE interlocuteurs SET principal = false WHERE prospect_id = $1 AND id != $2',
        [prospectId, id]
      );
    }

    const result = await pool.query(
      `UPDATE interlocuteurs 
       SET nom = $1, fonction = $2, email = $3, telephone = $4, principal = $5, decideur = $6, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $7 AND prospect_id = $8 
       RETURNING *`,
      [nom, fonction, email, telephone, principal || false, decideur || false, id, prospectId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Interlocuteur non trouvé' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erreur update interlocuteur:', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/prospects/:prospectId/interlocuteurs/:id', auth, async (req, res) => {
  try {
    const { prospectId, id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM interlocuteurs WHERE id = $1 AND prospect_id = $2 RETURNING *',
      [id, prospectId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Interlocuteur non trouvé' });
    }

    res.json({ message: 'Interlocuteur supprimé', deleted: result.rows[0] });
  } catch (err) {
    console.error('Erreur delete interlocuteur:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===================== ADMIN ROUTES =====================
const requireAdmin = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Non authentifié' });
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const result = await pool.query('SELECT role FROM users WHERE id = $1', [decoded.id]);
    
    if (!result.rows[0] || result.rows[0].role !== 'admin') {
      return res.status(403).json({ error: 'Accès refusé - Admin uniquement' });
    }
    
    req.userId = decoded.id;
    req.userName = decoded.name;
    next();
  } catch {
    res.status(401).json({ error: 'Token invalide' });
  }
};

app.get('/admin', (req, res) => {
  res.sendFile(join(__dirname, 'admin.html'));
});

app.get('/api/admin/active-users', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        user_email,
        user_name,
        login_time,
        ip_address
      FROM user_sessions
      WHERE is_active = true
      ORDER BY login_time DESC
    `);
    
    res.json({ success: true, users: result.rows });
  } catch (err) {
    console.error('Erreur récupération users actifs:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ===================== START =====================
initDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Serveur sur port ${PORT}`);
    console.log('✅ BD PostgreSQL connectée');
  });
}).catch(err => {
  console.error('Erreur démarrage:', err);
  process.exit(1);
});
