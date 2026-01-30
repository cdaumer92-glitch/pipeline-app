import express from 'express';
import sqlite3 from 'sqlite3';
import cors from 'cors';
import bcryptjs from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';
import path from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = 'ta-clé-secrète-change-en-prod-2024';

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ===================== BD SQLITE =====================
const db = new sqlite3.Database('./pipeline.db', (err) => {
  if (err) console.error('Erreur BD:', err);
  else console.log('✓ BD connectée');
});

// Initialiser les tables et charger les données seed
function initializeDatabase() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        email TEXT UNIQUE,
        password TEXT,
        temp_password TEXT,
        name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      db.run(`ALTER TABLE users ADD COLUMN temp_password TEXT`, (err) => {
        // Ignore si existe
      });

      db.run(`CREATE TABLE IF NOT EXISTS prospects (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        contact_name TEXT,
        email TEXT,
        phone TEXT,
        status TEXT DEFAULT 'Prospection',
        status_date DATE,
        setup_amount REAL DEFAULT 0,
        monthly_amount REAL DEFAULT 0,
        annual_amount REAL DEFAULT 0,
        training_amount REAL DEFAULT 0,
        material_amount REAL DEFAULT 0,
        chance_percent INTEGER DEFAULT 20,
        assigned_to TEXT,
        next_action TEXT,
        deadline DATE,
        quote_date DATE,
        decision_maker TEXT,
        notes TEXT,
        user_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      db.run(`ALTER TABLE prospects ADD COLUMN status_date DATE`, (err) => {
        // Ignore si existe
      });

      db.run(`CREATE TABLE IF NOT EXISTS activities (
        id INTEGER PRIMARY KEY,
        prospect_id INTEGER NOT NULL,
        activity_type TEXT,
        description TEXT,
        activity_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_by TEXT,
        user_id INTEGER,
        FOREIGN KEY(prospect_id) REFERENCES prospects(id)
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS status_history (
        id INTEGER PRIMARY KEY,
        prospect_id INTEGER NOT NULL,
        old_status TEXT,
        new_status TEXT,
        status_date DATE,
        notes TEXT,
        user_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(prospect_id) REFERENCES prospects(id)
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS next_actions (
        id INTEGER PRIMARY KEY,
        prospect_id INTEGER NOT NULL,
        action_type TEXT,
        planned_date DATE,
        actor TEXT,
        completed INTEGER DEFAULT 0,
        completed_date DATE,
        completed_note TEXT,
        user_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(prospect_id) REFERENCES prospects(id)
      )`);

      db.run(`ALTER TABLE next_actions ADD COLUMN completed_note TEXT`, (err) => {
        // Ignore si existe
      });

      db.run(`ALTER TABLE prospects ADD COLUMN annual_amount REAL DEFAULT 0`, (err) => {
        // Ignore si existe
      });

      // Vérifier si on doit charger les données seed
      db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
        if (err) {
          reject(err);
          return;
        }

        if (row.count === 0) {
          // Base vide, charger les données seed
          console.log('📦 Chargement des données seed...');
          loadSeedData(resolve, reject);
        } else {
          console.log('✅ Base de données déjà initialisée');
          resolve();
        }
      });
    });
  });
}

function loadSeedData(resolve, reject) {
  try {
    const seedPath = path.join(__dirname, 'seed-data.json');
    
    if (!fs.existsSync(seedPath)) {
      console.log('⚠️  seed-data.json non trouvé, base vide');
      resolve();
      return;
    }

    const seedData = JSON.parse(fs.readFileSync(seedPath, 'utf8'));

    db.serialize(() => {
      // Charger les utilisateurs
      if (seedData.users && seedData.users.length > 0) {
        console.log(`📝 Chargement de ${seedData.users.length} utilisateurs...`);
        seedData.users.forEach(user => {
          db.run(
            `INSERT OR IGNORE INTO users (id, email, password, temp_password, name, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [user.id, user.email, user.password, user.temp_password, user.name, user.created_at]
          );
        });
      }

      // Charger les prospects
      if (seedData.prospects && seedData.prospects.length > 0) {
        console.log(`📝 Chargement de ${seedData.prospects.length} prospects...`);
        seedData.prospects.forEach(prospect => {
          db.run(
            `INSERT OR IGNORE INTO prospects 
             (id, name, contact_name, email, phone, status, status_date, setup_amount, monthly_amount, annual_amount,
              training_amount, material_amount, chance_percent, assigned_to, next_action, deadline, quote_date, 
              decision_maker, notes, user_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [prospect.id, prospect.name, prospect.contact_name, prospect.email, prospect.phone, prospect.status,
             prospect.status_date, prospect.setup_amount, prospect.monthly_amount, prospect.annual_amount,
             prospect.training_amount, prospect.material_amount, prospect.chance_percent, prospect.assigned_to,
             prospect.next_action, prospect.deadline, prospect.quote_date, prospect.decision_maker, prospect.notes,
             prospect.user_id, prospect.created_at, prospect.updated_at]
          );
        });
      }

      // Charger les next_actions
      if (seedData.next_actions && seedData.next_actions.length > 0) {
        console.log(`📝 Chargement de ${seedData.next_actions.length} next actions...`);
        seedData.next_actions.forEach(action => {
          db.run(
            `INSERT OR IGNORE INTO next_actions 
             (id, prospect_id, action_type, planned_date, actor, completed, completed_date, completed_note, user_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [action.id, action.prospect_id, action.action_type, action.planned_date, action.actor, 
             action.completed, action.completed_date, action.completed_note, action.user_id, action.created_at]
          );
        });
      }

      // Charger l'historique des statuts
      if (seedData.status_history && seedData.status_history.length > 0) {
        console.log(`📝 Chargement de ${seedData.status_history.length} historiques de statuts...`);
        seedData.status_history.forEach(history => {
          db.run(
            `INSERT OR IGNORE INTO status_history 
             (id, prospect_id, old_status, new_status, status_date, notes, user_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [history.id, history.prospect_id, history.old_status, history.new_status, 
             history.status_date, history.notes, history.user_id, history.created_at]
          );
        });
      }

      console.log('✅ Données seed chargées avec succès!');
      resolve();
    });
  } catch (err) {
    console.error('❌ Erreur lors du chargement des données seed:', err);
    reject(err);
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

  const hashedPassword = await bcryptjs.hash(password, 10);

  db.run(
    'INSERT INTO users (email, password, name) VALUES (?, ?, ?)',
    [email, hashedPassword, name],
    function(err) {
      if (err) {
        return res.status(400).json({ error: 'Email existe déjà' });
      }
      const token = jwt.sign({ id: this.lastID, name }, JWT_SECRET, { expiresIn: '30d' });
      res.json({ token, user: { id: this.lastID, email, name } });
    }
  );
});

// CONNEXION
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;

  db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
    if (err || !user) {
      return res.status(400).json({ error: 'Identifiants invalides' });
    }

    const validPassword = await bcryptjs.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Identifiants invalides' });
    }

    const token = jwt.sign({ id: user.id, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  });
});

// ===================== PROSPECTS ENDPOINTS =====================

// GET tous les prospects
app.get('/api/prospects', authenticate, (req, res) => {
  db.all(
    'SELECT * FROM prospects WHERE user_id = ? ORDER BY created_at DESC',
    [req.userId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    }
  );
});

// POST nouveau prospect
app.post('/api/prospects', authenticate, (req, res) => {
  const { name, contact_name, email, phone, status, setup_amount, monthly_amount, annual_amount, training_amount, material_amount, chance_percent, assigned_to, quote_date, decision_maker, notes } = req.body;
  const today = new Date().toISOString().split('T')[0];

  db.run(
    `INSERT INTO prospects
    (name, contact_name, email, phone, status, status_date, setup_amount, monthly_amount, annual_amount, training_amount, material_amount, chance_percent, assigned_to, quote_date, decision_maker, notes, user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, contact_name, email, phone, status || 'Prospection', today, setup_amount || 0, monthly_amount || 0, annual_amount || 0, training_amount || 0, material_amount || 0, chance_percent || 20, assigned_to, quote_date, decision_maker, notes, req.userId],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, message: 'Prospect créé' });
    }
  );
});

