import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function initializeDatabase(db) {
  return new Promise((resolve, reject) => {
    // Créer les tables
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
          loadSeedData(db, resolve, reject);
        } else {
          console.log('✅ Base de données déjà initialisée');
          resolve();
        }
      });
    });
  });
}

function loadSeedData(db, resolve, reject) {
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

      // Charger les activities
      if (seedData.activities && seedData.activities.length > 0) {
        console.log(`📝 Chargement de ${seedData.activities.length} activités...`);
        seedData.activities.forEach(activity => {
          db.run(
            `INSERT OR IGNORE INTO activities 
             (id, prospect_id, activity_type, description, activity_date, created_by, user_id)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [activity.id, activity.prospect_id, activity.activity_type, activity.description, 
             activity.activity_date, activity.created_by, activity.user_id]
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
