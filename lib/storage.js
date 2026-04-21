/**
 * lib/storage.js
 *
 * Wrapper Scaleway Object Storage (S3-compatible) pour remplacer
 * @google-cloud/storage dans server.js.
 *
 * Expose les 4 primitives utilisées par server.js :
 *   - saveObject(key, buffer, contentType)
 *   - downloadObject(key) → Buffer
 *   - deleteObject(key)
 *   - objectExists(key) → boolean
 *
 * Design : toutes les erreurs "not found" sont normalisées en retour
 * booléen pour objectExists, et en throw propre pour les autres méthodes.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';

const REGION = process.env.SCW_REGION || 'fr-par';
const BUCKET = process.env.SCW_BUCKET_NAME || 'pipeline-texaswin-devis';
const ENDPOINT = process.env.SCW_ENDPOINT || `https://s3.${REGION}.scw.cloud`;

if (!process.env.SCW_ACCESS_KEY || !process.env.SCW_SECRET_KEY) {
  console.warn(
    '⚠️  SCW_ACCESS_KEY / SCW_SECRET_KEY manquants — le stockage PDF ne fonctionnera pas'
  );
}

const s3 = new S3Client({
  region: REGION,
  endpoint: ENDPOINT,
  credentials: {
    accessKeyId: process.env.SCW_ACCESS_KEY || '',
    secretAccessKey: process.env.SCW_SECRET_KEY || '',
  },
  // Scaleway accepte les deux styles, on garde le défaut (virtual-hosted)
});

/**
 * Upload/remplace un objet.
 * @param {string} key - Chemin dans le bucket (ex: "prospects/prospect-30-xxx.pdf")
 * @param {Buffer} body
 * @param {string} contentType - Ex: "application/pdf"
 */
export async function saveObject(key, body, contentType = 'application/pdf') {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

/**
 * Télécharge un objet en mémoire et retourne son contenu complet.
 * @param {string} key
 * @returns {Promise<Buffer>}
 */
export async function downloadObject(key) {
  const response = await s3.send(
    new GetObjectCommand({ Bucket: BUCKET, Key: key })
  );
  // En v3, Body est un stream. transformToByteArray() renvoie un Uint8Array
  // qu'on convertit en Buffer (API Node attendue par res.send()).
  const bytes = await response.Body.transformToByteArray();
  return Buffer.from(bytes);
}

/**
 * Supprime un objet. Ne jette PAS d'erreur si l'objet n'existe pas
 * (S3 Delete est idempotent par design).
 * @param {string} key
 */
export async function deleteObject(key) {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

/**
 * @param {string} key
 * @returns {Promise<boolean>}
 */
export async function objectExists(key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch (err) {
    if (
      err.name === 'NotFound' ||
      err.name === 'NoSuchKey' ||
      err.$metadata?.httpStatusCode === 404
    ) {
      return false;
    }
    throw err;
  }
}

// Pour debug/info
export const storageConfig = {
  provider: 'scaleway',
  region: REGION,
  bucket: BUCKET,
  endpoint: ENDPOINT,
};