// PUT modifier prospect
app.put('/api/prospects/:id', authenticate, (req, res) => {
  const { id } = req.params;
  const { name, contact_name, email, phone, status, setup_amount, monthly_amount, annual_amount, training_amount, material_amount, chance_percent, assigned_to, quote_date, decision_maker, notes } = req.body;
  const today = new Date().toISOString().split('T')[0];

  db.get('SELECT status FROM prospects WHERE id = ? AND user_id = ?', [id, req.userId], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });

    const oldStatus = row ? row.status : null;
    const statusChanged = oldStatus && oldStatus !== status;

    db.run(
      `UPDATE prospects
      SET name=?, contact_name=?, email=?, phone=?, status=?, setup_amount=?, monthly_amount=?, annual_amount=?, training_amount=?, material_amount=?, chance_percent=?, assigned_to=?, quote_date=?, decision_maker=?, notes=?, ${statusChanged ? 'status_date=?,' : ''} updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND user_id=?`,
      statusChanged ? [name, contact_name, email, phone, status, setup_amount, monthly_amount, annual_amount, training_amount, material_amount, chance_percent, assigned_to, quote_date, decision_maker, notes, today, id, req.userId]
                    : [name, contact_name, email, phone, status, setup_amount, monthly_amount, annual_amount, training_amount, material_amount, chance_percent, assigned_to, quote_date, decision_maker, notes, id, req.userId],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Non trouvé' });

        if (statusChanged) {
          db.run(
            `INSERT INTO status_history (prospect_id, old_status, new_status, status_date, notes, user_id)
            VALUES (?, ?, ?, ?, ?, ?)`,
            [id, oldStatus, status, today, notes, req.userId],
            (err) => {
              if (err) console.error('Erreur historique:', err);
              res.json({ message: 'Prospect modifié' });
            }
          );
        } else {
          res.json({ message: 'Prospect modifié' });
        }
      }
    );
  });
});

