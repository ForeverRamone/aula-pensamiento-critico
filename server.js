// Espacio colaborativo del curso "Del ChatGPT al pensamiento crítico".
// Node + Express + SQLite (integrado en Node) + plantillas EJS. Un solo proceso,
// pensado para correr en un contenedor Docker.
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const express = require('express');
const session = require('express-session');
const expressLayouts = require('express-ejs-layouts');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const sanitizeHtml = require('sanitize-html');

const { db, UPLOAD_DIR } = require('./db');
const SqliteStore = require('./sessionStore');

// ---- Configuración (todo se puede fijar por variables de entorno) ----
const PORT = process.env.PORT || 3000;
const SITE_NAME = process.env.SITE_NAME || 'Del ChatGPT al pensamiento crítico';
const INVITE_CODE = process.env.INVITE_CODE || 'cambia-este-codigo';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const SESSION_SECRET = process.env.SESSION_SECRET || 'cambia-esto-en-produccion';

// ---- Sentencias SQL preparadas ----
const q = {
  userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
  userById: db.prepare('SELECT * FROM users WHERE id = ?'),
  insertUser: db.prepare(
    'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)'
  ),
  countUsers: db.prepare('SELECT COUNT(*) AS n FROM users'),
  listUsers: db.prepare('SELECT id, name, email, role, bio, created_at FROM users ORDER BY created_at ASC'),
  updateBio: db.prepare('UPDATE users SET bio = ? WHERE id = ?'),

  insertMaterial: db.prepare(
    `INSERT INTO materials (user_id, session, kind, title, description, url, embed_url, file_path, file_name, file_kind, slide_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ),
  listMaterials: db.prepare(
    `SELECT m.*, u.name AS author FROM materials m
     JOIN users u ON u.id = m.user_id ORDER BY m.created_at DESC, m.id DESC`
  ),
  materialById: db.prepare('SELECT * FROM materials WHERE id = ?'),
  deleteMaterial: db.prepare('DELETE FROM materials WHERE id = ?'),
  countMaterials: db.prepare('SELECT COUNT(*) AS n FROM materials'),

  insertPost: db.prepare(
    'INSERT INTO posts (user_id, type, title, body) VALUES (?, ?, ?, ?)'
  ),
  listPosts: db.prepare(
    `SELECT p.*, u.name AS author FROM posts p
     JOIN users u ON u.id = p.user_id ORDER BY p.created_at DESC, p.id DESC`
  ),
  postById: db.prepare('SELECT * FROM posts WHERE id = ?'),
  deletePost: db.prepare('DELETE FROM posts WHERE id = ?'),
  countPosts: db.prepare('SELECT COUNT(*) AS n FROM posts'),

  insertComment: db.prepare('INSERT INTO comments (post_id, user_id, body) VALUES (?, ?, ?)'),
  listComments: db.prepare(
    `SELECT c.*, u.name AS author FROM comments c
     JOIN users u ON u.id = c.user_id ORDER BY c.created_at ASC, c.id ASC`
  ),
  commentById: db.prepare('SELECT * FROM comments WHERE id = ?'),
  deleteComment: db.prepare('DELETE FROM comments WHERE id = ?'),

  // Actividad rediseñada
  getSubmission: db.prepare('SELECT * FROM submissions WHERE user_id = ?'),
  upsertSubmission: db.prepare(
    `INSERT INTO submissions (user_id, task_title, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET task_title = excluded.task_title, updated_at = datetime('now')`
  ),
  touchSubmission: db.prepare(
    `INSERT INTO submissions (user_id, updated_at) VALUES (?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET updated_at = datetime('now')`
  ),
  getText: db.prepare('SELECT body FROM activity_texts WHERE user_id = ? AND part = ?'),
  upsertText: db.prepare(
    `INSERT INTO activity_texts (user_id, part, body, updated_at) VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, part) DO UPDATE SET body = excluded.body, updated_at = datetime('now')`
  ),
  textsByUser: db.prepare('SELECT part, body FROM activity_texts WHERE user_id = ?'),
  insertActivityFile: db.prepare(
    `INSERT INTO activity_files (user_id, part, title, url, embed_url, file_path, file_name, file_kind, slide_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ),
  filesByUser: db.prepare('SELECT * FROM activity_files WHERE user_id = ? ORDER BY created_at ASC, id ASC'),
  activityFileById: db.prepare('SELECT * FROM activity_files WHERE id = ?'),
  deleteActivityFile: db.prepare('DELETE FROM activity_files WHERE id = ?'),

  // Participantes con estado de la actividad
  listUsersWithActivity: db.prepare(
    `SELECT u.id, u.name, u.role, s.task_title, s.updated_at AS activity_updated
     FROM users u LEFT JOIN submissions s ON s.user_id = u.id
     ORDER BY u.created_at ASC`
  ),

  // ---- Administración ----
  getSetting: db.prepare('SELECT value FROM settings WHERE key = ?'),
  setSetting: db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ),
  listUsersAdmin: db.prepare(
    `SELECT u.id, u.name, u.email, u.role, u.created_at,
            (SELECT COUNT(*) FROM activity_texts t WHERE t.user_id = u.id AND t.body IS NOT NULL) AS parts,
            (SELECT COUNT(*) FROM posts p WHERE p.user_id = u.id) AS posts,
            (SELECT COUNT(*) FROM comments c WHERE c.user_id = u.id) AS comments
     FROM users u ORDER BY u.created_at ASC`
  ),
  updateUserRole: db.prepare('UPDATE users SET role = ? WHERE id = ?'),
  updateUserPassword: db.prepare('UPDATE users SET password_hash = ? WHERE id = ?'),
  deleteUser: db.prepare('DELETE FROM users WHERE id = ?'),
  countAdmins: db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'"),
  materialsByUser: db.prepare('SELECT file_kind, file_path FROM materials WHERE user_id = ?'),
  activityFilesByUserRaw: db.prepare('SELECT file_kind, file_path FROM activity_files WHERE user_id = ?'),
  countComments: db.prepare('SELECT COUNT(*) AS n FROM comments'),
  countSubmissions: db.prepare('SELECT COUNT(*) AS n FROM submissions'),
};

// Apartados de la actividad rediseñada, en orden, con su ayuda contextual.
const ACTIVITY_PARTS = [
  {
    key: 'original',
    label: 'La actividad original',
    tag: 'Fase 1 · Tu tarea, hoy',
    help: 'Describe la tarea tal como la pides ahora: qué pides (el enunciado), para qué (el resultado de aprendizaje) y cómo la evalúas.',
  },
  {
    key: 'hackeo',
    label: 'Cómo la "hackea" la IA',
    tag: 'Fase 2 · La prueba de estrés',
    help: 'Pasa tu enunciado por una IA. Pega el prompt que usaste y un resumen o captura de lo que devolvió. ¿Cuánto resuelve: todo, una parte, casi nada? ¿Qué aprendizaje quedaría sin demostrar?',
  },
  {
    key: 'rediseno',
    label: 'El rediseño IA-consciente',
    tag: 'Fase 3 · El rediseño',
    help: 'La tarea rediseñada con sus seis componentes: enunciado situado, reglas de uso por fase, trabajo por fases, rúbrica de proceso, declaración de uso de IA y verificación de autoría.',
  },
  {
    key: 'evaluacion',
    label: 'Cómo evaluamos el rediseño',
    tag: 'Certificación · Apto / No apto',
    help: 'Cómo compruebas que cumple los cinco criterios: situada y "resistente" a la IA, reglas de uso claras, evalúa el proceso, verifica la autoría y está éticamente cuidada.',
  },
  {
    key: 'ia_despues',
    label: 'Qué hace la IA tras el rediseño',
    tag: 'La prueba, otra vez',
    help: 'Vuelve a pasar la tarea ya rediseñada por la IA. Muestra qué devuelve ahora y por qué ya no basta para superar la tarea sin aprendizaje real.',
  },
];
const ACTIVITY_PART_KEYS = ACTIVITY_PARTS.map((p) => p.key);

// El curso tiene 5 sesiones. La "sesión 0" es material general (sin sesión).
const NUM_SESSIONS = Number(process.env.NUM_SESSIONS || 5);
function sessionLabel(n) {
  return Number(n) > 0 ? `Sesión ${n}` : 'General';
}

// Ajustes editables desde el panel de administración. Si no se han tocado,
// valen los de las variables de entorno (arriba). Una vez el admin los cambia,
// mandan los guardados en la base de datos (sin necesidad de redeplegar).
const SETTING_DEFAULTS = {
  invite_code: INVITE_CODE,
  registration_open: '1',
  site_name: SITE_NAME,
  num_sessions: String(NUM_SESSIONS),
};
function getSetting(key) {
  const row = q.getSetting.get(key);
  return row && row.value != null ? row.value : SETTING_DEFAULTS[key];
}
function currentNumSessions() {
  const n = parseInt(getSetting('num_sessions'), 10);
  return Number.isInteger(n) && n > 0 && n <= 20 ? n : 5;
}

// Dos categorías de material: el del curso en sí y el adicional.
const MATERIAL_KINDS = { curso: 'Material del curso', adicional: 'Material adicional' };

// Programa de conversión de PPTX. En Docker es "libreoffice"; se puede cambiar
// con la variable SOFFICE_BIN si hiciera falta.
const SOFFICE_BIN = process.env.SOFFICE_BIN || 'libreoffice';

// Convierte un .pptx/.ppt en imágenes de diapositiva (una PNG por página).
// Devuelve el número de diapositivas. Lanza error si el conversor no está.
function convertPptxToSlides(pptxPath, hex) {
  const outDir = path.join(UPLOAD_DIR, hex);
  fs.mkdirSync(outDir, { recursive: true });
  // Paso 1: PPTX -> PDF con LibreOffice (headless).
  execFileSync(
    SOFFICE_BIN,
    ['--headless', '--convert-to', 'pdf', '--outdir', outDir, pptxPath],
    { timeout: 150000, env: { ...process.env, HOME: '/tmp' }, stdio: 'ignore' }
  );
  const pdfPath = path.join(outDir, path.basename(pptxPath, path.extname(pptxPath)) + '.pdf');
  if (!fs.existsSync(pdfPath)) throw new Error('La conversión a PDF no produjo archivo.');
  // Paso 2: PDF -> una PNG por página con pdftoppm (poppler).
  execFileSync(
    'pdftoppm',
    ['-png', '-r', '120', pdfPath, path.join(outDir, 'slide')],
    { timeout: 150000, stdio: 'ignore' }
  );
  fs.unlinkSync(pdfPath); // el PDF intermedio no se conserva ni se sirve
  return listSlides(hex).length;
}

// Lista, en orden, las imágenes de diapositiva de un material convertido.
function listSlides(hex) {
  const dir = path.join(UPLOAD_DIR, hex);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^slide-\d+\.png$/.test(f))
    .sort((a, b) => parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10));
}

