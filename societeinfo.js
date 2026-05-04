/* ============================================================
   societeinfo.js — Module front pour SocieteInfo (via proxy backend)
   ------------------------------------------------------------
   Ce module N'utilise JAMAIS la clé API directement.
   Il appelle uniquement les routes /api/societeinfo/* du serveur,
   qui se chargent d'ajouter la clé côté backend.

   Utilisation depuis index.html (composants React) :
     const data = await SInfo.searchByName('cuirco diffusion');
     const company = await SInfo.getCompany('332139583');
     const contacts = await SInfo.getContacts('332139583');
   ============================================================ */

(function() {
  'use strict';

  // ─── Config ──────────────────────────────────────────────────
  // En dev local, on peut surcharger via window.API_URL_OVERRIDE.
  // En prod, l'app utilise des chemins relatifs (/api/...).
  const API_BASE = (typeof window.API_URL !== 'undefined' && window.API_URL)
    ? window.API_URL
    : '';

  // ─── Helpers internes ────────────────────────────────────────

  // Récupère le token JWT depuis localStorage (où l'app le stocke à la connexion)
  function getToken() {
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}');
      return u.token || '';
    } catch (e) {
      return '';
    }
  }

  // Wrapper fetch authentifié vers le proxy backend
  async function call(path) {
    const token = getToken();
    if (!token) {
      throw new Error('Non authentifié — token JWT manquant');
    }
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    let body;
    try {
      body = await res.json();
    } catch (e) {
      body = { error: `Réponse non-JSON (HTTP ${res.status})` };
    }
    if (!res.ok) {
      const err = new Error(body.error || `HTTP ${res.status}`);
      err.status = res.status;
      err.body = body;
      throw err;
    }
    return body;
  }

  // ─── API publique ────────────────────────────────────────────

  /**
   * Vérifie le statut de la clé API SocieteInfo (quota restant, etc.)
   * @returns {Promise<Object>} { success, result: { ... } }
   */
  async function status() {
    return call('/api/societeinfo/status');
  }

  /**
   * Autocomplete au fil de la frappe (rapide, peu coûteux en quota)
   * @param {string} q - Requête (min 2 caractères)
   * @returns {Promise<Array>} Liste de suggestions {id, name, ...}
   */
  async function autocomplete(q) {
    const trimmed = (q || '').trim();
    if (trimmed.length < 2) return { results: [] };
    return call(`/api/societeinfo/autocomplete?q=${encodeURIComponent(trimmed)}`);
  }

  /**
   * Recherche complète par nom OU marque
   * Le mode searchMode=name côté SocieteInfo cherche dans la raison sociale
   * ET dans les marques déposées de l'entreprise.
   * @param {string} q - Requête (min 2 caractères)
   * @returns {Promise<Object>} { success, result: { items: [...] } }
   */
  async function searchByName(q) {
    const trimmed = (q || '').trim();
    if (trimmed.length < 2) {
      throw new Error('Requête trop courte (min 2 caractères)');
    }
    return call(`/api/societeinfo/search?q=${encodeURIComponent(trimmed)}`);
  }

  /**
   * Récupère les détails complets d'une société par son SIREN
   * @param {string} siren - 9 chiffres
   * @returns {Promise<Object>} Détails complets : raison sociale, adresse, NAF, effectifs, CA, etc.
   */
  async function getCompany(siren) {
    const cleaned = String(siren || '').replace(/\D/g, '');
    if (cleaned.length !== 9) {
      throw new Error('SIREN invalide (9 chiffres requis)');
    }
    return call(`/api/societeinfo/company/${cleaned}`);
  }

  /**
   * Récupère les détails d'une société par ID interne SocieteInfo
   * (utile car l'autocomplete peut renvoyer un id pas toujours == SIREN)
   * @param {string} id - ID interne SocieteInfo
   */
  async function getCompanyById(id) {
    if (!id) throw new Error('ID manquant');
    return call(`/api/societeinfo/company-by-id/${encodeURIComponent(id)}`);
  }

  /**
   * Liste les contacts (dirigeants, c-level) d'une société
   * Mode anonymized = on a les noms et fonctions mais pas les emails/tels
   * (ces derniers consomment du quota séparé via getContactsDetails)
   * @param {string} siren
   * @returns {Promise<Object>} Liste de contacts : prénom, nom, fonction, contact_id
   */
  async function getContacts(siren) {
    const cleaned = String(siren || '').replace(/\D/g, '');
    if (cleaned.length !== 9) {
      throw new Error('SIREN invalide');
    }
    return call(`/api/societeinfo/contacts/${cleaned}`);
  }

  /**
   * Récupère les détails complets (avec emails et téléphones) des contacts choisis
   * ⚠️ Cette opération CONSOMME du quota SocieteInfo
   * @param {string} siren
   * @param {Array<string|number>} contactIds - IDs des contacts à enrichir
   */
  async function getContactsDetails(siren, contactIds) {
    const cleaned = String(siren || '').replace(/\D/g, '');
    if (cleaned.length !== 9) {
      throw new Error('SIREN invalide');
    }
    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      throw new Error('Aucun contact sélectionné');
    }
    const ids = contactIds.join(',');
    return call(`/api/societeinfo/contacts-details/${cleaned}?contact_ids=${encodeURIComponent(ids)}`);
  }

  // ─── Mapping helpers : SocieteInfo → modèle interne CRM ──────

  /**
   * Convertit une réponse SocieteInfo de type "company" en objet prospect prêt à insérer
   * dans la BDD (avec tous les champs du modèle CRM existant).
   *
   * On ne renvoie QUE les champs qu'on peut alimenter depuis SocieteInfo —
   * le commercial, le statut prospection, etc. sont gérés côté UI.
   *
   * @param {Object} si - Objet "company" tel que renvoyé par /v2/company.json
   * @returns {Object} { name, siren, code_naf, adresse, cp, ville, tel_standard, website, marques, secteur }
   */
  function companyToProspect(si) {
    if (!si) return {};
    // Nom : priorité au nom commercial / marque, sinon raison sociale
    const name = si.name || si.brandName || si.commercialName || si.companyName || '';

    // SIREN : registration_number (vrai nom dans l'API SocieteInfo) ou fallbacks
    const siren = String(si.registration_number || si.siren || si.companyId || '').replace(/\D/g, '').slice(0, 9);

    // Code NAF
    const code_naf = si.naf_code || si.naf || si.nafCode || si.activityCode || '';

    // Adresse : SocieteInfo renvoie souvent formatted_address (CP + ville déjà concaténés)
    let adresseComplete = '';
    let cp = '';
    let ville = '';
    if (si.formatted_address) {
      adresseComplete = si.formatted_address;
      // Extraire CP + ville depuis "93160 NOISY-LE-GRAND"
      const m = si.formatted_address.match(/^(\d{5})\s+(.+)$/);
      if (m) { cp = m[1]; ville = m[2]; }
    } else if (si.address && typeof si.address === 'object') {
      const street = si.address.street || si.address.line1 || '';
      cp = si.address.postCode || si.address.postalCode || si.address.zip || '';
      ville = si.address.city || si.address.locality || '';
      adresseComplete = [street, cp, ville].filter(Boolean).join(' ').trim();
    } else {
      adresseComplete = si.address || si.addressLine || '';
    }

    // Téléphone
    const tel_standard = si.phone || si.phoneNumber || si.tel || '';

    // Site web
    const website = si.website || si.url || '';

    // Marques (tableau de strings dans le CRM)
    let marques = [];
    if (Array.isArray(si.brands)) {
      marques = si.brands.map(b => (typeof b === 'string' ? b : (b.name || b.brand || ''))).filter(Boolean);
    } else if (si.brandName && si.brandName !== si.name) {
      marques = [si.brandName];
    }

    // Secteur (libellé NAF / activité)
    const secteur = si.activity || si.nafLabel || si.activityLabel || '';

    return {
      name,
      siren,
      code_naf,
      adresse: adresseComplete,
      cp,
      ville,
      tel_standard,
      website,
      marques,
      secteur,
      // Métadonnées de traçabilité
      import_source: 'SInfo',
      import_ref: siren
    };
  }

  /**
   * Convertit un contact SocieteInfo en interlocuteur CRM
   * @param {Object} sic - Contact tel que renvoyé par /v2/contacts.json
   * @returns {Object} { civilite, prenom, nom, fonction, email, telephone, contact_id }
   */
  function contactToInterlocuteur(sic) {
    if (!sic) return {};
    return {
      civilite: sic.gender === 'M' ? 'M.' : sic.gender === 'F' ? 'Mme' : '',
      prenom: sic.firstName || sic.firstname || '',
      nom: sic.lastName || sic.lastname || sic.name || '',
      fonction: sic.position || sic.title || sic.function || sic.role || '',
      email: sic.email || '',
      telephone: sic.phone || sic.phoneNumber || sic.tel || '',
      // Garde l'ID source pour pouvoir re-fetch les détails plus tard
      contact_id: sic.id || sic.contactId || ''
    };
  }

  // ─── Détection de doublons via le CRM (avant import) ─────────

  /**
   * Vérifie si une société avec ce SIREN existe déjà dans le CRM
   * Utilise la route existante GET /api/prospects?siren=XXX
   * @param {string} siren
   * @returns {Promise<Object|null>} Le prospect existant {id, name, siren} ou null
   */
  async function checkDuplicateBySiren(siren) {
    const cleaned = String(siren || '').replace(/\D/g, '');
    if (cleaned.length !== 9) return null;
    const token = getToken();
    if (!token) throw new Error('Non authentifié');
    try {
      const res = await fetch(`${API_BASE}/api/prospects?siren=${cleaned}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) return null;
      const arr = await res.json();
      // La route renvoie un array, vide si pas de match
      if (Array.isArray(arr) && arr.length > 0) return arr[0];
      return null;
    } catch (e) {
      console.warn('[SInfo] checkDuplicateBySiren:', e.message);
      return null;
    }
  }

  // ─── Expose le module sur window.SInfo ───────────────────────
  window.SInfo = {
    status,
    autocomplete,
    searchByName,
    getCompany,
    getCompanyById,
    getContacts,
    getContactsDetails,
    // Mappers
    companyToProspect,
    contactToInterlocuteur,
    // Doublons
    checkDuplicateBySiren
  };

})();