// DELETE prospect
app.delete('/api/prospects/:id', authenticate, (req, res) => {
  const { id } = req.params;

  db.serialize(() => {
    db.run('DELETE FROM activities WHERE prospect_id=?', [id]);
    db.run('DELETE FROM next_actions WHERE prospect_id=?', [id]);
    db.run('DELETE FROM status_history WHERE prospect_id=?', [id]);

    db.run(
      'DELETE FROM prospects WHERE id=? AND user_id=?',
      [id, req.userId],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Non trouvé' });
        res.json({ message: 'Prospect et toutes ses données supprimés' });
      }
    );
  });
});

// ===================== ACTIVITIES ENDPOINTS =====================

app.get('/api/prospects/:id/activities', authenticate, (req, res) => {
  const { id } = req.params;

  db.all(
    'SELECT * FROM activities WHERE prospect_id=? AND user_id=? ORDER BY activity_date DESC',
    [id, req.userId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    }
  );
});

app.post('/api/prospects/:id/activities', authenticate, (req, res) => {
  const { id } = req.params;
  const { activity_type, description } = req.body;

  db.run(
    'INSERT INTO activities (prospect_id, activity_type, description, created_by, user_id) VALUES (?, ?, ?, ?, ?)',
    [id, activity_type, description, req.userName, req.userId],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, message: 'Activité créée' });
    }
  );
});

// ===================== NEXT ACTIONS ENDPOINTS =====================

app.get('/api/prospects/:id/next_actions', authenticate, (req, res) => {
  const { id } = req.params;

  db.all(
    'SELECT * FROM next_actions WHERE prospect_id=? AND user_id=? ORDER BY planned_date ASC',
    [id, req.userId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    }
  );
});