// Borra del disco los archivos asociados a un material (al eliminarlo).
function removeMaterialFiles(m) {
  try {
    if (m.file_kind === 'slides' && m.file_path) {
      fs.rmSync(path.join(UPLOAD_DIR, m.file_path), { recursive: true, force: true });
    } else if (m.file_path) {
      fs.rmSync(path.join(UPLOAD_DIR, m.file_path), { force: true });
    }
  } catch (_) {
    /* si el archivo ya no está, no pasa nada */
  }
}

// Procesa un archivo subido y decide cómo se mostrará (PDF, diapositivas u otro).
// Devuelve { filePath, fileKind, slideCount }. Lanza error si un PPTX no se
// pudo convertir (el llamador limpia y avisa). Reutilizado por Materiales y Actividad.
function processUpload(file) {
  const ext = path.extname(file.filename).toLowerCase();
  if (ext === '.pdf') {
    return { filePath: file.filename, fileKind: 'pdf', slideCount: 0 };
  }
  if (ext === '.pptx' || ext === '.ppt') {
    const hex = path.basename(file.filename, ext);
    const slideCount = convertPptxToSlides(file.path, hex);
    if (slideCount === 0) throw new Error('La presentación no generó diapositivas.');
    fs.rmSync(file.path, { force: true }); // el .pptx original no se conserva
    return { filePath: hex, fileKind: 'slides', slideCount };
  }
  return { filePath: file.filename, fileKind: 'file', slideCount: 0 };
}

