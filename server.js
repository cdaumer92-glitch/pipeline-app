import express from 'express';
import nodemailer from 'nodemailer';
import pkg from 'pg';
import cors from 'cors';
import bcryptjs from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fileUpload from 'express-fileupload';
import {
  saveObject,
  downloadObject,
  deleteObject,
  objectExists,
  storageConfig,
} from './lib/storage.js';
import XLSX from 'xlsx';

const { Pool } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 8080;
const JWT_SECRET = process.env.JWT_SECRET || 'secret-key-2024';

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

// ===================== Object Storage (Scaleway) =====================
console.log(
  `📦 Storage : ${storageConfig.provider} / ${storageConfig.bucket} @ ${storageConfig.region}`
);

app.use(cors());
app.use(express.json());
app.use(fileUpload());
app.use(express.static(__dirname));

// Route explicite pour le configurateur (fichier avec C majuscule)
app.get('/configurateur', (req, res) => res.sendFile(join(__dirname, 'Configurateur.html')));

// ===================== DATABASE =====================
// Fonction qui retourne les options du pool (lit process.env)
function getDBConfig() {
  return {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false }
  };
}

const pool = new Pool(getDBConfig());

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

    // Migration: Ajouter contexte dans next_actions si elle n'existe pas
    await client.query(`
      ALTER TABLE next_actions
      ADD COLUMN IF NOT EXISTS contexte VARCHAR(50)
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

    // Migration : stockage du JSON de configuration de propale (admin SAV)
    await client.query(`
      ALTER TABLE devis ADD COLUMN IF NOT EXISTS config_json JSONB
    `);

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

    // ============ TABLES CLIENT (licences, boutiques, matériel) ============

    // Référentiel licences
    await client.query(`CREATE TABLE IF NOT EXISTS licences (
      id SERIAL PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      nom TEXT NOT NULL,
      type TEXT DEFAULT 'saas',
      description TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )`);

    // Insérer les licences de base si pas encore présentes
    // Mettre à jour les noms des licences existantes et en ajouter de nouvelles
    await client.query(`
      INSERT INTO licences (code, nom, type) VALUES
        ('BIZ',        'Biz',                     'saas'),
        ('BIZ_FAB',    'Biz + Fab',               'saas'),
        ('FAB',        'Fab',                     'saas'),
        ('NET_B2B',    'Net B2B',                 'saas'),
        ('NET_AGENTS', 'Net Agents seuls',         'saas'),
        ('NET_B2B_AG', 'Net B2B + Agents',        'saas'),
        ('MAG',        'Mag',                     'saas'),
        ('VRP',        'VRP',                     'saas'),
        ('COL',        'Col',                     'saas'),
        ('LOG',        'Log',                     'saas'),
        ('JET',        'Jet',                     'saas'),
        ('KUB',        'Kub',                     'saas'),
        ('FLUX',       'Flux',                    'saas'),
        ('FACT_ELEC',  'Facturation Électronique','saas'),
        ('COMPTA_SAGE','Compta SAGE',             'saas')
      ON CONFLICT (code) DO UPDATE SET nom = EXCLUDED.nom, type = EXCLUDED.type
    `);
    // Supprimer les anciens codes inutilisés
    await client.query(`
      DELETE FROM licences WHERE code IN ('AGENTS','FLUX_TIERS','PERP_BIZ','PERP_FAB','PERP_BIZ_FAB')
        AND id NOT IN (SELECT DISTINCT licence_id FROM client_licences WHERE licence_id IS NOT NULL)
    `);

    // Référentiel types de matériel
    await client.query(`CREATE TABLE IF NOT EXISTS materiel_types (
      id SERIAL PRIMARY KEY,
      nom TEXT UNIQUE NOT NULL,
      icone TEXT DEFAULT '💻',
      created_at TIMESTAMP DEFAULT NOW()
    )`);

    await client.query(`
      INSERT INTO materiel_types (nom, icone) VALUES
        ('PDA',                   '📱'),
        ('Tablette Windows',      '📊'),
        ('Caisse',                '🖥️'),
        ('Serveur',               '🖥️'),
        ('Imprimante étiquettes', '🖨️'),
        ('PC',                    '💻'),
        ('Autre',                 '📦')
      ON CONFLICT (nom) DO NOTHING
    `);

    // Boutiques
    await client.query(`CREATE TABLE IF NOT EXISTS boutiques (
      id SERIAL PRIMARY KEY,
      prospect_id INTEGER REFERENCES prospects(id) ON DELETE CASCADE,
      nom TEXT NOT NULL,
      adresse TEXT,
      ville TEXT,
      cp TEXT,
      telephone TEXT,
      responsable_id INTEGER REFERENCES interlocuteurs(id) ON DELETE SET NULL,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`);

    // Licences client
    await client.query(`CREATE TABLE IF NOT EXISTS client_licences (
      id SERIAL PRIMARY KEY,
      prospect_id INTEGER REFERENCES prospects(id) ON DELETE CASCADE,
      licence_id INTEGER REFERENCES licences(id) ON DELETE CASCADE,
      nb_utilisateurs INTEGER DEFAULT 0,
      hebergement TEXT DEFAULT 'cloud',
      maintenance TEXT DEFAULT 'aucune',
      date_contrat DATE,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`);

    // Matériel client
    await client.query(`CREATE TABLE IF NOT EXISTS client_materiel (
      id SERIAL PRIMARY KEY,
      prospect_id INTEGER REFERENCES prospects(id) ON DELETE CASCADE,
      boutique_id INTEGER REFERENCES boutiques(id) ON DELETE SET NULL,
      materiel_type_id INTEGER REFERENCES materiel_types(id) ON DELETE SET NULL,
      marque TEXT,
      modele TEXT,
      os TEXT,
      version_os TEXT,
      nb_unites INTEGER DEFAULT 1,
      localisation TEXT,
      date_achat DATE,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`);

    // Version TexasWin installée
    await client.query(`
      ALTER TABLE prospects
      ADD COLUMN IF NOT EXISTS tw_version TEXT
    `);
    await client.query(`
      ALTER TABLE client_licences
      ADD COLUMN IF NOT EXISTS facturation TEXT DEFAULT 'saas_mensuel'
    `);
    await client.query(`
      ALTER TABLE prospects
      ADD COLUMN IF NOT EXISTS statut_societe TEXT DEFAULT 'Prospect'
    `);

    // Migration: colonnes import
    await client.query(`ALTER TABLE prospects ADD COLUMN IF NOT EXISTS cp TEXT`);
    await client.query(`ALTER TABLE prospects ADD COLUMN IF NOT EXISTS ville TEXT`);
    await client.query(`ALTER TABLE prospects ADD COLUMN IF NOT EXISTS secteur TEXT`);
    await client.query(`ALTER TABLE prospects ADD COLUMN IF NOT EXISTS email_societe TEXT`);
    await client.query(`ALTER TABLE prospects ADD COLUMN IF NOT EXISTS siren VARCHAR(9)`);
    await client.query(`ALTER TABLE prospects ADD COLUMN IF NOT EXISTS code_naf VARCHAR(6)`);
    await client.query(`ALTER TABLE prospects ADD COLUMN IF NOT EXISTS marques TEXT[]`);
    await client.query(`ALTER TABLE prospects DROP COLUMN IF EXISTS nom_commercial`);

    // Migration: table codes_naf
    await client.query(`CREATE TABLE IF NOT EXISTS codes_naf (
      code VARCHAR(6) PRIMARY KEY,
      libelle TEXT,
      categorie TEXT
    )`);

    // Migration: colonnes interlocuteurs (prénom séparé du nom)
    await client.query(`ALTER TABLE interlocuteurs ADD COLUMN IF NOT EXISTS prenom TEXT`);
    await client.query(`ALTER TABLE interlocuteurs ADD COLUMN IF NOT EXISTS civilite TEXT`);

    // ========== MIGRATION GCS → Scaleway : préfixes pdf_url ==========
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMP DEFAULT NOW()
      )
    `);

    const migrationName = 'gcs-to-scaleway-pdf-paths-v1';
    const migCheck = await client.query(
      'SELECT 1 FROM migrations WHERE name = $1',
      [migrationName]
    );

    if (migCheck.rows.length === 0) {
      console.log(`⏳ Migration "${migrationName}" en cours...`);
      await client.query('BEGIN');
      try {
        const rp = await client.query(`
          UPDATE prospects
             SET pdf_url = 'prospects/' || pdf_url
           WHERE pdf_url IS NOT NULL
             AND pdf_url NOT LIKE 'prospects/%'
             AND pdf_url NOT LIKE 'devis/%'
        `);

        const rd1 = await client.query(`
          UPDATE devis
             SET pdf_url = 'devis/' || SUBSTRING(pdf_url FROM LENGTH('devis-pdfs/') + 1)
           WHERE pdf_url LIKE 'devis-pdfs/%'
        `);

        const rd2 = await client.query(`
          UPDATE devis
             SET pdf_url = 'devis/' || pdf_url
           WHERE pdf_url IS NOT NULL
             AND pdf_url NOT LIKE 'prospects/%'
             AND pdf_url NOT LIKE 'devis/%'
             AND pdf_url NOT LIKE 'devis-pdfs/%'
        `);

        await client.query(
          'INSERT INTO migrations (name) VALUES ($1)',
          [migrationName]
        );
        await client.query('COMMIT');

        console.log(
          `✅ Migration "${migrationName}" appliquée : ` +
          `${rp.rowCount} prospects, ${rd1.rowCount + rd2.rowCount} devis mis à jour`
        );
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`❌ Migration "${migrationName}" échouée, ROLLBACK :`, err.message);
        throw err;
      }
    } else {
      console.log(`↻ Migration "${migrationName}" déjà appliquée (skip)`);
    }
    // ========== FIN MIGRATION ==========

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
// =====================================================================
// ROUTE PUBLIQUE — Recherche société pour le Configurateur TexasWin
// Sans auth JWT — retourne uniquement : nom, contact principal, adresse
// =====================================================================
app.get('/api/public/companies/search', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const q = (req.query.q || '').trim();
  if (!q || q.length < 2) {
    return res.status(400).json({ error: 'Paramètre q requis (min 2 caractères)' });
  }

  try {
    // 1. Récupérer les sociétés qui matchent
    const companiesResult = await pool.query(`
      SELECT
        p.id,
        p.name                                    AS societe,
        COALESCE(p.adresse, '')                   AS adresse,
        COALESCE(p.ville, '')                     AS ville,
        COALESCE(p.cp, '')                        AS code_postal,
        p.contact_name                            AS fallback_contact
      FROM prospects p
      WHERE p.name ILIKE $1
      ORDER BY p.name ASC
      LIMIT 10
    `, [`%${q}%`]);

    if (companiesResult.rows.length === 0) {
      return res.json([]);
    }

    // 2. Récupérer tous les interlocuteurs de ces sociétés en une seule requête
    const companyIds = companiesResult.rows.map(r => r.id);
    const intersResult = await pool.query(`
      SELECT
        prospect_id,
        id,
        NULLIF(TRIM(COALESCE(prenom,'') || ' ' || COALESCE(nom,'')), '') AS nom,
        COALESCE(fonction, '') AS fonction,
        COALESCE(email, '')    AS email,
        COALESCE(telephone,'') AS telephone,
        COALESCE(principal, false) AS principal,
        COALESCE(decideur, false)  AS decideur
      FROM interlocuteurs
      WHERE prospect_id = ANY($1::int[])
        AND NULLIF(TRIM(COALESCE(prenom,'') || ' ' || COALESCE(nom,'')), '') IS NOT NULL
      ORDER BY prospect_id, principal DESC, decideur DESC, nom ASC
    `, [companyIds]);

    // 3. Grouper les interlocuteurs par société
    const intersByCompany = {};
    for (const i of intersResult.rows) {
      if (!intersByCompany[i.prospect_id]) intersByCompany[i.prospect_id] = [];
      intersByCompany[i.prospect_id].push({
        id:        i.id,
        nom:       i.nom,
        fonction:  i.fonction,
        email:     i.email,
        telephone: i.telephone,
        principal: i.principal,
        decideur:  i.decideur,
      });
    }

    // 4. Construire la réponse
    const rows = companiesResult.rows.map(r => {
      const inters = intersByCompany[r.id] || [];
      // Contact affiché en preview : principal > 1er > contact_name
      const principal = inters.find(i => i.principal) || inters[0];
      const contactPreview = principal
        ? (principal.nom + (principal.fonction ? ', ' + principal.fonction : ''))
        : (r.fallback_contact || '');

      return {
        id:              r.id,
        societe:         r.societe,
        contact:         contactPreview,
        fonction:        principal ? principal.fonction : '',
        adresse:         [r.adresse, r.code_postal, r.ville].filter(Boolean).join(', '),
        interlocuteurs:  inters,
      };
    });

    res.json(rows);
  } catch (err) {
    console.error('Erreur /api/public/companies/search:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/prospects', auth, async (req, res) => {
  try {
    const { siren } = req.query;
    if (siren) {
      const result = await pool.query('SELECT id, name, siren FROM prospects WHERE siren = $1 LIMIT 1', [siren]);
      return res.json(result.rows);
    }
    const result = await pool.query('SELECT * FROM prospects ORDER BY created_at DESC');
    const rows = result.rows.map(r => ({ ...r, marques: Array.isArray(r.marques) ? r.marques : (r.marques ? r.marques : []) }));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/codes-naf', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT code, libelle, categorie FROM codes_naf ORDER BY code');
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
    decision_maker, solutions_en_place, notes, siren, code_naf, marques
  } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO prospects (
        name, contact_name, email, phone, adresse, website, tel_standard, statut_societe,
        status, setup_amount, monthly_amount, annual_amount,
        training_amount, chance_percent, assigned_to, quote_date,
        decision_maker, solutions_en_place, notes, siren, code_naf, marques, user_id, status_date
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,CURRENT_DATE)
      RETURNING id`,
      [
        name, contact_name, email || null, phone || null, adresse || null, website || null, tel_standard || null, statut_societe || 'Prospect',
        status || 'Prospection', setup_amount || 0, monthly_amount || 0, annual_amount || 0,
        training_amount || 0, chance_percent || 20, assigned_to, quote_date || null,
        decision_maker || null, solutions_en_place || null, notes || null, siren || null, code_naf || null,
        (Array.isArray(marques) && marques.length > 0) ? marques : null, req.userId
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
    decision_maker, solutions_en_place, notes, pdf_url, tw_version, siren, code_naf, created_at, marques
  } = req.body;

  try {
    await pool.query(
      `UPDATE prospects SET
        name=$1, contact_name=$2, email=$3, phone=$4, adresse=$5, website=$6, tel_standard=$7, statut_societe=$8,
        status=$9, setup_amount=$10, monthly_amount=$11, annual_amount=$12,
        training_amount=$13, chance_percent=$14, assigned_to=$15, quote_date=$16,
        decision_maker=$17, solutions_en_place=$18, notes=$19, pdf_url=$20,
        tw_version=$21, siren=$22, code_naf=$23, created_at=COALESCE($24, created_at),
        marques=$25, updated_at=NOW()
      WHERE id=$26`,
      [
        name, contact_name, email || null, phone || null, adresse || null, website || null, tel_standard || null, statut_societe || 'Prospect',
        status, setup_amount || 0, monthly_amount || 0, annual_amount || 0,
        training_amount || 0, chance_percent || 20, assigned_to, quote_date || null,
        decision_maker || null, solutions_en_place || null, notes || null, pdf_url || null,
        tw_version || null, siren || null, code_naf || null, created_at || null,
        (Array.isArray(marques) && marques.length > 0) ? marques : null,
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

// GET /api/prospects/:id/actions-all — toutes les actions de l'entreprise (flottantes + liées aux affaires)
app.get('/api/prospects/:id/actions-all', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT na.*, a.nom_affaire
       FROM next_actions na
       LEFT JOIN affaires a ON na.affaire_id = a.id
       WHERE na.prospect_id = $1
       ORDER BY na.planned_date DESC NULLS LAST`,
      [req.params.id]
    );
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
  const { action_type, planned_date, actor, contact, completed_note, affaire_id, contexte } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO next_actions (prospect_id, affaire_id, action_type, planned_date, actor, contact, completed_note, contexte, user_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id',
      [req.params.id, affaire_id || null, action_type, planned_date || null, actor, contact || null, completed_note || null, contexte || null, req.userId]
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

    const fileName = `prospects/prospect-${req.params.id}-${Date.now()}.pdf`;
    await saveObject(fileName, pdfFile.data, 'application/pdf');

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
      try {
        await deleteObject(fileName);
      } catch (storageErr) {
        console.error('Erreur suppression PDF storage:', storageErr);
      }
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

    if (!(await objectExists(fileName))) {
      return res.status(404).json({ error: 'Fichier PDF non trouvé' });
    }

    const fileContent = await downloadObject(fileName);
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
    
    // Supprimer le PDF du storage si présent
    if (devis.pdf_url) {
      try {
        await deleteObject(devis.pdf_url);
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
    const fileName = `devis/devis-${id}-${timestamp}.pdf`;

    // Upload vers Scaleway Object Storage
    await saveObject(fileName, pdfFile.data, 'application/pdf');
    
    // Mettre à jour l'URL dans la base de données
    await pool.query(
      'UPDATE devis SET pdf_url = $1 WHERE id = $2',
      [fileName, id]
    );
    
    // Supprimer l'ancien PDF si présent
    if (oldPdfUrl) {
      try {
        await deleteObject(oldPdfUrl);
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
    
    // Supprimer du Scaleway Object Storage
    try {
      await deleteObject(pdfUrl);
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
    
    if (!(await objectExists(pdfUrl))) {
      return res.status(404).json({ error: 'Fichier PDF non trouvé' });
    }

    const fileContent = await downloadObject(pdfUrl);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${pdfUrl}"`);
    res.send(fileContent);
  } catch (err) {
    console.error('Erreur GET /api/devis/:id/download-pdf:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// GÉNÉRATION PROPOSITION COMMERCIALE VIA CLAUDE API
// ==========================================
// GET /api/health-python : diagnostic Python sur le container
app.get('/api/health-python', auth, async (req, res) => {
  const checks = { _warnings: [] };

  let execp = null;
  try {
    const cp = await import('child_process');
    const util = await import('util');
    execp = util.promisify(cp.exec);
    checks.child_process = 'OK';
  } catch (e) {
    checks.child_process = 'IMPOSSIBLE: ' + (e.message || '').slice(0, 200);
    return res.json({ ok: false, checks });
  }

  const safeExec = async (cmd, label) => {
    try {
      const { stdout, stderr } = await execp(cmd, { timeout: 5000 });
      return (stdout || stderr || '').trim().slice(0, 300) || 'OK';
    } catch (e) {
      return 'ERR: ' + (e.message || 'unknown').slice(0, 200);
    }
  };

  checks.python3 = await safeExec('python3 --version 2>&1', 'python3');
  checks.python  = await safeExec('python --version 2>&1', 'python');
  checks.which_python3 = await safeExec('which python3 || echo none', 'which');
  checks.os = await safeExec('cat /etc/os-release 2>/dev/null | head -3 || uname -a', 'os');
  checks.tmp_writable = await safeExec('echo test > /tmp/healthcheck && rm /tmp/healthcheck && echo OK || echo NON', 'tmp');
  checks.pwd = await safeExec('pwd', 'pwd');
  checks.cwd_listing = await safeExec('ls -la 2>&1 | head -20', 'ls');

  // Si python3 dispo, tester les modules
  if (!checks.python3.startsWith('ERR')) {
    for (const mod of ['PIL', 'defusedxml', 'zipfile', 'json']) {
      checks[`mod_${mod}`] = await safeExec(`python3 -c "import ${mod}; print('OK')" 2>&1`, mod);
    }
    checks.pip = await safeExec('python3 -m pip --version 2>&1', 'pip');
  }

  res.json({ ok: true, checks });
});

// POST /api/devis/generate-proposition
// Body : le JSON d'export du configurateur (exportConfig())
// Retourne : un fichier .docx à télécharger
app.post('/api/devis/generate-proposition', auth, async (req, res) => {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  const SKILL_ID = process.env.ANTHROPIC_PROPALE_SKILL_ID;

  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY manquante sur le serveur' });
  if (!SKILL_ID)         return res.status(500).json({ error: 'ANTHROPIC_PROPALE_SKILL_ID manquante sur le serveur' });

  try {
    const config = req.body;
    if (!config || typeof config !== 'object') {
      return res.status(400).json({ error: 'Corps de requête invalide' });
    }

    // Récupérer l'ID du devis si fourni (pour stocker le JSON de la propale)
    const devisId = req.body.devis_id || null;

    // Filtrer le JSON pour ne garder QUE ce que le script Python lit (gros gain de tokens)
    const minimalConfig = {
      societe:         config.societe,
      contact:         config.contact || '',
      adresse:         config.adresse || '',
      commercial:      config.commercial || 'christian',
      modules_retenus: config.modules_retenus || [],
      propale:         config.propale || {},
    };
    const configJson = JSON.stringify(minimalConfig);

    // Sauvegarder le JSON dans le devis (admin pourra le récupérer pour le SAV)
    if (devisId) {
      try {
        await pool.query(
          'UPDATE devis SET config_json = $1 WHERE id = $2',
          [JSON.stringify(minimalConfig), devisId]
        );
        console.log('[Propale] JSON sauvegardé pour devis_id=', devisId);
      } catch (saveErr) {
        console.warn('[Propale] Erreur sauvegarde JSON devis:', saveErr.message);
        // On continue malgré l'erreur, la génération propale doit aboutir
      }
    }

    // ── MODE HYBRIDE : essai propale-service en priorité ──
    // Si le container propale-service est configuré, on tente une génération rapide (~2-3s)
    // En cas d'échec (timeout, 5xx, réseau), fallback sur l'API skill Anthropic (~90s)
    const PROPALE_SERVICE_URL = process.env.PROPALE_SERVICE_URL;
    const PROPALE_SERVICE_SECRET = process.env.PROPALE_SERVICE_SECRET;

    if (PROPALE_SERVICE_URL) {
      const tStart = Date.now();
      console.log('[Propale] Mode hybride : tentative via propale-service pour', config?.societe || '(inconnu)');

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s max

        const svcRes = await fetch(`${PROPALE_SERVICE_URL}/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(PROPALE_SERVICE_SECRET ? { 'X-Service-Secret': PROPALE_SERVICE_SECRET } : {}),
          },
          body: JSON.stringify(minimalConfig),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!svcRes.ok) {
          const errBody = await svcRes.text();
          throw new Error(`propale-service HTTP ${svcRes.status}: ${errBody.slice(0, 200)}`);
        }

        const svcData = await svcRes.json();
        if (!svcData.ok || !svcData.file_base64) {
          throw new Error(`Réponse propale-service invalide : ${JSON.stringify(svcData).slice(0, 200)}`);
        }

        const buffer = Buffer.from(svcData.file_base64, 'base64');
        const filename = svcData.filename || `propale_${(config.societe || 'sans-nom').replace(/[^a-zA-Z0-9_-]/g, '')}_${new Date().toISOString().slice(0, 7).replace('-', '')}.docx`;

        console.log(`[Propale] ✅ Généré via propale-service en ${Date.now() - tStart}ms (${buffer.length} octets, elapsed_ms côté service: ${svcData.elapsed_ms})`);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(buffer);

      } catch (svcErr) {
        console.warn(`[Propale] ⚠️ propale-service KO après ${Date.now() - tStart}ms (${svcErr.name || 'Error'}: ${svcErr.message}). Fallback sur API skill...`);
        // Continue ci-dessous pour fallback sur l'API skill
      }
    } else {
      console.log('[Propale] PROPALE_SERVICE_URL non configurée, appel direct API skill');
    }
    // ── FIN MODE HYBRIDE ──

    const userMessage = `Genere une proposition commerciale via le script du skill charge.

Trouve le script (chemin probable + fallback find) :
SCRIPT=$(ls /mnt/skills/user/*/scripts/generer_propale.py 2>/dev/null | head -1); [ -z "$SCRIPT" ] && SCRIPT=$(ls /skill*/scripts/generer_propale.py 2>/dev/null | head -1); [ -z "$SCRIPT" ] && SCRIPT=$(find / -name "generer_propale.py" 2>/dev/null | head -1)

Ecris ce JSON dans /tmp/config.json puis execute : python "$SCRIPT" /tmp/config.json /tmp/propale.docx

${configJson}

Execute uniquement le script. Ne genere pas le document toi-meme.`;

    console.log('[Propale] Appel Anthropic API pour société:', config?.societe || '(inconnu)');
    console.log('[Propale] Skill ID utilisé:', SKILL_ID);

    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'code-execution-2025-08-25,skills-2025-10-02,files-api-2025-04-14',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 16000,
        container: {
          skills: [
            { type: 'custom', skill_id: SKILL_ID, version: 'latest' }
          ]
        },
        tools: [
          { type: 'code_execution_20250825', name: 'code_execution' }
        ],
        messages: [
          { role: 'user', content: userMessage }
        ],
      }),
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error('[Propale] Erreur Anthropic API:', apiRes.status, errText);
      return res.status(502).json({ error: `Erreur API Anthropic (${apiRes.status}) : ${errText}` });
    }

    const apiData = await apiRes.json();

    // ── LOGS DE DEBUG : voir ce que Claude a fait ──
    console.log('[Propale] stop_reason:', apiData.stop_reason);
    console.log('[Propale] usage:', JSON.stringify(apiData.usage));
    if (Array.isArray(apiData.content)) {
      apiData.content.forEach((block, i) => {
        if (block.type === 'text') {
          console.log(`[Propale] content[${i}] TEXT:`, block.text?.slice(0, 500));
        } else if (block.type === 'server_tool_use' || block.type === 'tool_use') {
          console.log(`[Propale] content[${i}] ${block.type}:`, block.name, '| input:', JSON.stringify(block.input)?.slice(0, 300));
        } else if (block.type === 'code_execution_tool_result' || block.type === 'tool_result') {
          const content = block.content;
          const preview = typeof content === 'string' ? content : JSON.stringify(content);
          console.log(`[Propale] content[${i}] ${block.type}:`, preview?.slice(0, 500));
        } else {
          console.log(`[Propale] content[${i}] type=${block.type}`);
        }
      });
    }

    // ── Construction de la trace (pour mode debug) ──
    const trace = [];
    trace.push({ step: 'api_call', skill_id: SKILL_ID, stop_reason: apiData.stop_reason, usage: apiData.usage });
    if (Array.isArray(apiData.content)) {
      apiData.content.forEach((block, i) => {
        if (block.type === 'text') {
          trace.push({ step: i, type: 'text', text: block.text });
        } else if (block.type === 'server_tool_use' || block.type === 'tool_use') {
          trace.push({ step: i, type: block.type, name: block.name, input: block.input });
        } else if (block.type === 'code_execution_tool_result' || block.type === 'tool_result') {
          trace.push({ step: i, type: block.type, content: block.content });
        } else {
          trace.push({ step: i, type: block.type, raw: block });
        }
      });
    }

    const isDebug = req.query.debug === '1' || req.query.debug === 'true';

    // Parcourir récursivement pour trouver tous les file_id créés
    const fileIds = [];
    const walk = (obj) => {
      if (!obj) return;
      if (Array.isArray(obj)) { obj.forEach(walk); return; }
      if (typeof obj === 'object') {
        if (obj.file_id && typeof obj.file_id === 'string') {
          if (!fileIds.includes(obj.file_id)) fileIds.push(obj.file_id);
        }
        for (const k of Object.keys(obj)) walk(obj[k]);
      }
    };
    walk(apiData);

    if (fileIds.length === 0) {
      console.error('[Propale] Aucun fichier généré. Réponse brute :', JSON.stringify(apiData).slice(0, 2000));
      return res.status(500).json({
        error: 'Aucun fichier généré par la skill',
        trace,
      });
    }

    // On prend le dernier file_id généré (le .docx final)
    const targetFileId = fileIds[fileIds.length - 1];
    console.log('[Propale] file_id récupéré:', targetFileId, `(${fileIds.length} fichier(s) au total)`);

    // Télécharger le fichier via l'API Files
    const fileRes = await fetch(`https://api.anthropic.com/v1/files/${targetFileId}/content`, {
      method: 'GET',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'files-api-2025-04-14',
      },
    });

    if (!fileRes.ok) {
      const errText = await fileRes.text();
      console.error('[Propale] Erreur download file:', fileRes.status, errText);
      return res.status(502).json({ error: `Erreur téléchargement fichier (${fileRes.status})`, trace });
    }

    const buffer = Buffer.from(await fileRes.arrayBuffer());

    // Nom de fichier pour l'utilisateur
    const societeSlug = (config.societe || 'propale').replace(/[^a-zA-Z0-9_-]/g, '');
    const today = new Date();
    const dateStr = `${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}`;
    const filename = `propale_${societeSlug}_${dateStr}.docx`;

    console.log('[Propale] Fichier envoyé :', filename, `(${buffer.length} octets, ${fileIds.length} file(s) générés)`);

    // Mode debug : renvoyer un JSON avec la trace + le fichier en base64
    if (isDebug) {
      return res.json({
        success: true,
        filename,
        size: buffer.length,
        file_ids_count: fileIds.length,
        all_file_ids: fileIds,
        target_file_id: targetFileId,
        file_base64: buffer.toString('base64'),
        trace,
      });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    console.error('[Propale] Erreur inattendue:', err);
    res.status(500).json({ error: err.message, stack: err.stack });
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

// GET /api/admin/devis/:id/config-json — Télécharger le JSON de config d'un devis (admin uniquement)
app.get('/api/admin/devis/:id/config-json', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT d.config_json, d.devis_name, p.name as societe_name
       FROM devis d
       LEFT JOIN prospects p ON p.id = d.prospect_id
       WHERE d.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Devis non trouvé' });
    }

    const { config_json, societe_name } = result.rows[0];

    if (!config_json) {
      return res.status(404).json({ error: 'Aucun JSON de propale stocké pour ce devis (généré avant cette fonctionnalité, ou propale jamais générée)' });
    }

    const slug = (societe_name || 'devis').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `propale_${slug}_devis-${req.params.id}.json`;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(config_json, null, 2));
  } catch (err) {
    console.error('Erreur GET /api/admin/devis/:id/config-json:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Routes admin pour le panneau de récupération JSON (cascade Société → Affaire → Devis) ──

// GET /api/admin/societes-with-json?q=xxx — Sociétés ayant au moins un devis avec config_json (autocomplete)
app.get('/api/admin/societes-with-json', requireAdmin, async (req, res) => {
  try {
    const q = ((req.query.q || '').trim());
    if (q.length < 2) return res.json([]);

    const result = await pool.query(
      `SELECT DISTINCT p.id, p.name
       FROM prospects p
       INNER JOIN devis d ON d.prospect_id = p.id
       WHERE d.config_json IS NOT NULL
         AND p.name ILIKE $1
       ORDER BY p.name ASC
       LIMIT 20`,
      [`%${q}%`]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Erreur GET /api/admin/societes-with-json:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/societes/:id/affaires-with-json — Affaires d'une société avec au moins un devis ayant config_json
app.get('/api/admin/societes/:id/affaires-with-json', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT a.id, a.nom_affaire, a.statut_global, a.created_at
       FROM affaires a
       INNER JOIN devis d ON d.affaire_id = a.id
       WHERE a.prospect_id = $1
         AND d.config_json IS NOT NULL
       ORDER BY a.created_at DESC`,
      [req.params.id]
    );
    // On ne renvoie pas created_at au client (pas utile pour l'UI)
    res.json(result.rows.map(r => ({ id: r.id, nom_affaire: r.nom_affaire, statut_global: r.statut_global })));
  } catch (err) {
    console.error('Erreur GET /api/admin/societes/:id/affaires-with-json:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/diag-json?societe=Test%20CDA — Route diagnostic : scanne par nom de société
// Montre tous les devis et leur état config_json sans avoir besoin de l'ID
app.get('/api/admin/diag-json', requireAdmin, async (req, res) => {
  try {
    const q = (req.query.societe || '').trim();
    if (!q) return res.status(400).json({ error: 'paramètre ?societe=NomDeLaSociete requis' });

    const prospect = await pool.query(
      `SELECT id, name FROM prospects WHERE name ILIKE $1 ORDER BY name LIMIT 5`,
      [`%${q}%`]
    );
    if (prospect.rows.length === 0) {
      return res.json({ found: false, query: q });
    }

    const results = [];
    for (const p of prospect.rows) {
      const devis = await pool.query(
        `SELECT d.id, d.devis_name, d.affaire_id, d.prospect_id,
                (d.config_json IS NOT NULL) AS has_json,
                CASE WHEN d.config_json IS NOT NULL THEN OCTET_LENGTH(d.config_json::text) ELSE 0 END AS json_size,
                a.nom_affaire, a.prospect_id AS affaire_prospect_id
         FROM devis d
         LEFT JOIN affaires a ON a.id = d.affaire_id
         WHERE d.prospect_id = $1
         ORDER BY d.created_at DESC`,
        [p.id]
      );
      results.push({
        prospect_id: p.id,
        prospect_name: p.name,
        nb_devis: devis.rows.length,
        devis: devis.rows
      });
    }

    res.json({ found: true, query: q, results });
  } catch (err) {
    console.error('Erreur GET /api/admin/diag-json:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/affaires/:id/devis-with-json — Devis d'une affaire qui ont config_json
app.get('/api/admin/affaires/:id/devis-with-json', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, devis_name, devis_status, quote_date, created_at
       FROM devis
       WHERE affaire_id = $1
         AND config_json IS NOT NULL
       ORDER BY created_at DESC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Erreur GET /api/admin/affaires/:id/devis-with-json:', err);
    res.status(500).json({ error: err.message });
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
          -- Prioriser les devis actifs (non Perdu/Gagné) sur les anciens
          CASE d.devis_status WHEN 'Perdu' THEN 1 WHEN 'Gagné' THEN 1 ELSE 0 END,
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

    const rows = result.rows.map(r => ({ ...r, marques: Array.isArray(r.marques) ? r.marques : [] }));
    res.json(rows);
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

// Health check - pour warm-up Cloud Run
app.get('/api/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// Nettoyage licences obsolètes (one-shot)
app.get('/api/admin/clean-licences', auth, async (req, res) => {
  try {
    await pool.query(`DELETE FROM licences WHERE nom ILIKE '%Perpétuelle%'`);
    await pool.query(`DELETE FROM licences WHERE code IN ('AGENTS','FLUX_TIERS','PERP_BIZ','PERP_FAB','PERP_BIZ_FAB')`);
    const r = await pool.query(`SELECT id, code, nom, type FROM licences ORDER BY nom`);
    res.json({ ok: true, licences: r.rows });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ===================== ROUTES CLIENT =====================

// ── Référentiels ──
app.get('/api/licences', auth, async (req, res) => {
  try {
    const r = await pool.query(`SELECT * FROM licences ORDER BY type, nom`);
    res.json(r.rows);
  } catch(err) { res.status(500).json({error: err.message}); }
});

app.get('/api/materiel-types', auth, async (req, res) => {
  try {
    const r = await pool.query(`SELECT * FROM materiel_types ORDER BY nom`);
    res.json(r.rows);
  } catch(err) { res.status(500).json({error: err.message}); }
});

// ── Boutiques ──
app.get('/api/prospects/:id/boutiques', auth, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT b.*, i.nom as responsable_nom, i.telephone as responsable_tel, i.email as responsable_email
      FROM boutiques b
      LEFT JOIN interlocuteurs i ON i.id = b.responsable_id
      WHERE b.prospect_id = $1
      ORDER BY b.nom
    `, [req.params.id]);
    res.json(r.rows);
  } catch(err) { res.status(500).json({error: err.message}); }
});

app.post('/api/prospects/:id/boutiques', auth, async (req, res) => {
  const { nom, adresse, ville, cp, telephone, responsable_id, notes } = req.body;
  try {
    const r = await pool.query(`
      INSERT INTO boutiques (prospect_id, nom, adresse, ville, cp, telephone, responsable_id, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
    `, [req.params.id, nom, adresse||null, ville||null, cp||null, telephone||null, responsable_id||null, notes||null]);
    res.json(r.rows[0]);
  } catch(err) { res.status(500).json({error: err.message}); }
});

app.put('/api/boutiques/:id', auth, async (req, res) => {
  const { nom, adresse, ville, cp, telephone, responsable_id, notes } = req.body;
  try {
    const r = await pool.query(`
      UPDATE boutiques SET nom=$1, adresse=$2, ville=$3, cp=$4, telephone=$5,
        responsable_id=$6, notes=$7, updated_at=NOW()
      WHERE id=$8 RETURNING *
    `, [nom, adresse||null, ville||null, cp||null, telephone||null, responsable_id||null, notes||null, req.params.id]);
    res.json(r.rows[0]);
  } catch(err) { res.status(500).json({error: err.message}); }
});

app.delete('/api/boutiques/:id', auth, async (req, res) => {
  try {
    await pool.query(`DELETE FROM boutiques WHERE id=$1`, [req.params.id]);
    res.json({ok: true});
  } catch(err) { res.status(500).json({error: err.message}); }
});

// ── Licences client ──
app.get('/api/prospects/:id/licences', auth, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT cl.*, l.code, l.nom as licence_nom, l.type as licence_type
      FROM client_licences cl
      INNER JOIN licences l ON l.id = cl.licence_id
      WHERE cl.prospect_id = $1
      ORDER BY l.type DESC, l.nom
    `, [req.params.id]);
    res.json(r.rows);
  } catch(err) { res.status(500).json({error: err.message}); }
});

app.post('/api/prospects/:id/licences', auth, async (req, res) => {
  const { licence_id, nb_utilisateurs, facturation, hebergement, maintenance, date_contrat, notes } = req.body;
  try {
    const r = await pool.query(`
      INSERT INTO client_licences (prospect_id, licence_id, nb_utilisateurs, facturation, hebergement, maintenance, date_contrat, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
    `, [req.params.id, licence_id, nb_utilisateurs||0, facturation||'saas_mensuel', hebergement||'cloud', maintenance||'aucune', date_contrat||null, notes||null]);
    res.json(r.rows[0]);
  } catch(err) { res.status(500).json({error: err.message}); }
});

app.put('/api/licences-client/:id', auth, async (req, res) => {
  const { licence_id, nb_utilisateurs, facturation, hebergement, maintenance, date_contrat, notes } = req.body;
  try {
    const r = await pool.query(`
      UPDATE client_licences SET licence_id=$1, nb_utilisateurs=$2, facturation=$3, hebergement=$4,
        maintenance=$5, date_contrat=$6, notes=$7, updated_at=NOW()
      WHERE id=$8 RETURNING *
    `, [licence_id, nb_utilisateurs||0, facturation||'saas_mensuel', hebergement||'cloud', maintenance||'aucune', date_contrat||null, notes||null, req.params.id]);
    res.json(r.rows[0]);
  } catch(err) { res.status(500).json({error: err.message}); }
});

app.delete('/api/licences-client/:id', auth, async (req, res) => {
  try {
    await pool.query(`DELETE FROM client_licences WHERE id=$1`, [req.params.id]);
    res.json({ok: true});
  } catch(err) { res.status(500).json({error: err.message}); }
});

// ── Matériel client ──
app.get('/api/prospects/:id/materiel', auth, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT cm.*, mt.nom as type_nom, mt.icone as type_icone,
             b.nom as boutique_nom
      FROM client_materiel cm
      LEFT JOIN materiel_types mt ON mt.id = cm.materiel_type_id
      LEFT JOIN boutiques b ON b.id = cm.boutique_id
      WHERE cm.prospect_id = $1
      ORDER BY mt.nom, cm.marque
    `, [req.params.id]);
    res.json(r.rows);
  } catch(err) { res.status(500).json({error: err.message}); }
});

app.post('/api/prospects/:id/materiel', auth, async (req, res) => {
  const { boutique_id, materiel_type_id, marque, modele, os, version_os, nb_unites, localisation, date_achat, notes } = req.body;
  try {
    const r = await pool.query(`
      INSERT INTO client_materiel (prospect_id, boutique_id, materiel_type_id, marque, modele, os, version_os, nb_unites, localisation, date_achat, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *
    `, [req.params.id, boutique_id||null, materiel_type_id||null, marque||null, modele||null, os||null, version_os||null, nb_unites||1, localisation||null, date_achat||null, notes||null]);
    res.json(r.rows[0]);
  } catch(err) { res.status(500).json({error: err.message}); }
});

app.put('/api/materiel-client/:id', auth, async (req, res) => {
  const { boutique_id, materiel_type_id, marque, modele, os, version_os, nb_unites, localisation, date_achat, notes } = req.body;
  try {
    const r = await pool.query(`
      UPDATE client_materiel SET boutique_id=$1, materiel_type_id=$2, marque=$3, modele=$4,
        os=$5, version_os=$6, nb_unites=$7, localisation=$8, date_achat=$9, notes=$10, updated_at=NOW()
      WHERE id=$11 RETURNING *
    `, [boutique_id||null, materiel_type_id||null, marque||null, modele||null, os||null, version_os||null, nb_unites||1, localisation||null, date_achat||null, notes||null, req.params.id]);
    res.json(r.rows[0]);
  } catch(err) { res.status(500).json({error: err.message}); }
});

app.delete('/api/materiel-client/:id', auth, async (req, res) => {
  try {
    await pool.query(`DELETE FROM client_materiel WHERE id=$1`, [req.params.id]);
    res.json({ok: true});
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

// ===================== IMPORT EXCEL =====================
// POST /api/import
// Importe des sociétés + contacts depuis un fichier Excel (2 onglets : Societes / Contacts)
// assigned_to = NULL pour toutes les sociétés importées
app.post('/api/import', auth, async (req, res) => {
  try {
    if (!req.files || !req.files.file) {
      return res.status(400).json({ error: 'Fichier Excel manquant' });
    }

    const workbook = XLSX.read(req.files.file.data, { type: 'buffer' });

    // ── Onglet Societes ──
    const sheetSoc = workbook.Sheets['Societes'] || workbook.Sheets[workbook.SheetNames[0]];
    if (!sheetSoc) return res.status(400).json({ error: 'Onglet "Societes" introuvable' });
    const societes = XLSX.utils.sheet_to_json(sheetSoc, { defval: '' });

    // ── Onglet Contacts ──
    const sheetCont = workbook.Sheets['Contacts'] || workbook.Sheets[workbook.SheetNames[1]];
    const contacts = sheetCont ? XLSX.utils.sheet_to_json(sheetCont, { defval: '' }) : [];

    const statutsValides = ['Suspect', 'Prospect', 'Client'];

    let created = 0, updated = 0, contactsAdded = 0, errors = [];

    for (const row of societes) {
      const nomSociete = (row['nom_societe'] || '').trim();
      if (!nomSociete) { errors.push(`Ligne ignorée : nom_societe vide`); continue; }

      const statut = statutsValides.includes(row['statut']) ? row['statut'] : 'Prospect';
      const statutSociete = statut; // statut_societe = Suspect/Prospect/Client
      // status (pipeline) : on mappe Suspect→Prospection, Prospect→Prospection, Client→Gagné
      const statusPipeline = statut === 'Client' ? 'Gagné' : 'Prospection';

      try {
        // Chercher doublon sur nom (insensible à la casse)
        const existing = await pool.query(
          `SELECT id FROM prospects WHERE LOWER(name) = LOWER($1) LIMIT 1`,
          [nomSociete]
        );

        if (existing.rows.length > 0) {
          // Mise à jour
          const pid = existing.rows[0].id;
          await pool.query(
            `UPDATE prospects SET
              statut_societe = $1,
              status = $2,
              adresse = COALESCE(NULLIF($3,''), adresse),
              cp = COALESCE(NULLIF($4,''), cp),
              ville = COALESCE(NULLIF($5,''), ville),
              phone = COALESCE(NULLIF($6,''), phone),
              email_societe = COALESCE(NULLIF($7,''), email_societe),
              website = COALESCE(NULLIF($8,''), website),
              secteur = COALESCE(NULLIF($9,''), secteur),
              notes = COALESCE(NULLIF($10,''), notes),
              updated_at = NOW()
            WHERE id = $11`,
            [
              statutSociete, statusPipeline,
              row['adresse'] || '', row['cp'] || '', row['ville'] || '',
              row['telephone'] || '', row['email_societe'] || '',
              row['site_web'] || '', row['secteur'] || '', row['notes'] || '',
              pid
            ]
          );
          updated++;
        } else {
          // Création — assigned_to = NULL
          await pool.query(
            `INSERT INTO prospects (
              name, statut_societe, status,
              adresse, cp, ville, phone, email_societe, website, secteur, notes,
              assigned_to, user_id, status_date
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NULL,$12,CURRENT_DATE)`,
            [
              nomSociete, statutSociete, statusPipeline,
              row['adresse'] || null, row['cp'] || null, row['ville'] || null,
              row['telephone'] || null, row['email_societe'] || null,
              row['site_web'] || null, row['secteur'] || null,
              row['notes'] || null,
              req.userId
            ]
          );
          created++;
        }
      } catch (e) {
        errors.push(`${nomSociete} : ${e.message}`);
      }
    }

    // ── Traitement contacts ──
    for (const row of contacts) {
      const nomSociete = (row['nom_societe'] || '').trim();
      if (!nomSociete) continue;

      const prospectRes = await pool.query(
        `SELECT id FROM prospects WHERE LOWER(name) = LOWER($1) LIMIT 1`,
        [nomSociete]
      );
      if (prospectRes.rows.length === 0) {
        errors.push(`Contact ignoré (société introuvable) : ${nomSociete} — ${row['nom'] || '?'}`);
        continue;
      }
      const pid = prospectRes.rows[0].id;

      const nom = (row['nom'] || '').trim();
      const prenom = (row['prenom'] || '').trim();
      const email = (row['email'] || '').trim() || null;

      // Éviter les doublons contact sur email ou nom+prénom
      let dupQuery, dupParams;
      if (email) {
        dupQuery = `SELECT id FROM interlocuteurs WHERE prospect_id=$1 AND email=$2 LIMIT 1`;
        dupParams = [pid, email];
      } else {
        dupQuery = `SELECT id FROM interlocuteurs WHERE prospect_id=$1 AND LOWER(nom)=LOWER($2) AND LOWER(COALESCE(prenom,''))=LOWER($3) LIMIT 1`;
        dupParams = [pid, nom, prenom];
      }
      const dupRes = await pool.query(dupQuery, dupParams);
      if (dupRes.rows.length > 0) continue; // déjà présent, on skip

      const principal = ['oui','yes','1','true'].includes((row['contact_principal'] || '').toLowerCase());

      try {
        await pool.query(
          `INSERT INTO interlocuteurs (prospect_id, civilite, prenom, nom, fonction, telephone, email, principal)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            pid,
            row['civilite'] || null, prenom || null, nom || null,
            row['fonction'] || null, row['telephone'] || null,
            email, principal
          ]
        );
        contactsAdded++;
      } catch (e) {
        errors.push(`Contact ${nom} (${nomSociete}) : ${e.message}`);
      }
    }

    res.json({
      ok: true,
      created,
      updated,
      contactsAdded,
      errors,
      total: societes.length
    });

  } catch (err) {
    console.error('Erreur import:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===================== ATTRIBUTION COMMERCIAL =====================
// PUT /api/prospects/attribuer-bulk
// Attribue plusieurs sociétés à des commerciaux + envoie UN mail par commercial
app.put('/api/attributions/bulk', auth, async (req, res) => {
  try {
    const { attributions } = req.body; // [{ id, commercial_name }, ...]
    if (!Array.isArray(attributions) || attributions.length === 0)
      return res.status(400).json({ error: 'attributions[] requis' });

    // 1. Mise à jour en BDD de chaque société
    for (const { id, commercial_name } of attributions) {
      await pool.query(
        `UPDATE prospects SET assigned_to = $1, updated_at = NOW() WHERE id = $2`,
        [commercial_name, id]
      );
    }

    // 2. Récupérer les détails des sociétés mises à jour
    const ids = attributions.map(a => a.id);
    const prospectsRes = await pool.query(
      `SELECT id, name, statut_societe, ville FROM prospects WHERE id = ANY($1)`,
      [ids]
    );
    const prospectsMap = {};
    prospectsRes.rows.forEach(p => { prospectsMap[p.id] = p; });

    // 3. Grouper par commercial
    const byCommercial = {};
    for (const { id, commercial_name } of attributions) {
      if (!byCommercial[commercial_name]) byCommercial[commercial_name] = [];
      if (prospectsMap[id]) byCommercial[commercial_name].push({ ...prospectsMap[id] });
    }

    const appUrl = process.env.APP_URL || 'https://pipeline-app-702707858708.europe-west9.run.app';

    // 4. Un seul mail par commercial
    for (const [commercial_name, societes] of Object.entries(byCommercial)) {
      const userRes = await pool.query(`SELECT email, name FROM users WHERE name = $1 LIMIT 1`, [commercial_name]);
      if (userRes.rows.length === 0) continue;
      const commercial = userRes.rows[0];

      const n = societes.length;
      const lignesSocietes = societes.map(p => {
        const ficheUrl = `${appUrl}/#prospect-${p.id}`;
        return `
          <tr>
            <td style="padding:12px 16px;border-bottom:1px solid #e0ecec">
              <div style="font-size:15px;font-weight:700;color:#007d89">${p.name}</div>
              <div style="font-size:12px;color:#607a7a;margin-top:2px">${p.statut_societe || 'Prospect'}${p.ville ? ' · ' + p.ville : ''}</div>
            </td>
            <td style="padding:12px 16px;border-bottom:1px solid #e0ecec;text-align:right;white-space:nowrap">
              <a href="${ficheUrl}" style="display:inline-block;background:#007d89;color:#fff;text-decoration:none;padding:7px 16px;border-radius:5px;font-size:12px;font-weight:700">Voir la fiche →</a>
            </td>
          </tr>`;
      }).join('');

      const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f0f4f4;font-family:Arial,sans-serif">
<div style="max-width:600px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="background:#007d89;padding:20px 28px">
        <span style="color:#fff;font-size:18px;font-weight:700">TexasWin Pipeline</span>
        <span style="float:right;background:#2ec27e;color:#fff;font-size:11px;font-weight:700;padding:4px 10px;border-radius:12px;margin-top:2px">Nouvelle attribution</span>
      </td>
    </tr>
    <tr>
      <td style="padding:28px">
        <p style="margin:0 0 16px;font-size:15px;color:#1a3535">Bonjour <strong>${commercial.name}</strong>,</p>
        <p style="margin:0 0 20px;font-size:14px;color:#444">${n} société${n > 1 ? 's vous ont été attribuées' : ' vous a été attribuée'} :</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f8f8;border-radius:6px;border:1px solid #cde8e8;margin-bottom:24px">
          ${lignesSocietes}
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 28px;background:#f0f4f4;border-top:1px solid #e0ecec">
        <p style="margin:0;font-size:11px;color:#9eb5b5;text-align:center">TexasWin Pipeline · notifications@texaswin.fr</p>
      </td>
    </tr>
  </table>
</div>
</body></html>`;

      await transporter.sendMail({
        from: `"TexasWin Pipeline" <notifications@texaswin.fr>`,
        to: commercial.email,
        subject: n > 1
          ? `🎯 ${n} nouvelles sociétés attribuées`
          : `🎯 Nouvelle société attribuée : ${societes[0].name}`,
        html
      });

      console.log(`✅ Mail attribution envoyé à ${commercial.name} (${commercial.email}) — ${n} société(s)`);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Erreur attribution bulk:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/prospects/:id/attribuer
// Attribue un commercial à une société + envoie un mail de notification
app.put('/api/prospects/:id/attribuer', auth, async (req, res) => {
  try {
    const { commercial_name } = req.body;
    if (!commercial_name) return res.status(400).json({ error: 'commercial_name requis' });

    const prospectRes = await pool.query(`SELECT name, statut_societe, ville FROM prospects WHERE id = $1`, [req.params.id]);
    if (prospectRes.rows.length === 0) return res.status(404).json({ error: 'Société introuvable' });
    const prospect = prospectRes.rows[0];

    // Mettre à jour assigned_to
    await pool.query(
      `UPDATE prospects SET assigned_to = $1, updated_at = NOW() WHERE id = $2`,
      [commercial_name, req.params.id]
    );

    // Récupérer l'email du commercial
    const userRes = await pool.query(`SELECT email, name FROM users WHERE name = $1 LIMIT 1`, [commercial_name]);
    if (userRes.rows.length > 0) {
      const commercial = userRes.rows[0];
      const appUrl = process.env.APP_URL || 'https://pipeline-app-702707858708.europe-west9.run.app';
      const ficheUrl = `${appUrl}/#prospect-${req.params.id}`;

      const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f0f4f4;font-family:Arial,sans-serif">
<div style="max-width:560px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="background:#007d89;padding:20px 28px">
        <span style="color:#fff;font-size:18px;font-weight:700">TexasWin Pipeline</span>
        <span style="float:right;background:#2ec27e;color:#fff;font-size:11px;font-weight:700;padding:4px 10px;border-radius:12px;margin-top:2px">Nouvelle attribution</span>
      </td>
    </tr>
    <tr>
      <td style="padding:28px">
        <p style="margin:0 0 16px;font-size:15px;color:#1a3535">Bonjour <strong>${commercial.name}</strong>,</p>
        <p style="margin:0 0 20px;font-size:14px;color:#444">Une nouvelle société vous a été attribuée :</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f8f8;border-radius:6px;border:1px solid #cde8e8;margin-bottom:24px">
          <tr>
            <td style="padding:16px 20px">
              <div style="font-size:18px;font-weight:700;color:#007d89;margin-bottom:4px">${prospect.name}</div>
              <div style="font-size:13px;color:#607a7a">${prospect.statut_societe || 'Prospect'}${prospect.ville ? ' · ' + prospect.ville : ''}</div>
            </td>
          </tr>
        </table>
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td align="center">
              <a href="${ficheUrl}" style="display:inline-block;background:#007d89;color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:14px;font-weight:700">Ouvrir la fiche →</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 28px;background:#f0f4f4;border-top:1px solid #e0ecec">
        <p style="margin:0;font-size:11px;color:#9eb5b5;text-align:center">TexasWin Pipeline · notifications@texaswin.fr</p>
      </td>
    </tr>
  </table>
</div>
</body></html>`;

      await transporter.sendMail({
        from: `"TexasWin Pipeline" <notifications@texaswin.fr>`,
        to: commercial.email,
        subject: `🎯 Nouvelle société attribuée : ${prospect.name}`,
        html
      });

      console.log(`✅ Mail attribution envoyé à ${commercial.name} (${commercial.email})`);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Erreur attribution:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/prospects/non-attribues — liste des sociétés sans commercial (admin)
app.get('/api/prospects/non-attribues', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM prospects WHERE assigned_to IS NULL OR assigned_to = '' ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/societes/suspects-non-attribues/count — compte les suspects sans commercial
app.get('/api/societes/suspects-non-attribues/count', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT COUNT(*) FROM prospects WHERE statut_societe = 'Suspect' AND (assigned_to IS NULL OR assigned_to = '')`
    );
    res.json({ count: parseInt(result.rows[0].count, 10) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/societes/suspects-non-attribues — supprime tous les suspects sans commercial
app.delete('/api/societes/suspects-non-attribues', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM prospects WHERE statut_societe = 'Suspect' AND (assigned_to IS NULL OR assigned_to = '') RETURNING id`
    );
    res.json({ deleted: result.rowCount });
  } catch (err) {
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
