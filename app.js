// ============================================================
// Suivi de travaux d'instrumentation — app.js
// L'application fonctionne entièrement HORS SERVEUR.
// Toute la persistance (brouillon, fichiers, cases cochées,
// approbations) passe par IndexedDB. La sauvegarde durable et
// volontaire se fait dans un dossier choisi par l'utilisateur via
// la File System Access API (Chrome/Edge de bureau). server.js
// n'est plus appelé par le flux principal — il reste disponible
// pour une future fonction de synchronisation, isolée et facultative.
// ============================================================

// ---------- Listes de vérification (reflètent les fiches PDF) ----------
const CHECKLISTS = {
  installation: {
    identification: [
      ['identification.tmsFils', 'TMS sur tous les fils'],
      ['identification.tagsStainless', 'Tags de stainless sur tous les câbles et joyplugs'],
      ['identification.cartesPlastique', 'Cartes de plastique sur chaque élément de champ'],
      ['identification.plaquetteEquipement', 'Plaquette d\u2019identification à l\u2019équipement'],
    ],
    plans: [
      ['plans.planBoucle', 'Plan de la boucle mis à jour'],
      ['plans.plansBjis', 'Plans des BJIs mis à jour'],
      ['plans.plansAlimentations', 'Plans des alimentations électriques mis à jour, si nécessaire'],
      ['plans.ficheHpm', 'Fiche du HPM corrigée'],
      ['plans.plansDiagrammes', 'Plans des diagrammes de procédé mis à jour'],
      ['plans.sama', 'SAMA corrigé avec l\u2019ingénieur de système'],
      ['plans.remisePanneau', 'Mise à jour remise dans le panneau concerné'],
    ],
    programmation: [
      ['programmation.collaboration', 'Collaboration avec l\u2019ingénieur de système'],
      ['programmation.contournement', 'Contournement de programme réalisé'],
      ['programmation.calibration', 'Calibration des équipements et étalonnage au TDC'],
      ['programmation.modifsCl', 'Ajouts ou modifications au programme CL'],
    ],
    systeme: [
      ['systeme.immpower', 'Mise à jour dans Immpower'],
      ['systeme.nouvelleLoc', 'Nouvelle localisation ajoutée'],
      ['systeme.coordonnees', 'Coordonnées X-Y-Z ajoutées ou corrigées'],
      ['systeme.hierarchie', 'Hiérarchie mise à jour (-INST, -DEM, etc.)'],
      ['systeme.nouveauxItems', 'Nouveaux items de pièces de rechange ajoutés'],
      ['systeme.codeSpecs', 'Code de spécifications créé, si nécessaire'],
      ['systeme.liensPieces', 'Liens avec pièces de rechange et inventaire ajoutés'],
      ['systeme.routeEntretien', 'Route d\u2019entretien créée ou corrigée'],
      ['systeme.livretMaj', 'Livret d\u2019instrumentation mis à jour'],
      ['systeme.docNouvelItem', 'Documentation ajoutée pour un nouvel item'],
    ],
    information: [
      ['information.rapportActivite', 'Rapport d\u2019activité détaillé complété, si requis'],
      ['information.bibliotheque', 'Documents ajoutés à la bibliothèque et index mis à jour'],
      ['information.aviserProduction', 'Production avisée que le travail est terminé, si requis'],
    ],
    securite: [
      ['securite.cadenassage', 'Fiches de cadenassage : opérations avisées'],
      ['securite.nettoyage', 'Lieux de travail nettoyés'],
      ['securite.armoiresRousseau', 'Matériel utilisé recommandé aux armoires Rousseau'],
      ['securite.materiauxTrop', 'Matériaux en trop retournés au magasin'],
    ],
  },
  demantelement: {
    identification: [],
    plans: [
      ['plans.planBoucle', 'Plan de la boucle mis à jour'],
      ['plans.ficheHpm', 'Fiche du HPM corrigée'],
      ['plans.plansAlimentation', 'Plans de l\u2019alimentation mis à jour, si nécessaire'],
      ['plans.plansBjis', 'Plans des BJIs mis à jour'],
      ['plans.plansDiagramme', 'Plans du diagramme de procédé mis à jour'],
      ['plans.sama', 'SAMA corrigé avec l\u2019ingénieur de système'],
      ['plans.remisePanneau', 'Mise à jour remise dans le panneau concerné'],
    ],
    programmation: [
      ['programmation.collaboration', 'Collaboration avec l\u2019ingénieur de système'],
      ['programmation.forcesContournement', 'Forces et/ou contournement de programme'],
      ['programmation.modifsCl', 'Ajouts ou modifications au programme CL'],
      ['programmation.backupReseau', 'Backup du programme sur réseau'],
    ],
    systeme: [
      ['systeme.immpowerInactif', 'Immpower mis inactif et/ou corrigé'],
      ['systeme.localisation', 'Localisation mise à jour'],
      ['systeme.hierarchie', 'Hiérarchie mise à jour (-INST, -DEM, etc.)'],
      ['systeme.liensPieces', 'Liens avec pièces de rechange et inventaire mis à jour'],
      ['systeme.routeEntretien', 'Route d\u2019entretien détruite et/ou corrigée'],
    ],
    information: [
      ['information.rapportActivite', 'Rapport d\u2019activité détaillé complété, si requis'],
      ['information.bibliotheque', 'Documents ajoutés à la bibliothèque et index mis à jour'],
      ['information.aviserProduction', 'Production avisée que le travail est terminé, si requis'],
    ],
    securite: [
      ['securite.cadenassage', 'Fiches de cadenassage : opérations avisées pour modification'],
      ['securite.bji', 'BJI : trous des câbles enlevés bouchés'],
      ['securite.nettoyage', 'Lieux de travail nettoyés'],
      ['securite.materiauxRecuperes', 'Matériaux récupérés retournés au magasin'],
    ],
  },
};

const UPLOAD_TABS = ['mise-a-jour'];
const ATTACH_GROUPS = ['plans', 'programmation', 'systeme', 'information'];
const GROUP_LABELS = {
  identification: 'IDENTIFICATION', plans: 'PLANS', programmation: 'PROGRAMMATION',
  systeme: 'MISES À JOUR SYSTÈME', information: 'INFORMATION', securite: 'SÉCURITÉ ET GÉNÉRAL',
};

const state = {
  mode: null,               // 'installation' | 'demantelement'
  numero: null,
  isNewDraft: false,
  currentTab: 'identification',
  rootDirHandle: null,      // dossier racine choisi par l'utilisateur sur cet appareil
  dossierDirHandle: null,   // sous-dossier <numero> à l'intérieur du dossier racine
  draft: null,              // objet de suivi complet, persistant en IndexedDB
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// ---------- Service worker ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

// ---------- Theme toggle ----------
(function () {
  const root = document.documentElement;
  let theme = 'dark'; // industriel : sombre par défaut
  root.setAttribute('data-theme', theme);
  $('#themeToggle').addEventListener('click', () => {
    theme = theme === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', theme);
  });
})();

// ---------- Toast ----------
function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), ms);
}

// ---------- Fenêtre modale générique ----------
function showModal({ title, bodyHtml, confirmLabel = 'Confirmer' }) {
  return new Promise((resolve) => {
    const overlay = $('#modalOverlay');
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = bodyHtml;
    $('#modalConfirm').textContent = confirmLabel;
    overlay.classList.remove('hidden');

    function cleanup(confirmed) {
      overlay.classList.add('hidden');
      $('#modalConfirm').removeEventListener('click', onConfirm);
      $('#modalCancel').removeEventListener('click', onCancel);
      resolve(confirmed);
    }
    function onConfirm() { cleanup(true); }
    function onCancel() { cleanup(false); }
    $('#modalConfirm').addEventListener('click', onConfirm);
    $('#modalCancel').addEventListener('click', onCancel);
  });
}

async function askNaReason() {
  const confirmed = await showModal({
    title: 'Marquer comme non applicable',
    bodyHtml: '<label style="font-size:var(--text-sm);color:var(--color-text-muted);">Raison (optionnel)</label><textarea id="modalNaReason" rows="3" placeholder="ex. Aucune alimentation électrique sur ce point"></textarea>',
    confirmLabel: 'Marquer N/A',
  });
  if (!confirmed) return null;
  return $('#modalNaReason').value.trim();
}

async function askNcReason() {
  const confirmed = await showModal({
    title: 'Marquer comme non conforme',
    bodyHtml: '<label style="font-size:var(--text-sm);color:var(--color-text-muted);">Raison (optionnel)</label><textarea id="modalNaReason" rows="3" placeholder="ex. Câblage ne respecte pas le plan"></textarea>',
    confirmLabel: 'Marquer non conforme',
  });
  if (!confirmed) return null;
  return $('#modalNaReason').value.trim();
}

// ============================================================
// Stockage local — IndexedDB (brouillons + fichiers, un enregistrement
// par numéro de localisation, blobs de fichiers inclus)
// ============================================================
const DB_NAME = 'suivi-instrumentation';
const DB_STORE = 'dossiers';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(DB_STORE)) {
        req.result.createObjectStore(DB_STORE, { keyPath: 'localisation' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGet(numero) {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const r = tx.objectStore(DB_STORE).get(numero);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => reject(r.error);
    });
  } catch (err) { return null; }
}

async function dbPut(draft) {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(draft);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) { return false; }
}

