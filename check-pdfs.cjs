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
  const pdfs = await client.query(`
    SELECT COUNT(*) as total,
           COUNT(pdf_url) as avec_pdf,
           COUNT(CASE WHEN pdf_url LIKE '%storage.googleapis.com%' THEN 1 END) as gcs_urls,
           COUNT(CASE WHEN pdf_url LIKE '%pipeline-devis%' THEN 1 END) as pipeline_devis_urls
    FROM prospects
  `);
  console.log('=== Prospects et PDFs ===');
  console.table(pdfs.rows);
  
  // Voir quelques URLs pour comprendre le format
  const samples = await client.query(`
    SELECT id, name, pdf_url FROM prospects 
    WHERE pdf_url IS NOT NULL 
    LIMIT 5
  `);
  console.log('=== Exemples d\'URLs PDF ===');
  console.table(samples.rows);
  
  // Chercher aussi dans devis (si table existe)
  try {
    const devis = await client.query(`
      SELECT COUNT(*) as total,
             COUNT(pdf_url) as avec_pdf
      FROM devis
    `);
    console.log('=== Devis ===');
    console.table(devis.rows);
  } catch (e) { console.log('Pas de table devis ou autre erreur'); }
  
  await client.end();
})();