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
    vpo: [],
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
    vpo: [],
  },
};

const UPLOAD_TABS = ['mise-a-jour'];
const ATTACH_GROUPS = ['plans', 'programmation', 'systeme', 'information'];
const GROUP_LABELS = {
  identification: 'IDENTIFICATION', plans: 'PLANS', programmation: 'PROGRAMMATION',
  systeme: 'MISES À JOUR SYSTÈME', information: 'INFORMATION', securite: 'SÉCURITÉ ET GÉNÉRAL',
  vpo: 'VPO — VÉRIFICATION PRÉ-OPÉRATIONNELLE',
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
$$('.choice-card').forEach((card) => {
  card.addEventListener('click', () => {
    state.mode = card.dataset.choice;
    document.getElementById('app').setAttribute('data-mode', state.mode);

    const label = state.mode === 'installation' ? "Suivi d'installation" : "Démantèlement d'instrumentation";
    $('#modeBadge').textContent = label;
    $('#modeBadge').classList.remove('hidden');
    $('#brandSub').textContent = label;
    $('#homeBtn').classList.remove('hidden');
    $('#step2Kicker').textContent = `Étape 2 · ${label}`;
    $('#step2Title').textContent = state.mode === 'installation'
      ? "Localisation de l'instrument à installer"
      : "Localisation de l'instrument à démanteler";

    $('#screenChoice').classList.add('hidden');
    $('#screenDossier').classList.remove('hidden');
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
        rows.push({ group, label, reason: state.draft.casesRaisons[name] || '' });
      }
    });
  });
  if (!rows.length) {
    el.innerHTML = '<div class="empty-state">Aucune non-conformité relevée pour ce dossier.</div>';
    return;
  }
  el.innerHTML = rows.map((r) => `
    <div class="nc-summary-item">
      <div class="nc-section">${GROUP_LABELS[r.group] || r.group}</div>
      <div class="nc-label">${r.label}</div>
      ${r.reason ? `<div class="nc-reason">Raison : ${r.reason}</div>` : ''}
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
    await writeEverythingToDisk();
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
async function writeEverythingToDisk() {
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

async function ouvrirDossier() {
  const numero = $('#numLoc').value.trim().toUpperCase();
  const statusEl = $('#dossierStatus');
  if (!numero) {
    statusEl.classList.remove('hidden', 'ok', 'new');
    statusEl.classList.add('err');
    statusEl.textContent = 'Entrez d\u2019abord le numéro de localisation.';
    return;
  }

  statusEl.classList.remove('hidden', 'ok', 'err');
  statusEl.textContent = 'Ouverture du dossier local…';

  const bt = $('#numBt').value.trim();
  const existing = await dbGet(numero);
  if (existing) {
    state.draft = normalizeDraft(existing);
    state.isNewDraft = false;
    if (bt) state.draft.champs.bt = bt;
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
  ['identification', 'plans', 'programmation', 'systeme', 'information', 'securite', 'vpo'].forEach(renderChecklist);
}

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