function generateId() {
  return 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function newVpoItem() {
  return { id: generateId(), texte: '', statut: null, raison: '' };
}

function newDraft(numero, mode) {
  const now = new Date().toISOString();
  return {
    schemaVersion: 2,
    application: 'Gestion responsable',
    localisation: numero,
    mode,
    creeLe: now,
    modifieLe: now,
    champs: {},
    liens: {},
    casesCochees: {},
    casesRaisons: {},
    casesFichiers: {},
    files: Object.fromEntries(UPLOAD_TABS.map((o) => [o, []])),
    vpoItems: [newVpoItem()],
    approbations: [],
    derniereSauvegardeOfficielle: null,
    meta: { source: 'pwa', modeSauvegarde: 'brouillon-local' },
  };
}

function normalizeDraft(d) {
  if (!d.champs) d.champs = {};
  if (!d.liens) d.liens = {};
  if (!d.casesCochees) d.casesCochees = {};
  if (!d.casesRaisons) d.casesRaisons = {};
  if (!d.casesFichiers) d.casesFichiers = {};
  if (!d.files) d.files = {};
  UPLOAD_TABS.forEach((o) => { if (!d.files[o]) d.files[o] = []; });
  if (!d.vpoItems || !d.vpoItems.length) d.vpoItems = [newVpoItem()];
  if (!d.approbations) d.approbations = [];
  if (d.derniereSauvegardeOfficielle === undefined) d.derniereSauvegardeOfficielle = null;
  return d;
}

let persistTimer;
function schedulePersist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(async () => {
    if (!state.draft) return;
    state.draft.modifieLe = new Date().toISOString();
    await dbPut(state.draft);
  }, 400);
}

// ---------- Étape 1 : choix du type ----------
function selectMode(mode) {
  state.mode = mode;
  document.getElementById('app').setAttribute('data-mode', mode);

  const label = mode === 'installation' ? "Suivi d'installation" : "Démantèlement d'instrumentation";
  $('#modeBadge').textContent = label;
  $('#modeBadge').classList.remove('hidden');
  $('#brandSub').textContent = label;
  $('#homeBtn').classList.remove('hidden');
  $('#step2Kicker').textContent = `Étape 2 · ${label}`;
  $('#step2Title').textContent = mode === 'installation'
    ? "Localisation de l'instrument à installer"
    : "Localisation de l'instrument à démanteler";

  $('#screenChoice').classList.add('hidden');
  $('#screenDossier').classList.remove('hidden');
}

$$('.choice-card').forEach((card) => {
  card.addEventListener('click', () => {
    selectMode(card.dataset.choice);
    $('#numLoc').focus();
  });
});

$('#homeBtn').addEventListener('click', () => location.reload());

// ---------- Emplacement local du dossier (File System Access API) ----------
const FS_ACCESS_SUPPORTED = 'showDirectoryPicker' in window;
if (!FS_ACCESS_SUPPORTED) {
  $('#folderStatus').textContent = 'La sauvegarde dans un dossier est disponible dans Chrome ou Edge sur ordinateur.';
}

$('#btnChooseFolder').addEventListener('click', async () => {
  if (!FS_ACCESS_SUPPORTED) {
    toast('Cette fonction est disponible dans Chrome ou Edge sur ordinateur.', 4000);
    return;
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    state.rootDirHandle = handle;
    $('#folderStatus').classList.remove('err');
    $('#folderStatus').classList.add('ok');
    $('#folderStatus').textContent = `Emplacement choisi : ${handle.name}.`;
    toast(`Emplacement « ${handle.name} » retenu.`);
  } catch (err) {
    // AbortError : l'utilisateur a fermé le sélecteur — rien à signaler
  }
});

function isTaskDone(name) {
  const v = state.draft.casesCochees[name];
  return v === true || v === 'na';
}

function computeProgress() {
  if (!state.draft) return { done: 0, total: 0, pct: 100 };
  const groups = CHECKLISTS[state.draft.mode] || {};
  let total = 0, done = 0;
  Object.values(groups).forEach((items) => {
    items.forEach(([name]) => { total += 1; if (isTaskDone(name)) done += 1; });
  });
  (state.draft.vpoItems || []).forEach((item) => {
    if (!item.texte || !item.texte.trim()) return;
    total += 1;
    if (item.statut === 'conforme' || item.statut === 'nc') done += 1;
  });
  const pct = total ? (done / total) * 100 : 100;
  return { done, total, pct };
}

function updateProgressPill() {
  const pill = $('#wsProgressPill');
  if (!pill || !state.draft) return;
  const { pct } = computeProgress();
  pill.textContent = `${Math.round(pct)} %`;
  const hue = Math.max(0, Math.min(120, (pct / 100) * 120));
  pill.style.background = `hsl(${hue}, 70%, 45%)`;
}

function renderNonConformites() {
  const el = $('#ncSummary');
  if (!el || !state.draft) return;
  const groups = CHECKLISTS[state.draft.mode] || {};
  const rows = [];
  Object.entries(groups).forEach(([group, items]) => {
    items.forEach(([name, label]) => {
      if (state.draft.casesCochees[name] === 'nc') {
        rows.push({ section: GROUP_LABELS[group] || group, label, reason: state.draft.casesRaisons[name] || '' });
      }
    });
  });
  (state.draft.vpoItems || []).forEach((item) => {
    if (item.statut === 'nc') {
      rows.push({ section: 'VPO', label: item.texte || '(sans description)', reason: item.raison || '' });
    }
  });
  if (!rows.length) {
    el.innerHTML = '<div class="empty-state">Aucune non-conformité relevée pour ce dossier.</div>';
    return;
  }
  el.innerHTML = rows.map((r) => `
    <div class="nc-summary-item">
      <div class="nc-section">${r.section}</div>
      <div class="nc-label">${escapeHtml(r.label)}</div>
      ${r.reason ? `<div class="nc-reason">Raison : ${escapeHtml(r.reason)}</div>` : ''}
    </div>`).join('');
}

$('#btnSaveFolder').addEventListener('click', async () => {
  if (!FS_ACCESS_SUPPORTED) {
    toast('La sauvegarde dans un dossier est disponible dans Chrome ou Edge sur ordinateur.', 4000);
    return;
  }
  if (!state.rootDirHandle) {
    toast('Choisissez d\u2019abord un emplacement de sauvegarde (étape précédente).', 4000);
    return;
  }
  const { done, total, pct } = computeProgress();
  if (pct < 100) {
    const confirmed = await showModal({
      title: 'Dossier incomplet',
      bodyHtml: `<p style="font-size:var(--text-sm);color:var(--color-text-muted);">Il reste <strong>${total - done}</strong> tâche(s) non cochée(s) ou non marquée(s) N/A. Dans le cadre de la gestion du changement, chaque tâche doit normalement être complétée avant la fermeture du dossier.</p><p style="font-size:var(--text-sm);color:var(--color-text-muted);margin-top:var(--space-3);">Vous pouvez tout de même sauvegarder ce dossier partiel.</p>`,
      confirmLabel: 'Sauvegarder quand même',
    });
    if (!confirmed) return;
  }
  const nom = $('#fldEmployeeName').value.trim();
  const role = $('#fldRole').value;
  if (!nom) {
    toast('Entrez le nom de l\u2019employé (onglet Approbation) avant de sauvegarder.', 4500);
    selectTab('approbation');
    return;
  }

  const now = new Date();
  const record = { nom, role, at: now.toISOString() };
  state.draft.approbations.push(record);
  state.draft.derniereSauvegardeOfficielle = record;
  state.draft.champs.employeeName = nom;
  state.draft.champs.employeeRole = role;

  try {
    await ensureLocalDossierFolder(now);
    await writeEverythingToDisk(now);
    await dbPut(state.draft);
    refreshApprovals();
    toast(`Dossier ${folderName(now)} sauvegardé avec succès.`);
  } catch (err) {
    toast('Impossible d\u2019écrire dans ce dossier. Vérifiez l\u2019autorisation et réessayez.', 4500);
  }
});

function selectTab(tab) {
  $$('.tab-btn').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === tab ? 'true' : 'false'));
  $$('.tab-panel').forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== tab));
  state.currentTab = tab;
}

function folderName(date) {
  const bt = (state.draft && state.draft.champs.bt) || '';
  const ds = (date || new Date()).toISOString().slice(0, 10);
  return bt ? `${state.numero} (${bt}) - ${ds}` : `${state.numero} - ${ds}`;
}

async function ensureLocalDossierFolder(date) {
  if (!state.rootDirHandle || !state.numero) return;
  state.dossierDirHandle = await state.rootDirHandle.getDirectoryHandle(folderName(date), { create: true });
  for (const sub of ['Documents', 'Photos', 'Exports']) {
    await state.dossierDirHandle.getDirectoryHandle(sub, { create: true });
  }
  const pill = $('#wsFolderPill');
  if (pill) pill.textContent = `📁 lié : ${state.rootDirHandle.name}/${folderName(date)}`;
}

// Pré-remplit le B.T. si un brouillon existe déjà pour ce numéro
$('#numLoc').addEventListener('blur', async () => {
  const numero = $('#numLoc').value.trim().toUpperCase();
  if (!numero) return;
  const existing = await dbGet(numero);
  if (existing && existing.champs && existing.champs.bt) {
    $('#numBt').value = existing.champs.bt;
  }
});