// Convierte un enlace de Google (Slides, Docs, Sheets o Drive) en su URL
// embebible en "modo lector". Devuelve null si no es un enlace de Google.
function googleEmbed(url) {
  if (!url) return null;
  let m;
  if ((m = url.match(/docs\.google\.com\/presentation\/d\/([\w-]+)/))) {
    // Sin rm=minimal: así el reproductor de Google muestra sus controles
    // (flechas anterior/siguiente, contador y pantalla completa).
    return `https://docs.google.com/presentation/d/${m[1]}/embed?start=false&loop=false`;
  }
  if ((m = url.match(/docs\.google\.com\/document\/d\/([\w-]+)/))) {
    return `https://docs.google.com/document/d/${m[1]}/preview`;
  }
  if ((m = url.match(/docs\.google\.com\/spreadsheets\/d\/([\w-]+)/))) {
    return `https://docs.google.com/spreadsheets/d/${m[1]}/preview`;
  }
  if ((m = url.match(/drive\.google\.com\/file\/d\/([\w-]+)/))) {
    return `https://drive.google.com/file/d/${m[1]}/preview`;
  }
  if ((m = url.match(/drive\.google\.com\/open\?id=([\w-]+)/))) {
    return `https://drive.google.com/file/d/${m[1]}/preview`;
  }
  return null;
}

// Limpia el HTML del editor de texto enriquecido: conserva formato básico
// (negrita, cursiva, subrayado, listas, enlaces) y elimina cualquier cosa
// peligrosa (scripts, estilos raros, etc.). Sirve también para depurar el
// HTML sucio que llega al pegar desde Word.
function cleanHtml(dirty) {
  const clean = sanitizeHtml(String(dirty || ''), {
    allowedTags: ['b', 'strong', 'i', 'em', 'u', 's', 'p', 'br', 'ul', 'ol', 'li', 'a', 'h3', 'h4', 'blockquote', 'span', 'div'],
    allowedAttributes: { a: ['href', 'target', 'rel'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedStyles: {
      '*': {
        'text-decoration': [/^underline$/, /^line-through$/],
        'font-weight': [/^bold$/, /^[5-9]00$/],
        'font-style': [/^italic$/],
      },
    },
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }),
    },
  }).trim();
  // Si al quitar las etiquetas no queda texto (ni listas ni enlaces), es vacío.
  const plain = clean.replace(/<[^>]*>/g, '').trim();
  if (!plain && !/<(li|a|img)\b/i.test(clean)) return null;
  return clean;
}

