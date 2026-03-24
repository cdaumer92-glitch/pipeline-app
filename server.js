import express from 'express';
import nodemailer from 'nodemailer';
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

// ===================== MAILER =====================
const transporter = nodemailer.createTransport({
  host: 'ssl0.ovh.net',
  port: 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER || 'notifications@texaswin.fr',
    pass: process.env.SMTP_PASS || ''
  }
});

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

    // Migration: Ajouter website si elle n'existe pas
    await client.query(`
      ALTER TABLE prospects 
      ADD COLUMN IF NOT EXISTS website TEXT
    `);

    // Migration: Ajouter contact dans next_actions si elle n'existe pas
    await client.query(`
      ALTER TABLE next_actions 
      ADD COLUMN IF NOT EXISTS contact TEXT
    `);

    // Migration: Ajouter affaire_id dans next_actions si elle n'existe pas
    await client.query(`
      ALTER TABLE next_actions 
      ADD COLUMN IF NOT EXISTS affaire_id INTEGER REFERENCES affaires(id) ON DELETE CASCADE
    `);

    // Table affaires (doit exister avant next_actions pour la FK)
    await client.query(`CREATE TABLE IF NOT EXISTS affaires (
      id SERIAL PRIMARY KEY,
      prospect_id INTEGER REFERENCES prospects(id) ON DELETE CASCADE,
      nom_affaire TEXT NOT NULL,
      description TEXT,
      statut_global TEXT DEFAULT 'En cours',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`);

    // Table devis
    await client.query(`CREATE TABLE IF NOT EXISTS devis (
      id SERIAL PRIMARY KEY,
      prospect_id INTEGER REFERENCES prospects(id) ON DELETE CASCADE,
      affaire_id INTEGER REFERENCES affaires(id) ON DELETE CASCADE,
      devis_name TEXT,
      devis_status TEXT DEFAULT 'En cours',
      quote_date DATE,
      setup_amount NUMERIC(12,2) DEFAULT 0,
      monthly_amount NUMERIC(12,2) DEFAULT 0,
      annual_amount NUMERIC(12,2) DEFAULT 0,
      training_amount NUMERIC(12,2) DEFAULT 0,
      chance_percent INTEGER DEFAULT 0,
      modules JSONB,
      comment TEXT,
      pdf_url TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )`);

    // Table interlocuteurs
    await client.query(`CREATE TABLE IF NOT EXISTS interlocuteurs (
      id SERIAL PRIMARY KEY,
      prospect_id INTEGER REFERENCES prospects(id) ON DELETE CASCADE,
      nom TEXT,
      fonction TEXT,
      email TEXT,
      telephone TEXT,
      principal BOOLEAN DEFAULT false,
      decideur BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`);

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

    await client.query(`CREATE TABLE IF NOT EXISTS prospect_modules (
      id SERIAL PRIMARY KEY,
      prospect_id INTEGER REFERENCES prospects(id) ON DELETE CASCADE,
      module_name TEXT NOT NULL,
      nb_users INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(prospect_id, module_name)
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
    name, contact_name, email, phone, adresse, website, tel_standard, statut_societe,
    status, setup_amount, monthly_amount, annual_amount, 
    training_amount, chance_percent, assigned_to, quote_date, 
    decision_maker, solutions_en_place, notes 
  } = req.body;
  
  try {
    const result = await pool.query(
      `INSERT INTO prospects (
        name, contact_name, email, phone, adresse, website, tel_standard, statut_societe,
        status, setup_amount, monthly_amount, annual_amount, 
        training_amount, chance_percent, assigned_to, quote_date, 
        decision_maker, solutions_en_place, notes, user_id, status_date
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, CURRENT_DATE) 
      RETURNING id`,
      [
        name, contact_name, email || null, phone || null, adresse || null, website || null, tel_standard || null, statut_societe || 'Prospect',
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
    name, contact_name, email, phone, adresse, website, tel_standard, statut_societe,
    status, setup_amount, monthly_amount, annual_amount, 
    training_amount, chance_percent, assigned_to, quote_date, 
    decision_maker, solutions_en_place, notes, pdf_url 
  } = req.body;
  
  try {
    await pool.query(
      `UPDATE prospects SET 
        name=$1, contact_name=$2, email=$3, phone=$4, adresse=$5, website=$6, tel_standard=$7, statut_societe=$8,
        status=$9, setup_amount=$10, monthly_amount=$11, annual_amount=$12, 
        training_amount=$13, chance_percent=$14, assigned_to=$15, quote_date=$16, 
        decision_maker=$17, solutions_en_place=$18, notes=$19, pdf_url=$20, 
        updated_at=NOW() 
      WHERE id=$21`,
      [
        name, contact_name, email || null, phone || null, adresse || null, website || null, tel_standard || null, statut_societe || 'Prospect',
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
    const result = await pool.query('SELECT * FROM next_actions WHERE prospect_id = $1 AND affaire_id IS NULL ORDER BY planned_date ASC', [req.params.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/affaires/:id/next_actions - Récupérer les actions d'une affaire
app.get('/api/affaires/:id/next_actions', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM next_actions WHERE affaire_id = $1 ORDER BY planned_date ASC', 
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/prospects/:id/next_actions', auth, async (req, res) => {
  const { action_type, planned_date, actor, contact, completed_note, affaire_id } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO next_actions (prospect_id, affaire_id, action_type, planned_date, actor, contact, completed_note, user_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
      [req.params.id, affaire_id || null, action_type, planned_date || null, actor, contact || null, completed_note || null, req.userId]
    );
    res.json({ id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/affaires/:id/next_actions - Créer une action pour une affaire
app.post('/api/affaires/:id/next_actions', auth, async (req, res) => {
  const affaireId = req.params.id;
  const { action_type, planned_date, actor, contact, completed_note } = req.body;
  
  try {
    // Récupérer le prospect_id depuis l'affaire
    const affaireResult = await pool.query(
      'SELECT prospect_id FROM affaires WHERE id = $1',
      [affaireId]
    );

    if (affaireResult.rows.length === 0) {
      return res.status(404).json({ error: 'Affaire non trouvée' });
    }

    const prospectId = affaireResult.rows[0].prospect_id;

    const result = await pool.query(
      'INSERT INTO next_actions (prospect_id, affaire_id, action_type, planned_date, actor, contact, completed_note, user_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
      [prospectId, affaireId, action_type, planned_date || null, actor, contact || null, completed_note || null, req.userId]
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
        `UPDATE next_actions SET completed_note=$1 WHERE id=$2`,
        [completed_notes || null, req.params.id]
      );
    } else {
      await pool.query(
        `UPDATE next_actions SET completed=$1, completed_date=$2, completed_note=$3 WHERE id=$4`,
        [completed ? 1 : 0, completed ? new Date().toISOString().split('T')[0] : null, completed_notes || null, req.params.id]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/next_actions/:id', auth, async (req, res) => {
  try {
    await pool.query('DELETE FROM next_actions WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===================== MODULES =====================
// GET - Récupérer les modules d'un prospect
app.get('/api/prospects/:id/modules', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM prospect_modules WHERE prospect_id = $1', [req.params.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST - Sauvegarder les modules d'un prospect
app.post('/api/prospects/:id/modules', auth, async (req, res) => {
  const { modules } = req.body; // modules = [{module_name: 'Biz', nb_users: 5}, ...]
  try {
    // Supprimer les anciens modules
    await pool.query('DELETE FROM prospect_modules WHERE prospect_id = $1', [req.params.id]);
    
    // Insérer les nouveaux modules (seulement ceux avec nb_users > 0)
    for (const module of modules) {
      if (module.nb_users > 0) {
        await pool.query(
          'INSERT INTO prospect_modules (prospect_id, module_name, nb_users) VALUES ($1, $2, $3)',
          [req.params.id, module.module_name, module.nb_users]
        );
      }
    }
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
// ROUTES DEVIS
// ==========================================

// GET /api/prospects/:id/devis - Liste des devis d'un prospect
// ===================== AFFAIRES =====================
// GET /api/prospects/:id/affaires - Récupérer toutes les affaires d'un prospect
// POST /api/prospects/:id/affaires - Créer une nouvelle affaire
// PUT /api/affaires/:id - Modifier une affaire
// ===================== AFFAIRES =====================

// GET /api/prospects/:id/affaires - Récupérer toutes les affaires d'une société
app.get('/api/prospects/:id/affaires', auth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `SELECT a.*, 
              COUNT(d.id) as nb_devis,
              MAX(d.created_at) as dernier_devis_date
       FROM affaires a
       LEFT JOIN devis d ON d.affaire_id = a.id
       WHERE a.prospect_id = $1
       GROUP BY a.id
       ORDER BY a.created_at DESC`,
      [id]
    );
    
    res.json(result.rows);
  } catch (err) {
    console.error('Erreur GET /api/prospects/:id/affaires:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/prospects/:id/affaires - Créer une nouvelle affaire
app.post('/api/prospects/:id/affaires', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { nom_affaire, description, statut_global } = req.body;
    
    const result = await pool.query(
      `INSERT INTO affaires (prospect_id, nom_affaire, description, statut_global, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       RETURNING *`,
      [id, nom_affaire, description || null, statut_global || 'En cours']
    );
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erreur POST /api/prospects/:id/affaires:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/affaires/:id - Récupérer une affaire spécifique
app.get('/api/affaires/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `SELECT * FROM affaires WHERE id = $1`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Affaire non trouvée' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erreur GET /api/affaires/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/affaires/:id - Modifier une affaire
app.put('/api/affaires/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { nom_affaire, description, statut_global } = req.body;
    
    const result = await pool.query(
      `UPDATE affaires 
       SET nom_affaire = $1, description = $2, statut_global = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [nom_affaire, description, statut_global, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Affaire non trouvée' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erreur PUT /api/affaires/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/affaires/:id - Supprimer une affaire (et ses devis en cascade)
app.delete('/api/affaires/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    
    await pool.query('DELETE FROM affaires WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Erreur DELETE /api/affaires/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/affaires/:id/devis - Récupérer tous les devis d'une affaire
app.get('/api/affaires/:id/devis', auth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `SELECT * FROM devis 
       WHERE affaire_id = $1 
       ORDER BY created_at DESC`,
      [id]
    );
    
    res.json(result.rows);
  } catch (err) {
    console.error('Erreur GET /api/affaires/:id/devis:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/affaires/:id/devis - Créer un devis dans une affaire
app.post('/api/affaires/:id/devis', auth, async (req, res) => {
  try {
    const affaireId = req.params.id;
    const {
      devis_name,
      devis_status,
      quote_date,
      setup_amount,
      monthly_amount,
      annual_amount,
      training_amount,
      chance_percent,
      modules,
      comment
    } = req.body;

    // Récupérer le prospect_id depuis l'affaire
    const affaireResult = await pool.query(
      'SELECT prospect_id FROM affaires WHERE id = $1',
      [affaireId]
    );

    if (affaireResult.rows.length === 0) {
      return res.status(404).json({ error: 'Affaire non trouvée' });
    }

    const prospectId = affaireResult.rows[0].prospect_id;

    const result = await pool.query(
      `INSERT INTO devis (
        prospect_id, 
        affaire_id,
        devis_name,
        devis_status,
        quote_date, 
        setup_amount, 
        monthly_amount, 
        annual_amount, 
        training_amount, 
        chance_percent, 
        modules,
        comment,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW()) 
      RETURNING *`,
      [
        prospectId,
        affaireId,
        devis_name || null,
        devis_status || 'En cours',
        quote_date === '' ? null : quote_date,
        parseFloat(setup_amount) || 0,
        parseFloat(monthly_amount) || 0,
        parseFloat(annual_amount) || 0,
        parseFloat(training_amount) || 0,
        parseInt(chance_percent) || 0,
        JSON.stringify(modules || {}),
        comment || null
      ]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erreur POST /api/affaires/:id/devis:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===================== DEVIS =====================
// GET /api/devis/all - Récupérer tous les devis avec info commercial
app.get('/api/devis/all', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT d.*, p.name as prospect_name, p.assigned_to as commercial
       FROM devis d
       LEFT JOIN prospects p ON d.prospect_id = p.id
       ORDER BY d.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Erreur GET /api/devis/all:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/prospects/:id/devis', auth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `SELECT * FROM devis 
       WHERE prospect_id = $1 
       ORDER BY quote_date DESC, created_at DESC`,
      [id]
    );
    
    res.json(result.rows);
  } catch (err) {
    console.error('Erreur GET /api/prospects/:id/devis:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/prospects/:id/devis - Créer un nouveau devis
app.post('/api/prospects/:id/devis', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      affaire_id,
      devis_name,
      devis_status,
      quote_date,
      setup_amount,
      monthly_amount,
      annual_amount,
      training_amount,
      chance_percent,
      modules,
      comment
    } = req.body;
    
    const result = await pool.query(
      `INSERT INTO devis (
        prospect_id,
        affaire_id,
        devis_name,
        devis_status,
        quote_date,
        setup_amount,
        monthly_amount,
        annual_amount,
        training_amount,
        chance_percent,
        modules,
        comment
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        id,
        affaire_id || null,
        devis_name || 'Devis sans nom',
        devis_status || 'En cours',
        quote_date === '' ? null : quote_date,
        setup_amount || 0,
        monthly_amount || 0,
        annual_amount || 0,
        training_amount || 0,
        chance_percent || 0,
        JSON.stringify(modules || {}),
        comment || null
      ]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Erreur POST /api/prospects/:id/devis:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/devis/:id - Modifier un devis
app.put('/api/devis/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      devis_name,
      devis_status,
      quote_date,
      setup_amount,
      monthly_amount,
      annual_amount,
      training_amount,
      chance_percent,
      modules,
      comment,
      affaire_id
    } = req.body;
    
    console.log('🔧 PUT /api/devis/' + id);
    console.log('Body reçu:', req.body);
    
    const result = await pool.query(
      `UPDATE devis SET
        devis_name = $1,
        devis_status = COALESCE($2, devis_status),
        quote_date = $3,
        setup_amount = $4,
        monthly_amount = $5,
        annual_amount = $6,
        training_amount = $7,
        chance_percent = $8,
        modules = $9,
        comment = $10,
        affaire_id = $11,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $12
      RETURNING *`,
      [
        devis_name,
        devis_status || null,
        quote_date === '' ? null : quote_date, // Convertir chaîne vide en null pour PostgreSQL
        setup_amount || 0,
        monthly_amount || 0,
        annual_amount || 0,
        training_amount || 0,
        chance_percent || 0,
        JSON.stringify(modules || {}),
        comment || null,
        affaire_id !== undefined ? affaire_id : null,
        id
      ]
    );
    
    console.log('✅ Devis mis à jour:', result.rows[0]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Devis non trouvé' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('❌ Erreur PUT /api/devis/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/devis/:id - Supprimer un devis
app.delete('/api/devis/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Récupérer le devis pour supprimer son PDF du storage si nécessaire
    const devisResult = await pool.query('SELECT pdf_url FROM devis WHERE id = $1', [id]);
    
    if (devisResult.rows.length === 0) {
      return res.status(404).json({ error: 'Devis non trouvé' });
    }
    
    const devis = devisResult.rows[0];
    
    // Supprimer le PDF du Google Cloud Storage si présent
    if (devis.pdf_url) {
      try {
        const fileName = devis.pdf_url;
        const file = bucket.file(fileName);
        await file.delete();
      } catch (storageErr) {
        console.error('Erreur suppression PDF du storage:', storageErr);
      }
    }
    
    // Supprimer le devis
    await pool.query('DELETE FROM devis WHERE id = $1', [id]);
    
    res.json({ message: 'Devis supprimé' });
  } catch (err) {
    console.error('Erreur DELETE /api/devis/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/devis/:id/upload-pdf - Upload PDF pour un devis
app.post('/api/devis/:id/upload-pdf', auth, async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!req.files || !req.files.pdf) {
      return res.status(400).json({ error: 'Aucun fichier fourni' });
    }
    
    const pdfFile = req.files.pdf;
    
    if (pdfFile.mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'Le fichier doit être un PDF' });
    }
    
    // Vérifier que le devis existe
    const devisCheck = await pool.query('SELECT pdf_url FROM devis WHERE id = $1', [id]);
    if (devisCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Devis non trouvé' });
    }
    
    const oldPdfUrl = devisCheck.rows[0].pdf_url;
    
    // Générer un nom unique pour le fichier
    const timestamp = Date.now();
    const fileName = `devis-pdfs/devis-${id}-${timestamp}.pdf`;
    const blob = bucket.file(fileName);
    
    // Upload vers Google Cloud Storage
    await blob.save(pdfFile.data, {
      metadata: { contentType: 'application/pdf' }
    });
    
    // Mettre à jour l'URL dans la base de données
    await pool.query(
      'UPDATE devis SET pdf_url = $1 WHERE id = $2',
      [fileName, id]
    );
    
    // Supprimer l'ancien PDF si présent
    if (oldPdfUrl) {
      try {
        const oldFile = bucket.file(oldPdfUrl);
        await oldFile.delete();
      } catch (err) {
        console.error('Erreur suppression ancien PDF:', err);
      }
    }
    
    res.json({ 
      message: 'PDF uploadé avec succès',
      pdf_url: fileName
    });
  } catch (err) {
    console.error('Erreur POST /api/devis/:id/upload-pdf:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/devis/:id/pdf - Supprimer le PDF d'un devis
app.delete('/api/devis/:id/pdf', auth, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Récupérer l'URL du PDF
    const result = await pool.query('SELECT pdf_url FROM devis WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Devis non trouvé' });
    }
    
    const pdfUrl = result.rows[0].pdf_url;
    
    if (!pdfUrl) {
      return res.status(404).json({ error: 'Aucun PDF à supprimer' });
    }
    
    // Supprimer du Google Cloud Storage
    try {
      const file = bucket.file(pdfUrl);
      await file.delete();
    } catch (storageErr) {
      console.error('Erreur suppression PDF du storage:', storageErr);
    }
    
    // Mettre à jour la base de données
    await pool.query('UPDATE devis SET pdf_url = NULL WHERE id = $1', [id]);
    
    res.json({ message: 'PDF supprimé' });
  } catch (err) {
    console.error('Erreur DELETE /api/devis/:id/pdf:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/devis/:id/download-pdf - Télécharger le PDF d'un devis
app.get('/api/devis/:id/download-pdf', auth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query('SELECT pdf_url FROM devis WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Devis non trouvé' });
    }
    
    const pdfUrl = result.rows[0].pdf_url;
    
    if (!pdfUrl) {
      return res.status(404).json({ error: 'Aucun PDF disponible' });
    }
    
    const blob = bucket.file(pdfUrl);
    
    const [exists] = await blob.exists();
    if (!exists) {
      return res.status(404).json({ error: 'Fichier PDF non trouvé' });
    }
    
    const [fileContent] = await blob.download();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${pdfUrl}"`);
    res.send(fileContent);
  } catch (err) {
    console.error('Erreur GET /api/devis/:id/download-pdf:', err);
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

// ===================== ROUTE OPTIMISÉE PROSPECTS ENRICHIS =====================
// GET /api/prospects/enriched - Récupérer tous les prospects avec dernier devis actif + actions planifiées
app.get('/api/prospects/enriched', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      WITH derniers_devis AS (
        -- Pour chaque prospect, récupérer le devis le plus récent d'une affaire en cours
        SELECT DISTINCT ON (a.prospect_id)
          a.prospect_id,
          a.nom_affaire,
          d.devis_status,
          d.chance_percent,
          d.quote_date,
          d.setup_amount      AS devis_setup,
          d.monthly_amount    AS devis_monthly,
          d.annual_amount     AS devis_annual,
          d.training_amount   AS devis_training
        FROM affaires a
        INNER JOIN devis d ON d.affaire_id = a.id
        ORDER BY a.prospect_id, 
          CASE a.statut_global WHEN 'Gagné' THEN 1 WHEN 'Perdu' THEN 2 ELSE 0 END,
          d.quote_date DESC NULLS LAST, d.created_at DESC
      ),
      -- Résoudre le prospect_id même quand il est NULL (anciennes actions sans prospect_id)
      actions_resolved AS (
        SELECT
          COALESCE(na.prospect_id, a.prospect_id) AS prospect_id,
          na.action_type,
          na.planned_date,
          na.actor,
          na.contact,
          na.completed,
          na.affaire_id,
          aff.statut_global
        FROM next_actions na
        LEFT JOIN affaires aff ON aff.id = na.affaire_id
        LEFT JOIN affaires a   ON a.id = na.affaire_id
        WHERE na.completed = 0
          AND (
            na.affaire_id IS NULL
            OR aff.statut_global NOT IN ('Gagné', 'Perdu')
          )
          AND COALESCE(na.prospect_id, aff.prospect_id) IS NOT NULL
      ),
      actions_next AS (
        -- Prochaine action non complétée par prospect (la plus proche dans le temps)
        SELECT DISTINCT ON (prospect_id)
          prospect_id,
          action_type,
          planned_date,
          actor,
          contact,
          planned_date < CURRENT_DATE AS is_late
        FROM actions_resolved
        ORDER BY prospect_id, planned_date ASC NULLS LAST
      ),
      actions_info AS (
        -- Comptage actions non complétées par prospect
        SELECT 
          prospect_id,
          COUNT(*) > 0 AS has_action,
          BOOL_OR(planned_date < CURRENT_DATE) AS is_late
        FROM actions_resolved
        GROUP BY prospect_id
      )
      SELECT 
        p.*,
        dd.devis_status       AS real_status,
        dd.chance_percent     AS real_probability,
        dd.nom_affaire        AS real_affaire_name,
        dd.quote_date         AS real_quote_date,
        dd.devis_setup        AS real_setup_amount,
        dd.devis_monthly      AS real_monthly_amount,
        dd.devis_annual       AS real_annual_amount,
        dd.devis_training     AS real_training_amount,
        COALESCE(ai.has_action, false)         AS action_has_action,
        COALESCE(ai.is_late, false)            AS action_is_late,
        an.planned_date                        AS action_next_date,
        an.action_type                         AS action_next_type,
        an.actor                               AS action_next_actor,
        an.contact                             AS action_next_contact,
        COALESCE(an.is_late, false)            AS action_next_is_late
      FROM prospects p
      LEFT JOIN derniers_devis dd ON dd.prospect_id = p.id
      LEFT JOIN actions_info   ai ON ai.prospect_id = p.id
      LEFT JOIN actions_next   an ON an.prospect_id = p.id
      ORDER BY p.name
    `);

    res.json(result.rows);
  } catch (err) {
    console.error('Erreur GET /api/prospects/enriched:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===================== DEBUG TEMPORAIRE =====================
app.get('/api/debug/actions', auth, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT na.id, na.prospect_id, na.affaire_id, na.action_type, na.planned_date, na.completed, a.prospect_id as aff_prospect_id
      FROM next_actions na
      LEFT JOIN affaires a ON a.id = na.affaire_id
      WHERE na.completed = 0
      ORDER BY na.id DESC LIMIT 20
    `);
    res.json(r.rows);
  } catch(err) { res.status(500).json({error: err.message}); }
});

// ===================== RECAP EMAIL =====================
// Clé secrète pour le scheduler (Cloud Scheduler l'envoie en header)
const SCHEDULER_KEY = process.env.SCHEDULER_KEY || 'recap-secret-key';

// Fonction de construction du récap pour un commercial
async function buildRecapData(commercialName) {
  const today = new Date().toISOString().split('T')[0];

  // Prospects du commercial
  const prospectsRes = await pool.query(
    `SELECT id, name, contact_name FROM prospects WHERE assigned_to = $1`,
    [commercialName]
  );
  const prospectIds = prospectsRes.rows.map(p => p.id);
  if (prospectIds.length === 0) return null;

  // Devis en cours sans actions planifiées
  const sansActions = await pool.query(`
    SELECT DISTINCT p.id, p.name, p.contact_name, d.devis_status, d.chance_percent, d.quote_date
    FROM prospects p
    INNER JOIN affaires a ON a.prospect_id = p.id AND a.statut_global NOT IN ('Gagné','Perdu')
    INNER JOIN devis d ON d.affaire_id = a.id
    WHERE p.assigned_to = $1
      AND NOT EXISTS (
        SELECT 1 FROM next_actions na
        WHERE na.prospect_id = p.id AND na.completed = 0
      )
    ORDER BY p.name
  `, [commercialName]);

  // Actions en retard
  const enRetard = await pool.query(`
    SELECT na.id, na.action_type, na.planned_date, na.actor, na.contact,
           p.name as prospect_name
    FROM next_actions na
    INNER JOIN prospects p ON p.id = COALESCE(na.prospect_id,
      (SELECT prospect_id FROM affaires WHERE id = na.affaire_id))
    WHERE p.assigned_to = $1
      AND na.completed = 0
      AND na.planned_date < $2
    ORDER BY na.planned_date ASC
  `, [commercialName, today]);

  // Actions à venir (7 prochains jours)
  const in7days = new Date();
  in7days.setDate(in7days.getDate() + 7);
  const aVenir = await pool.query(`
    SELECT na.id, na.action_type, na.planned_date, na.actor, na.contact,
           p.name as prospect_name
    FROM next_actions na
    INNER JOIN prospects p ON p.id = COALESCE(na.prospect_id,
      (SELECT prospect_id FROM affaires WHERE id = na.affaire_id))
    WHERE p.assigned_to = $1
      AND na.completed = 0
      AND na.planned_date >= $2
      AND na.planned_date <= $3
    ORDER BY na.planned_date ASC
  `, [commercialName, today, in7days.toISOString().split('T')[0]]);

  return {
    commercial: commercialName,
    sansActions: sansActions.rows,
    enRetard: enRetard.rows,
    aVenir: aVenir.rows
  };
}

// Fonction de construction du HTML du mail
function buildEmailHTML(data, isGlobal = false) {
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';
  const title = isGlobal ? 'Récap Pipeline Global — TexasWin' : `Récap Pipeline — ${data[0]?.commercial || ''}`;

  let body = `
  <!DOCTYPE html>
  <html>
  <head><meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', sans-serif; background:#f4f7f7; margin:0; padding:20px; color:#1a3535; }
    .container { max-width:700px; margin:0 auto; background:white; border-radius:10px; overflow:hidden; box-shadow:0 2px 8px rgba(0,125,137,.1); }
    .header { background:#007d89; color:white; padding:24px 28px; }
    .header h1 { margin:0; font-size:20px; font-weight:600; }
    .header p { margin:6px 0 0; font-size:13px; opacity:.85; }
    .section { padding:20px 28px; border-bottom:1px solid #e0ecec; }
    .section:last-child { border-bottom:none; }
    .section-title { font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:.5px; margin-bottom:14px; display:flex; align-items:center; gap:8px; }
    .badge { display:inline-block; padding:2px 10px; border-radius:10px; font-size:12px; font-weight:600; margin-left:6px; }
    .badge-red { background:#fdecea; color:#e74c3c; }
    .badge-orange { background:#fff8e1; color:#f0932b; }
    .badge-green { background:#e8f8f0; color:#2ec27e; }
    table { width:100%; border-collapse:collapse; font-size:13px; }
    th { text-align:left; padding:8px 10px; background:#f4f7f7; color:#607a7a; font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:.4px; }
    td { padding:9px 10px; border-bottom:1px solid #f0f0f0; }
    tr:last-child td { border-bottom:none; }
    .empty { color:#9eb5b5; font-style:italic; font-size:13px; padding:10px 0; }
    .commercial-header { background:#e6f4f5; padding:12px 16px; border-radius:6px; margin-bottom:16px; font-weight:600; color:#007d89; }
    .footer { padding:16px 28px; background:#f4f7f7; font-size:12px; color:#9eb5b5; text-align:center; }
  </style>
  </head>
  <body>
  <div class="container">
    <div style="padding:16px 28px;border-bottom:3px solid #007d89;background:white">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="vertical-align:middle">
          <span style="font-size:17px;font-weight:700;color:#1a3535;letter-spacing:-.3px">TexasWin</span>
          <span style="font-size:17px;font-weight:300;color:#007d89;letter-spacing:-.3px"> Pipeline</span>
          <span style="display:inline-block;margin-left:10px;padding:2px 9px;background:#fdecea;color:#e74c3c;font-size:11px;font-weight:600;border-radius:10px;text-transform:uppercase;letter-spacing:.4px">Actions & Devis</span>
        </td>
        <td align="right" style="font-size:12px;color:#9eb5b5;vertical-align:middle">${new Date().toLocaleDateString('fr-FR', {weekday:'long', day:'numeric', month:'long', year:'numeric'})}</td>
      </tr></table>
    </div>`;

  const sections = Array.isArray(data) ? data : [data];
  
  for (const d of sections) {
    if (!d) continue;
    if (isGlobal) {
      body += `<div class="section"><div class="commercial-header">👤 ${d.commercial}</div>`;
    } else {
      body += `<div class="section">`;
    }

    // Actions en retard EN PREMIER
    body += `<div class="section-title" style="color:#e74c3c">🔴 Actions en retard <span class="badge badge-red">${d.enRetard.length}</span></div>`;
    if (d.enRetard.length === 0) {
      body += `<p class="empty">✓ Aucune action en retard</p>`;
    } else {
      body += `<table><tr><th>Société</th><th>Type</th><th>Date prévue</th><th>De</th><th>Vers</th></tr>`;
      for (const a of d.enRetard) {
        body += `<tr><td>${a.prospect_name}</td><td>${a.action_type||'—'}</td><td style="color:#e74c3c;font-weight:600">${fmtDate(a.planned_date)}</td><td>${a.actor||'—'}</td><td>${a.contact||'—'}</td></tr>`;
      }
      body += `</table>`;
    }

    // Actions à venir
    body += `<div class="section-title" style="color:#2ec27e;margin-top:20px">📅 Actions à venir (7 jours) <span class="badge badge-green">${d.aVenir.length}</span></div>`;
    if (d.aVenir.length === 0) {
      body += `<p class="empty">Aucune action planifiée cette semaine</p>`;
    } else {
      body += `<table><tr><th>Société</th><th>Type</th><th>Date</th><th>De</th><th>Vers</th></tr>`;
      for (const a of d.aVenir) {
        body += `<tr><td>${a.prospect_name}</td><td>${a.action_type||'—'}</td><td style="color:#2ec27e;font-weight:600">${fmtDate(a.planned_date)}</td><td>${a.actor||'—'}</td><td>${a.contact||'—'}</td></tr>`;
      }
      body += `</table>`;
    }

    // Devis sans actions (en dernier)
    body += `<div class="section-title" style="color:#607a7a;margin-top:20px">📋 Devis sans action planifiée <span class="badge" style="background:#f0f0f0;color:#607a7a;padding:2px 8px;border-radius:10px;font-size:11px">${d.sansActions.length}</span></div>`;
    if (d.sansActions.length === 0) {
      body += `<p class="empty">✓ Tous les devis ont une action planifiée</p>`;
    } else {
      body += `<table><tr><th>Société</th><th>Contact</th><th>Statut</th><th>%</th><th>Date devis</th></tr>`;
      for (const p of d.sansActions) {
        body += `<tr><td>${p.name}</td><td>${p.contact_name||'—'}</td><td>${p.devis_status||'—'}</td><td>${p.chance_percent||0}%</td><td>${fmtDate(p.quote_date)}</td></tr>`;
      }
      body += `</table>`;
    }

    body += `</div>`;
  }

  body += `
    <div class="footer">TexasWin Pipeline · Récap automatique · notifications@texaswin.fr</div>
  </div></body></html>`;

  return body;
}

// ── Recap type 3 : Vue globale pipeline ──
async function buildRecapPipeline(commercialName) {
  const prospects = await pool.query(`
    SELECT p.name, p.contact_name, p.assigned_to,
           d.devis_status, d.chance_percent, d.monthly_amount, d.setup_amount, d.quote_date,
           a.nom_affaire
    FROM prospects p
    INNER JOIN affaires a ON a.prospect_id = p.id AND a.statut_global NOT IN ('Gagné','Perdu')
    INNER JOIN devis d ON d.affaire_id = a.id
    WHERE p.assigned_to = $1
      AND d.devis_status NOT IN ('Gagné','Perdu')
    ORDER BY d.chance_percent DESC, p.name
  `, [commercialName]);

  const gagnes = await pool.query(`
    SELECT p.name, p.contact_name, d.monthly_amount, d.annual_amount, d.setup_amount, d.quote_date, a.nom_affaire
    FROM prospects p
    INNER JOIN affaires a ON a.prospect_id = p.id
    INNER JOIN devis d ON d.affaire_id = a.id AND d.devis_status = 'Gagné'
    WHERE p.assigned_to = $1
    ORDER BY d.quote_date DESC
  `, [commercialName]);

  return { commercial: commercialName, pipeline: prospects.rows, gagnes: gagnes.rows };
}

// ── HTML pour récap type 2 : Actions modifiées ──
function buildEmailModifiees(dataList) {
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';
  let body = `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    body{font-family:'Segoe UI',sans-serif;background:#f4f7f7;margin:0;padding:20px;color:#1a3535}
    .container{max-width:700px;margin:0 auto;background:white;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,125,137,.1)}
    /* header remplacé par layout table */
    .section{padding:20px 28px;border-bottom:1px solid #e0ecec}
    .section:last-child{border-bottom:none}
    .stitle{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:14px}
    .commercial-header{background:#e6f4f5;padding:10px 14px;border-radius:6px;margin-bottom:14px;font-weight:600;color:#007d89}
    table{width:100%;border-collapse:collapse;font-size:13px}
    th{text-align:left;padding:8px 10px;background:#f4f7f7;color:#607a7a;font-size:11px;font-weight:600;text-transform:uppercase}
    td{padding:8px 10px;border-bottom:1px solid #f0f0f0}
    tr:last-child td{border-bottom:none}
    .empty{color:#9eb5b5;font-style:italic;font-size:13px}
    .footer{padding:14px 28px;background:#f4f7f7;font-size:12px;color:#9eb5b5;text-align:center}
  </style></head><body><div class="container">
  <div style="padding:16px 28px;border-bottom:3px solid #007d89;background:white">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="vertical-align:middle">
        <span style="font-size:17px;font-weight:700;color:#1a3535;letter-spacing:-.3px">TexasWin</span>
        <span style="font-size:17px;font-weight:300;color:#007d89;letter-spacing:-.3px"> Pipeline</span>
        <span style="display:inline-block;margin-left:10px;padding:2px 9px;background:#e8f4fd;color:#3498db;font-size:11px;font-weight:600;border-radius:10px;text-transform:uppercase;letter-spacing:.4px">Actions semaine</span>
      </td>
      <td align="right" style="font-size:12px;color:#9eb5b5;vertical-align:middle">${new Date().toLocaleDateString('fr-FR', {weekday:'long',day:'numeric',month:'long',year:'numeric'})}</td>
    </tr></table>
  </div>`;

  for (const d of dataList) {
    body += `<div class="section"><div class="commercial-header">👤 ${d.commercial}</div>`;
    
    body += `<div class="stitle" style="color:#2ec27e">✅ Actions complétées (${d.completees.length})</div>`;
    if (d.completees.length === 0) {
      body += `<p class="empty">Aucune action complétée cette semaine</p>`;
    } else {
      body += `<table><tr><th>Société</th><th>Type</th><th>Complétée le</th><th>Note</th></tr>`;
      for (const a of d.completees) {
        body += `<tr><td>${a.prospect_name}</td><td>${a.action_type||'—'}</td><td style="color:#2ec27e">${fmtDate(a.completed_date)}</td><td style="color:#607a7a;font-size:12px">${a.completed_note||'—'}</td></tr>`;
      }
      body += `</table>`;
    }

    body += `<div class="stitle" style="color:#3498db;margin-top:18px">🆕 Actions créées cette semaine (${d.modifiees.length})</div>`;
    if (d.modifiees.length === 0) {
      body += `<p class="empty">Aucune action créée cette semaine</p>`;
    } else {
      body += `<table><tr><th>Société</th><th>Type</th><th>Date prévue</th><th>De</th><th>Vers</th></tr>`;
      for (const a of d.modifiees) {
        body += `<tr><td>${a.prospect_name}</td><td>${a.action_type||'—'}</td><td>${fmtDate(a.planned_date)}</td><td>${a.actor||'—'}</td><td>${a.contact||'—'}</td></tr>`;
      }
      body += `</table>`;
    }
    body += `</div>`;
  }
  body += `<div class="footer">TexasWin Pipeline · notifications@texaswin.fr</div></div></body></html>`;
  return body;
}

// ── HTML pour récap type 3 : Vue pipeline ──
function buildEmailPipeline(dataList) {
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';
  const fmtAmount = (n) => (n||0).toLocaleString('fr-FR', {minimumFractionDigits:2, maximumFractionDigits:2});
  
  let body = `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    body{font-family:'Segoe UI',sans-serif;background:#f4f7f7;margin:0;padding:20px;color:#1a3535}
    .container{max-width:750px;margin:0 auto;background:white;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,125,137,.1)}
    /* header remplacé par layout table */
    .section{padding:20px 28px;border-bottom:1px solid #e0ecec}
    .section:last-child{border-bottom:none}
    .stitle{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:14px}
    .commercial-header{background:#e6f4f5;padding:10px 14px;border-radius:6px;margin-bottom:14px;font-weight:600;color:#007d89}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th{text-align:left;padding:7px 10px;background:#f4f7f7;color:#607a7a;font-size:11px;font-weight:600;text-transform:uppercase}
    td{padding:7px 10px;border-bottom:1px solid #f0f0f0}
    tr:last-child td{border-bottom:none}
    .empty{color:#9eb5b5;font-style:italic;font-size:13px}
    .footer{padding:14px 28px;background:#f4f7f7;font-size:12px;color:#9eb5b5;text-align:center}
    .pct{font-weight:700;padding:2px 7px;border-radius:8px;font-size:11px}
  </style></head><body><div class="container">
  <div style="padding:16px 28px;border-bottom:3px solid #007d89;background:white">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="vertical-align:middle">
        <span style="font-size:17px;font-weight:700;color:#1a3535;letter-spacing:-.3px">TexasWin</span>
        <span style="font-size:17px;font-weight:300;color:#007d89;letter-spacing:-.3px"> Pipeline</span>
        <span style="display:inline-block;margin-left:10px;padding:2px 9px;background:#e6f4f5;color:#007d89;font-size:11px;font-weight:600;border-radius:10px;text-transform:uppercase;letter-spacing:.4px">Vue Pipeline</span>
      </td>
      <td align="right" style="font-size:12px;color:#9eb5b5;vertical-align:middle">${new Date().toLocaleDateString('fr-FR', {weekday:'long',day:'numeric',month:'long',year:'numeric'})}</td>
    </tr></table>
  </div>`;

  // ── KPI globaux calculés sur tous les commerciaux ──
  const allPipeline = dataList.flatMap(d => d.pipeline);
  const allGagnes   = dataList.flatMap(d => d.gagnes);
  const totalSocietes = dataList.reduce((s,d) => s + d.pipeline.length + d.gagnes.length, 0);
  const nbDevis     = allPipeline.length; // déjà filtré Gagné/Perdu dans la requête
  const nbGagnes    = allGagnes.length;
  const aboMensuel  = allPipeline.reduce((s,p) => s+(parseFloat(p.monthly_amount)||0), 0);
  const setupTotal  = allPipeline.reduce((s,p) => s+(parseFloat(p.setup_amount)||0), 0);
  const aboGagnes      = allGagnes.reduce((s,p) => s+(parseFloat(p.monthly_amount)||0), 0);
  const aboGagnesAnnuel= allGagnes.reduce((s,p) => s+(parseFloat(p.annual_amount)||0), 0);
  const setupGagnes    = allGagnes.reduce((s,p) => s+(parseFloat(p.setup_amount)||0), 0);

  body += `
  <table width="100%" cellpadding="0" cellspacing="0" style="border-bottom:2px solid #e0ecec">
    <tr>
      <td width="25%" style="padding:16px 20px;border-right:1px solid #e0ecec;text-align:center;vertical-align:top">
        <div style="font-size:11px;color:#9eb5b5;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Sociétés base</div>
        <div style="font-size:28px;font-weight:700;color:#007d89">${dataList.reduce((s,d)=>s+d.pipeline.length+d.gagnes.length,0)}</div>
        <div style="font-size:11px;color:#9eb5b5;margin-top:4px">${dataList.length} commercial${dataList.length>1?'s':''}</div>
      </td>
      <td width="25%" style="padding:16px 20px;border-right:1px solid #e0ecec;text-align:center;vertical-align:top">
        <div style="font-size:11px;color:#9eb5b5;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Devis en cours</div>
        <div style="font-size:28px;font-weight:700;color:#1a3535">${nbDevis}</div>
        <div style="font-size:11px;color:#2ec27e;margin-top:4px">${nbGagnes} gagné${nbGagnes>1?'s':''}</div>
      </td>
      <td width="25%" style="padding:16px 20px;border-right:1px solid #e0ecec;text-align:center;vertical-align:top">
        <div style="font-size:11px;color:#9eb5b5;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Potentiel Abo/mois</div>
        <div style="font-size:22px;font-weight:700;color:#007d89">${fmtAmount(aboMensuel)} €</div>
        <div style="font-size:11px;color:#9eb5b5;margin-top:4px">Setup ${fmtAmount(setupTotal)} €</div>
      </td>
      <td width="25%" style="padding:16px 20px;text-align:center;vertical-align:top">
        <div style="font-size:11px;color:#9eb5b5;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Signés 2026</div>
        <div style="font-size:22px;font-weight:700;color:#2ec27e">${fmtAmount(aboGagnes)} €/m</div>
        <div style="font-size:11px;color:#9eb5b5;margin-top:2px">+ ${fmtAmount(aboGagnesAnnuel)} €/an</div>
        <div style="font-size:11px;color:#9eb5b5;margin-top:2px">Setup ${fmtAmount(setupGagnes)} €</div>
      </td>
    </tr>
  </table>`;

  for (const d of dataList) {
    const totalAbo = d.pipeline.reduce((s,p) => s+(parseFloat(p.monthly_amount)||0), 0);
    const totalSetup = d.pipeline.reduce((s,p) => s+(parseFloat(p.setup_amount)||0), 0);
    
    body += `<div class="section"><div class="commercial-header">👤 ${d.commercial} — ${d.pipeline.length} devis en cours · Abo: ${fmtAmount(totalAbo)} €/m · Setup: ${fmtAmount(totalSetup)} €</div>`;
    
    body += `<div class="stitle" style="color:#007d89">🪙 Devis en cours</div>`;
    if (d.pipeline.length === 0) {
      body += `<p class="empty">Aucun devis en cours</p>`;
    } else {
      body += `<table><tr><th>Société</th><th>Affaire</th><th>Statut</th><th>%</th><th>Abo/mois</th><th>Setup</th><th>Date devis</th></tr>`;
      for (const p of d.pipeline) {
        const pctColor = p.chance_percent>=60?'#2ec27e':p.chance_percent>=30?'#f0932b':'#e74c3c';
        const pctBg = p.chance_percent>=60?'#e8f8f0':p.chance_percent>=30?'#fff8e1':'#fdecea';
        body += `<tr>
          <td>${p.name}<br><span style="color:#9eb5b5;font-size:11px">${p.contact_name||''}</span></td>
          <td style="color:#607a7a">${p.nom_affaire||'—'}</td>
          <td>${p.devis_status||'—'}</td>
          <td><span class="pct" style="color:${pctColor};background:${pctBg}">${p.chance_percent||0}%</span></td>
          <td style="font-weight:600">${fmtAmount(p.monthly_amount)} €</td>
          <td>${fmtAmount(p.setup_amount)} €</td>
          <td style="color:#9eb5b5">${fmtDate(p.quote_date)}</td>
        </tr>`;
      }
      body += `</table>`;
    }

    if (d.gagnes.length > 0) {
      body += `<div class="stitle" style="color:#2ec27e;margin-top:18px">✅ Gagnés ${new Date().getFullYear()} (${d.gagnes.length})</div>`;
      body += `<table><tr><th>Société</th><th>Abo/mois</th><th>Setup</th><th>Date</th></tr>`;
      for (const p of d.gagnes) {
        body += `<tr><td>${p.name}</td><td style="color:#2ec27e;font-weight:600">${fmtAmount(p.monthly_amount)} €</td><td>${fmtAmount(p.setup_amount)} €</td><td>${fmtDate(p.quote_date)}</td></tr>`;
      }
      body += `</table>`;
    }
    body += `</div>`;
  }
  body += `<div class="footer">TexasWin Pipeline · notifications@texaswin.fr</div></div></body></html>`;
  return body;
}

// POST /api/recap/send-test - Envoyer un récap test à une adresse donnée (admin uniquement)
app.post('/api/recap/send-test', auth, async (req, res) => {
  try {
    const { targetName, recapType } = req.body;
    if (!targetName || !recapType) return res.status(400).json({ error: 'targetName et recapType requis' });

    // Récupérer l'email du destinataire (ou admin si 'Christian')
    // En mode test : TOUJOURS envoyer à Christian
    const adminRes = await pool.query(`SELECT email FROM users WHERE name = 'Christian' LIMIT 1`);
    const toEmail = adminRes.rows[0]?.email;
    if (!toEmail) return res.status(404).json({ error: 'Email Christian non trouvé' });

    let html, subject;

    if (recapType === 'actions') {
      // Type 1 : pour un commercial spécifique
      const data = await buildRecapData(targetName);
      if (!data) return res.status(404).json({ error: 'Aucune donnée pour ce commercial' });
      html = buildEmailHTML([data], targetName !== 'Christian' && targetName !== 'Frédéric');
      subject = `[TEST] ⚠️ Récap Actions — ${targetName}`;

    } else if (recapType === 'pipeline') {
      // Vue Pipeline = TOUJOURS toute l'application (tous utilisateurs avec au moins 1 société)
      const usersRes = await pool.query(`
        SELECT DISTINCT u.name 
        FROM users u
        INNER JOIN prospects p ON p.assigned_to = u.name
        ORDER BY u.name
      `);
      const dataList = [];
      for (const u of usersRes.rows) {
        const d = await buildRecapPipeline(u.name);
        if (d.pipeline.length > 0 || d.gagnes.length > 0) dataList.push(d);
      }
      html = buildEmailPipeline(dataList);
      subject = `[TEST] 📊 Vue Pipeline Globale — ${new Date().toLocaleDateString('fr-FR')}`;
    } else {
      return res.status(400).json({ error: 'Type inconnu' });
    }

    await transporter.sendMail({
      from: `"TexasWin Pipeline" <notifications@texaswin.fr>`,
      to: toEmail,
      subject,
      html
    });

    console.log(`✅ Récap test [${recapType}] envoyé à ${targetName} (${toEmail})`);
    res.json({ ok: true, email: toEmail });
  } catch (err) {
    console.error('Erreur récap test:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Helper : vérifier la clé scheduler ──
const checkSchedulerKey = (req, res) => {
  const key = req.headers['x-scheduler-key'] || req.body?.key;
  if (key !== SCHEDULER_KEY) {
    res.status(401).json({ error: 'Non autorisé' });
    return false;
  }
  return true;
};

// POST /api/recap/send-actions
// ⚠️ Actions & Devis — tous les matins lun-ven à 8h
// Envoie à chaque commercial (sauf Frédéric) son récap individuel
// + récap global à Christian
app.post('/api/recap/send-actions', async (req, res) => {
  if (!checkSchedulerKey(req, res)) return;
  try {
    const usersRes = await pool.query(`SELECT id, name, email FROM users ORDER BY name`);
    const users = usersRes.rows;
    const results = [];

    // Récap individuel pour chaque commercial (tous sauf Frédéric)
    const commerciaux = users.filter(u => !['Frédéric','Frederic'].includes(u.name));
    for (const user of commerciaux) {
      const data = await buildRecapData(user.name);
      if (!data) continue;
      const html = buildEmailHTML([data], false);
      await transporter.sendMail({
        from: `"TexasWin Pipeline" <notifications@texaswin.fr>`,
        to: user.email,
        cc: 'cdaumer92@gmail.com', // CC Christian jusqu'au 27/03/2026
        subject: `⚠️ Récap Actions — ${user.name} — ${new Date().toLocaleDateString('fr-FR')}`,
        html
      });
      results.push({ user: user.name, email: user.email, sent: true });
      console.log(`✅ Actions envoyé à ${user.name} (${user.email})`);
    }

    res.json({ ok: true, sent: results.length, details: results });
  } catch (err) {
    console.error('Erreur send-actions:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/recap/send-pipeline
// 📊 Vue Pipeline — tous les vendredis à 17h
// Envoie la vue globale à Frédéric
app.post('/api/recap/send-pipeline', async (req, res) => {
  if (!checkSchedulerKey(req, res)) return;
  try {
    const fredericRes = await pool.query(`SELECT email FROM users WHERE name IN ('Frédéric','Frederic') LIMIT 1`);
    const toEmail = fredericRes.rows[0]?.email;
    if (!toEmail) return res.status(404).json({ error: 'Email Frédéric non trouvé' });

    const usersWithProspects = await pool.query(`
      SELECT DISTINCT u.name FROM users u
      INNER JOIN prospects p ON p.assigned_to = u.name
      ORDER BY u.name
    `);
    const dataList = [];
    for (const u of usersWithProspects.rows) {
      const data = await buildRecapPipeline(u.name);
      if (data && (data.pipeline.length > 0 || data.gagnes.length > 0)) dataList.push(data);
    }
    if (dataList.length === 0) return res.json({ ok: true, sent: 0, msg: 'Aucune donnée pipeline' });

    const html = buildEmailPipeline(dataList);
    await transporter.sendMail({
      from: `"TexasWin Pipeline" <notifications@texaswin.fr>`,
      to: toEmail,
      cc: 'cdaumer92@gmail.com', // CC Christian jusqu'au 27/03/2026
      subject: `📊 Vue Pipeline — ${new Date().toLocaleDateString('fr-FR')}`,
      html
    });
    console.log(`✅ Vue Pipeline envoyée à Frédéric (${toEmail})`);
    res.json({ ok: true, sent: 1, details: [{ user: 'Frédéric', email: toEmail }] });
  } catch (err) {
    console.error('Erreur send-pipeline:', err);
    res.status(500).json({ error: err.message });
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