// Écrit tout le contenu du brouillon (suivi.json, resume.txt, documents par
// tâche, photos de mise à jour) sur le disque. N'est appelé QUE lors de la
// sauvegarde officielle (100 % des tâches cochées ou N/A + nom d'employé).
async function writeEverythingToDisk(date) {
  if (!state.dossierDirHandle || !state.draft) return;

  const jsonHandle = await state.dossierDirHandle.getFileHandle('suivi.json', { create: true });
  const w1 = await jsonHandle.createWritable();
  await w1.write(JSON.stringify(state.draft, (k, v) => (k === 'blob' ? undefined : v), 2));
  await w1.close();

  const resumeHandle = await state.dossierDirHandle.getFileHandle('resume.txt', { create: true });
  const w2 = await resumeHandle.createWritable();
  await w2.write(buildResumeText());
  await w2.close();

  const docsDir = await state.dossierDirHandle.getDirectoryHandle('Documents', { create: true });
  for (const [name, files] of Object.entries(state.draft.casesFichiers || {})) {
    for (const f of files) {
      try {
        const safe = f.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const fh = await docsDir.getFileHandle(`${name}__${safe}`, { create: true });
        const w = await fh.createWritable();
        await w.write(f.blob);
        await w.close();
      } catch (err) { /* best effort par fichier */ }
    }
  }

  const photosDir = await state.dossierDirHandle.getDirectoryHandle('Photos', { create: true });
  for (const f of (state.draft.files['mise-a-jour'] || [])) {
    try {
      const safe = (f.storedAs || f.name).replace(/[^a-zA-Z0-9._-]/g, '_');
      const fh = await photosDir.getFileHandle(safe, { create: true });
      const w = await fh.createWritable();
      await w.write(f.blob);
      await w.close();
    } catch (err) { /* best effort par fichier */ }
  }

  try {
    const dashName = `Dashboard - ${folderName(date)}.html`;
    const dashHandle = await state.dossierDirHandle.getFileHandle(dashName, { create: true });
    const w3 = await dashHandle.createWritable();
    await w3.write(buildDashboardHtml());
    await w3.close();
  } catch (err) { /* best effort */ }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function isImageFile(filename) {
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(filename);
}

function ringSvg(pct, size, stroke) {
  const clamped = Math.max(0, Math.min(100, pct));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - clamped / 100);
  const hue = Math.max(0, Math.min(120, (clamped / 100) * 120));
  const color = `hsl(${hue}, 72%, 52%)`;
  const fontSize = Math.round(size * 0.22);
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="ring-svg">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#232b36" stroke-width="${stroke}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}"
      stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}" stroke-linecap="round"
      transform="rotate(-90 ${size / 2} ${size / 2})"/>
    <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-size="${fontSize}" font-weight="700" fill="#eef1f4">${Math.round(clamped)}%</text>
  </svg>`;
}

function buildDashboardHtml() {
  const d = state.draft;
  const modeLabel = d.mode === 'installation' ? "Suivi d'installation" : 'Démantèlement d\u2019instrumentation';
  const { done, total, pct } = computeProgress();
  const groups = CHECKLISTS[d.mode];

  const statusDotFor = (v) => {
    if (v === true) return { cls: 'st-done', icon: '\u2713' };
    if (v === 'na') return { cls: 'st-na', icon: 'N/A' };
    if (v === 'nc') return { cls: 'st-nc', icon: '!' };
    return { cls: 'st-pending', icon: '' };
  };

  const attachmentsHtml = (files, baseHref) => {
    if (!files || !files.length) return '';
    return `<div class="attachments">${files.map((f) => {
      const safeStored = (f.storedAs || f.name).replace(/[^a-zA-Z0-9._-]/g, '_');
      const href = `${baseHref}${safeStored}`;
      return isImageFile(f.name)
        ? `<a href="${href}" target="_blank" class="thumb-link" title="${escapeHtml(f.name)}"><img src="${href}" class="thumb" alt="${escapeHtml(f.name)}"></a>`
        : `<a href="${href}" target="_blank" class="doc-link">\ud83d\udcc4 ${escapeHtml(f.name)}</a>`;
    }).join('')}</div>`;
  };

  // ---- Anneaux par section (cliquables -> sautent à la section, avec flash) ----
  const groupStats = Object.entries(groups).map(([group, items]) => {
    if (!items.length) return null;
    const doneCount = items.filter(([name]) => isTaskDone(name)).length;
    return { group, label: GROUP_LABELS[group] || group, pct: (doneCount / items.length) * 100, count: `${doneCount}/${items.length}` };
  }).filter(Boolean);

  const vpoFilled = (d.vpoItems || []).filter((it) => it.texte && it.texte.trim());
  const hasVpo = vpoFilled.length > 0;
  if (hasVpo) {
    const vpoDone = vpoFilled.filter((it) => it.statut === 'conforme' || it.statut === 'nc').length;
    groupStats.push({ group: 'vpo', label: 'VPO', pct: (vpoDone / vpoFilled.length) * 100, count: `${vpoDone}/${vpoFilled.length}` });
  }

  const ringsHtml = groupStats.map((g) => `
    <div class="ring-card" onclick="jumpToSection('sec-${g.group}')" role="button" tabindex="0">
      ${ringSvg(g.pct, 104, 9)}
      <div class="ring-card-label">${escapeHtml(g.label)}</div>
      <div class="ring-card-count">${g.count} tâches</div>
    </div>`).join('');

  // ---- Sections détaillées par tâche (redessinées, fermées par défaut) ----
  const taskRowHtml = (label, v, reasonRaw, filesHtml) => {
    const st = statusDotFor(v);
    const reason = reasonRaw ? `<div class="task-reason">Raison : ${escapeHtml(reasonRaw)}</div>` : '';
    return `<div class="task-row ${st.cls}">
      <div class="task-dot">${st.icon}</div>
      <div class="task-body">
        <div class="task-label">${escapeHtml(label)}</div>
        ${reason}
        ${filesHtml || ''}
      </div>
    </div>`;
  };

  const sectionsHtml = groupStats.map((g) => {
    const items = groups[g.group];
    const rows = items.map(([name, label]) => {
      const v = d.casesCochees[name];
      const reason = (v === 'na' || v === 'nc') ? d.casesRaisons[name] : '';
      const files = d.casesFichiers[name] || [];
      const filesHtml = attachmentsHtml(files, `Documents/${name}__`);
      return taskRowHtml(label, v, reason, filesHtml);
    }).join('');
    return `<details class="section-card" id="sec-${g.group}">
      <summary><span>${g.label}</span><span class="section-pct">${Math.round(g.pct)} %</span></summary>
      <div class="task-list">${rows}</div>
    </details>`;
  }).join('');

  // ---- VPO détaillé ----
  const vpoHtml = hasVpo ? (() => {
    const vpoDone = vpoFilled.filter((it) => it.statut === 'conforme' || it.statut === 'nc').length;
    const vpoPct = (vpoDone / vpoFilled.length) * 100;
    const rows = vpoFilled.map((it) => {
      const v = it.statut === 'conforme' ? true : it.statut === 'nc' ? 'nc' : false;
      return taskRowHtml(it.texte, v, it.statut === 'nc' ? it.raison : '', '');
    }).join('');
    return `<details class="section-card" id="sec-vpo">
      <summary><span>VPO — Vérification pré-opérationnelle</span><span class="section-pct">${Math.round(vpoPct)} %</span></summary>
      <div class="task-list">${rows}</div>
    </details>`;
  })() : '';

  // ---- Non-conformités ----
  const ncItems = [];
  Object.entries(groups).forEach(([group, items]) => items.forEach(([name, label]) => {
    if (d.casesCochees[name] === 'nc') ncItems.push({ section: GROUP_LABELS[group] || group, label, reason: d.casesRaisons[name] || '' });
  }));
  (d.vpoItems || []).forEach((it) => {
    if (it.statut === 'nc') ncItems.push({ section: 'VPO', label: it.texte || '(sans description)', reason: it.raison || '' });
  });
  const ncBanner = ncItems.length
    ? `<div class="nc-banner nc-banner-alert">
        <div class="nc-banner-title">\u26a0 ${ncItems.length} non-conformité${ncItems.length > 1 ? 's' : ''} relevée${ncItems.length > 1 ? 's' : ''}</div>
        <ul class="nc-list">${ncItems.map((r) => `<li><strong>${escapeHtml(r.section)}</strong> — ${escapeHtml(r.label)}${r.reason ? ` <span class="reason-inline">(${escapeHtml(r.reason)})</span>` : ''}</li>`).join('')}</ul>
      </div>`
    : `<div class="nc-banner nc-banner-ok">\u2705 Aucune non-conformité relevée pour ce dossier.</div>`;

  // ---- Documents / photos ----
  const docCount = Object.values(d.casesFichiers || {}).reduce((s, arr) => s + arr.length, 0);
  const photos = d.files['mise-a-jour'] || [];
  const photosHtml = photos.length ? attachmentsHtml(photos, 'Photos/') : '<p class="empty">Aucune image de mise à jour.</p>';

  // ---- Historique ----
  const histHtml = (d.approbations || []).length
    ? `<div class="timeline">${d.approbations.slice().reverse().map((a) => `
        <div class="timeline-item">
          <div class="timeline-dot"></div>
          <div class="timeline-body">
            <strong>${escapeHtml(a.nom)}</strong> <span class="timeline-role">${escapeHtml(a.role)}</span>
            <div class="timeline-date">${new Date(a.at).toLocaleString('fr-CA')}</div>
          </div>
        </div>`).join('')}</div>`
    : '<p class="empty">Aucune sauvegarde officielle enregistrée.</p>';

  const titre = `${escapeHtml(d.localisation)}${d.champs.bt ? ' (' + escapeHtml(d.champs.bt) + ')' : ''}`;
  const appUrl = buildDossierUrl();
  const qrSvg = generateQrSvg(appUrl);
  const statutLabel = pct >= 100 ? 'Terminé' : pct > 0 ? 'En cours' : 'Non commencé';
  const statutClass = pct >= 100 ? 'status-done' : pct > 0 ? 'status-progress' : 'status-new';

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dashboard \u2014 ${titre}</title>
<style>
  :root {
    --bg: #0c1016; --surface: #141a22; --surface-2: #1a212b; --border: #262e3a;
    --text: #eef1f4; --text-muted: #8a97a6; --accent: #ff7a1a; --accent-soft: rgba(255,122,26,0.12);
  }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    background: radial-gradient(1200px 600px at 10% -10%, #1a1410 0%, var(--bg) 45%), var(--bg);
    color: var(--text); margin: 0; padding: 40px 32px 64px;
  }
  .wrap { max-width: 1080px; margin: 0 auto; }
  .hero { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 24px; margin-bottom: 32px; }
  .hero-left h1 { margin: 0 0 6px; font-size: 26px; letter-spacing: -0.01em; }
  .hero-sub { color: var(--text-muted); font-size: 14px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .status-pill { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; }
  .status-done { background: rgba(74,222,128,0.15); color: #4ade80; }
  .status-progress { background: rgba(234,179,8,0.15); color: #eab308; }
  .status-new { background: rgba(138,151,166,0.15); color: var(--text-muted); }
  .hero-actions { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
  .open-app-link {
    display: inline-flex; align-items: center; gap: 8px; background: var(--accent); color: #10151b; font-weight: 700;
    padding: 12px 22px; border-radius: 10px; text-decoration: none; font-size: 14px; box-shadow: 0 8px 24px rgba(255,122,26,0.25);
  }
  .open-app-link:hover { background: #ff8f3f; }
  .qr-card { background: #fff; border-radius: 12px; padding: 8px; display: flex; align-items: center; justify-content: center; }
  .qr-card svg { display: block; width: 78px; height: 78px; }
  .qr-wrap { display: flex; align-items: center; gap: 10px; }
  .qr-caption { font-size: 11px; color: var(--text-muted); max-width: 90px; line-height: 1.3; }

  .hero-ring { display: flex; align-items: center; gap: 28px; background: var(--surface); border: 1px solid var(--border); border-radius: 18px; padding: 24px 32px; }
  .hero-ring-label { font-size: 14px; color: var(--text-muted); }
  .hero-ring-count { font-size: 26px; font-weight: 700; margin-top: 4px; }

  .stat-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 14px; margin-bottom: 32px; }
  .stat-card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 16px 18px; }
  .stat-card .num { font-size: 24px; font-weight: 700; }
  .stat-card .lbl { font-size: 12px; color: var(--text-muted); margin-top: 2px; }

  h2.section-title { font-size: 15px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); margin: 40px 0 16px; }

  .rings-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 16px; margin-bottom: 8px; }
  .ring-card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 18px 12px; display: flex; flex-direction: column; align-items: center; gap: 8px; cursor: pointer; transition: transform 0.15s, border-color 0.15s; }
  .ring-card:hover { transform: translateY(-3px); border-color: var(--accent); }
  .ring-card-label { font-size: 12px; font-weight: 600; text-align: center; }
  .ring-card-count { font-size: 11px; color: var(--text-muted); font-family: ui-monospace, "SF Mono", Consolas, monospace; }

  .nc-banner { border-radius: 14px; padding: 18px 22px; margin-bottom: 8px; }
  .nc-banner-alert { background: rgba(214,69,69,0.1); border: 1px solid rgba(214,69,69,0.4); }
  .nc-banner-ok { background: rgba(74,222,128,0.08); border: 1px solid rgba(74,222,128,0.35); color: #4ade80; font-weight: 600; }
  .nc-banner-title { color: #f87171; font-weight: 700; margin-bottom: 8px; }
  .nc-list { color: #f0a8a8; list-style: none; padding-left: 0; margin: 0; }
  .nc-list li { margin-bottom: 6px; font-size: 14px; }
  .reason-inline { color: var(--text-muted); font-style: italic; }

  details.section-card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; margin-bottom: 12px; overflow: hidden; scroll-margin-top: 24px; }
  details.section-card summary {
    cursor: pointer; padding: 16px 20px; font-weight: 700; font-size: 14px; list-style: none;
    display: flex; align-items: center; justify-content: space-between; background: var(--surface-2);
    gap: 12px;
  }
  details.section-card summary::-webkit-details-marker { display: none; }
  details.section-card summary::before { content: '\u25b8'; color: var(--text-muted); margin-right: 10px; transition: transform 0.2s; display: inline-block; }
  details.section-card[open] summary::before { transform: rotate(90deg); }
  details.section-card summary span:first-child { flex: 1; display: flex; align-items: center; }
  .section-pct { font-family: ui-monospace, "SF Mono", Consolas, monospace; font-size: 13px; color: var(--accent); background: var(--accent-soft); padding: 3px 10px; border-radius: 999px; }

  @keyframes flashHighlight {
    0%, 100% { box-shadow: none; }
    12%, 55% { box-shadow: 0 0 0 3px var(--accent), 0 0 30px rgba(255,122,26,0.55); }
  }
  details.section-card.flash { animation: flashHighlight 1.7s ease; }

  .task-list { padding: 8px; display: flex; flex-direction: column; gap: 6px; }
  .task-row { display: flex; gap: 12px; padding: 12px 14px; border-radius: 10px; background: var(--surface-2); border: 1px solid transparent; }
  .task-row.st-done { border-color: rgba(74,222,128,0.35); }
  .task-row.st-na { border-color: rgba(234,179,8,0.35); }
  .task-row.st-nc { border-color: rgba(248,113,113,0.4); background: rgba(214,69,69,0.06); }
  .task-dot {
    width: 24px; height: 24px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 700; margin-top: 1px;
  }
  .st-done .task-dot { background: rgba(74,222,128,0.18); color: #4ade80; }
  .st-na .task-dot { background: rgba(234,179,8,0.18); color: #eab308; font-size: 9px; }
  .st-nc .task-dot { background: rgba(248,113,113,0.2); color: #f87171; }
  .st-pending .task-dot { background: #232b36; border: 2px solid #384151; }
  .task-label { font-size: 13.5px; font-weight: 500; }
  .task-reason { font-size: 12px; color: var(--text-muted); font-style: italic; margin-top: 4px; }
  .attachments { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
  .thumb { width: 60px; height: 60px; object-fit: cover; border-radius: 8px; border: 1px solid var(--border); transition: transform 0.15s; }
  .thumb:hover { transform: scale(1.08); }
  .doc-link, .thumb-link { color: #5eb8ff; text-decoration: none; font-size: 12.5px; }

  .timeline { display: flex; flex-direction: column; gap: 4px; }
  .timeline-item { display: flex; gap: 14px; padding: 12px 4px; border-bottom: 1px solid var(--border); }
  .timeline-item:last-child { border-bottom: none; }
  .timeline-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--accent); margin-top: 6px; flex-shrink: 0; }
  .timeline-role { color: var(--text-muted); font-size: 12.5px; }
  .timeline-date { font-size: 12px; color: var(--text-muted); font-family: ui-monospace, "SF Mono", Consolas, monospace; margin-top: 2px; }

  .empty { color: var(--text-muted); font-style: italic; font-size: 14px; }
  .comment-box { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 18px 22px; white-space: pre-wrap; font-size: 14px; line-height: 1.6; }
  .footer-note { text-align: center; color: var(--text-muted); font-size: 12px; margin-top: 48px; }
</style></head>
<body>
  <div class="wrap">
    <div class="hero">
      <div class="hero-left">
        <h1>${titre}</h1>
        <div class="hero-sub">
          <span class="status-pill ${statutClass}">${statutLabel}</span>
          <span>${escapeHtml(modeLabel)}</span>
          <span>\u00b7 généré le ${new Date().toLocaleString('fr-CA')}</span>
        </div>
      </div>
      <div class="hero-actions">
        <div class="qr-wrap">
          <div class="qr-card">${qrSvg || ''}</div>
          <div class="qr-caption">Scannez pour rouvrir ce dossier</div>
        </div>
        <a class="open-app-link" href="${appUrl}">\u21a9 Ouvrir dans l\u2019application</a>
      </div>
    </div>

    <div class="hero-ring">
      ${ringSvg(pct, 150, 14)}
      <div>
        <div class="hero-ring-label">Progression globale</div>
        <div class="hero-ring-count">${done} / ${total} tâches</div>
      </div>
    </div>

    <div class="stat-row" style="margin-top:24px;">
      <div class="stat-card"><div class="num">${done}/${total}</div><div class="lbl">Tâches complétées</div></div>
      <div class="stat-card"><div class="num">${docCount + photos.length}</div><div class="lbl">Documents / photos</div></div>
      <div class="stat-card"><div class="num" style="color:${ncItems.length ? '#f87171' : '#4ade80'};">${ncItems.length}</div><div class="lbl">Non-conformités</div></div>
      <div class="stat-card"><div class="num">${(d.approbations || []).length}</div><div class="lbl">Sauvegardes officielles</div></div>
    </div>

    <h2 class="section-title">Progression par section — cliquez pour voir le détail</h2>
    <div class="rings-grid">${ringsHtml}</div>

    <h2 class="section-title">Non-conformités</h2>
    ${ncBanner}

    <h2 class="section-title">Détail des tâches</h2>
    ${sectionsHtml}
    ${vpoHtml}

    <h2 class="section-title">Images et documents de mise à jour</h2>
    ${photosHtml}

    <h2 class="section-title">Historique des sauvegardes officielles</h2>
    ${histHtml}

    ${d.champs.commentaires ? `<h2 class="section-title">Commentaires</h2><div class="comment-box">${escapeHtml(d.champs.commentaires)}</div>` : ''}

    <div class="footer-note">Gestion responsable \u00b7 Dashboard généré automatiquement</div>
  </div>

  <script>
    function jumpToSection(id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.open = true;
      el.classList.remove('flash');
      void el.offsetWidth;
      el.classList.add('flash');
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(function () { el.classList.remove('flash'); }, 1700);
    }
  </script>
</body></html>`;
}