const POST_TYPES = {
  prompt: 'Prompt',
  idea: 'Idea',
  recurso: 'Recurso',
  pregunta: 'Pregunta',
};

// ---- Subida de archivos ----
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).slice(0, 12).replace(/[^.\w]/g, '');
    cb(null, crypto.randomBytes(16).toString('hex') + ext);
  },
});
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });

// ---- App ----
const app = express();
app.set('trust proxy', 1); // detrás del proxy inverso del Synology
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');

app.use(express.urlencoded({ extended: true }));
app.use('/public', express.static(path.join(__dirname, 'public')));

app.use(
  session({
    store: new SqliteStore(),
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: { httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000 },
  })
);

// Variables disponibles en todas las plantillas.
app.use((req, res, next) => {
  // Refresca el usuario de la sesión desde la base de datos: si un admin lo
  // eliminó, se cierra su sesión; si le cambió el rol, se aplica al momento.
  if (req.session.user) {
    const fresh = q.userById.get(req.session.user.id);
    if (!fresh) {
      return req.session.destroy(() => res.redirect('/login'));
    }
    req.session.user = { id: fresh.id, name: fresh.name, email: fresh.email, role: fresh.role };
  }
  res.locals.siteName = getSetting('site_name');
  res.locals.currentUser = req.session.user || null;
  res.locals.flash = req.session.flash || null;
  res.locals.active = '';
  res.locals.postTypes = POST_TYPES;
  res.locals.fmtDate = fmtDate;
  res.locals.sessionLabel = sessionLabel;
  res.locals.numSessions = currentNumSessions();
  res.locals.materialKinds = MATERIAL_KINDS;
  res.locals.activityParts = ACTIVITY_PARTS;
  delete req.session.flash;
  next();
});

function flash(req, type, message) {
  req.session.flash = { type, message };
}

function requireAuth(req, res, next) {
  if (!req.session.user) {
    flash(req, 'error', 'Entra con tu cuenta para acceder al espacio del curso.');
    return res.redirect('/login');
  }
  next();
}

// Solo la organización del curso (administrador) puede publicar materiales.
function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    flash(req, 'error', 'Solo la organización del curso puede añadir materiales.');
    return res.redirect('/materiales');
  }
  next();
}

function fmtDate(s) {
  if (!s) return '';
  // Las fechas se guardan en UTC (datetime('now')); las mostramos en español.
  const d = new Date(s.replace(' ', 'T') + 'Z');
  return d.toLocaleDateString('es-ES', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// Los archivos subidos solo se sirven a usuarios identificados. Además, las
// presentaciones (PPTX/PPT/ODP/KEY) nunca se sirven directamente: solo se
// consultan como diapositivas dentro de la web, no se pueden descargar.
app.use('/uploads', requireAuth, (req, res, next) => {
  if (/\.(pptx?|odp|key)$/i.test(req.path)) {
    return res.status(403).send('Este material solo puede consultarse dentro de la web.');
  }
  next();
});
app.use('/uploads', requireAuth, express.static(UPLOAD_DIR));

// ---- Autenticación ----
app.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('login', { title: 'Entrar', layout: 'layout-auth' });
});

app.post('/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const user = q.userByEmail.get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    flash(req, 'error', 'Email o contraseña incorrectos.');
    return res.redirect('/login');
  }
  req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
  res.redirect('/');
});

app.get('/register', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('register', { title: 'Crear cuenta', layout: 'layout-auth' });
});

