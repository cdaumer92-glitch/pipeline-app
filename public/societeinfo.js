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

  function mockSearch(q, searchMode) {
    const Q = (q || '').toLowerCase();
    const mode = searchMode || 'name';
    // 'name' : dénomination + marques uniquement (cohérent avec doc SocieteInfo)
    // 'keyword' / 'auto' / 'legalname' : ajoute le matching sur activity en mock
    //   (en prod, 'keyword' chercherait aussi dans les sites web crawlés)
    const matched = MOCK_COMPANIES.filter(c => {
      const nameMatch = c.name.toLowerCase().includes(Q) ||
                        (c.brands || []).some(b => b.toLowerCase().includes(Q));
      if (mode === 'name' || mode === 'legalname') {
        return nameMatch;
      }
      // keyword / auto : élargit à l'activité
      return nameMatch || c.activity.toLowerCase().includes(Q);
    });
    return {
      success: true,
      total: matched.length,
      searchMode: mode,
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

  // Mock pour Enrich Company : trouve la meilleure société selon name + ville/CP
  // Score simulé : +0.4 si name match, +0.3 si city match, +0.3 si postal_code match
  function mockEnrich(criteria) {
    const name = (criteria.name || '').toLowerCase();
    const city = (criteria.city || '').toLowerCase();
    const cp = (criteria.postal_code || '').trim();
    let best = null;
    let bestScore = 0;
    for (const c of MOCK_COMPANIES) {
      let score = 0;
      const nameMatch = c.name.toLowerCase().includes(name) ||
                        (c.brands || []).some(b => b.toLowerCase().includes(name));
      if (nameMatch) score += 0.4;
      if (city && c.formatted_address.toLowerCase().includes(city)) score += 0.3;
      if (cp && c.formatted_address.startsWith(cp)) score += 0.3;
      if (score > bestScore) { bestScore = score; best = c; }
    }
    const minScore = parseFloat(criteria.min_match_score) || 0;
    if (!best || bestScore < minScore) {
      return { success: false, error: 'Aucune société ne correspond avec un score suffisant', match_info: { score: bestScore } };
    }
    return {
      success: true,
      match_info: { score: parseFloat(bestScore.toFixed(2)), sources: 'Mock' },
      result: best
    };
  }

  // Mock pour Place Autocomplete : retourne quelques places fictives matchant la requête
  function mockPlaceAutocomplete(q) {
    const Q = q.toLowerCase();
    // Structure alignée sur le format normalisé du backend :
    // {id, name, formatted_name, type} avec types techniques SocieteInfo
    const PLACES = [
      { id: 'mock-place-bretagne',       name: 'Bretagne',           formatted_name: 'Bretagne',                                  type: 'administrative_area_level_1' },
      { id: 'mock-place-finistere',      name: 'Finistère',          formatted_name: 'Finistère, Bretagne',                       type: 'administrative_area_level_2' },
      { id: 'mock-place-paris',          name: 'Paris',              formatted_name: 'Paris, Île-de-France',                      type: 'locality' },
      { id: 'mock-place-lyon',           name: 'Lyon',               formatted_name: 'Lyon, Rhône, Auvergne-Rhône-Alpes',          type: 'locality' },
      { id: 'mock-place-saintjeandeluz', name: 'Saint-Jean-de-Luz',  formatted_name: 'Saint-Jean-de-Luz, Pyrénées-Atlantiques',    type: 'locality' },
      { id: 'mock-place-noisy',          name: 'Noisy-le-Grand',     formatted_name: 'Noisy-le-Grand, Seine-Saint-Denis',          type: 'locality' },
      { id: 'mock-place-bordeaux',       name: 'Bordeaux',           formatted_name: 'Bordeaux, Gironde, Nouvelle-Aquitaine',      type: 'locality' },
      { id: 'mock-place-iledefrance',    name: 'Île-de-France',      formatted_name: 'Île-de-France',                              type: 'administrative_area_level_1' }
    ];
    const matched = PLACES.filter(p =>
      p.name.toLowerCase().includes(Q) || p.formatted_name.toLowerCase().includes(Q)
    );
    return {
      success: true,
      total: matched.length,
      result: matched
    };
  }

  // Mock pour Multi-Search : génère des "fausses sociétés" supplémentaires si on est sur des critères larges
  // Filtre les MOCK_COMPANIES selon nafLevel et placeId, applique pagination
  function mockMultiSearch(criteria) {
    let filtered = MOCK_COMPANIES.slice();
    // Filtre approximatif par placeId : on regarde si le code postal mock match
    if (criteria.placeId) {
      const placeMap = {
        'mock-place-bretagne':     /^(22|29|35|56)/,
        'mock-place-finistere':    /^29/,
        'mock-place-paris':        /^75/,
        'mock-place-lyon':         /^69/,
        'mock-place-saintjeandeluz': /^64500/,
        'mock-place-noisy':        /^93160/,
        'mock-place-bordeaux':     /^33/,
        'mock-place-iledefrance':  /^(75|77|78|91|92|93|94|95)/
      };
      const re = placeMap[criteria.placeId];
      if (re) filtered = filtered.filter(c => re.test(c.formatted_address || ''));
    }
    // Filtre par activité (mock ne stocke pas le NAF, on se base sur l'activity textuelle)
    if (criteria.nafLevel) {
      // En mock on simule : si nafLevel commence par '14' on filtre sur "textile"
      if (String(criteria.nafLevel).startsWith('14') || String(criteria.nafLevel).startsWith('47.71')) {
        filtered = filtered.filter(c => /textile|prêt|porter|cuir|maroquinerie|couture|vêtement/i.test(c.activity || ''));
      }
    }
    // Filtres withphone/withemail/withsite : en mock tout est vrai
    // Pagination
    const limit = parseInt(criteria.limit) || 25;
    const page = parseInt(criteria.page) || 1;
    const totalPages = Math.max(1, Math.ceil(filtered.length / limit));
    const start = (page - 1) * limit;
    const pageItems = filtered.slice(start, start + limit);
    return {
      success: true,
      total: filtered.length,
      totalContacts: filtered.length,
      currentPage: page,
      totalPages,
      searchMode: 'multi',
      result: pageItems
    };
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
   * Recherche par nom, marque, ou contenu web
   * @param {string} q - Requête (min 2 caractères)
   * @param {Object} [options] - Options
   * @param {string} [options.searchMode] - 'name' (défaut, dénomination + marques INPI),
   *                                        'keyword' (recherche élargie : sites web, RS, APE),
   *                                        'legalname' (raison sociale stricte),
   *                                        'auto' (legalname puis fallback keyword)
   * @returns {Promise<Object>} { success, result: [...], searchMode, ... }
   */
  async function searchByName(q, options) {
    const trimmed = (q || '').trim();
    if (trimmed.length < 2) {
      throw new Error('Requête trop courte (min 2 caractères)');
    }
    const opts = options || {};
    const allowed = ['name', 'keyword', 'legalname', 'auto'];
    const searchMode = allowed.indexOf(opts.searchMode) !== -1 ? opts.searchMode : 'name';
    if (isMockEnabled()) {
      await mockDelay();
      return mockSearch(trimmed, searchMode);
    }
    return call(`/api/societeinfo/search?q=${encodeURIComponent(trimmed)}&searchMode=${searchMode}`);
  }

  /**
   * Enrich Company : matching ciblé avec score (1 société + match_info.score)
   * Coût identique à searchByName (1 crédit/succès) mais retour focalisé.
   * Plus pertinent quand on a un nom commercial + une localisation.
   *
   * Combinaisons "Killer" : name + street + postal_code + city / name + street / domain_name + name
   * Combinaisons "Good"   : name + postal_code + city / name + city / name + postal_code
   *
   * @param {Object} criteria
   * @param {string} criteria.name - Nom de la société (obligatoire, min 2 caractères)
   * @param {string} [criteria.city] - Ville
   * @param {string} [criteria.postal_code] - Code postal
   * @param {string} [criteria.street] - Rue (optionnel)
   * @param {string} [criteria.domain_name] - Nom de domaine ou URL site
   * @param {string} [criteria.email] - Email
   * @param {string} [criteria.min_match_score] - Score minimum (0.0 à 1.0) pour ne pas payer un match faible
   * @returns {Promise<Object>} { success, match_info: { score, sources }, result: { ...société } }
   */
  async function enrichCompany(criteria) {
    const c = criteria || {};
    const name = (c.name || '').trim();
    if (name.length < 2) {
      throw new Error('Le paramètre name est obligatoire (min 2 caractères)');
    }
    if (isMockEnabled()) {
      await mockDelay();
      return mockEnrich(c);
    }
    const params = [];
    const allowed = ['name', 'street', 'postal_code', 'city', 'domain_name', 'email', 'registration_number', 'min_match_score'];
    for (const k of allowed) {
      const v = (c[k] || '').toString().trim();
      if (v) params.push(`${k}=${encodeURIComponent(v)}`);
    }
    return call(`/api/societeinfo/enrich?${params.join('&')}`);
  }

  /**
   * Place Autocomplete : suggestions de places (ville/dept/région) pour la recherche multi-critères
   * Aucun coût en crédits (endpoint /v3/places.json/autocomplete)
   * @param {string} q - Requête (min 2 caractères)
   * @returns {Promise<Object>} { result: [{ id: '...', name: 'Bretagne', type: 'region', ... }, ...] }
   */
  async function placeAutocomplete(q) {
    const trimmed = (q || '').trim();
    if (trimmed.length < 2) return { result: [] };
    if (isMockEnabled()) {
      await mockDelay();
      return mockPlaceAutocomplete(trimmed);
    }
    return call(`/api/societeinfo/place-autocomplete?q=${encodeURIComponent(trimmed)}`);
  }

  /**
   * Recherche multi-critères : NAF + zone + filtres
   * Coût : 1 crédit / page de résultats (25 résultats max par page).
   *
   * @param {Object} criteria
   * @param {string} [criteria.nafLevel] - Code NAF (ex: '14.13Z') — nécessaire si pas de placeId
   * @param {string} [criteria.placeId] - ID de zone (depuis placeAutocomplete) — nécessaire si pas de nafLevel
   * @param {boolean} [criteria.withphone] - Uniquement sociétés avec téléphone identifié
   * @param {boolean} [criteria.withemail] - Uniquement sociétés avec email
   * @param {boolean} [criteria.withsite] - Uniquement sociétés avec site web
   * @param {number} [criteria.minstaff] - Effectif minimum
   * @param {number} [criteria.maxstaff] - Effectif maximum
   * @param {number} [criteria.page] - Page (1 par défaut)
   * @param {number} [criteria.limit] - Résultats par page (max 25)
   * @returns {Promise<Object>} { success, total, currentPage, totalPages, result: [...] }
   */
  async function multiSearch(criteria) {
    const c = criteria || {};
    if (!c.nafLevel && !c.placeId) {
      throw new Error('Au moins un critère NAF ou zone géographique est requis');
    }
    if (isMockEnabled()) {
      await mockDelay();
      return mockMultiSearch(c);
    }
    const params = [];
    const allowed = ['nafLevel', 'placeId', 'withphone', 'withemail', 'withsite', 'minstaff', 'maxstaff', 'email_type', 'page', 'limit'];
    for (const k of allowed) {
      let v = c[k];
      if (v === undefined || v === null || v === '') continue;
      // Booléens en string 'true'/'false' (format API SocieteInfo)
      if (typeof v === 'boolean') v = v ? 'true' : 'false';
      params.push(`${k}=${encodeURIComponent(String(v))}`);
    }
    return call(`/api/societeinfo/multi-search?${params.join('&')}`);
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

    // L'API SocieteInfo renvoie DEUX formes selon l'endpoint :
    //  • LISTE (/v2/companies.json) + mock : objet PLAT
    //      { name, registration_number, formatted_address, phone?, website?, ... }
    //      ⚠️ l'endpoint liste ne renvoie NI téléphone NI site web — uniquement l'identité + l'adresse.
    //  • DÉTAIL (/v2/company.json/{siren}) : objet IMBRIQUÉ
    //      { organization:{ name, commercial_name, address:{street,postal_code,city}, ... },
    //        contacts:{ phones:[{value}], email, emails:[...] },
    //        web_infos:{ website_url, ... } }
    //      C'est la SEULE forme qui porte le téléphone (contacts.phones[0].value) et le site (web_infos.website_url).
    // On gère les deux ici pour que l'appelant n'ait pas à connaître la forme.
    const org = si.organization || null;
    const ct  = si.contacts || null;
    const web = si.web_infos || null;

    // Nom : priorité au nom commercial / marque, sinon raison sociale
    const name = (org && (org.commercial_name || org.business_name || org.name))
      || si.name || si.brandName || si.commercialName || si.companyName || '';

    // SIREN : registration_number (vrai nom dans l'API SocieteInfo) ou fallbacks
    const siren = String(
      (org && org.registration_number) || si.registration_number || si.siren || si.companyId || ''
    ).replace(/\D/g, '').slice(0, 9);

    // Code NAF : dans le détail, l'activité est sous organization.activity (objet ou string selon les cas)
    const orgActivity = org && org.activity;
    const code_naf = (orgActivity && typeof orgActivity === 'object' && (orgActivity.code || orgActivity.naf_code || orgActivity.naf))
      || (org && org.naf_code)
      || si.naf_code || si.naf || si.nafCode || si.activityCode || '';

    // Adresse : objet imbriqué (détail) > formatted_address (liste) > objet plat > string
    let adresseComplete = '';
    let cp = '';
    let ville = '';
    if (org && org.address && typeof org.address === 'object') {
      const a = org.address;
      const street = a.street || a.line1 || '';
      cp = a.postal_code || a.postCode || a.postalCode || a.zip || '';
      ville = a.city || a.locality || '';
      adresseComplete = [street, cp, ville].filter(Boolean).join(' ').trim();
    } else if (si.formatted_address) {
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

    // Téléphone : détail → contacts.phones[0].value ; sinon fallbacks plats
    let tel_standard = '';
    if (ct && Array.isArray(ct.phones) && ct.phones.length) {
      const p = ct.phones[0];
      tel_standard = (p && typeof p === 'object') ? (p.value || p.number || p.tel || '') : (p || '');
    } else {
      tel_standard = si.phone || si.phoneNumber || si.tel || '';
    }

    // Email société : détail → contacts.email (ou 1er de contacts.emails)
    let email = '';
    if (ct) {
      if (ct.email) email = ct.email;
      else if (Array.isArray(ct.emails) && ct.emails.length) {
        const e = ct.emails[0];
        email = (e && typeof e === 'object') ? (e.value || e.email || '') : (e || '');
      }
    }
    if (!email) email = si.email || '';

    // Site web : détail → web_infos.website_url ; sinon fallbacks plats
    const website = (web && web.website_url) || si.website || si.url || '';

    // Marques (tableau de strings dans le CRM)
    let marques = [];
    if (Array.isArray(si.brands)) {
      marques = si.brands.map(b => (typeof b === 'string' ? b : (b.name || b.brand || ''))).filter(Boolean);
    } else if (org && org.brand) {
      marques = [typeof org.brand === 'string' ? org.brand : (org.brand.name || '')].filter(Boolean);
    } else if (si.brandName && si.brandName !== si.name) {
      marques = [si.brandName];
    }

    // Secteur (libellé NAF / activité) : détail → organization.activity (string ou {label})
    const secteur = (typeof orgActivity === 'string' ? orgActivity : (orgActivity && (orgActivity.label || orgActivity.text)))
      || si.activity || si.nafLabel || si.activityLabel || '';

    return {
      name,
      siren,
      code_naf,
      adresse: adresseComplete,
      cp,
      ville,
      tel_standard,
      email,
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
    enrichCompany,
    placeAutocomplete,
    multiSearch,
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