function buildResumeText() {
  const d = state.draft;
  const modeLabel = d.mode === 'installation' ? "Suivi d'installation" : 'Démantèlement d\u2019instrumentation';
  const groups = CHECKLISTS[d.mode];
  const { done, total } = computeProgress();

  const lines = [];
  lines.push('GESTION RESPONSABLE — SUIVI DE TRAVAUX');
  lines.push('=======================================');
  lines.push('');
  lines.push(`Type d\u2019intervention : ${modeLabel}`);
  lines.push(`Localisation : ${d.localisation}${d.champs.bt ? ' (B.T. ' + d.champs.bt + ')' : ''}`);
  if (d.derniereSauvegardeOfficielle) {
    const off = d.derniereSauvegardeOfficielle;
    const dt = new Date(off.at);
    lines.push(`Sauvegardée officiellement par : ${off.nom} (${off.role})`);
    lines.push(`Date de sauvegarde (non modifiable) : ${dt.toLocaleDateString('fr-CA')} ${dt.toLocaleTimeString('fr-CA')}`);
  }
  lines.push('');
  lines.push(`Employé : ${d.champs.employe || ''}`);
  lines.push(`Chargé de projet : ${d.champs.chargeProjet || ''}`);
  lines.push(`Contracteur : ${d.champs.contracteur || ''}`);
  lines.push(`Date de début : ${d.champs.dateDebut || ''}`);
  lines.push(`Date de fin : ${d.champs.dateFin || ''}`);
  lines.push(`État général : ${d.champs.etatGeneral || ''}`);
  lines.push('');
  lines.push(`Tâches terminées : ${done} / ${total}`);
  lines.push('');

  Object.entries(groups).forEach(([group, items]) => {
    if (!items.length) return;
    const title = GROUP_LABELS[group] || group.toUpperCase();
    lines.push(title);
    lines.push('-'.repeat(title.length));
    items.forEach(([name, label]) => {
      const v = d.casesCochees[name];
      const mark = v === true ? 'X' : v === 'na' ? 'N/A' : v === 'nc' ? '!' : ' ';
      lines.push(`[${mark}] ${label}`);
      if ((v === 'na' || v === 'nc') && d.casesRaisons[name]) lines.push(`      \u2192 raison : ${d.casesRaisons[name]}`);
    });
    lines.push('');
  });

  const vpoFilled = (d.vpoItems || []).filter((it) => it.texte && it.texte.trim());
  if (vpoFilled.length) {
    lines.push('VPO — VÉRIFICATION PRÉ-OPÉRATIONNELLE');
    lines.push('---------------------------------------');
    vpoFilled.forEach((it) => {
      const mark = it.statut === 'conforme' ? 'C' : it.statut === 'nc' ? '!' : ' ';
      lines.push(`[${mark}] ${it.texte}`);
      if (it.statut === 'nc' && it.raison) lines.push(`      \u2192 raison : ${it.raison}`);
    });
    lines.push('');
  }

  if (d.champs.commentaires) {
    lines.push('COMMENTAIRES / NOTES');
    lines.push('---------------------');
    lines.push(d.champs.commentaires);
    lines.push('');
  }

  return lines.join('\n');
}