app.post('/register', (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const invite = String(req.body.invite || '').trim();

  // El registro se puede cerrar desde el panel de administración. Aun cerrado,
  // se permite si todavía no hay ningún usuario (para crear el primer admin).
  const registrationOpen = getSetting('registration_open') === '1';
  if (!registrationOpen && q.countUsers.get().n > 0) {
    flash(req, 'error', 'El registro está cerrado. Pide acceso a la organización del curso.');
    return res.redirect('/login');
  }
  if (invite !== getSetting('invite_code')) {
    flash(req, 'error', 'El código de invitación no es correcto.');
    return res.redirect('/register');
  }
  if (name.length < 2 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || password.length < 6) {
    flash(req, 'error', 'Revisa los datos: nombre, un email válido y una contraseña de al menos 6 caracteres.');
    return res.redirect('/register');
  }
  if (q.userByEmail.get(email)) {
    flash(req, 'error', 'Ya existe una cuenta con ese email. Prueba a entrar.');
    return res.redirect('/login');
  }

  const hash = bcrypt.hashSync(password, 10);
  // El primer usuario, o quien coincida con ADMIN_EMAIL, es administrador.
  const isFirst = q.countUsers.get().n === 0;
  const role = isFirst || email === ADMIN_EMAIL ? 'admin' : 'member';
  const info = q.insertUser.run(name, email, hash, role);

  req.session.user = { id: Number(info.lastInsertRowid), name, email, role };
  flash(req, 'success', `¡Bienvenido/a, ${name}! Ya formas parte del espacio del curso.`);
  res.redirect('/');
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// ---- Panel de inicio ----
app.get('/', requireAuth, (req, res) => {
  const materials = q.listMaterials.all().slice(0, 5);
  const posts = q.listPosts.all().slice(0, 5);
  res.render('dashboard', {
    title: 'Inicio',
    active: 'inicio',
    stats: {
      materials: q.countMaterials.get().n,
      posts: q.countPosts.get().n,
      users: q.countUsers.get().n,
    },
    materials,
    posts,
  });
});

// ---- Materiales del curso ----
app.get('/materiales', requireAuth, (req, res) => {
  const all = q.listMaterials.all();
  // Agrupa por sesión: primero Sesión 1..N, y al final "General" si hay.
  const groups = [];
  for (let s = 1; s <= currentNumSessions(); s++) {
    const items = all.filter((m) => Number(m.session) === s);
    if (items.length) groups.push({ session: s, label: sessionLabel(s), items });
  }
  const general = all.filter((m) => Number(m.session) === 0);
  if (general.length) groups.push({ session: 0, label: 'General', items: general });

  res.render('materiales', {
    title: 'Materiales del curso',
    active: 'materiales',
    groups,
    total: all.length,
  });
});

app.post('/materiales', requireAuth, requireAdmin, upload.single('file'), (req, res) => {
  const title = String(req.body.title || '').trim();
  const description = String(req.body.description || '').trim();
  const kind = MATERIAL_KINDS[req.body.kind] ? req.body.kind : 'curso';
  let session = parseInt(req.body.session, 10);
  if (!Number.isInteger(session) || session < 0 || session > currentNumSessions()) session = 0;
  let url = String(req.body.url || '').trim();
  if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;

  const file = req.file || null;

  if (!title) {
    if (file) fs.rmSync(file.path, { force: true });
    flash(req, 'error', 'El material necesita al menos un título.');
    return res.redirect('/materiales');
  }

  // Determina qué tipo de contenido es, para saber cómo mostrarlo.
  let filePath = null, fileKind = null, slideCount = 0, embedUrl = null;
  if (file) {
    try {
      ({ filePath, fileKind, slideCount } = processUpload(file));
    } catch (err) {
      console.error('Error al procesar el archivo:', err.message);
      fs.rmSync(file.path, { force: true });
      fs.rmSync(path.join(UPLOAD_DIR, path.basename(file.filename, path.extname(file.filename))), { recursive: true, force: true });
      flash(req, 'error', 'No se pudo preparar la presentación para verla en la web. Inténtalo de nuevo o súbela como PDF.');
      return res.redirect('/materiales');
    }
  } else if (url) {
    // Sin archivo: si el enlace es de Google (Slides/Docs/Drive), se podrá ver
    // incrustado en modo lector dentro de la web.
    embedUrl = googleEmbed(url);
    if (embedUrl) fileKind = 'embed';
  }

  q.insertMaterial.run(
    req.session.user.id,
    session,
    kind,
    title,
    description || null,
    url || null,
    embedUrl,
    filePath,
    file ? file.originalname : null,
    fileKind,
    slideCount
  );
  flash(req, 'success', 'Material añadido. ¡Gracias por compartir!');
  res.redirect('/materiales');
});

// Visor: muestra un PDF incrustado, las diapositivas de un PPTX, o un documento
// de Google en modo lector, todo dentro de la web.
const VIEWABLE = new Set(['pdf', 'slides', 'embed']);
app.get('/materiales/:id/ver', requireAuth, (req, res) => {
  const m = q.materialById.get(Number(req.params.id));
  if (!m || !VIEWABLE.has(m.file_kind)) {
    flash(req, 'error', 'Ese material no se puede visualizar.');
    return res.redirect('/materiales');
  }
  const slides = m.file_kind === 'slides' ? listSlides(m.file_path) : [];
  res.render('ver', { title: m.title, active: 'materiales', item: m, slides, backUrl: '/materiales', backLabel: 'Volver a materiales' });
});

app.post('/materiales/:id/delete', requireAuth, (req, res) => {
  const m = q.materialById.get(Number(req.params.id));
  if (m && (m.user_id === req.session.user.id || req.session.user.role === 'admin')) {
    removeMaterialFiles(m);
    q.deleteMaterial.run(m.id);
    flash(req, 'success', 'Material eliminado.');
  } else {
    flash(req, 'error', 'No puedes eliminar ese material.');
  }
  res.redirect('/materiales');
});

// ---- Muro: prompts, ideas y recursos de los participantes ----
app.get('/muro', requireAuth, (req, res) => {
  const filter = POST_TYPES[req.query.tipo] ? req.query.tipo : null;
  let posts = q.listPosts.all();
  if (filter) posts = posts.filter((p) => p.type === filter);

  // Agrupa los comentarios por publicación y los cuelga de cada post.
  const byPost = new Map();
  for (const c of q.listComments.all()) {
    if (!byPost.has(c.post_id)) byPost.set(c.post_id, []);
    byPost.get(c.post_id).push(c);
  }
  posts = posts.map((p) => ({ ...p, comments: byPost.get(p.id) || [] }));

  res.render('muro', {
    title: 'Muro compartido',
    active: 'muro',
    posts,
    filter,
  });
});

app.post('/muro', requireAuth, (req, res) => {
  const type = POST_TYPES[req.body.type] ? req.body.type : 'idea';
  const title = String(req.body.title || '').trim();
  const body = String(req.body.body || '').trim();
  if (!body) {
    flash(req, 'error', 'Escribe algo antes de publicar.');
    return res.redirect('/muro');
  }
  q.insertPost.run(req.session.user.id, type, title || null, body);
  flash(req, 'success', 'Publicado en el muro.');
  res.redirect('/muro');
});

app.post('/muro/:id/delete', requireAuth, (req, res) => {
  const p = q.postById.get(Number(req.params.id));
  if (p && (p.user_id === req.session.user.id || req.session.user.role === 'admin')) {
    q.deletePost.run(p.id);
    flash(req, 'success', 'Publicación eliminada.');
  } else {
    flash(req, 'error', 'No puedes eliminar esa publicación.');
  }
  res.redirect('/muro');
});

app.post('/muro/:id/comment', requireAuth, (req, res) => {
  const p = q.postById.get(Number(req.params.id));
  const body = String(req.body.body || '').trim();
  if (p && body) {
    q.insertComment.run(p.id, req.session.user.id, body);
  } else if (!body) {
    flash(req, 'error', 'Escribe un comentario antes de enviarlo.');
  }
  res.redirect('/muro#post-' + req.params.id);
});

app.post('/muro/comment/:cid/delete', requireAuth, (req, res) => {
  const c = q.commentById.get(Number(req.params.cid));
  if (c && (c.user_id === req.session.user.id || req.session.user.role === 'admin')) {
    q.deleteComment.run(c.id);
  } else {
    flash(req, 'error', 'No puedes eliminar ese comentario.');
  }
  res.redirect('/muro#post-' + (c ? c.post_id : ''));
});

// ---- Participantes ----
app.get('/participantes', requireAuth, (req, res) => {
  res.render('participantes', {
    title: 'Participantes',
    active: 'participantes',
    users: q.listUsers.all(),
  });
});

app.post('/perfil', requireAuth, (req, res) => {
  const bio = String(req.body.bio || '').trim().slice(0, 500);
  q.updateBio.run(bio || null, req.session.user.id);
  flash(req, 'success', 'Tu presentación se ha guardado.');
  res.redirect('/participantes');
});

// ---- Actividad rediseñada (la construyen los participantes) ----
function buildActivity(userId) {
  const sub = q.getSubmission.get(userId) || null;
  const texts = {};
  for (const r of q.textsByUser.all(userId)) texts[r.part] = r.body;
  const filesByPart = {};
  for (const f of q.filesByUser.all(userId)) (filesByPart[f.part] ||= []).push(f);
  return { sub, texts, filesByPart };
}

app.get('/actividad', requireAuth, (req, res) => {
  res.render('actividad', {
    title: 'Actividad rediseñada',
    active: 'actividad',
    participants: q.listUsersWithActivity.all(),
  });
});

app.get('/actividad/mia', requireAuth, (req, res) => {
  const data = buildActivity(req.session.user.id);
  res.render('actividad-mia', { title: 'Mi actividad', active: 'actividad', ...data });
});

app.get('/actividad/u/:id', requireAuth, (req, res) => {
  const user = q.userById.get(Number(req.params.id));
  if (!user) {
    flash(req, 'error', 'Participante no encontrado.');
    return res.redirect('/actividad');
  }
  const data = buildActivity(user.id);
  res.render('actividad-ver', { title: `Actividad de ${user.name}`, active: 'actividad', participant: user, ...data });
});

app.post('/actividad/titulo', requireAuth, (req, res) => {
  const t = String(req.body.task_title || '').trim().slice(0, 200);
  q.upsertSubmission.run(req.session.user.id, t || null);
  flash(req, 'success', 'Título guardado.');
  res.redirect('/actividad/mia');
});

app.post('/actividad/texto', requireAuth, (req, res) => {
  const part = req.body.part;
  if (!ACTIVITY_PART_KEYS.includes(part)) return res.redirect('/actividad/mia');
  const body = cleanHtml(req.body.body);
  q.upsertText.run(req.session.user.id, part, body);
  q.touchSubmission.run(req.session.user.id);
  flash(req, 'success', 'Apartado guardado.');
  res.redirect('/actividad/mia#' + part);
});

app.post('/actividad/archivo', requireAuth, upload.single('file'), (req, res) => {
  const part = req.body.part;
  if (!ACTIVITY_PART_KEYS.includes(part)) {
    if (req.file) fs.rmSync(req.file.path, { force: true });
    return res.redirect('/actividad/mia');
  }
  const titleF = String(req.body.title || '').trim();
  let url = String(req.body.url || '').trim();
  if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
  const file = req.file || null;

  if (!file && !url) {
    flash(req, 'error', 'Añade un archivo o un enlace.');
    return res.redirect('/actividad/mia#' + part);
  }

  let filePath = null, fileKind = null, slideCount = 0, embedUrl = null;
  if (file) {
    try {
      ({ filePath, fileKind, slideCount } = processUpload(file));
    } catch (err) {
      console.error('Error al procesar el archivo:', err.message);
      fs.rmSync(file.path, { force: true });
      fs.rmSync(path.join(UPLOAD_DIR, path.basename(file.filename, path.extname(file.filename))), { recursive: true, force: true });
      flash(req, 'error', 'No se pudo preparar la presentación. Súbela como PDF.');
      return res.redirect('/actividad/mia#' + part);
    }
  } else if (url) {
    embedUrl = googleEmbed(url);
    if (embedUrl) fileKind = 'embed';
  }

  q.insertActivityFile.run(
    req.session.user.id, part, titleF || null, url || null, embedUrl,
    filePath, file ? file.originalname : null, fileKind, slideCount
  );
  q.touchSubmission.run(req.session.user.id);
  flash(req, 'success', 'Adjunto añadido.');
  res.redirect('/actividad/mia#' + part);
});

app.post('/actividad/archivo/:id/delete', requireAuth, (req, res) => {
  const f = q.activityFileById.get(Number(req.params.id));
  if (f && (f.user_id === req.session.user.id || req.session.user.role === 'admin')) {
    removeMaterialFiles(f);
    q.deleteActivityFile.run(f.id);
    flash(req, 'success', 'Adjunto eliminado.');
  } else {
    flash(req, 'error', 'No puedes eliminar ese adjunto.');
  }
  res.redirect('/actividad/mia');
});

app.get('/actividad/archivo/:id/ver', requireAuth, (req, res) => {
  const f = q.activityFileById.get(Number(req.params.id));
  if (!f || !VIEWABLE.has(f.file_kind)) {
    flash(req, 'error', 'Ese adjunto no se puede visualizar.');
    return res.redirect('/actividad');
  }
  const slides = f.file_kind === 'slides' ? listSlides(f.file_path) : [];
  res.render('ver', {
    title: f.title || 'Adjunto', active: 'actividad', item: f, slides,
    backUrl: '/actividad/u/' + f.user_id, backLabel: 'Volver a la actividad',
  });
});

// ---- Panel de administración (solo admin) ----

// Tamaño total de los archivos subidos (para mostrar el espacio usado).
function dirSize(dir) {
  let total = 0;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      total += entry.isDirectory() ? dirSize(p) : fs.statSync(p).size;
    }
  } catch (_) { /* carpeta vacía o inexistente */ }
  return total;
}
function humanSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  const units = ['KB', 'MB', 'GB'];
  let n = bytes, i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < units.length - 1);
  return n.toFixed(1) + ' ' + units[i];
}

