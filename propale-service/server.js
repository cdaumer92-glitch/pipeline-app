// propale-service : container dédié génération propale .docx via Python
// Tourne en standalone, expose POST /generate
import express from 'express';
import { spawn } from 'child_process';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = join(__dirname, 'skill');
const SCRIPT = join(SKILL_DIR, 'scripts', 'generer_propale.py');
const PORT = process.env.PORT || 8080;
const SERVICE_SECRET = process.env.SERVICE_SECRET || '';

const app = express();
app.use(express.json({ limit: '10mb' }));

// Santé
app.get('/', (req, res) => {
  res.json({
    ok: true,
    service: 'propale-service',
    skill_present: existsSync(SCRIPT),
    secret_configured: !!SERVICE_SECRET,
  });
});

// Génération
app.post('/generate', async (req, res) => {
  // Auth via secret partagé
  if (SERVICE_SECRET) {
    const provided = req.header('X-Service-Secret');
    if (provided !== SERVICE_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const config = req.body;
  if (!config || !config.societe) {
    return res.status(400).json({ error: 'Config invalide (societe manquant)' });
  }

  // Préparer un dossier temporaire unique
  const jobId = randomUUID();
  const workDir = `/tmp/propale-${jobId}`;
  mkdirSync(workDir, { recursive: true });

  const configPath = join(workDir, 'config.json');
  const outputPath = join(workDir, 'propale.docx');

  try {
    writeFileSync(configPath, JSON.stringify(config), 'utf-8');

    // Lancer le script Python
    const startTs = Date.now();
    const result = await new Promise((resolve, reject) => {
      const proc = spawn('python3', [SCRIPT, configPath, outputPath], {
        cwd: workDir,
        timeout: 60000, // 60s max
      });

      let stdout = '', stderr = '';
      proc.stdout.on('data', d => { stdout += d.toString(); });
      proc.stderr.on('data', d => { stderr += d.toString(); });

      proc.on('close', code => {
        if (code === 0) resolve({ stdout, stderr });
        else reject(new Error(`Script Python exit ${code}: ${stderr || stdout}`));
      });
      proc.on('error', err => reject(err));
    });

    const elapsed = Date.now() - startTs;

    if (!existsSync(outputPath)) {
      return res.status(500).json({ error: 'Le script Python n\'a pas généré le fichier .docx', stdout: result.stdout, stderr: result.stderr });
    }

    const docxBuffer = readFileSync(outputPath);
    const docxB64 = docxBuffer.toString('base64');

    // Cleanup
    try {
      const { rmSync } = await import('fs');
      rmSync(workDir, { recursive: true, force: true });
    } catch {}

    res.json({
      ok: true,
      elapsed_ms: elapsed,
      filename: `propale_${(config.societe || 'sans-nom').replace(/[^a-zA-Z0-9-]/g, '_')}_${new Date().toISOString().slice(0, 7).replace('-', '')}.docx`,
      file_base64: docxB64,
      size: docxBuffer.length,
    });
  } catch (e) {
    return res.status(500).json({ error: 'Génération échouée', message: String(e.message || e).slice(0, 500) });
  }
});

app.listen(PORT, () => {
  console.log(`propale-service écoute sur :${PORT}`);
  console.log(`Skill présent : ${existsSync(SCRIPT)}`);
});
