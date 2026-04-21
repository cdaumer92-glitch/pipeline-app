const { Client } = require("pg");

const client = new Client({
  host: "51.159.24.123",
  port: 3035,
  user: "Pipeline_Texaswin",
  password: "PipelineScaleway2026SecureDb4xTexasWin!",
  database: "rdb",
  ssl: { rejectUnauthorized: false }
});

(async () => {
  try {
    await client.connect();
    console.log("CONNEXION OK");
    const r = await client.query("SELECT current_user, current_database()");
    console.log("Resultat:", JSON.stringify(r.rows));
    await client.end();
  } catch (e) {
    console.log("ERREUR:", e.message);
  }
})();