app.get('/admin', requireAuth, requireAdmin, (req, res) => {
  res.render('admin', {
    title: 'Administración',
    active: 'admin',
    stats: {
      users: q.countUsers.get().n,
      materials: q.countMaterials.get().n,
      posts: q.countPosts.get().n,
      comments: q.countComments.get().n,
      submissions: q.countSubmissions.get().n,
      storage: humanSize(dirSize(UPLOAD_DIR)),
    },
    users: q.listUsersAdmin.all(),
    materials: q.listMaterials.all(),
    posts: q.listPosts.all(),
    comments: q.listComments.all(),
    settings: {
      invite_code: getSetting('invite_code'),
      registration_open: getSetting('registration_open') === '1',
      site_name: getSetting('site_name'),
      num_sessions: currentNumSessions(),
    },
  });
});

app.post('/admin/settings', requireAuth, requireAdmin, (req, res) => {
  const invite = String(req.body.invite_code || '').trim();
  const siteName = String(req.body.site_name || '').trim();
  let numSessions = parseInt(req.body.num_sessions, 10);
  if (!Number.isInteger(numSessions) || numSessions < 1 || numSessions > 20) numSessions = currentNumSessions();
  if (invite.length >= 3) q.setSetting.run('invite_code', invite);
  if (siteName.length >= 2) q.setSetting.run('site_name', siteName);
  q.setSetting.run('num_sessions', String(numSessions));
  q.setSetting.run('registration_open', req.body.registration_open ? '1' : '0');
  flash(req, 'success', 'Ajustes guardados.');
  res.redirect('/admin#ajustes');
});