// ---------- Étape 2 : ouvrir / créer le dossier localement ----------
$('#btnOuvrirDossier').addEventListener('click', ouvrirDossier);
$('#numLoc').addEventListener('keydown', (e) => { if (e.key === 'Enter') ouvrirDossier(); });

const NUMERO_PATTERN = /^[A-Za-z0-9-]+$/;

$('#numLoc').addEventListener('input', () => {
  const el = $('#numLoc');
  const val = el.value.trim();
  if (!val) { el.classList.remove('invalid', 'valid'); return; }
  const ok = NUMERO_PATTERN.test(val);
  el.classList.toggle('invalid', !ok);
  el.classList.toggle('valid', ok);
});

$('#numBt').addEventListener('input', () => {
  const el = $('#numBt');
  const val = el.value.trim();
  el.classList.toggle('valid', !!val);
  el.classList.remove('invalid');
});

async function ouvrirDossier() {
  const numero = $('#numLoc').value.trim().toUpperCase();
  const statusEl = $('#dossierStatus');
  if (!numero) {
    statusEl.classList.remove('hidden', 'ok', 'new');
    statusEl.classList.add('err');
    statusEl.textContent = 'Entrez d\u2019abord le numéro de localisation.';
    return;
  }
  if (!NUMERO_PATTERN.test(numero)) {
    statusEl.classList.remove('hidden', 'ok', 'new');
    statusEl.classList.add('err');
    statusEl.textContent = 'Le numéro de localisation ne peut contenir que des lettres, des chiffres et des tirets.';
    $('#numLoc').classList.add('invalid');
    $('#numLoc').focus();
    return;
  }

  const bt = $('#numBt').value.trim().toUpperCase();
  if (!bt) {
    statusEl.classList.remove('hidden', 'ok', 'new');
    statusEl.classList.add('err');
    statusEl.textContent = 'Entrez le B.T. (n\u2019importe quel contenu est accepté).';
    $('#numBt').classList.add('invalid');
    $('#numBt').focus();
    return;
  }

  statusEl.classList.remove('hidden', 'ok', 'err');
  statusEl.textContent = 'Ouverture du dossier local…';

  const existing = await dbGet(numero);
  if (existing) {
    state.draft = normalizeDraft(existing);
    state.isNewDraft = false;
    state.draft.champs.bt = bt;
  } else {
    state.draft = newDraft(numero, state.mode);
    state.draft.champs.bt = bt;
    state.isNewDraft = true;
    await dbPut(state.draft);
  }
  state.numero = numero;

  statusEl.classList.remove('new', 'ok');
  statusEl.classList.add(state.isNewDraft ? 'new' : 'ok');
  statusEl.textContent = state.isNewDraft
    ? `Nouveau dossier créé localement pour ${numero}.`
    : `Dossier existant repris — dernière sauvegarde ${new Date(state.draft.modifieLe).toLocaleString('fr-CA')}.`;

  setTimeout(() => openWorkspace(), 400);
}

// ---------- Étape 3 : espace de travail ----------
function openWorkspace() {
  const d = state.draft;
  $('#screenDossier').classList.add('hidden');
  $('#screenWorkspace').classList.remove('hidden');

  $('#wsNum').textContent = state.numero + (d.champs.bt ? ` (${d.champs.bt})` : '');
  $('#wsMeta').textContent = `${d.mode === 'installation' ? "Suivi d'installation" : 'Démantèlement'} · créé le ${new Date(d.creeLe).toLocaleDateString('fr-CA')}`;
  $('#wsCreated').textContent = state.isNewDraft ? 'nouveau dossier' : 'dossier existant';
  $('#wsFolderPill').textContent = d.derniereSauvegardeOfficielle
    ? `📁 dernière sauvegarde : ${new Date(d.derniereSauvegardeOfficielle.at).toLocaleDateString('fr-CA')}`
    : '📁 brouillon local seulement';

  $$('[data-link]').forEach((input) => { input.value = d.liens[input.dataset.link] || ''; });
  updateLinkTargets();

  $('#fldTag').value = d.champs.tag || '';
  $('#fldType').value = d.champs.type || '';
  $('#fldDesc').value = d.champs.desc || '';
  $('#fldEmploye').value = d.champs.employe || '';
  $('#fldChargeProjet').value = d.champs.chargeProjet || '';
  $('#fldContracteur').value = d.champs.contracteur || '';
  $('#fldDateDebut').value = d.champs.dateDebut || '';
  $('#fldDateFin').value = d.champs.dateFin || '';
  $('#fldEtatGeneral').value = d.champs.etatGeneral || '';
  $('#fldCommentaires').value = d.champs.commentaires || '';
  $('#fldEmployeeName').value = d.champs.employeeName || '';
  $('#fldRole').value = d.champs.employeeRole || 'technicien';

  renderAllChecklists();
  renderVpoList();
  refreshAllFileLists();
  refreshApprovals();
  updateFilesCount();
  updateProgressPill();
  renderNonConformites();
}

// ---------- Onglets ----------
$$('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => selectTab(btn.dataset.tab));
});

