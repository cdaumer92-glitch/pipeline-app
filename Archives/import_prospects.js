import pkg from 'pg';
import fs from 'fs';

const { Pool } = pkg;

// Configuration
const pool = new Pool({
  host: '34.155.151.220',
  port: 5432,
  database: 'pipeline',
  user: 'postgres',
  password: 'Postgres@2024',
  ssl: { rejectUnauthorized: false }
});

async function importProspects() {
  try {
    // 1. Supprimer tous les prospects existants (les actions et activités vont être supprimées en cascade)
    console.log('🗑️  Suppression des prospects existants...');
    await pool.query("DELETE FROM prospects");
    console.log('✅ Prospects supprimés');

    // 2. Lire le JSON
    const prospects = JSON.parse(fs.readFileSync('prospects_export.json', 'utf8'));
    console.log(`✅ ${prospects.length} prospects chargés depuis JSON\n`);

    // 3. Récupérer ou créer Christian
    let userId;
    const userResult = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      ['c.daumer@texaswin.fr']
    );

    if (userResult.rows.length > 0) {
      userId = userResult.rows[0].id;
      console.log(`✅ Utilisateur Christian trouvé (id=${userId})`);
    } else {
      const insertUser = await pool.query(
        "INSERT INTO users (email, password, name, temp_password) VALUES ($1, $2, $3, $4) RETURNING id",
        ['c.daumer@texaswin.fr', 'hashed', 'Christian', 'Cda@texaswin14']
      );
      userId = insertUser.rows[0].id;
      console.log(`✅ Utilisateur Christian créé (id=${userId})`);
    }

    // 4. Importer les prospects
    let count = 0;
    let errors = 0;

    for (const prospect of prospects) {
      try {
        // Corriger les dates vides - utiliser NULL ou la date du jour
        const statusDate = prospect.status_date && prospect.status_date.trim() ? prospect.status_date : null;
        const quoteDate = prospect.quote_date && prospect.quote_date.trim() ? prospect.quote_date : null;

        await pool.query(
          `INSERT INTO prospects 
          (name, contact_name, email, phone, status, status_date, setup_amount, 
           monthly_amount, annual_amount, training_amount, 
           chance_percent, assigned_to, quote_date, decision_maker, notes, user_id, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
          [
            prospect.name,
            prospect.contact_name,
            prospect.email || null,
            prospect.phone || null,
            prospect.status || 'Prospection',
            statusDate,
            prospect.setup_amount || 0,
            prospect.monthly_amount || 0,
            prospect.annual_amount || 0,
            prospect.training_amount || 0,
            prospect.chance_percent || 20,
            prospect.assigned_to,
            quoteDate,
            prospect.decision_maker,
            prospect.notes || null,
            userId,
            prospect.created_at || new Date(),
            prospect.updated_at || new Date()
          ]
        );
        count++;
        console.log(`  ✅ ${prospect.name}`);
      } catch (err) {
        console.error(`  ❌ ${prospect.name}: ${err.message}`);
        errors++;
      }
    }

    console.log(`\n✅ ${count}/${prospects.length} prospects importés!`);
    if (errors > 0) {
      console.log(`⚠️  ${errors} erreurs`);
    }

    await pool.end();
    console.log('\n✅ Import terminé!');
  } catch (err) {
    console.error('❌ Erreur:', err);
    process.exit(1);
  }
}

importProspects();