app.post('/api/prospects/:id/next_actions', authenticate, (req, res) => {
  const { id } = req.params;
  const { action_type, planned_date, actor } = req.body;

  db.run(
    'INSERT INTO next_actions (prospect_id, action_type, planned_date, actor, user_id) VALUES (?, ?, ?, ?, ?)',
    [id, action_type, planned_date, actor, req.userId],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, message: 'Action créée' });
    }
  );
});

app.put('/api/next_actions/:id', authenticate, (req, res) => {
  const { id } = req.params;
  const { completed, completed_notes } = req.body;
  const completedDate = completed ? new Date().toISOString().split('T')[0] : null;

  db.run(
    `UPDATE next_actions
    SET completed=?, completed_date=?, completed_note=?
    WHERE id=? AND user_id=?`,
    [completed ? 1 : 0, completedDate, completed_notes || null, id, req.userId],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Non trouvé' });
      res.json({ message: 'Action mise à jour' });
    }
  );
});

app.delete('/api/next_actions/:id', authenticate, (req, res) => {
  const { id } = req.params;

  db.run(
    'DELETE FROM next_actions WHERE id=? AND user_id=?',
    [id, req.userId],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Non trouvé' });
      res.json({ message: 'Action supprimée' });
    }
  );
});

app.get('/api/prospects/:id/status_history', authenticate, (req, res) => {
  const { id } = req.params;

  db.all(
    'SELECT * FROM status_history WHERE prospect_id=? AND user_id=? ORDER BY created_at DESC',
    [id, req.userId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    }
  );
});

// ===================== GESTION DES UTILISATEURS =====================

app.get('/api/users', authenticate, (req, res) => {
  db.get('SELECT name FROM users WHERE id=?', [req.userId], (err, user) => {
    if (err || !user || user.name !== 'Christian') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    db.all('SELECT id, email, name, temp_password, created_at FROM users ORDER BY name', (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    });
  });
});

app.post('/api/users', authenticate, async (req, res) => {
  db.get('SELECT name FROM users WHERE id=?', [req.userId], async (err, user) => {
    if (err || !user || user.name !== 'Christian') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const { email, password, name } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, mot de passe et nom requis' });
    }

    try {
      const hashedPassword = await bcryptjs.hash(password, 10);
      db.run(
        'INSERT INTO users (email, password, temp_password, name) VALUES (?, ?, ?, ?)',
        [email, hashedPassword, password, name],
        function(err) {
          if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
              return res.status(400).json({ error: 'Cet email existe déjà' });
            }
            return res.status(500).json({ error: err.message });
          }
          res.json({ id: this.lastID, email, name });
        }
      );
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
});

app.put('/api/users/:id/password', authenticate, async (req, res) => {
  db.get('SELECT name FROM users WHERE id=?', [req.userId], async (err, user) => {
    if (err || !user || user.name !== 'Christian') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const { id } = req.params;
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'Mot de passe requis' });
    }

    try {
      const hashedPassword = await bcryptjs.hash(password, 10);
      db.run(
        'UPDATE users SET password=?, temp_password=? WHERE id=?',
        [hashedPassword, password, id],
        function(err) {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ success: true, temp_password: password });
        }
      );
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
});

app.delete('/api/users/:id', authenticate, (req, res) => {
  db.get('SELECT name FROM users WHERE id=?', [req.userId], (err, user) => {
    if (err || !user || user.name !== 'Christian') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const { id } = req.params;

    db.get('SELECT name FROM users WHERE id=?', [id], (err, targetUser) => {
      if (err || !targetUser) {
        return res.status(404).json({ error: 'Utilisateur non trouvé' });
      }

      if (targetUser.name === 'Christian') {
        return res.status(403).json({ error: 'Impossible de supprimer Christian' });
      }

      db.run('DELETE FROM users WHERE id=?', [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
      });
    });
  });
});

// ===================== DÉMARRAGE SERVEUR =====================
initializeDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🚀 Serveur lancé sur http://localhost:${PORT}`);
    console.log('📊 BD SQLite : pipeline.db\n');
  });
}).catch(err => {
  console.error('❌ Erreur lors de l\'initialisation:', err);
  process.exit(1);
});