// ---------- Cases à cocher ----------
function renderChecklist(group) {
  const container = $(`[data-checklist="${group}"]`);
  if (!container) return;
  const items = (CHECKLISTS[state.draft.mode] && CHECKLISTS[state.draft.mode][group]) || [];
  if (!items.length) {
    container.innerHTML = '<div class="empty-state">Aucune tâche prévue pour ce type d\u2019intervention dans cette section.</div>';
    updateChecklistProgress(group, 0, 0);
    return;
  }
  const canAttach = ATTACH_GROUPS.includes(group);

  container.innerHTML = items.map(([name, label]) => {
    const val = state.draft.casesCochees[name];
    const checked = val === true;
    const isNa = val === 'na';
    const isNc = val === 'nc';
    const files = (state.draft.casesFichiers[name] || []);
    const reason = state.draft.casesRaisons[name] || '';
    return `
      <div class="checklist-item-wrap${checked ? ' checked' : ''}${isNa ? ' na' : ''}${isNc ? ' nc' : ''}" data-item-wrap="${name}">
        <div class="checklist-item-row">
          <input type="checkbox" class="ci-checkbox" ${checked ? 'checked' : ''} data-name="${name}">
          <span class="ci-label" data-name="${name}">${label}</span>
          ${canAttach ? `<span class="ci-attach-count" data-attach-count="${name}">${files.length ? '📎 ' + files.length : ''}</span>` : ''}
          <button type="button" class="btn-na" data-na="${name}">N/A</button>
          <button type="button" class="btn-nc" data-nc="${name}">Non conforme</button>
        </div>
        ${(isNa || isNc) && reason ? `<div class="na-reason">Raison : ${reason}</div>` : ''}
        ${canAttach ? `
        <div class="checklist-item-drawer${checked ? '' : ' hidden'}" data-drawer="${name}">
          <div class="dropzone-mini" data-item-dropzone="${name}">
            📎 Glissez-déposez un document, cliquez pour parcourir, ou
            <button type="button" class="btn btn-outline" data-item-snagit="${name}">utiliser Snagit</button>
            <input type="file" data-item-file-input="${name}" multiple class="hidden">
          </div>
          <div class="file-list-mini" data-item-file-list="${name}"></div>
        </div>` : ''}
      </div>`;
  }).join('');

  $$('.ci-checkbox', container).forEach((cb) => {
    cb.addEventListener('change', () => {
      const name = cb.dataset.name;
      state.draft.casesCochees[name] = cb.checked;
      if (cb.checked) delete state.draft.casesRaisons[name];
      const wrap = container.querySelector(`[data-item-wrap="${name}"]`);
      if (wrap) { wrap.classList.toggle('checked', cb.checked); wrap.classList.remove('na', 'nc'); }
      const drawer = container.querySelector(`[data-drawer="${name}"]`);
      if (drawer) drawer.classList.toggle('hidden', !cb.checked);
      schedulePersist();
      refreshChecklistProgressFor(group);
      updateProgressPill();
      renderNonConformites();
    });
  });

  $$('.ci-label', container).forEach((lbl) => {
    lbl.addEventListener('click', () => {
      const drawer = container.querySelector(`[data-drawer="${lbl.dataset.name}"]`);
      if (drawer) drawer.classList.toggle('hidden');
    });
  });

  $$('.btn-na', container).forEach((btn) => {
    btn.addEventListener('click', async () => {
      const name = btn.dataset.na;
      const isCurrentlyNa = state.draft.casesCochees[name] === 'na';
      if (isCurrentlyNa) {
        state.draft.casesCochees[name] = false;
        delete state.draft.casesRaisons[name];
      } else {
        const reason = await askNaReason();
        if (reason === null) return;
        state.draft.casesCochees[name] = 'na';
        state.draft.casesRaisons[name] = reason;
      }
      schedulePersist();
      renderChecklist(group);
      refreshChecklistProgressFor(group);
      updateProgressPill();
      renderNonConformites();
    });
  });

  $$('.btn-nc', container).forEach((btn) => {
    btn.addEventListener('click', async () => {
      const name = btn.dataset.nc;
      const isCurrentlyNc = state.draft.casesCochees[name] === 'nc';
      if (isCurrentlyNc) {
        state.draft.casesCochees[name] = false;
        delete state.draft.casesRaisons[name];
      } else {
        const reason = await askNcReason();
        if (reason === null) return;
        state.draft.casesCochees[name] = 'nc';
        state.draft.casesRaisons[name] = reason;
      }
      schedulePersist();
      renderChecklist(group);
      refreshChecklistProgressFor(group);
      updateProgressPill();
      renderNonConformites();
    });
  });

  if (canAttach) {
    items.forEach(([name]) => {
      const dz = container.querySelector(`[data-item-dropzone="${name}"]`);
      if (!dz) return;
      const input = dz.querySelector('input[type="file"]');
      dz.addEventListener('click', (e) => {
        if (e.target === input || e.target.closest('button')) return;
        input.click();
      });
      input.addEventListener('change', () => attachFilesToTask(group, name, input.files));
      ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('dragover'); }));
      ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('dragover'); }));
      dz.addEventListener('drop', (e) => attachFilesToTask(group, name, e.dataTransfer.files));
      const snagitBtn = dz.querySelector('[data-item-snagit]');
      if (snagitBtn) {
        snagitBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          window.location.href = 'snagit://capture';
          toast('Ouverture de Snagit… capturez, puis glissez l\u2019image ici.', 4000);
        });
      }
      renderItemFileList(group, name);
    });
  }

  refreshChecklistProgressFor(group);
}

async function attachFilesToTask(group, name, fileList) {
  if (!fileList || !fileList.length) return;
  if (!state.draft.casesFichiers[name]) state.draft.casesFichiers[name] = [];
  Array.from(fileList).forEach((f) => {
    state.draft.casesFichiers[name].push({
      name: f.name, size: f.size, type: f.type, uploadedAt: new Date().toISOString(), blob: f,
    });
  });
  await dbPut(state.draft);
  renderItemFileList(group, name);
  updateFilesCount();
  toast(`${fileList.length} document(s) joint(s) à la tâche.`);
}

function renderItemFileList(group, name) {
  const container = $(`[data-checklist="${group}"]`);
  if (!container) return;
  const listEl = container.querySelector(`[data-item-file-list="${name}"]`);
  const countEl = container.querySelector(`[data-attach-count="${name}"]`);
  const files = state.draft.casesFichiers[name] || [];
  if (countEl) countEl.textContent = files.length ? `📎 ${files.length}` : '';
  if (!listEl) return;
  listEl.innerHTML = files.length ? files.map((f) => `
    <div class="file-row">
      <span class="ext-badge">${extBadge(f.name)}</span>
      <span class="file-name">${f.name}</span>
      <span class="file-meta">${fmtSize(f.size)}</span>
    </div>`).join('') : '';
}

function refreshChecklistProgressFor(group) {
  const items = (CHECKLISTS[state.draft.mode] && CHECKLISTS[state.draft.mode][group]) || [];
  const done = items.filter(([n]) => isTaskDone(n)).length;
  updateChecklistProgress(group, done, items.length);
}

function updateChecklistProgress(group, done, total) {
  const el = $(`[data-checklist-progress="${group}"]`);
  if (el) el.textContent = total ? `${done} / ${total} tâche(s) complétée(s)` : '';
}

function renderAllChecklists() {
  ['identification', 'plans', 'programmation', 'systeme', 'information', 'securite'].forEach(renderChecklist);
}

// ---------- Onglet VPO : liste dynamique (conforme / non conforme) ----------
function findVpoItem(id) {
  return (state.draft.vpoItems || []).find((it) => it.id === id);
}

function renderVpoList() {
  const container = $('#vpoList');
  if (!container || !state.draft) return;
  const items = state.draft.vpoItems || [];

  container.innerHTML = items.map((item) => `
    <div class="vpo-row" data-vpo-id="${item.id}">
      <div class="vpo-status">
        <button type="button" class="btn-conforme${item.statut === 'conforme' ? ' active' : ''}" data-vpo-conforme="${item.id}">Conforme</button>
        <button type="button" class="btn-nc-vpo${item.statut === 'nc' ? ' active' : ''}" data-vpo-nc="${item.id}">Non conforme</button>
      </div>
      <input type="text" class="vpo-input" data-vpo-text="${item.id}" placeholder="Décrire le point vérifié…" value="${escapeHtml(item.texte || '')}">
      <button type="button" class="btn-vpo-remove" data-vpo-remove="${item.id}" title="Retirer cette ligne">✕</button>
    </div>
    ${item.statut === 'nc' && item.raison ? `<div class="na-reason" style="margin-left:8px;">Raison : ${escapeHtml(item.raison)}</div>` : ''}
  `).join('');

  $$('[data-vpo-text]', container).forEach((input) => {
    input.addEventListener('input', () => {
      const item = findVpoItem(input.dataset.vpoText);
      if (!item) return;
      item.texte = input.value;
      schedulePersist();
      updateProgressPill();
    });
  });

  $$('[data-vpo-conforme]', container).forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = findVpoItem(btn.dataset.vpoConforme);
      if (!item) return;
      item.statut = item.statut === 'conforme' ? null : 'conforme';
      if (item.statut !== 'nc') item.raison = '';
      schedulePersist();
      renderVpoList();
      updateProgressPill();
      renderNonConformites();
    });
  });

  $$('[data-vpo-nc]', container).forEach((btn) => {
    btn.addEventListener('click', async () => {
      const item = findVpoItem(btn.dataset.vpoNc);
      if (!item) return;
      if (item.statut === 'nc') {
        item.statut = null;
        item.raison = '';
      } else {
        const reason = await askNcReason();
        if (reason === null) return;
        item.statut = 'nc';
        item.raison = reason;
      }
      schedulePersist();
      renderVpoList();
      updateProgressPill();
      renderNonConformites();
    });
  });

  $$('[data-vpo-remove]', container).forEach((btn) => {
    btn.addEventListener('click', () => {
      state.draft.vpoItems = state.draft.vpoItems.filter((it) => it.id !== btn.dataset.vpoRemove);
      if (!state.draft.vpoItems.length) state.draft.vpoItems.push(newVpoItem());
      schedulePersist();
      renderVpoList();
      updateProgressPill();
      renderNonConformites();
    });
  });
}

