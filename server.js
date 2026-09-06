// server.js — simulateur du "dossier réseau" par numéro de localisation.
// Démo : reproduit le comportement attendu (vérifier si un dossier existe sur
// le réseau, sinon le créer) avec le système de fichiers local du bac à sable.
// En production, DATA_ROOT pointerait vers le chemin UNC / lecteur réseau réel
// (ex. \\\\srv-instrumentation\\dossiers\\) via un petit service Windows relais
// (voir le document de vision pour les recommandations d'architecture).
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const DATA_ROOT = path.join(__dirname, 'data');
fs.mkdirSync(DATA_ROOT, { recursive: true });

const app = express();
app.use(cors());
app.use(express.json());

function dossierDir(numero) { return path.join(DATA_ROOT, numero); }
function metaPath(numero) { return path.join(dossierDir(numero), 'dossier.json'); }

function loadMeta(numero) {
  try { return JSON.parse(fs.readFileSync(metaPath(numero), 'utf8')); } catch (e) { return null; }
}
function saveMeta(numero, meta) {
  meta.updatedAt = new Date().toISOString();
  fs.writeFileSync(metaPath(numero), JSON.stringify(meta, null, 2));
}

const ONGLETS = ['plans', 'programmation', 'mise-a-jour', 'information'];

function ensureDossier(numero, type) {
  const dir = dossierDir(numero);
  let justCreated = false;
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    ONGLETS.forEach((o) => fs.mkdirSync(path.join(dir, o), { recursive: true }));
    const meta = {
      numero, type,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      liens: {}, identification: {}, files: Object.fromEntries(ONGLETS.map((o) => [o, []])),
      approbations: [],
    };
    saveMeta(numero, meta);
    justCreated = true;
  }
  return { meta: loadMeta(numero), justCreated };
}

// ---- Vérifier / créer le dossier ----
app.post('/api/dossier/:numero', (req, res) => {
  const numero = req.params.numero;
  const type = req.query.type || 'installation';
  const { meta, justCreated } = ensureDossier(numero, type);
  res.json({ ...meta, justCreated });
});

// ---- Lire l'état complet du dossier ----
app.get('/api/dossier/:numero', (req, res) => {
  const meta = loadMeta(req.params.numero);
  if (!meta) return res.status(404).json({ error: 'not found' });
  res.json(meta);
});

// ---- Sauvegarder les liens hypertextes (Identification) ----
app.post('/api/dossier/:numero/liens', (req, res) => {
  const meta = loadMeta(req.params.numero);
  if (!meta) return res.status(404).json({ error: 'not found' });
  meta.liens = { ...meta.liens, ...req.body.liens };
  saveMeta(req.params.numero, meta);
  res.json({ ok: true });
});

// ---- Sauvegarder la fiche d'identification ----
app.post('/api/dossier/:numero/identification', (req, res) => {
  const meta = loadMeta(req.params.numero);
  if (!meta) return res.status(404).json({ error: 'not found' });
  meta.identification = { tag: req.body.tag, type: req.body.type, desc: req.body.desc };
  saveMeta(req.params.numero, meta);
  res.json({ ok: true });
});

// ---- Upload de fichiers par onglet ----
// Stockage en mémoire : multer termine de lire TOUT le formulaire multipart (fichiers + champs texte)
// avant que notre gestionnaire ne s'exécute. Le champ "onglet" est donc toujours disponible ici,
// peu importe l'ordre dans lequel le navigateur a envoyé les parties du formulaire.
// (Un stockage disque avec répertoire calculé à la volée plantait le serveur quand le champ
// "onglet" arrivait après les fichiers dans le flux multipart.)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 9.5 * 1024 * 1024 } });

app.post('/api/dossier/:numero/upload', upload.array('files'), (req, res) => {
  const numero = req.params.numero;
  const onglet = req.body.onglet;
  if (!onglet) return res.status(400).json({ error: 'onglet manquant' });
  const meta = loadMeta(numero);
  if (!meta) return res.status(404).json({ error: 'not found' });
  const dir = path.join(dossierDir(numero), onglet);
  fs.mkdirSync(dir, { recursive: true });
  if (!meta.files[onglet]) meta.files[onglet] = [];
  (req.files || []).forEach((f) => {
    const safe = f.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storedAs = `${Date.now()}-${safe}`;
    fs.writeFileSync(path.join(dir, storedAs), f.buffer);
    meta.files[onglet].push({ name: f.originalname, storedAs, size: f.size, uploadedAt: new Date().toISOString() });
  });
  saveMeta(numero, meta);
  res.json({ ok: true, count: (req.files || []).length });
});

// ---- Liste des fichiers d'un onglet ----
app.get('/api/dossier/:numero/files/:onglet', (req, res) => {
  const meta = loadMeta(req.params.numero);
  if (!meta) return res.status(404).json({ error: 'not found' });
  res.json(meta.files[req.params.onglet] || []);
});

// ---- Approbation ----
app.post('/api/dossier/:numero/approbation', (req, res) => {
  const meta = loadMeta(req.params.numero);
  if (!meta) return res.status(404).json({ error: 'not found' });
  meta.approbations.push({ employeeId: req.body.employeeId, role: req.body.role, at: new Date().toISOString() });
  saveMeta(req.params.numero, meta);
  res.json({ ok: true, approbations: meta.approbations });
});

const PORT = 8000;
// Garde-fou : une erreur non gérée dans une requête ne doit jamais faire planter tout le serveur.
process.on('uncaughtException', (err) => console.error('Erreur non gérée (serveur maintenu en vie) :', err));
process.on('unhandledRejection', (err) => console.error('Rejet non géré (serveur maintenu en vie) :', err));

app.listen(PORT, '0.0.0.0', () => console.log(`Serveur de dossiers démarré sur le port ${PORT}`));