app.post('/admin/users/:id/role', requireAuth, requireAdmin, (req, res) => {
  const u = q.userById.get(Number(req.params.id));
  if (!u) { flash(req, 'error', 'Usuario no encontrado.'); return res.redirect('/admin#usuarios'); }
  if (u.id === req.session.user.id) {
    flash(req, 'error', 'No puedes cambiar tu propio rol, para no quedarte fuera.');
    return res.redirect('/admin#usuarios');
  }
  const newRole = u.role === 'admin' ? 'member' : 'admin';
  if (newRole === 'member' && q.countAdmins.get().n <= 1) {
    flash(req, 'error', 'Debe quedar al menos un administrador.');
    return res.redirect('/admin#usuarios');
  }
  q.updateUserRole.run(newRole, u.id);
  flash(req, 'success', `${u.name} ahora es ${newRole === 'admin' ? 'administrador' : 'participante'}.`);
  res.redirect('/admin#usuarios');
});

app.post('/admin/users/:id/password', requireAuth, requireAdmin, (req, res) => {
  const u = q.userById.get(Number(req.params.id));
  const pass = String(req.body.password || '');
  if (!u) { flash(req, 'error', 'Usuario no encontrado.'); return res.redirect('/admin#usuarios'); }
  if (pass.length < 6) {
    flash(req, 'error', 'La nueva contraseña debe tener al menos 6 caracteres.');
    return res.redirect('/admin#usuarios');
  }
  q.updateUserPassword.run(bcrypt.hashSync(pass, 10), u.id);
  flash(req, 'success', `Contraseña de ${u.name} actualizada.`);
  res.redirect('/admin#usuarios');
});