$('#btnAddVpo').addEventListener('click', () => {
  if (!state.draft) return;
  state.draft.vpoItems.push(newVpoItem());
  schedulePersist();
  renderVpoList();
});

// ---------- Onglet Identification : liens hypertextes ----------
function updateLinkTargets() {
  $$('[data-link]').forEach((input) => {
    const key = input.dataset.link;
    const target = $(`[data-open-link="${key}"]`);
    if (target) target.href = input.value || '#';
  });
}
$$('[data-link]').forEach((input) => {
  input.addEventListener('input', () => {
    updateLinkTargets();
    if (!state.draft) return;
    state.draft.liens[input.dataset.link] = input.value;
    schedulePersist();
  });
});

['fldTag', 'fldType', 'fldDesc'].forEach((id) => {
  document.getElementById(id).addEventListener('change', () => {
    if (!state.draft) return;
    state.draft.champs.tag = $('#fldTag').value;
    state.draft.champs.type = $('#fldType').value;
    state.draft.champs.desc = $('#fldDesc').value;
    toast('Fiche d\u2019identification enregistrée.');
    schedulePersist();
  });
});

// ---------- Onglet Sécurité et général : champs généraux ----------
const GENERAL_FIELD_MAP = {
  fldEmploye: 'employe', fldChargeProjet: 'chargeProjet', fldContracteur: 'contracteur',
  fldDateDebut: 'dateDebut', fldDateFin: 'dateFin', fldEtatGeneral: 'etatGeneral', fldCommentaires: 'commentaires',
  fldEmployeeName: 'employeeName', fldRole: 'employeeRole',
};
Object.keys(GENERAL_FIELD_MAP).forEach((id) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('change', () => {
    if (!state.draft) return;
    state.draft.champs[GENERAL_FIELD_MAP[id]] = el.value;
    schedulePersist();
  });
});

// ---------- Dropzones génériques (Plans / Programmation / Mise à jour / Information) ----------
function extBadge(filename) {
  const ext = (filename.split('.').pop() || '').toUpperCase();
  return ext.length > 5 ? 'FICHIER' : ext;
}
function fmtSize(bytes) {
  if (bytes < 1024) return bytes + ' o';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' Ko';
  return (bytes / (1024 * 1024)).toFixed(1) + ' Mo';
}

async function uploadFiles(onglet, files) {
  if (!state.numero) { toast('Entrez d\u2019abord un numéro de localisation.'); return; }
  if (!files || !files.length) return;

  for (const f of Array.from(files)) {
    const safe = f.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storedAs = `${Date.now()}-${safe}`;
    state.draft.files[onglet].push({
      name: f.name, storedAs, size: f.size, type: f.type,
      uploadedAt: new Date().toISOString(), blob: f,
    });
  }

  await dbPut(state.draft);
  toast(`${files.length} document(s) enregistré(s) localement dans « ${onglet} ».`);
  refreshFileList(onglet);
  updateFilesCount();
}

function refreshFileList(onglet) {
  const listEl = $(`[data-file-list="${onglet}"]`);
  if (!listEl || !state.draft) return;
  const files = state.draft.files[onglet] || [];
  if (!files.length) { listEl.innerHTML = '<div class="empty-state">Aucun document déposé pour l\'instant.</div>'; return; }
  listEl.innerHTML = files.map((f) => `
    <div class="file-row">
      <span class="ext-badge">${extBadge(f.name)}</span>
      <span class="file-name">${f.name}</span>
      <span class="file-meta">${fmtSize(f.size)} · ${new Date(f.uploadedAt).toLocaleDateString('fr-CA')}</span>
    </div>`).join('');
}

function refreshAllFileLists() {
  UPLOAD_TABS.forEach(refreshFileList);
}

function updateFilesCount() {
  if (!state.draft) return;
  const tabTotal = Object.values(state.draft.files || {}).reduce((sum, arr) => sum + arr.length, 0);
  const taskTotal = Object.values(state.draft.casesFichiers || {}).reduce((sum, arr) => sum + arr.length, 0);
  $('#wsFilesCount').textContent = `${tabTotal + taskTotal} document(s)`;
}

$$('.dropzone').forEach((zone) => {
  const onglet = zone.dataset.dropzone;
  const input = zone.querySelector('input[type="file"]');
  zone.addEventListener('click', (e) => { if (e.target !== input) input.click(); });
  input.addEventListener('change', () => uploadFiles(onglet, input.files));
  ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('dragover'); }));
  ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove('dragover'); }));
  zone.addEventListener('drop', (e) => uploadFiles(onglet, e.dataTransfer.files));
});

// ---------- Snagit + outil d'annotation ----------
const canvas = $('#annotateCanvas');
const ctx = canvas.getContext('2d');
let drawing = false, currentTool = 'pen', lastX = 0, lastY = 0, startX = 0, startY = 0;

function resetCanvas() {
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-surface-2') || '#1e2630';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#555f6b';
  ctx.font = '14px Inter, sans-serif';
  ctx.fillStyle = '#7a8694';
  ctx.textAlign = 'center';
  ctx.fillText('Chargez une capture Snagit ou une image pour commencer l\'annotation', canvas.width / 2, canvas.height / 2);
}
resetCanvas();

$('#btnSnagit').addEventListener('click', () => {
  const attempted = 'snagit://capture';
  window.location.href = attempted;
  toast("Ouverture de Snagit… si rien ne se passe, capturez puis utilisez « Charger une image existante ».", 4000);
});

function loadImageBlobIntoCanvas(blob) {
  const img = new Image();
  img.onload = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
    const w = img.width * scale, h = img.height * scale;
    ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    URL.revokeObjectURL(img.src);
  };
  img.src = URL.createObjectURL(blob);
}

$('#btnLoadImage').addEventListener('click', () => $('#loadImageInput').click());
$('#loadImageInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  loadImageBlobIntoCanvas(file);
});

// ---------- Collage direct depuis le presse-papiers ----------
$('#btnPasteClipboard').addEventListener('click', async () => {
  if (!navigator.clipboard || !navigator.clipboard.read) {
    toast("Le collage direct n'est pas supporté par ce navigateur. Utilisez Ctrl+V dans cet onglet, ou glissez-déposez l'image.", 4000);
    return;
  }
  try {
    const items = await navigator.clipboard.read();
    let found = false;
    for (const item of items) {
      const imgType = item.types.find((t) => t.startsWith('image/'));
      if (imgType) {
        const blob = await item.getType(imgType);
        loadImageBlobIntoCanvas(blob);
        toast('Image collée depuis le presse-papiers.');
        found = true;
        break;
      }
    }
    if (!found) toast('Aucune image trouvée dans le presse-papiers.');
  } catch (err) {
    toast('Impossible de lire le presse-papiers (autorisation refusée). Essayez Ctrl+V ou le glisser-déposer.', 4000);
  }
});

document.addEventListener('paste', (e) => {
  if (state.currentTab !== 'mise-a-jour' || $('#screenWorkspace').classList.contains('hidden')) return;
  const items = e.clipboardData && e.clipboardData.items;
  if (!items) return;
  for (const item of items) {
    if (item.type && item.type.startsWith('image/')) {
      const blob = item.getAsFile();
      if (blob) {
        loadImageBlobIntoCanvas(blob);
        toast('Image collée depuis le presse-papiers.');
      }
      e.preventDefault();
      break;
    }
  }
});

$$('[data-tool]').forEach((btn) => btn.addEventListener('click', () => {
  currentTool = btn.dataset.tool;
  $$('[data-tool]').forEach((b) => b.classList.remove('btn-primary'));
  btn.classList.add('btn-primary');
}));

$('#btnClearCanvas').addEventListener('click', resetCanvas);

function canvasPos(e) {
  const rect = canvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return { x: (clientX - rect.left) * (canvas.width / rect.width), y: (clientY - rect.top) * (canvas.height / rect.height) };
}

function startDraw(e) {
  drawing = true;
  const p = canvasPos(e);
  lastX = startX = p.x; lastY = startY = p.y;
  if (currentTool === 'text') {
    const txt = prompt('Texte de l\'annotation :');
    if (txt) { ctx.fillStyle = '#ff7a1a'; ctx.font = 'bold 16px Inter, sans-serif'; ctx.textAlign = 'left'; ctx.fillText(txt, p.x, p.y); }
    drawing = false;
  }
}
function moveDraw(e) {
  if (!drawing) return;
  const p = canvasPos(e);
  if (currentTool === 'pen') {
    ctx.strokeStyle = '#ff7a1a'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(lastX, lastY); ctx.lineTo(p.x, p.y); ctx.stroke();
    lastX = p.x; lastY = p.y;
  }
}
function endDraw(e) {
  if (!drawing) return;
  if (currentTool === 'arrow') {
    const p = canvasPos(e);
    drawArrow(startX, startY, p.x, p.y);
  }
  drawing = false;
}
function drawArrow(x1, y1, x2, y2) {
  const headlen = 14, angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.strokeStyle = '#ff7a1a'; ctx.fillStyle = '#ff7a1a'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headlen * Math.cos(angle - Math.PI / 6), y2 - headlen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - headlen * Math.cos(angle + Math.PI / 6), y2 - headlen * Math.sin(angle + Math.PI / 6));
  ctx.closePath(); ctx.fill();
}
canvas.addEventListener('mousedown', startDraw);
canvas.addEventListener('mousemove', moveDraw);
canvas.addEventListener('mouseup', endDraw);
canvas.addEventListener('touchstart', (e) => { e.preventDefault(); startDraw(e); });
canvas.addEventListener('touchmove', (e) => { e.preventDefault(); moveDraw(e); });
canvas.addEventListener('touchend', endDraw);

