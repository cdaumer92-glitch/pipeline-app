# propale-service

Container dédié à la génération de propales TexasWin en .docx via Python.

## Architecture

- `Dockerfile` : Node.js 20 + Python 3 + Pillow + defusedxml
- `server.js` : serveur Express minimal (1 route `POST /generate`)
- `skill/` : assets, templates, scripts du générateur

## Endpoints

### `GET /`
Health check. Retourne `{ ok: true, skill_present: boolean }`.

### `POST /generate`
Génère un .docx à partir d'un JSON config TexasWin.

**Headers requis** : `X-Service-Secret: <SERVICE_SECRET>`
**Body** : JSON config (même format que le skill Anthropic)
**Réponse** :
```json
{
  "ok": true,
  "elapsed_ms": 2300,
  "filename": "propale_NomSociete_202604.docx",
  "file_base64": "<base64 du docx>",
  "size": 442000
}
```

## Déploiement Scaleway

1. Créer un nouveau **Serverless Container** sur Scaleway.
2. Source : ce repo, sous-dossier `propale-service/`.
3. Le déploiement utilisera automatiquement le `Dockerfile` (Scaleway le détecte).
4. Variable d'environnement : `SERVICE_SECRET` (générer une chaîne aléatoire, ex: `openssl rand -hex 32`).
5. Port : 8080.

## Test local

```bash
docker build -t propale-service .
docker run -p 8080:8080 -e SERVICE_SECRET=test propale-service

# Dans un autre terminal :
curl http://localhost:8080/
curl -X POST http://localhost:8080/generate \
  -H "Content-Type: application/json" \
  -H "X-Service-Secret: test" \
  -d @config.json \
  -o response.json
```
