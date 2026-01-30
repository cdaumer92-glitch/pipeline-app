import pkg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const { Pool } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));

// Configuration PostgreSQL
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'pipeline',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'Connect@bdd1286',
  ssl: process.env.DB_SSL ? { rejectUnauthorized: false } : false
});

async function importData() {
  try {
    console.log('📦 Lecture de seed-data.json...');
    const seedPath = path.join(__dirname, 'seed-data.json');
    
    if (!fs.existsSync(seedPath)) {
      console.error('❌ seed-data.json non trouvé !');
      process.exit(1);
    }

    const seedData = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
    const client = await pool.connect();

    try {
      // Importer les utilisateurs
      if (seedData.users && seedData.users.length > 0) {
        console.log(`📝 Import de ${seedData.users.length} utilisateurs...`);
        for (const user of seedData.users) {
          await client.query(
            `INSERT INTO users (id, email, password, temp_password, name, created_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (email) DO NOTHING`,
            [user.id, user.email, user.password, user.temp_password, user.name, user.created_at]
          );
        }
        console.log('✅ Utilisateurs importés');
      }

      // Importer les prospects
      if (seedData.prospects && seedData.prospects.length > 0) {
        console.log(`📝 Import de ${seedData.prospects.length} prospects...`);
        for (const prospect of seedData.prospects) {
          await client.query(
            `INSERT INTO prospects 
             (id, name, contact_name, email, phone, status, status_date, setup_amount, monthly_amount, annual_amount,
              training_amount, material_amount, chance_percent, assigned_to, next_action, deadline, quote_date, 
              decision_maker, notes, user_id, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
             ON CONFLICT (id) DO NOTHING`,
            [prospect.id, prospect.name, prospect.contact_name, prospect.email || null, prospect.phone || null, prospect.status,
             prospect.status_date || null, prospect.setup_amount, prospect.monthly_amount, prospect.annual_amount,
             prospect.training_amount, prospect.material_amount, prospect.chance_percent, prospect.assigned_to,
             prospect.next_action || null, prospect.deadline || null, prospect.quote_date || null, prospect.decision_maker || null, prospect.notes || null,
             prospect.user_id, prospect.created_at, prospect.updated_at]
          );
        }
        console.log('✅ Prospects importés');
      }

      // Importer les next_actions
      if (seedData.next_actions && seedData.next_actions.length > 0) {
        console.log(`📝 Import de ${seedData.next_actions.length} next actions...`);
        for (const action of seedData.next_actions) {
          await client.query(
            `INSERT INTO next_actions 
             (id, prospect_id, action_type, planned_date, actor, completed, completed_date, completed_note, user_id, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             ON CONFLICT (id) DO NOTHING`,
            [action.id, action.prospect_id, action.action_type, action.planned_date || null, action.actor, 
             action.completed, action.completed_date || null, action.completed_note || null, action.user_id, action.created_at]
          );
        }
        console.log('✅ Next actions importées');
      }

      // Importer l'historique
      if (seedData.status_history && seedData.status_history.length > 0) {
        console.log(`📝 Import de ${seedData.status_history.length} historiques...`);
        for (const history of seedData.status_history) {
          await client.query(
            `INSERT INTO status_history 
             (id, prospect_id, old_status, new_status, status_date, notes, user_id, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (id) DO NOTHING`,
            [history.id, history.prospect_id, history.old_status, history.new_status, 
             history.status_date || null, history.notes || null, history.user_id, history.created_at]
          );
        }
        console.log('✅ Historiques importés');
      }

      console.log('\n🎉 Tous les données ont été importées avec succès!');
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('❌ Erreur lors de l\'import:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

importData();