$('#btnSaveAnnotated').addEventListener('click', () => {
  if (!state.numero) { toast("Créez d'abord un dossier."); return; }
  canvas.toBlob(async (blob) => {
    const filename = `capture-annotee-${Date.now()}.png`;
    const namedBlob = new File([blob], filename, { type: 'image/png' });
    await uploadFiles('mise-a-jour', [namedBlob]);
  }, 'image/png');
});

// ---------- Approbation : le nom/rôle sont persistés comme champs généraux
// (voir GENERAL_FIELD_MAP) et lus au moment de la sauvegarde officielle ----------
function refreshApprovals() {
  const el = $('#approvalHistory');
  const list = state.draft ? state.draft.approbations : [];
  if (!list || !list.length) { el.innerHTML = '<div class="empty-state">Aucune sauvegarde officielle enregistrée pour ce dossier.</div>'; return; }
  el.innerHTML = list.slice().reverse().map((a) => `
    <div class="approval-row">
      <span class="badge-ok">✓</span>
      <span class="who">${a.nom} <span style="color:var(--color-text-faint);font-weight:400;">(${a.role})</span></span>
      <span class="when">${new Date(a.at).toLocaleString('fr-CA')}</span>
    </div>`).join('');
}

// ---------- Code QR : retrouver rapidement ce dossier ----------
function buildDossierUrl() {
  const base = location.origin + location.pathname;
  const params = new URLSearchParams({
    mode: state.draft.mode,
    numero: state.numero,
    bt: state.draft.champs.bt || '',
  });
  return `${base}?${params.toString()}`;
}

function generateQrSvg(text) {
  if (typeof qrcode === 'undefined') return '';
  for (let type = 4; type <= 40; type++) {
    try {
      const qr = qrcode(type, 'M');
      qr.addData(text);
      qr.make();
      return qr.createSvgTag(4, 4);
    } catch (err) {
      // ce type est trop petit pour la donnée — on essaie le suivant
    }
  }
  return '';
}

$('#btnShowQr').addEventListener('click', () => {
  if (!state.numero || !state.draft) { toast('Ouvrez d\u2019abord un dossier.'); return; }
  const url = buildDossierUrl();
  const svg = generateQrSvg(url);
  const off = state.draft.derniereSauvegardeOfficielle;
  const statusHtml = off
    ? `<p style="font-size:var(--text-sm);color:var(--color-success);">\u2705 Ce dossier a été sauvegardé sur le réseau le ${new Date(off.at).toLocaleString('fr-CA')}. Ce code pointe vers cette sauvegarde.</p>`
    : `<p style="font-size:var(--text-sm);color:var(--color-warning, #eab308);">\u26a0 Ce dossier n\u2019a pas encore été sauvegardé sur le réseau (bouton \u00ab Sauvegarder le dossier \u00bb). Ce code permet de reprendre sur cet appareil, mais ne trouvera rien sur un autre appareil tant qu\u2019une sauvegarde officielle n\u2019aura pas été faite.</p>`;
  showModal({
    title: 'Code QR du dossier',
    bodyHtml: `
      <p style="font-size:var(--text-sm);color:var(--color-text-muted);">Scannez ce code pour rouvrir directement ce dossier — sur cet appareil instantanément, ou sur un autre appareil en important la dernière sauvegarde réseau.</p>
      ${statusHtml}
      <div style="background:#fff;padding:12px;border-radius:8px;display:flex;justify-content:center;margin:var(--space-3) 0;">${svg || '<span style="color:#900;">Erreur de génération du code QR.</span>'}</div>
      <input type="text" readonly value="${url}" onclick="this.select()" style="font-family:var(--font-mono);font-size:11px;">
    `,
    confirmLabel: 'Fermer',
  });
});

// ---------- Import depuis un dossier réseau existant (vraie synchronisation) ----------
async function findLatestNetworkFolder(rootHandle, numero, bt) {
  const prefix = bt ? `${numero} (${bt}) - ` : `${numero} - `;
  const candidates = [];
  for await (const [name, handle] of rootHandle.entries()) {
    if (handle.kind === 'directory' && name.startsWith(prefix)) candidates.push(name);
  }
  if (!candidates.length) return null;
  candidates.sort(); // les noms se terminent par AAAA-MM-JJ, le tri texte suffit
  const latestName = candidates[candidates.length - 1];
  return rootHandle.getDirectoryHandle(latestName, { create: false });
}

async function readBlobFromDir(dirHandle, filename) {
  try {
    const fh = await dirHandle.getFileHandle(filename);
    return await fh.getFile();
  } catch (err) { return null; }
}

async function importFromNetworkFolder(numero, bt) {
  if (!FS_ACCESS_SUPPORTED) {
    toast('L\u2019import réseau nécessite Chrome ou Edge sur ordinateur.', 4000);
    return false;
  }
  try {
    const root = await window.showDirectoryPicker({ mode: 'readwrite' });
    state.rootDirHandle = root;

    const folder = await findLatestNetworkFolder(root, numero, bt);
    if (!folder) {
      toast(`Aucun dossier réseau trouvé pour ${numero}${bt ? ' (' + bt + ')' : ''} à cet emplacement.`, 5000);
      return false;
    }

    const jsonFile = await (await folder.getFileHandle('suivi.json')).getFile();
    const draft = normalizeDraft(JSON.parse(await jsonFile.text()));

    const docsDir = await folder.getDirectoryHandle('Documents', { create: false }).catch(() => null);
    if (docsDir) {
      for (const [name, files] of Object.entries(draft.casesFichiers || {})) {
        for (const f of files) {
          const safe = f.name.replace(/[^a-zA-Z0-9._-]/g, '_');
          const blob = await readBlobFromDir(docsDir, `${name}__${safe}`);
          if (blob) f.blob = blob;
        }
      }
    }
    const photosDir = await folder.getDirectoryHandle('Photos', { create: false }).catch(() => null);
    if (photosDir) {
      for (const f of (draft.files['mise-a-jour'] || [])) {
        const safe = (f.storedAs || f.name).replace(/[^a-zA-Z0-9._-]/g, '_');
        const blob = await readBlobFromDir(photosDir, safe);
        if (blob) f.blob = blob;
      }
    }

    state.draft = draft;
    state.numero = draft.localisation;
    state.isNewDraft = false;
    state.dossierDirHandle = folder;
    await dbPut(state.draft);
    toast(`Dossier ${state.numero} importé depuis le réseau — vous reprenez où c\u2019était rendu.`, 4500);
    openWorkspace();
    return true;
  } catch (err) {
    if (err && err.name === 'AbortError') return false;
    toast('Impossible d\u2019importer le dossier depuis cet emplacement.', 4500);
    return false;
  }
}

$('#btnImportNetwork').addEventListener('click', async () => {
  const numero = $('#numLoc').value.trim().toUpperCase();
  const bt = $('#numBt').value.trim().toUpperCase();
  if (!numero) { toast('Entrez d\u2019abord le numéro de localisation.'); return; }
  await importFromNetworkFolder(numero, bt);
});

// ---------- Reprise automatique via un lien/QR scanné ----------
(async function autoResumeFromUrl() {
  const params = new URLSearchParams(location.search);
  const mode = params.get('mode');
  const numero = params.get('numero');
  const bt = params.get('bt') || '';
  if (mode !== 'installation' && mode !== 'demantelement') return;
  if (!numero) return;

  selectMode(mode);
  $('#numLoc').value = numero;
  $('#numBt').value = bt;
  if (bt) $('#numBt').dispatchEvent(new Event('input'));
  $('#numLoc').dispatchEvent(new Event('input'));

  // Nettoyer l'URL pour ne pas reprendre automatiquement à chaque rechargement futur
  history.replaceState({}, '', location.pathname);

  if (!NUMERO_PATTERN.test(numero)) {
    toast('Le numéro de localisation contient des caractères invalides.', 4000);
    return;
  }
  if (!bt) {
    toast('Complétez le B.T. pour continuer.', 4000);
    return;
  }

  // Sur cet appareil, un brouillon local existe déjà : on l'ouvre directement (le plus rapide).
  const existing = await dbGet(numero);
  if (existing) {
    ouvrirDossier();
    return;
  }

  // Nouvel appareil : proposer d'importer les vraies données depuis le dossier réseau.
  const confirmed = await showModal({
    title: 'Reprendre ce dossier',
    bodyHtml: `<p style="font-size:var(--text-sm);color:var(--color-text-muted);">Aucun brouillon local n\u2019existe sur cet appareil pour <strong>${numero}${bt ? ' (' + bt + ')' : ''}</strong>. Importer les données (cases cochées, documents, photos) depuis le dossier réseau où il a été sauvegardé ?</p>`,
    confirmLabel: 'Importer depuis le réseau',
  });
  if (confirmed) {
    await importFromNetworkFolder(numero, bt);
  } else {
    toast('Cliquez sur Continuer pour démarrer un nouveau brouillon local.', 4500);
  }
})();