app.post('/admin/users/:id/delete', requireAuth, requireAdmin, (req, res) => {
  const u = q.userById.get(Number(req.params.id));
  if (!u) { flash(req, 'error', 'Usuario no encontrado.'); return res.redirect('/admin#usuarios'); }
  if (u.id === req.session.user.id) {
    flash(req, 'error', 'No puedes eliminar tu propia cuenta.');
    return res.redirect('/admin#usuarios');
  }
  if (u.role === 'admin' && q.countAdmins.get().n <= 1) {
    flash(req, 'error', 'Debe quedar al menos un administrador.');
    return res.redirect('/admin#usuarios');
  }
  // Borra del disco los archivos del usuario (la cascada de la base de datos
  // elimina sus filas, pero no los ficheros subidos).
  for (const m of q.materialsByUser.all(u.id)) removeMaterialFiles(m);
  for (const f of q.activityFilesByUserRaw.all(u.id)) removeMaterialFiles(f);
  q.deleteUser.run(u.id);
  flash(req, 'success', `Se ha eliminado a ${u.name} y todo su contenido.`);
  res.redirect('/admin#usuarios');
});

app.post('/admin/materiales/:id/delete', requireAuth, requireAdmin, (req, res) => {
  const m = q.materialById.get(Number(req.params.id));
  if (m) { removeMaterialFiles(m); q.deleteMaterial.run(m.id); flash(req, 'success', 'Material eliminado.'); }
  res.redirect('/admin#contenido');
});

app.post('/admin/muro/:id/delete', requireAuth, requireAdmin, (req, res) => {
  const p = q.postById.get(Number(req.params.id));
  if (p) { q.deletePost.run(p.id); flash(req, 'success', 'Aportación eliminada.'); }
  res.redirect('/admin#contenido');
});

app.post('/admin/comentario/:id/delete', requireAuth, requireAdmin, (req, res) => {
  const c = q.commentById.get(Number(req.params.id));
  if (c) { q.deleteComment.run(c.id); flash(req, 'success', 'Comentario eliminado.'); }
  res.redirect('/admin#contenido');
});

// Errores de subida (p. ej. archivo demasiado grande).
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    flash(req, 'error', 'No se pudo subir el archivo (¿supera los 25 MB?).');
    return res.redirect('back');
  }
  console.error(err);
  res.status(500).send('Error del servidor');
});

app.listen(PORT, () => {
  console.log(`\n  ${SITE_NAME}  →  http://localhost:${PORT}`);
  console.log(`  Código de invitación actual: "${INVITE_CODE}"`);
  if (!ADMIN_EMAIL) {
    console.log('  (Aviso: el primer usuario que se registre será el administrador.)\n');
  } else {
    console.log(`  Administrador: ${ADMIN_EMAIL}\n`);
  }
});
