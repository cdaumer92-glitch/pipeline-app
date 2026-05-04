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

  // ─── Mode MOCK ───────────────────────────────────────────────
  // Activation : localStorage.setItem('SI_MOCK', '1')
  // Désactivation : localStorage.removeItem('SI_MOCK')
  // Permet de tester toute l'UX (recherche, sélection, dirigeants, import)
  // sans consommer un seul crédit SocieteInfo.

  function isMockEnabled() {
    try { return localStorage.getItem('SI_MOCK') === '1'; }
    catch (e) { return false; }
  }

  // Catalogue de fausses sociétés textile/fashion pour les tests
  const MOCK_COMPANIES = [
    {
      id: 'mock-001',
      registration_number: '111111111',
      full_registration_number: '11111111100018',
      name: 'MAISON DEMO COUTURE',
      activity: 'Création et confection de prêt-à-porter féminin',
      formatted_address: '75008 PARIS',
      lat: 48.8738, lng: 2.3018,
      naf_code: '1413Z',
      phone: '01 42 56 78 90',
      website: 'https://maison-demo.fr',
      brands: ['DEMO COUTURE', 'ATELIER DEMO']
    },
    {
      id: 'mock-002',
      registration_number: '222222222',
      full_registration_number: '22222222200027',
      name: 'TEXTILE TEST SAS',
      activity: 'Négoce de tissus et bonneterie',
      formatted_address: '69002 LYON',
      lat: 45.7485, lng: 4.8365,
      naf_code: '4641Z',
      phone: '04 78 12 34 56',
      website: 'https://textile-test.fr',
      brands: ['TEXTEST']
    },
    {
      id: 'mock-003',
      registration_number: '333333333',
      full_registration_number: '33333333300013',
      name: 'BOUTIQUE FACTICE GROUP',
      activity: 'Commerce de détail d\'habillement en magasin spécialisé',
      formatted_address: '13001 MARSEILLE',
      lat: 43.2980, lng: 5.3811,
      naf_code: '4771Z',
      phone: '04 91 11 22 33',
      website: 'https://factice-group.fr',
      brands: ['FACTICE', 'BOUTIQUE FAC']
    },
    {
      id: 'mock-004',
      registration_number: '444444444',
      full_registration_number: '44444444400024',
      name: 'MODE EXAMPLE SARL',
      activity: 'Fabrication de vêtements de dessus',
      formatted_address: '59000 LILLE',
      lat: 50.6292, lng: 3.0573,
      naf_code: '1413Z',
      phone: '03 20 11 22 33',
      website: '',
      brands: []
    },
    {
      id: 'mock-005',
      registration_number: '555555555',
      full_registration_number: '55555555500011',
      name: 'CUIRCO MOCKED',
      activity: 'Maroquinerie et accessoires de luxe',
      formatted_address: '93160 NOISY-LE-GRAND',
      lat: 48.8498, lng: 2.5627,
      naf_code: '1512Z',
      phone: '01 43 04 56 78',
      website: 'https://cuirco-mocked.fr',
      brands: ['CUIRCO MOCK']
    }
  ];

  // Faux dirigeants par société
  const MOCK_CONTACTS = {
    '111111111': [
      { id: 'c-001-1', gender: 'F', firstName: 'Sophie', lastName: 'DURAND', position: 'Présidente' },
      { id: 'c-001-2', gender: 'M', firstName: 'Jean', lastName: 'MARTIN', position: 'Directeur Général' },
      { id: 'c-001-3', gender: 'F', firstName: 'Claire', lastName: 'BERNARD', position: 'Directrice Commerciale' }
    ],
    '222222222': [
      { id: 'c-002-1', gender: 'M', firstName: 'Pierre', lastName: 'LEFEVRE', position: 'PDG' },
      { id: 'c-002-2', gender: 'F', firstName: 'Marie', lastName: 'DUBOIS', position: 'Directrice Achats' }
    ],
    '333333333': [
      { id: 'c-003-1', gender: 'M', firstName: 'Luc', lastName: 'MOREAU', position: 'Gérant' }
    ],
    '444444444': [
      { id: 'c-004-1', gender: 'F', firstName: 'Anne', lastName: 'GIRARD', position: 'Présidente' },
      { id: 'c-004-2', gender: 'M', firstName: 'Paul', lastName: 'ROUX', position: 'DAF' }
    ],
    '555555555': [
      { id: 'c-005-1', gender: 'M', firstName: 'Thomas', lastName: 'NOIR', position: 'Président Directeur Général' },
      { id: 'c-005-2', gender: 'F', firstName: 'Léa', lastName: 'BLANC', position: 'Directrice Commerciale' },
      { id: 'c-005-3', gender: 'M', firstName: 'Hugo', lastName: 'GRIS', position: 'Responsable Export' }
    ]
  };

  // Délai artificiel pour simuler la latence réseau
  const mockDelay = (ms = 250) => new Promise(r => setTimeout(r, ms));

  function mockSearch(q) {
    const Q = (q || '').toLowerCase();
    const matched = MOCK_COMPANIES.filter(c =>
      c.name.toLowerCase().includes(Q) ||
      (c.brands || []).some(b => b.toLowerCase().includes(Q)) ||
      c.activity.toLowerCase().includes(Q)
    );
    return {
      success: true,
      total: matched.length,
      result: matched
    };
  }

  function mockGetCompany(siren) {
    const cleaned = String(siren || '').replace(/\D/g, '').slice(0, 9);
    const company = MOCK_COMPANIES.find(c => c.registration_number === cleaned);
    if (!company) {
      return { success: false, error: 'Société mock introuvable pour SIREN ' + cleaned };
    }
    return { success: true, result: company };
  }

  function mockGetContacts(siren) {
    const cleaned = String(siren || '').replace(/\D/g, '').slice(0, 9);
    const contacts = MOCK_CONTACTS[cleaned] || [];
    return { success: true, total: contacts.length, result: contacts };
  }

  function mockGetContactsDetails(siren, contactIds) {
    const cleaned = String(siren || '').replace(/\D/g, '').slice(0, 9);
    const contacts = MOCK_CONTACTS[cleaned] || [];
    const wanted = new Set(contactIds);
    // En mock on ajoute des emails et tels factices
    const enriched = contacts.filter(c => wanted.has(c.id)).map(c => ({
      ...c,
      email: `${c.firstName.toLowerCase()}.${c.lastName.toLowerCase()}@${cleaned}-demo.fr`,
      phone: '01 23 45 67 ' + (Math.floor(Math.random() * 90) + 10)
    }));
    return { success: true, total: enriched.length, result: enriched };
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
    if (isMockEnabled()) {
      await mockDelay();
      return mockSearch(trimmed);
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
    if (isMockEnabled()) {
      await mockDelay();
      return mockGetCompany(cleaned);
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
    if (isMockEnabled()) {
      await mockDelay();
      return mockGetContacts(cleaned);
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
    if (isMockEnabled()) {
      await mockDelay();
      return mockGetContactsDetails(cleaned, contactIds);
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
    // En mode mock : aucun doublon n'est jamais détecté (UX complète testable)
    if (isMockEnabled()) {
      await mockDelay(50);
      return null;
    }
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
    checkDuplicateBySiren,
    // Helpers mode mock
    enableMock: () => { localStorage.setItem('SI_MOCK', '1'); console.log('[SInfo] Mode MOCK activé — aucun crédit ne sera consommé. Rechargez la page.'); },
    disableMock: () => { localStorage.removeItem('SI_MOCK'); console.log('[SInfo] Mode mock désactivé. Rechargez la page.'); },
    isMockEnabled
  };

  // Log au chargement si mock actif (warning visible dans la console)
  if (isMockEnabled()) {
    console.warn('%c[SInfo] MODE MOCK ACTIF — toutes les requêtes utilisent des données factices, aucun crédit consommé. Désactivez avec SInfo.disableMock()', 'background:#b06e2a;color:white;padding:4px 8px;border-radius:4px;font-weight:bold;');
  }

})();
