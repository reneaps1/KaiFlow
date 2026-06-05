/* ═══════════════════════════════════════════════
   KaiFlow · app.js
   SPA Engine — Fase 1: shell + router + stubs
   ═══════════════════════════════════════════════ */

'use strict';

// ── State ─────────────────────────────────────
let state = null;

// Redistribution sandbox (Yamazumi interactive mode)
let _redistribActive = false;
let _redistribAssignments = null;

// Catalog editor draft (discarded when leaving Catálogo)
let _catalogDraft = null;
let _catalogDraftKey = null;
let _catalogCreatedInitial = false;
let _catalogOpenStationIds = new Set();
let _activeUser = null;

// Stopwatch runtime state (not persisted)
let _sw = { active: false, startMs: 0, elapsedMs: 0, lastLapMs: 0, mode: 'reset', studyId: null, stepId: null, rafId: null };

// Records tab filter state (not persisted)
let _tsFilter = { search: '', status: 'all', sort: 'newest' };

const DASHBOARD_LINES_BY_AREA = {
  Interior: [
    'SUB ENSAMBLE 1',
    'SUB ENSAMBLE 2',
    'SUB ENSAMBLE 3',
    'SUB ENSAMBLE 4',
    'CADENA PILOTOS 1',
    'CADENA PILOTOS 2',
    'CADENA INTERIOR 1',
    'CADENA INTERIOR 2'
  ],
  Motor: [
    'SUB GTI',
    'SGM',
    'EMBF',
    'KSMR',
    'CADENA MOTOR 1',
    'CADENA MOTOR 2'
  ],
  Tyron: [
    'PUERTA 1',
    'PUERTA 2'
  ]
};

const DASHBOARD_DEFAULT_AREA = 'Interior';
const DASHBOARD_DEFAULT_LINE = 'SUB ENSAMBLE 1';
const DASHBOARD_SHIFT_CONFIG = {
  'Turno 1': { hours: 8, seconds: 28800 },
  'Turno 2': { hours: 9, seconds: 32400 },
  'Turno 3': { hours: 7, seconds: 25200 }
};
const DASHBOARD_DEFAULT_SHIFT = 'Turno 1';
const DASHBOARD_DEFAULT_EFFICIENCY = 99;
const DASHBOARD_DEFAULT_GRAPH_BY = 'station';
const DASHBOARD_CONFIG_STORAGE_KEY = 'dashboardConfigByLine';
const CATALOG_DATA_STORAGE_KEY = 'catalogDataByLine';
const CATALOG_PLANT_NAME = 'Fujikura Puebla';
const ACTIVE_USER_STORAGE_KEY = 'kaiflowActiveUser';
const CHANGE_DATABASE_STORAGE_KEY = 'changeDatabaseLog';
const LOCAL_AUTH_USERS = [
  { username: 'admin', password: '1234', displayName: 'Administrador' },
  { username: 'supervisor', password: '1234', displayName: 'Supervisor' },
  { username: 'ingeniero', password: '1234', displayName: 'Ingeniero' }
];

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    state = raw ? JSON.parse(raw) : deepClone(DEFAULT_STATE);
  } catch {
    state = deepClone(DEFAULT_STATE);
  }
  _activeUser = readActiveUser();
  const catalogMigrated = normalizeManufacturingCatalog();
  normalizeTimeStudies();
  ensureTimeStudyStructure();
  const hashPage = window.location.hash.replace('#', '');
  if (PAGE_LABELS[hashPage]) state.currentPage = hashPage;
  // Ensure stationAssignments are populated
  if (catalogMigrated || !state.stationAssignments || state.stationAssignments.length === 0) {
    state.stationAssignments = autoBalanceOperations(state);
  }
  ensureDashboardState();
  if (catalogMigrated) saveState();
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    showToast('No se pudo guardar el estado en localStorage', 'warning');
  }
}

function readActiveUser() {
  try {
    const raw = localStorage.getItem(ACTIVE_USER_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.username || !parsed.displayName) return null;
    const localUser = LOCAL_AUTH_USERS.find(user => user.username === String(parsed.username));
    if (!localUser) return null;
    return {
      username: localUser.username,
      displayName: localUser.displayName
    };
  } catch {
    return null;
  }
}

function getActiveUser() {
  if (_activeUser) return _activeUser;
  _activeUser = readActiveUser();
  return _activeUser;
}

function setActiveUser(user) {
  _activeUser = {
    username: user.username,
    displayName: user.displayName
  };
  localStorage.setItem(ACTIVE_USER_STORAGE_KEY, JSON.stringify(_activeUser));
}

function clearActiveUser() {
  _activeUser = null;
  localStorage.removeItem(ACTIVE_USER_STORAGE_KEY);
}

function findLocalUser(username, password) {
  const normalizedUsername = String(username || '').trim().toLowerCase();
  const normalizedPassword = String(password || '');
  return LOCAL_AUTH_USERS.find(user =>
    user.username === normalizedUsername &&
    user.password === normalizedPassword
  ) || null;
}

function renderAuthWidget() {
  const container = document.getElementById('auth-widget');
  if (!container) return;
  const user = getActiveUser();

  if (user) {
    container.innerHTML = `
      <div class="auth-session">
        <span class="auth-user-label">Usuario: <strong>${esc(user.displayName)}</strong></span>
        <button class="btn btn--ghost btn--sm" id="auth-logout" type="button">Cerrar sesión</button>
      </div>
    `;
    container.querySelector('#auth-logout')?.addEventListener('click', () => {
      clearActiveUser();
      renderAuthWidget();
      showToast('Sesión cerrada', 'success');
    });
    return;
  }

  container.innerHTML = `
    <button class="btn btn--secondary btn--sm" id="auth-open-login" type="button">Iniciar sesión</button>
  `;
  container.querySelector('#auth-open-login')?.addEventListener('click', () => openLoginModal());
}

function openLoginModal(message = '') {
  openModal('Iniciar sesión', `
    <form class="login-form" id="login-form">
      <div class="form-group">
        <label class="form-label" for="login-username">Usuario</label>
        <input class="form-input w-full" id="login-username" type="text" autocomplete="username" />
      </div>
      <div class="form-group">
        <label class="form-label" for="login-password">Contraseña</label>
        <input class="form-input w-full" id="login-password" type="password" autocomplete="current-password" />
      </div>
      <div class="login-error ${message ? '' : 'hidden'}" id="login-error">${esc(message)}</div>
      <div class="modal-actions">
        <button class="btn btn--ghost" id="login-cancel" type="button">Cancelar</button>
        <button class="btn btn--primary" type="submit">Iniciar sesión</button>
      </div>
    </form>
  `);

  const form = document.getElementById('login-form');
  const usernameEl = document.getElementById('login-username');
  const passwordEl = document.getElementById('login-password');
  const errorEl = document.getElementById('login-error');

  document.getElementById('login-cancel')?.addEventListener('click', closeModal);
  usernameEl?.focus();

  form?.addEventListener('submit', event => {
    event.preventDefault();
    const user = findLocalUser(usernameEl.value, passwordEl.value);
    if (!user) {
      errorEl.textContent = 'Usuario o contraseña incorrectos.';
      errorEl.classList.remove('hidden');
      passwordEl.value = '';
      passwordEl.focus();
      return;
    }

    setActiveUser(user);
    closeModal();
    renderAuthWidget();
    showToast(`Sesión iniciada: ${user.displayName}`, 'success');
  });
}

function resetState() {
  showConfirm(
    'Restaurar datos demo',
    '¿Deseas restaurar todos los datos al estado original? Los cambios de esta sesión se perderán.',
    () => {
      localStorage.removeItem(STORAGE_KEY);
      writeCatalogStore({});
      writeChangeDatabaseLog([]);
      state = deepClone(DEFAULT_STATE);
      state.stationAssignments = autoBalanceOperations(state);
      ensureDashboardState();
      saveState();
      renderApp();
      showToast('Sistema limpiado. Listo para iniciar captura.', 'success');
    }
  );
}

// ── Utils ──────────────────────────────────────
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function generateId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function fmt(n, decimals = 1) {
  return Number(n).toFixed(decimals);
}

function fmtPct(n) {
  return fmt(n, 1) + '%';
}

function fmtMs(ms) {
  const cs = Math.floor(Math.max(0, ms) / 10);
  const cc = cs % 100;
  const ss = Math.floor(cs / 100) % 60;
  const mm = Math.floor(cs / 6000);
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(cc).padStart(2, '0')}`;
}

function normalizeManufacturingCatalog() {
  const mustReplaceCatalog =
    state.catalogVersion !== CATALOG_VERSION ||
    !Array.isArray(state.operations) ||
    state.operations.length !== MANUFACTURING_ACTIVITY_CATALOG.length ||
    state.operations.some(op => !String(op.id || '').startsWith('ACT-'));

  if (!mustReplaceCatalog) {
    state.activityCatalog = deepClone(MANUFACTURING_ACTIVITY_CATALOG);
    return false;
  }

  const preserved = {
    currentPage: state.currentPage || DEFAULT_STATE.currentPage,
    plant: state.plant || DEFAULT_STATE.plant,
    area: state.area || DEFAULT_STATE.area,
    line: state.line || DEFAULT_STATE.line,
    process: state.process || DEFAULT_STATE.process,
    balanceSettings: state.balanceSettings || DEFAULT_STATE.balanceSettings,
    roles: state.roles || DEFAULT_STATE.roles
  };

  state = {
    ...deepClone(DEFAULT_STATE),
    ...deepClone(preserved),
    catalogVersion: CATALOG_VERSION,
    activityCatalog: deepClone(MANUFACTURING_ACTIVITY_CATALOG),
    operations: buildDefaultOperations(),
    standardTimes: buildDefaultStandardTimes(),
    scenarios: deepClone(DEFAULT_STATE.scenarios),
    timeStudyStructure: buildTimeStudyStructure(),
    timeStudySelection: deepClone(DEFAULT_STATE.timeStudySelection),
    stationAssignments: []
  };

  return true;
}

function collectTimeStudyFrequencySeed(structure) {
  const seed = {};
  (structure || []).forEach(station => {
    (station.subconjuntos || station.subsets || []).forEach(subset => {
      const subsetSeed = {};
      (subset.actividades || subset.activities || []).forEach(activity => {
        const key = activity.activityId || activity.id || activity.no;
        subsetSeed[key] = Number(activity.frequency ?? activity.frecuencia ?? 0);
      });
      if (subset.id) seed[subset.id] = subsetSeed;
      if (subset.name || subset.nombre) seed[subset.name || subset.nombre] = subsetSeed;
    });
  });
  return seed;
}

function normalizeTimeStudies() {
  if (!Array.isArray(state.timeStudies)) { state.timeStudies = []; return; }
  const now = new Date().toISOString();
  state.timeStudies = state.timeStudies.map(s => {
    const normalStatus = s.status === 'borrador' ? 'draft' : (s.status || 'draft');
    return {
      id: s.id || generateId('TST'),
      name: s.name || 'Sin nombre',
      status: normalStatus,
      createdAt: s.createdAt || now,
      updatedAt: s.updatedAt || s.createdAt || now,
      completedAt: s.completedAt || null,
      steps: (s.steps || []).map(step => {
        // Old format had captures:number + times:[]; new format has requiredCaptures:number + captures:[]
        const hadOldCaptures = typeof step.captures === 'number';
        return {
          id: step.id || generateId('STP'),
          name: step.name || '',
          requiredCaptures: step.requiredCaptures != null
            ? step.requiredCaptures
            : (hadOldCaptures ? step.captures : 1),
          captures: Array.isArray(step.captures)
            ? step.captures
            : (Array.isArray(step.times) ? step.times : []),
          averageTime: step.averageTime !== undefined ? step.averageTime : (step.average || null),
          isComplete: step.isComplete || false
        };
      })
    };
  });
}

function ensureTimeStudyStructure() {
  const seed = collectTimeStudyFrequencySeed(state.timeStudyStructure);
  state.timeStudyStructure = buildTimeStudyStructure(seed);
  state.timeStudySelection = state.timeStudySelection || {};

  const firstStation = state.timeStudyStructure[0];
  const selectedStation =
    state.timeStudyStructure.find(st => st.id === state.timeStudySelection.stationId) ||
    firstStation;
  const firstSubset = selectedStation?.subconjuntos?.[0];
  const selectedSubset =
    selectedStation?.subconjuntos?.find(sub => sub.id === state.timeStudySelection.subsetId) ||
    firstSubset;

  state.timeStudySelection.stationId = selectedStation?.id || 'station-1';
  state.timeStudySelection.subsetId = selectedSubset?.id || 'station-1-subset-1';
}

function calculateActivityTC(activity) {
  const std = Number(activity.std ?? activity.standardTime ?? 0);
  const frequency = Number(activity.frequency ?? 0);
  return Math.round(std * frequency * 100) / 100;
}

function calculateSubsetTotal(subset) {
  return (subset?.actividades || []).reduce((sum, activity) => sum + calculateActivityTC(activity), 0);
}

function calculateStationTimeStudyTotal(station) {
  return (station?.subconjuntos || []).reduce((sum, subset) => sum + calculateSubsetTotal(subset), 0);
}

function getSelectedTimeStudyContext() {
  ensureTimeStudyStructure();
  const station = state.timeStudyStructure.find(st => st.id === state.timeStudySelection.stationId) || state.timeStudyStructure[0];
  const subset = station?.subconjuntos.find(sub => sub.id === state.timeStudySelection.subsetId) || station?.subconjuntos[0];
  return { station, subset };
}

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function dashboardLineKey(area, line) {
  return `${area}::${line}`;
}

function catalogLineKey(area, line) {
  return `${area}::${line}`;
}

function readCatalogStore() {
  try {
    const raw = localStorage.getItem(CATALOG_DATA_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeCatalogStore(store) {
  try {
    localStorage.setItem(CATALOG_DATA_STORAGE_KEY, JSON.stringify(store || {}));
  } catch {
    showToast('No se pudo guardar el catálogo en localStorage', 'warning');
  }
}

function getCatalogDashboardContext() {
  ensureDashboardState();
  return {
    planta: CATALOG_PLANT_NAME,
    area: state.dashboardSelection?.area || DASHBOARD_DEFAULT_AREA,
    linea: state.dashboardSelection?.line || DASHBOARD_DEFAULT_LINE
  };
}

function createEmptyCatalog(area, line) {
  return {
    planta: CATALOG_PLANT_NAME,
    area,
    linea: line,
    estaciones: [
      {
        id: 'station-1',
        nombre: 'Estación 1',
        operadores: []
      }
    ]
  };
}

function normalizeCatalogActivity(activity, index) {
  return {
    id: activity.id || generateId('CAT-ACT'),
    no: index + 1,
    actividad: activity.actividad ?? activity.name ?? activity.nombre ?? '',
    tiempo: activity.tiempo ?? activity.time ?? activity.standardTime ?? ''
  };
}

function normalizeCatalogOperator(operator, index) {
  const actividades = Array.isArray(operator.actividades)
    ? operator.actividades
    : Array.isArray(operator.activities)
      ? operator.activities
      : [];

  return {
    id: operator.id || generateId('CAT-OP'),
    nombre: operator.nombre ?? operator.name ?? `OP${index + 1}`,
    subconjunto: operator.subconjunto ?? operator.subset ?? '',
    actividades: actividades.map((activity, activityIndex) => normalizeCatalogActivity(activity, activityIndex))
  };
}

function normalizeCatalogStation(station, index) {
  const operadores = Array.isArray(station.operadores)
    ? station.operadores
    : Array.isArray(station.operators)
      ? station.operators
      : [];

  return {
    id: station.id || generateId('CAT-ST'),
    nombre: station.nombre ?? station.name ?? `Estación ${index + 1}`,
    operadores: operadores.map((operator, operatorIndex) => normalizeCatalogOperator(operator, operatorIndex))
  };
}

function normalizeCatalogForLine(catalog, area, line) {
  const base = catalog && typeof catalog === 'object' ? catalog : {};
  const estaciones = Array.isArray(base.estaciones)
    ? base.estaciones
    : createEmptyCatalog(area, line).estaciones;

  return {
    planta: base.planta || CATALOG_PLANT_NAME,
    area: base.area || area,
    linea: base.linea || base.line || line,
    estaciones: estaciones.map((station, index) => normalizeCatalogStation(station, index))
  };
}

function ensureCatalogForSelectedLine() {
  const { area, linea } = getCatalogDashboardContext();
  const key = catalogLineKey(area, linea);
  const store = readCatalogStore();
  const created = !store[key];

  if (created) {
    store[key] = createEmptyCatalog(area, linea);
    writeCatalogStore(store);
  }

  return {
    catalog: normalizeCatalogForLine(store[key], area, linea),
    created,
    key
  };
}

function getCatalogForSelectedLine() {
  return ensureCatalogForSelectedLine().catalog;
}

function readChangeDatabaseLog() {
  try {
    const raw = localStorage.getItem(CHANGE_DATABASE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeChangeDatabaseLog(records) {
  localStorage.setItem(CHANGE_DATABASE_STORAGE_KEY, JSON.stringify(Array.isArray(records) ? records : []));
}

function clearChangeDatabaseLog() {
  localStorage.removeItem(CHANGE_DATABASE_STORAGE_KEY);
}

function formatLocalDateTime(date = new Date()) {
  const pad = value => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join('-') + ' ' + [
    pad(date.getHours()),
    pad(date.getMinutes())
  ].join(':');
}

function createCatalogChangeRecord(user, catalog) {
  return {
    fechaHora: formatLocalDateTime(),
    usuario: user.displayName,
    area: catalog.area,
    linea: catalog.linea,
    estacion: 'Varias estaciones',
    cambio: 'Se actualizaron estaciones, operadores y actividades del catálogo.'
  };
}

function appendCatalogChangeRecord(user, catalog) {
  const records = readChangeDatabaseLog();
  records.push(createCatalogChangeRecord(user, catalog));
  writeChangeDatabaseLog(records);
}

function getCatalogEditorState() {
  const { area, linea } = getCatalogDashboardContext();
  const key = catalogLineKey(area, linea);

  if (_catalogDraft && _catalogDraftKey === key) {
    return { catalog: _catalogDraft, created: _catalogCreatedInitial, key };
  }

  const { catalog, created } = ensureCatalogForSelectedLine();
  _catalogDraft = deepClone(catalog);
  _catalogDraftKey = key;
  _catalogCreatedInitial = created;
  _catalogOpenStationIds = new Set();
  if (_catalogDraft.estaciones[0]?.id) _catalogOpenStationIds.add(_catalogDraft.estaciones[0].id);

  return { catalog: _catalogDraft, created: _catalogCreatedInitial, key };
}

function resetCatalogEditorDraft() {
  _catalogDraft = null;
  _catalogDraftKey = null;
  _catalogCreatedInitial = false;
  _catalogOpenStationIds = new Set();
}

function catalogSeconds(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function calculateCatalogOperatorTotal(operator) {
  return (operator?.actividades || []).reduce((sum, activity) => sum + catalogSeconds(activity.tiempo), 0);
}

function calculateCatalogStationTotal(station) {
  return (station?.operadores || []).reduce((sum, operator) => sum + calculateCatalogOperatorTotal(operator), 0);
}

function calculateCatalogLineTotal(catalog) {
  return (catalog?.estaciones || []).reduce((sum, station) => sum + calculateCatalogStationTotal(station), 0);
}

function fmtCatalogSeconds(value) {
  return fmt(Math.round(catalogSeconds(value) * 100) / 100, 2);
}

function recalcCatalogActivityNumbers(operator) {
  operator.actividades = (operator.actividades || []).map((activity, index) => ({
    ...activity,
    no: index + 1
  }));
}

function normalizeCatalogDraftForSave(catalog) {
  const normalized = normalizeCatalogForLine(catalog, catalog.area, catalog.linea);
  normalized.estaciones.forEach(station => {
    station.operadores.forEach(operator => {
      operator.actividades = operator.actividades.map((activity, index) => ({
        id: activity.id || generateId('CAT-ACT'),
        no: index + 1,
        actividad: activity.actividad || '',
        tiempo: catalogSeconds(activity.tiempo)
      }));
      operator.subconjunto = operator.subconjunto || '';
    });
  });
  return normalized;
}

function findCatalogStation(stationId) {
  return _catalogDraft?.estaciones?.find(station => station.id === stationId) || null;
}

function findCatalogOperator(stationId, operatorId) {
  const station = findCatalogStation(stationId);
  return station?.operadores?.find(operator => operator.id === operatorId) || null;
}

function findCatalogActivity(stationId, operatorId, activityId) {
  const operator = findCatalogOperator(stationId, operatorId);
  return operator?.actividades?.find(activity => activity.id === activityId) || null;
}

function findCatalogOperatorsWithoutSubset(catalog) {
  const missing = [];
  (catalog?.estaciones || []).forEach(station => {
    (station.operadores || []).forEach(operator => {
      if (!String(operator.subconjunto || '').trim()) {
        missing.push({ station, operator });
      }
    });
  });
  return missing;
}

function getNextCatalogStationName() {
  const used = new Set((_catalogDraft?.estaciones || []).map(station => {
    const match = String(station.nombre || '').match(/^Estación\s+(\d+)$/i);
    return match ? Number(match[1]) : null;
  }).filter(Boolean));

  let next = 1;
  while (used.has(next)) next++;
  return `Estación ${next}`;
}

function getNextCatalogOperatorName(station) {
  const used = new Set((station?.operadores || []).map(operator => {
    const match = String(operator.nombre || '').match(/^OP(\d+)$/i);
    return match ? Number(match[1]) : null;
  }).filter(Boolean));

  let next = 1;
  while (used.has(next)) next++;
  return `OP${next}`;
}

function getDefaultDashboardConfig(area = DASHBOARD_DEFAULT_AREA, line = DASHBOARD_DEFAULT_LINE) {
  return {
    area,
    linea: line,
    turno: DASHBOARD_DEFAULT_SHIFT,
    piezasPorHora: 0,
    eficienciaPorcentaje: DASHBOARD_DEFAULT_EFFICIENCY,
    graficoPor: DASHBOARD_DEFAULT_GRAPH_BY
  };
}

function normalizeDashboardConfig(config, area = DASHBOARD_DEFAULT_AREA, line = DASHBOARD_DEFAULT_LINE) {
  const turno = DASHBOARD_SHIFT_CONFIG[config?.turno] ? config.turno : DASHBOARD_DEFAULT_SHIFT;
  const piezasPorHora = Math.max(0, Number(
    config?.piezasPorHora ??
    config?.piecesPerHour ??
    config?.piezasRequeridas ??
    config?.requiredPieces ??
    0
  ) || 0);
  const eficienciaPorcentaje = Math.max(0, Number(
    config?.eficienciaPorcentaje ??
    config?.efficiencyPercent ??
    DASHBOARD_DEFAULT_EFFICIENCY
  ) || 0);
  const graficoPor = ['station', 'operator', 'subconjunto'].includes(config?.graficoPor || config?.graphBy)
    ? (config?.graficoPor || config?.graphBy)
    : DASHBOARD_DEFAULT_GRAPH_BY;

  return {
    area,
    linea: line,
    turno,
    piezasPorHora,
    eficienciaPorcentaje,
    graficoPor
  };
}

function readDashboardConfigStore() {
  try {
    const raw = localStorage.getItem(DASHBOARD_CONFIG_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeDashboardConfigStore(store) {
  localStorage.setItem(DASHBOARD_CONFIG_STORAGE_KEY, JSON.stringify(store));
}

function ensureDashboardState() {
  state.dashboardSelection = state.dashboardSelection || {
    area: DASHBOARD_DEFAULT_AREA,
    line: DASHBOARD_DEFAULT_LINE
  };
  if (!DASHBOARD_LINES_BY_AREA[state.dashboardSelection.area]) {
    state.dashboardSelection.area = DASHBOARD_DEFAULT_AREA;
  }
  const lines = DASHBOARD_LINES_BY_AREA[state.dashboardSelection.area];
  if (!lines.includes(state.dashboardSelection.line)) {
    state.dashboardSelection.line = lines[0];
  }
  const existingStore = readDashboardConfigStore();
  if (Object.keys(existingStore).length === 0 && state.dashboardLineConfigs) {
    const migratedStore = {};
    Object.values(state.dashboardLineConfigs).forEach(config => {
      const line = config.linea || config.line;
      if (!config.area || !line) return;
      const normalized = normalizeDashboardConfig(config, config.area, line);
      migratedStore[dashboardLineKey(normalized.area, normalized.linea)] = {
        area: normalized.area,
        linea: normalized.linea,
        turno: normalized.turno,
        piezasPorHora: normalized.piezasPorHora,
        eficienciaPorcentaje: normalized.eficienciaPorcentaje,
        graficoPor: normalized.graficoPor
      };
    });
    if (Object.keys(migratedStore).length > 0) writeDashboardConfigStore(migratedStore);
  }
}

function getDashboardLineConfig(area, line) {
  ensureDashboardState();
  const store = readDashboardConfigStore();
  const saved = store[dashboardLineKey(area, line)];
  return saved ? normalizeDashboardConfig(saved, area, line) : getDefaultDashboardConfig(area, line);
}

function saveDashboardLineConfig(config) {
  ensureDashboardState();
  const line = config.linea || config.line;
  const normalized = normalizeDashboardConfig(config, config.area, line);
  const store = readDashboardConfigStore();
  store[dashboardLineKey(normalized.area, normalized.linea)] = {
    area: normalized.area,
    linea: normalized.linea,
    turno: normalized.turno,
    piezasPorHora: normalized.piezasPorHora,
    eficienciaPorcentaje: normalized.eficienciaPorcentaje,
    graficoPor: normalized.graficoPor
  };
  writeDashboardConfigStore(store);
}

function getDashboardCatalog(area, line) {
  const store = readCatalogStore();
  const saved = store[catalogLineKey(area, line)];
  return saved ? normalizeCatalogForLine(saved, area, line) : null;
}

function getDashboardStationRows(catalog) {
  return (catalog?.estaciones || []).map((station, index) => ({
    id: station.id || `station-${index + 1}`,
    label: station.nombre || `Estación ${index + 1}`,
    time: calculateCatalogStationTotal(station)
  }));
}

function getDashboardOperatorRows(catalog) {
  const operatorTotals = {};
  (catalog?.estaciones || []).forEach(station => {
    (station.operadores || []).forEach(operator => {
      const label = String(operator.nombre || '').trim() || 'Sin nombre';
      operatorTotals[label] = (operatorTotals[label] || 0) + calculateCatalogOperatorTotal(operator);
    });
  });

  return Object.keys(operatorTotals)
    .sort((a, b) => a.localeCompare(b, 'es'))
    .map(label => ({ label, time: operatorTotals[label] }));
}

function getDashboardSubsetRows(catalog) {
  const subsetTotals = {};
  (catalog?.estaciones || []).forEach(station => {
    (station.operadores || []).forEach(operator => {
      const label = String(operator.subconjunto || '').trim() || 'Sin subconjunto';
      subsetTotals[label] = (subsetTotals[label] || 0) + calculateCatalogOperatorTotal(operator);
    });
  });

  return Object.keys(subsetTotals)
    .sort((a, b) => a.localeCompare(b, 'es'))
    .map(label => ({ label, time: subsetTotals[label] }));
}

function computeDashboardMetrics(config, catalog) {
  const shift = DASHBOARD_SHIFT_CONFIG[config.turno] || DASHBOARD_SHIFT_CONFIG[DASHBOARD_DEFAULT_SHIFT];
  const piezasPorHora = Math.max(0, Number(config.piezasPorHora) || 0);
  const eficienciaPorcentaje = Math.max(0, Number(config.eficienciaPorcentaje) || 0);
  const eficienciaDecimal = eficienciaPorcentaje / 100;
  const availableSeconds = shift.seconds;
  const tiempoCicloTotal = calculateCatalogLineTotal(catalog);
  const stationRows = getDashboardStationRows(catalog);
  const operatorRows = getDashboardOperatorRows(catalog);
  const subsetRows = getDashboardSubsetRows(catalog);
  const bottleneck = stationRows.reduce(
    (max, station) => station.time > max.time ? station : max,
    { label: 'N/A', time: 0 }
  );
  const takt = piezasPorHora > 0 ? 3600 / piezasPorHora : 0;
  const operatorCount = piezasPorHora > 0 && tiempoCicloTotal > 0 && eficienciaDecimal > 0
    ? Math.ceil((piezasPorHora * (tiempoCicloTotal / 3600)) / (shift.hours * eficienciaDecimal))
    : 0;
  const capacity = bottleneck.time > 0 ? Math.floor(availableSeconds / bottleneck.time) : 0;

  return {
    turno: config.turno,
    shiftHours: shift.hours,
    piezasPorHora,
    eficienciaPorcentaje,
    availableSeconds,
    takt,
    tiempoCicloTotal,
    operatorCount,
    bottleneck,
    capacity,
    stationRows,
    operatorRows,
    subsetRows,
    hasCatalog: !!catalog,
    hasTimes: tiempoCicloTotal > 0
  };
}

// ── Calculations ───────────────────────────────
function getActiveOperations(s) {
  return (s || state).operations.filter(op => op.active);
}

function calculateAvailableTime(settings) {
  const { shiftHours, breakMinutes, meetingMinutes } = settings;
  return (shiftHours * 3600) - (breakMinutes * 60) - (meetingMinutes * 60);
}

function calculateTaktTime(settings) {
  const available = calculateAvailableTime(settings);
  return available / settings.requiredQuantity;
}

function calculateTotalWorkContent(ops) {
  return Math.round(ops.reduce((sum, op) => sum + op.standardTime, 0) * 100) / 100;
}

function calculateRequiredOperators(twc, takt) {
  return Math.ceil(twc / takt);
}

function calculateStationLoads(assignments) {
  const loads = {};
  assignments.forEach(a => {
    if (!loads[a.station]) loads[a.station] = 0;
    loads[a.station] += a.standardTime;
  });
  return loads;
}

function detectBottleneck(stationLoads) {
  let max = 0, bottleneck = null;
  Object.entries(stationLoads).forEach(([station, load]) => {
    if (load > max) { max = load; bottleneck = parseInt(station); }
  });
  return { station: bottleneck, load: max };
}

function calculateEfficiency(twc, numStations, takt) {
  if (numStations === 0 || takt === 0) return 0;
  return (twc / (numStations * takt)) * 100;
}

function calculateCapacity(cycleTime) {
  if (cycleTime === 0) return 0;
  return Math.floor(3600 / cycleTime);
}

function autoBalanceOperations(s) {
  const src = s || state;
  const ops = getActiveOperations(src);
  const takt = calculateTaktTime(src.balanceSettings);
  const assignments = [];
  let station = 1;
  let stationLoad = 0;

  ops.forEach(op => {
    if (stationLoad + op.standardTime <= takt || stationLoad === 0) {
      stationLoad += op.standardTime;
    } else {
      station++;
      stationLoad = op.standardTime;
    }
    assignments.push({
      operationId: op.id,
      station,
      standardTime: op.standardTime,
      sequence: op.sequence,
      name: op.name
    });
  });

  return assignments;
}

// ── Computed summary ───────────────────────────
function computeSummary(s) {
  const src = s || state;
  const ops = getActiveOperations(src);
  const takt = calculateTaktTime(src.balanceSettings);
  const twc  = calculateTotalWorkContent(ops);
  const reqOps = calculateRequiredOperators(twc, takt);
  const assignments = src.stationAssignments.length
    ? src.stationAssignments
    : autoBalanceOperations(src);
  const stationLoads = calculateStationLoads(assignments);
  const numStations  = Object.keys(stationLoads).length;
  const bottleneck   = detectBottleneck(stationLoads);
  const efficiency   = calculateEfficiency(twc, numStations, takt);
  const capacity     = calculateCapacity(bottleneck.load);
  const available    = calculateAvailableTime(src.balanceSettings);
  const hasBottleneck = bottleneck.load > takt;

  return {
    takt, twc, reqOps, numStations, stationLoads,
    bottleneck, efficiency, capacity, available,
    hasBottleneck, assignments
  };
}

// ── Router / Navigation ────────────────────────
const PAGE_LABELS = {
  dashboard:     'Dashboard',
  catalogs:      'Captura',
  changeDatabase:'Base de Datos de Cambios',
  standardTimes: 'Tiempos Estándar',
  timeStudy:     'Estudios de Tiempo',
  balance:       'Balanceo',
  yamazumi:      'Yamazumi',
  scenarios:     'Escenarios',
  report:        'Reporte',
  permissions:   'Permisos'
};

function navigate(page) {
  // Discard redistrib sandbox when leaving Yamazumi
  if (page !== 'yamazumi' && _redistribActive) {
    _redistribActive = false;
    _redistribAssignments = null;
  }
  if (page !== 'catalogs') resetCatalogEditorDraft();
  state.currentPage = page;
  // Update nav active state
  document.querySelectorAll('.nav-item[data-page]').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
    if (el.dataset.page === page) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });
  // Update breadcrumb
  const bc = document.getElementById('breadcrumb-page');
  if (bc) bc.textContent = PAGE_LABELS[page] || page;
  // Render content
  renderPage(page);
}

function renderPage(page) {
  const main = document.getElementById('main-content');
  if (!main) return;
  const renderers = {
    dashboard:     renderDashboard,
    catalogs:      renderCatalogs,
    changeDatabase: renderChangeDatabase,
    standardTimes: renderStandardTimes,
    timeStudy:     renderTimeStudy,
    balance:       renderBalance,
    yamazumi:      renderYamazumi,
    scenarios:     renderScenarios,
    report:        renderReport,
    permissions:   renderPermissions
  };
  const fn = renderers[page];
  if (fn) fn(main);
  else main.innerHTML = renderPlaceholder(PAGE_LABELS[page] || page, 'Este módulo está en construcción.');
  main.scrollTop = 0;
}

// ── renderApp ─────────────────────────────────
function renderApp() {
  renderPage(state.currentPage || 'dashboard');
  navigate(state.currentPage || 'dashboard');
}

// ── Placeholder ───────────────────────────────
function renderPlaceholder(title, sub) {
  return `
    <div class="page-header">
      <h1 class="page-title">${title}</h1>
    </div>
    <div class="module-placeholder">
      <svg class="module-placeholder-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="6" y="6" width="36" height="36" rx="4"/>
        <line x1="16" y1="24" x2="32" y2="24"/>
        <line x1="24" y1="16" x2="24" y2="32"/>
      </svg>
      <p class="module-placeholder-title">${title}</p>
      <p class="module-placeholder-sub">${sub}</p>
    </div>`;
}

// ── Dashboard ─────────────────────────────────
function renderDashboardMetricCards(metrics) {
  const taktValue = metrics.takt > 0 ? fmt(metrics.takt, 2) : 'N/A';
  const cycleValue = metrics.tiempoCicloTotal > 0 ? fmt(metrics.tiempoCicloTotal, 2) : '0.00';
  const bottleneckLabel = metrics.bottleneck.time > 0
    ? `${metrics.bottleneck.label} — ${fmt(metrics.bottleneck.time, 2)}s`
    : 'N/A';

  return `
    <div class="kpi-grid dashboard-kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Tiempo disponible</div>
        <div class="kpi-value">${metrics.availableSeconds.toLocaleString('es-MX')}<span class="kpi-unit">seg</span></div>
        <div class="kpi-meta">${esc(metrics.turno)} · ${metrics.shiftHours} h</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Takt Time</div>
        <div class="kpi-value">${taktValue}<span class="kpi-unit">${metrics.takt > 0 ? 'seg' : ''}</span></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Tiempo ciclo total</div>
        <div class="kpi-value">${cycleValue}<span class="kpi-unit">seg</span></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Número de operadores</div>
        <div class="kpi-value">${metrics.operatorCount}</div>
      </div>
      <div class="kpi-card ${metrics.bottleneck.time > metrics.takt && metrics.takt > 0 ? 'kpi-card--danger' : ''}">
        <div class="kpi-label">Cuello de botella</div>
        <div class="kpi-value" style="font-size:var(--font-16);font-weight:700">${bottleneckLabel}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Capacidad máxima</div>
        <div class="kpi-value">${metrics.capacity}<span class="kpi-unit">${metrics.capacity > 0 ? 'pzs' : ''}</span></div>
      </div>
    </div>`;
}

function renderDashboardChart(metrics, rows, graphBy) {
  if (!metrics.hasCatalog || !metrics.hasTimes || rows.length === 0) {
    return `
      <div class="dashboard-chart-empty">
        <strong>No hay tiempos guardados en Catálogo para esta línea.</strong>
        <span>Guarda estaciones, operadores y actividades en Catálogo para alimentar el Dashboard.</span>
      </div>`;
  }

  const chartHeight = 260;
  const maxLoad = Math.max(...rows.map(row => row.time), metrics.takt || 0, 1);
  const maxVal = Math.ceil((maxLoad * 1.2) / 10) * 10 || 10;
  const scale = chartHeight / maxVal;
  const taktBottom = metrics.takt > 0 ? Math.round(metrics.takt * scale) : 0;
  const bottleneckLabel = graphBy === 'station' ? metrics.bottleneck.label : '';

  return `
    <div class="dashboard-chart">
      ${metrics.takt > 0 ? `
        <div class="dashboard-chart-takt" style="bottom:${taktBottom}px">
          <span>Takt ${fmt(metrics.takt, 2)}s</span>
        </div>` : ''}
      <div class="dashboard-chart-bars">
        ${rows.map(row => {
          const height = Math.max(Math.round(row.time * scale), 2);
          const status = metrics.takt > 0 && row.time > metrics.takt
            ? 'over'
            : metrics.takt > 0 && row.time >= metrics.takt * 0.9
              ? 'near'
              : 'ok';
          const isBottleneck = graphBy === 'station' && row.label === bottleneckLabel;
          return `
            <div class="dashboard-chart-bar-col">
              <div class="dashboard-chart-value">${fmt(row.time, 1)}s</div>
              <div class="dashboard-chart-bar dashboard-chart-bar--${status}${isBottleneck ? ' bottleneck' : ''}" style="height:${height}px"></div>
              <div class="dashboard-chart-label" title="${esc(row.label)}">${esc(row.label)}</div>
            </div>`;
        }).join('')}
      </div>
    </div>`;
}

function renderDashboard(container) {
  ensureDashboardState();
  const { area, line } = state.dashboardSelection;
  const config = getDashboardLineConfig(area, line);
  const areaOptions = Object.keys(DASHBOARD_LINES_BY_AREA).map(name =>
    `<option value="${esc(name)}"${name === area ? ' selected' : ''}>${esc(name)}</option>`
  ).join('');
  const lineOptions = DASHBOARD_LINES_BY_AREA[area].map(name =>
    `<option value="${esc(name)}"${name === line ? ' selected' : ''}>${esc(name)}</option>`
  ).join('');
  const shiftOptions = Object.keys(DASHBOARD_SHIFT_CONFIG).map(name =>
    `<option value="${esc(name)}"${name === config.turno ? ' selected' : ''}>${esc(name)}</option>`
  ).join('');

  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Dashboard</h1>
      <p class="page-subtitle">Indicadores calculados desde el Catálogo guardado por línea</p>
    </div>

    <div class="card mb-6">
      <div class="card-header">
        <div>
          <div class="card-title">Filtros de producción</div>
          <div class="card-subtitle">La configuración se guarda de forma independiente por área y línea</div>
        </div>
        <div class="btn-group">
          <button class="btn btn--primary" id="dashboard-save">Actualizar Dashboard</button>
        </div>
      </div>
      <div class="card-body">
        <div class="dashboard-controls">
          <div class="form-group">
            <label class="form-label" for="dashboard-area">Área</label>
            <select class="form-select" id="dashboard-area">${areaOptions}</select>
          </div>
          <div class="form-group">
            <label class="form-label" for="dashboard-line">Línea</label>
            <select class="form-select" id="dashboard-line">${lineOptions}</select>
          </div>
          <div class="form-group">
            <label class="form-label" for="dashboard-shift">Turno</label>
            <select class="form-select" id="dashboard-shift">${shiftOptions}</select>
          </div>
          <div class="form-group">
            <label class="form-label" for="dashboard-pieces-hour">Piezas por hora</label>
            <input class="form-input" id="dashboard-pieces-hour" type="number" min="0" step="0.01" value="${config.piezasPorHora}" />
          </div>
          <div class="form-group">
            <label class="form-label" for="dashboard-efficiency">% eficiencia</label>
            <input class="form-input" id="dashboard-efficiency" type="number" min="0" max="100" step="0.01" value="${config.eficienciaPorcentaje}" />
          </div>
          <div class="form-group">
            <label class="form-label" for="dashboard-graph-by">Ver gráfico por</label>
            <select class="form-select" id="dashboard-graph-by">
              <option value="station"${config.graficoPor === 'station' ? ' selected' : ''}>Estación</option>
              <option value="operator"${config.graficoPor === 'operator' ? ' selected' : ''}>Operador</option>
              <option value="subconjunto"${config.graficoPor === 'subconjunto' ? ' selected' : ''}>Subconjunto</option>
            </select>
          </div>
        </div>
      </div>
    </div>

    <div id="dashboard-metrics"></div>

    <div class="card dashboard-chart-card">
      <div class="card-header">
        <div>
          <div class="card-title" id="dashboard-chart-title">Gráfico de tiempos</div>
          <div class="card-subtitle" id="dashboard-chart-subtitle">Referencia visual contra Takt Time</div>
        </div>
      </div>
      <div class="card-body" id="dashboard-chart-wrap"></div>
    </div>
  `;

  const areaEl = container.querySelector('#dashboard-area');
  const lineEl = container.querySelector('#dashboard-line');
  const shiftEl = container.querySelector('#dashboard-shift');
  const piecesEl = container.querySelector('#dashboard-pieces-hour');
  const efficiencyEl = container.querySelector('#dashboard-efficiency');
  const graphByEl = container.querySelector('#dashboard-graph-by');
  const metricsEl = container.querySelector('#dashboard-metrics');
  const chartEl = container.querySelector('#dashboard-chart-wrap');
  const chartTitleEl = container.querySelector('#dashboard-chart-title');
  const chartSubtitleEl = container.querySelector('#dashboard-chart-subtitle');

  const readDraft = () => ({
    area: areaEl.value,
    line: lineEl.value,
    linea: lineEl.value,
    turno: shiftEl.value,
    piezasPorHora: Math.max(0, parseFloat(piecesEl.value) || 0),
    eficienciaPorcentaje: Math.max(0, parseFloat(efficiencyEl.value) || 0),
    graficoPor: graphByEl.value
  });

  const refreshDashboard = () => {
    const draft = readDraft();
    const catalog = getDashboardCatalog(draft.area, draft.line);
    const metrics = computeDashboardMetrics(draft, catalog);
    const chartRows = draft.graficoPor === 'operator'
      ? metrics.operatorRows
      : draft.graficoPor === 'subconjunto'
        ? metrics.subsetRows
        : metrics.stationRows;

    metricsEl.innerHTML = renderDashboardMetricCards(metrics);
    chartTitleEl.textContent = draft.graficoPor === 'operator'
      ? 'Gráfico de tiempos por operador'
      : draft.graficoPor === 'subconjunto'
        ? 'Gráfico de tiempos por subconjunto'
        : 'Gráfico de tiempos por estación';
    chartSubtitleEl.textContent = draft.graficoPor === 'operator'
      ? 'Suma de tiempos del mismo operador en todas las estaciones'
      : draft.graficoPor === 'subconjunto'
        ? 'Suma de tiempos por producto armado'
        : 'Tiempo total de cada estación del Catálogo';
    chartEl.innerHTML = renderDashboardChart(metrics, chartRows, draft.graficoPor);
  };

  areaEl.addEventListener('change', () => {
    state.dashboardSelection.area = areaEl.value;
    state.dashboardSelection.line = DASHBOARD_LINES_BY_AREA[areaEl.value][0];
    saveState();
    renderDashboard(container);
  });

  lineEl.addEventListener('change', () => {
    state.dashboardSelection.line = lineEl.value;
    saveState();
    renderDashboard(container);
  });

  [shiftEl, graphByEl].forEach(input => input.addEventListener('change', refreshDashboard));
  [piecesEl, efficiencyEl].forEach(input => input.addEventListener('input', refreshDashboard));

  container.querySelector('#dashboard-save').addEventListener('click', () => {
    const draft = readDraft();
    saveDashboardLineConfig(draft);
    state.dashboardSelection.area = draft.area;
    state.dashboardSelection.line = draft.line;
    saveState();
    refreshDashboard();
    showToast('Dashboard actualizado para esta línea', 'success');
  });

  refreshDashboard();
}

function getCatalogStationOperatorLabel(station) {
  const operadores = Array.isArray(station.operadores) ? station.operadores : [];
  const operatorNames = operadores
    .map(op => op.nombre || op.name)
    .filter(Boolean);
  return operatorNames.length ? operatorNames.join(', ') : 'Sin operadores';
}

function renderCatalogActivityRow(station, operator, activity, index) {
  return `
    <tr>
      <td class="font-mono catalog-activity-number">${index + 1}</td>
      <td>
        <input
          class="form-input w-full"
          data-catalog-action="activity-name"
          data-station-id="${esc(station.id)}"
          data-operator-id="${esc(operator.id)}"
          data-activity-id="${esc(activity.id)}"
          type="text"
          value="${esc(activity.actividad || '')}"
          placeholder="Actividad"
        />
      </td>
      <td>
        <input
          class="form-input catalog-time-input"
          data-catalog-action="activity-time"
          data-station-id="${esc(station.id)}"
          data-operator-id="${esc(operator.id)}"
          data-activity-id="${esc(activity.id)}"
          type="number"
          min="0"
          step="0.01"
          value="${esc(activity.tiempo ?? '')}"
          placeholder="0"
        />
      </td>
      <td class="td-actions">
        <button
          class="btn btn--ghost btn--sm"
          style="color:var(--danger)"
          type="button"
          data-catalog-action="delete-activity"
          data-station-id="${esc(station.id)}"
          data-operator-id="${esc(operator.id)}"
          data-activity-id="${esc(activity.id)}"
        >Eliminar</button>
      </td>
    </tr>
  `;
}

function getSubconjuntoOptions() {
  return [...new Set(
    (state.timeStudyStructure || []).flatMap(s => (s.subconjuntos || []).map(sc => sc.name))
  )];
}

function renderCatalogOperator(station, operator, index) {
  const actividades = Array.isArray(operator.actividades) ? operator.actividades : [];
  const rows = actividades.length
    ? actividades.map((activity, activityIndex) => renderCatalogActivityRow(station, operator, activity, activityIndex)).join('')
    : `<tr><td colspan="4" class="catalog-empty-table-cell">Sin actividades.</td></tr>`;

  return `
    <div class="catalog-operator" data-operator-id="${esc(operator.id)}">
      <div class="catalog-operator-header">
        <div class="catalog-operator-fields">
          <div class="catalog-operator-title">
            <label class="form-label" for="catalog-op-${esc(operator.id)}">Operador</label>
            <input
              class="form-input catalog-operator-name"
              id="catalog-op-${esc(operator.id)}"
              data-catalog-action="operator-name"
              data-station-id="${esc(station.id)}"
              data-operator-id="${esc(operator.id)}"
              type="text"
              value="${esc(operator.nombre ?? `OP${index + 1}`)}"
            />
          </div>
          <div class="catalog-operator-subset">
            <label class="form-label" for="catalog-subset-${esc(operator.id)}">Subconjunto</label>
            <input
              class="form-input catalog-subset-input"
              id="catalog-subset-${esc(operator.id)}"
              list="dl-subconjunto-${esc(operator.id)}"
              data-catalog-action="operator-subset"
              data-station-id="${esc(station.id)}"
              data-operator-id="${esc(operator.id)}"
              type="text"
              value="${esc(operator.subconjunto || '')}"
              placeholder="Ej. SGD_Q500"
              autocomplete="off"
            />
            <datalist id="dl-subconjunto-${esc(operator.id)}">
              ${getSubconjuntoOptions().map(name => `<option value="${esc(name)}"></option>`).join('')}
            </datalist>
          </div>
        </div>
        <div class="catalog-operator-actions">
          <div class="catalog-total-pill">
            Total operador:
            <strong data-catalog-operator-total="${esc(operator.id)}">${fmtCatalogSeconds(calculateCatalogOperatorTotal(operator))} s</strong>
          </div>
          <button
            class="btn btn--ghost btn--sm"
            style="color:var(--danger)"
            type="button"
            data-catalog-action="delete-operator"
            data-station-id="${esc(station.id)}"
            data-operator-id="${esc(operator.id)}"
          >Eliminar operador</button>
        </div>
      </div>

      <div class="table-wrapper catalog-activity-table">
        <table>
          <thead>
            <tr>
              <th style="width:64px">No.</th>
              <th>Actividad</th>
              <th style="width:150px">Tiempo</th>
              <th class="td-actions">Acciones</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>

      <div class="catalog-operator-footer">
        <button
          class="btn btn--secondary btn--sm"
          type="button"
          data-catalog-action="add-activity"
          data-station-id="${esc(station.id)}"
          data-operator-id="${esc(operator.id)}"
        >Agregar actividad</button>
      </div>
    </div>
  `;
}

function renderCatalogStation(station, index) {
  const operadores = Array.isArray(station.operadores) ? station.operadores : [];
  const operatorLabel = getCatalogStationOperatorLabel(station);
  const isOpen = _catalogOpenStationIds.has(station.id) || (_catalogOpenStationIds.size === 0 && index === 0);

  return `
    <details class="catalog-station" data-station-id="${esc(station.id)}" ${isOpen ? 'open' : ''}>
      <summary class="catalog-station-summary">
        <div class="catalog-station-title">
          <label class="form-label" for="catalog-st-${esc(station.id)}">Estación</label>
          <input
            class="form-input catalog-station-name"
            id="catalog-st-${esc(station.id)}"
            data-catalog-action="station-name"
            data-station-id="${esc(station.id)}"
            type="text"
            value="${esc(station.nombre ?? `Estación ${index + 1}`)}"
          />
        </div>
        <span class="catalog-station-meta" data-catalog-station-operators="${esc(station.id)}">${esc(operatorLabel)}</span>
        <span class="catalog-total-pill">
          Total estación:
          <strong data-catalog-station-total="${esc(station.id)}">${fmtCatalogSeconds(calculateCatalogStationTotal(station))} s</strong>
        </span>
        <button
          class="btn btn--ghost btn--sm"
          style="color:var(--danger)"
          type="button"
          data-catalog-action="delete-station"
          data-station-id="${esc(station.id)}"
        >Eliminar estación</button>
      </summary>
      <div class="catalog-station-body">
        ${operadores.length === 0 ? `
          <div class="catalog-empty-operators">
            <p>No hay operadores asignados.</p>
            <button
              class="btn btn--secondary btn--sm"
              type="button"
              data-catalog-action="add-operator"
              data-station-id="${esc(station.id)}"
            >Agregar operador</button>
          </div>
        ` : `
          <div class="catalog-operator-list">
            ${operadores.map((operator, operatorIndex) => renderCatalogOperator(station, operator, operatorIndex)).join('')}
          </div>
          <button
            class="btn btn--secondary btn--sm"
            type="button"
            data-catalog-action="add-operator"
            data-station-id="${esc(station.id)}"
          >Agregar operador</button>
        `}
      </div>
    </details>
  `;
}

// ── Stubs para fases futuras ──────────────────
function renderCatalogs(container) {
  const { catalog, created } = getCatalogEditorState();
  const lineTotal = calculateCatalogLineTotal(catalog);

  container.innerHTML = `
    <div class="page-header catalog-page-header">
      <div>
        <h1 class="page-title">Catálogo</h1>
        <p class="page-subtitle">Estructura de estaciones, operadores y actividades por línea</p>
      </div>
      <button class="btn btn--primary" type="button" data-catalog-action="save-catalog">Guardar cambios</button>
    </div>

    <div class="entity-grid mb-6">
      <div class="entity-card">
        <div class="entity-card-label">Planta</div>
        <div class="entity-card-name">${esc(catalog.planta)}</div>
        <div class="entity-card-meta">Contexto fijo del catálogo</div>
      </div>
      <div class="entity-card">
        <div class="entity-card-label">Área</div>
        <div class="entity-card-name">${esc(catalog.area)}</div>
        <div class="entity-card-meta">Última selección del Dashboard</div>
      </div>
      <div class="entity-card">
        <div class="entity-card-label">Línea</div>
        <div class="entity-card-name">${esc(catalog.linea)}</div>
        <div class="entity-card-meta">Última selección del Dashboard</div>
      </div>
      <div class="entity-card">
        <div class="entity-card-label">Total línea</div>
        <div class="entity-card-name"><span data-catalog-line-total>${fmtCatalogSeconds(lineTotal)}</span><span style="font-size:var(--font-14);font-weight:500;color:var(--text-muted)"> s</span></div>
        <div class="entity-card-meta">Suma de estaciones</div>
      </div>
    </div>

    ${created ? `
      <div class="catalog-initial-message mb-6">
        No hay información guardada para esta línea. Se creó una estructura inicial vacía para comenzar a capturar.
      </div>
    ` : ''}

    <div class="card catalog-structure-card">
      <div class="card-header">
        <div>
          <div class="card-title">Estructura del Catálogo</div>
          <div class="card-subtitle">Los cambios se mantienen como borrador hasta presionar Guardar cambios</div>
        </div>
        <button class="btn btn--secondary btn--sm" type="button" data-catalog-action="add-station">Agregar estación</button>
      </div>
      <div class="card-body">
        ${catalog.estaciones.length ? `
          <div class="catalog-station-list">
            ${catalog.estaciones.map((station, index) => renderCatalogStation(station, index)).join('')}
          </div>
        ` : `
          <div class="catalog-empty-line">
            <p>No hay estaciones capturadas.</p>
            <button class="btn btn--secondary btn--sm" type="button" data-catalog-action="add-station">Agregar estación</button>
          </div>
        `}
      </div>
    </div>
  `;

  bindCatalogEditor(container);
}

function captureCatalogOpenStates(container) {
  const openIds = new Set();
  container.querySelectorAll('details.catalog-station').forEach(detail => {
    if (detail.open && detail.dataset.stationId) openIds.add(detail.dataset.stationId);
  });
  _catalogOpenStationIds = openIds;
}

function setCatalogDataText(container, attrName, id, value) {
  container.querySelectorAll(`[${attrName}]`).forEach(el => {
    if (el.getAttribute(attrName) === id) el.textContent = value;
  });
}

function refreshCatalogEditorTotals(container) {
  if (!_catalogDraft) return;

  const lineTotalEl = container.querySelector('[data-catalog-line-total]');
  if (lineTotalEl) lineTotalEl.textContent = fmtCatalogSeconds(calculateCatalogLineTotal(_catalogDraft));

  (_catalogDraft.estaciones || []).forEach(station => {
    setCatalogDataText(
      container,
      'data-catalog-station-total',
      station.id,
      `${fmtCatalogSeconds(calculateCatalogStationTotal(station))} s`
    );
    setCatalogDataText(
      container,
      'data-catalog-station-operators',
      station.id,
      getCatalogStationOperatorLabel(station)
    );

    (station.operadores || []).forEach(operator => {
      setCatalogDataText(
        container,
        'data-catalog-operator-total',
        operator.id,
        `${fmtCatalogSeconds(calculateCatalogOperatorTotal(operator))} s`
      );
    });
  });
}

function rerenderCatalogEditor(container) {
  renderCatalogs(container || document.getElementById('main-content'));
}

function handleCatalogInput(container, input) {
  const action = input.dataset.catalogAction;
  const stationId = input.dataset.stationId;
  const operatorId = input.dataset.operatorId;
  const activityId = input.dataset.activityId;

  if (action === 'station-name') {
    const station = findCatalogStation(stationId);
    if (station) station.nombre = input.value;
  }

  if (action === 'operator-name') {
    const operator = findCatalogOperator(stationId, operatorId);
    if (operator) operator.nombre = input.value;
  }

  if (action === 'operator-subset') {
    const operator = findCatalogOperator(stationId, operatorId);
    if (operator) operator.subconjunto = input.value;
  }

  if (action === 'activity-name') {
    const activity = findCatalogActivity(stationId, operatorId, activityId);
    if (activity) activity.actividad = input.value;
  }

  if (action === 'activity-time') {
    const activity = findCatalogActivity(stationId, operatorId, activityId);
    if (activity) activity.tiempo = input.value;
  }

  refreshCatalogEditorTotals(container);
}

function saveCatalogDraft(container) {
  if (!_catalogDraft || !_catalogDraftKey) return;
  const activeUser = getActiveUser();
  if (!activeUser) {
    showToast('Debes iniciar sesión para guardar cambios en Catálogo.', 'warning');
    openLoginModal('Debes iniciar sesión para guardar cambios en Catálogo.');
    return;
  }
  if (findCatalogOperatorsWithoutSubset(_catalogDraft).length > 0) {
    showToast('No puedes guardar. Todos los operadores deben tener un subconjunto asignado.', 'warning');
    return;
  }
  captureCatalogOpenStates(container);

  const normalized = normalizeCatalogDraftForSave(_catalogDraft);
  const store = readCatalogStore();
  store[_catalogDraftKey] = normalized;
  writeCatalogStore(store);
  appendCatalogChangeRecord(activeUser, normalized);

  _catalogDraft = deepClone(normalized);
  _catalogCreatedInitial = false;
  showToast('Cambios guardados correctamente.', 'success');
  rerenderCatalogEditor(container);
}

function addCatalogStation(container) {
  captureCatalogOpenStates(container);
  const station = {
    id: generateId('CAT-ST'),
    nombre: getNextCatalogStationName(),
    operadores: []
  };
  _catalogDraft.estaciones.push(station);
  _catalogOpenStationIds.add(station.id);
  rerenderCatalogEditor(container);
}

function deleteCatalogStation(container, stationId) {
  const station = findCatalogStation(stationId);
  if (!station) return;

  showConfirm(
    'Eliminar estación',
    '¿Seguro que deseas eliminar esta estación? Esta acción eliminará sus operadores y actividades.',
    () => {
      captureCatalogOpenStates(container);
      _catalogDraft.estaciones = _catalogDraft.estaciones.filter(item => item.id !== stationId);
      _catalogOpenStationIds.delete(stationId);
      rerenderCatalogEditor(container);
    }
  );
}

function addCatalogOperator(container, stationId) {
  const station = findCatalogStation(stationId);
  if (!station) return;

  captureCatalogOpenStates(container);
  const operator = {
    id: generateId('CAT-OP'),
    nombre: getNextCatalogOperatorName(station),
    subconjunto: '',
    actividades: [
      {
        id: generateId('CAT-ACT'),
        no: 1,
        actividad: '',
        tiempo: ''
      }
    ]
  };
  station.operadores.push(operator);
  _catalogOpenStationIds.add(stationId);
  rerenderCatalogEditor(container);
}

function deleteCatalogOperator(container, stationId, operatorId) {
  const station = findCatalogStation(stationId);
  const operator = findCatalogOperator(stationId, operatorId);
  if (!station || !operator) return;

  showConfirm(
    'Eliminar operador',
    '¿Seguro que deseas eliminar este operador? Esta acción eliminará sus actividades.',
    () => {
      captureCatalogOpenStates(container);
      station.operadores = station.operadores.filter(item => item.id !== operatorId);
      _catalogOpenStationIds.add(stationId);
      rerenderCatalogEditor(container);
    }
  );
}

function addCatalogActivity(container, stationId, operatorId) {
  const operator = findCatalogOperator(stationId, operatorId);
  if (!operator) return;

  captureCatalogOpenStates(container);
  operator.actividades.push({
    id: generateId('CAT-ACT'),
    no: operator.actividades.length + 1,
    actividad: '',
    tiempo: ''
  });
  recalcCatalogActivityNumbers(operator);
  _catalogOpenStationIds.add(stationId);
  rerenderCatalogEditor(container);
}

function deleteCatalogActivity(container, stationId, operatorId, activityId) {
  const operator = findCatalogOperator(stationId, operatorId);
  if (!operator) return;

  showConfirm(
    'Eliminar actividad',
    '¿Seguro que deseas eliminar esta actividad?',
    () => {
      captureCatalogOpenStates(container);
      operator.actividades = operator.actividades.filter(item => item.id !== activityId);
      recalcCatalogActivityNumbers(operator);
      _catalogOpenStationIds.add(stationId);
      rerenderCatalogEditor(container);
    }
  );
}

function bindCatalogEditor(container) {
  container.querySelectorAll('.catalog-station-summary input, .catalog-station-summary button').forEach(control => {
    control.addEventListener('click', event => event.stopPropagation());
  });

  container.querySelectorAll('details.catalog-station').forEach(detail => {
    detail.addEventListener('toggle', () => {
      if (!detail.dataset.stationId) return;
      if (detail.open) _catalogOpenStationIds.add(detail.dataset.stationId);
      else _catalogOpenStationIds.delete(detail.dataset.stationId);
    });
  });

  container.oninput = event => {
    const input = event.target.closest('[data-catalog-action]');
    if (!input || input.tagName !== 'INPUT') return;
    handleCatalogInput(container, input);
  };

  container.onclick = event => {
    const button = event.target.closest('button[data-catalog-action]');
    if (!button || !container.contains(button)) return;

    event.preventDefault();
    event.stopPropagation();

    const action = button.dataset.catalogAction;
    const stationId = button.dataset.stationId;
    const operatorId = button.dataset.operatorId;
    const activityId = button.dataset.activityId;

    if (action === 'save-catalog') saveCatalogDraft(container);
    if (action === 'add-station') addCatalogStation(container);
    if (action === 'delete-station') deleteCatalogStation(container, stationId);
    if (action === 'add-operator') addCatalogOperator(container, stationId);
    if (action === 'delete-operator') deleteCatalogOperator(container, stationId, operatorId);
    if (action === 'add-activity') addCatalogActivity(container, stationId, operatorId);
    if (action === 'delete-activity') deleteCatalogActivity(container, stationId, operatorId, activityId);
  };
}

function renderChangeDatabase(container) {
  const records = readChangeDatabaseLog();
  const rows = [...records].reverse().map(record => `
    <tr>
      <td class="font-mono">${esc(record.fechaHora || '—')}</td>
      <td>${esc(record.usuario || '—')}</td>
      <td>${esc(record.area || '—')}</td>
      <td>${esc(record.linea || '—')}</td>
      <td>${esc(record.estacion || 'Varias estaciones')}</td>
      <td>${esc(record.cambio || '—')}</td>
    </tr>
  `).join('');

  container.innerHTML = `
    <div class="page-header catalog-page-header">
      <div>
        <h1 class="page-title">Base de Datos de Cambios</h1>
        <p class="page-subtitle">Historial resumido de guardados realizados desde Catálogo</p>
      </div>
      <button class="btn btn--ghost" id="change-log-clear" type="button" ${records.length ? '' : 'disabled'}>Limpiar bitácora</button>
    </div>

    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">Registros de cambios</div>
          <div class="card-subtitle">${records.length} registros guardados en esta instalación local</div>
        </div>
      </div>
      <div class="card-body">
        ${records.length ? `
          <div class="table-wrapper change-log-table">
            <table>
              <thead>
                <tr>
                  <th style="width:150px">Fecha/hora</th>
                  <th style="width:130px">Usuario</th>
                  <th style="width:120px">Área</th>
                  <th style="width:180px">Línea</th>
                  <th style="width:150px">Estación</th>
                  <th>Cambio</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        ` : `
          <div class="change-log-empty">No hay cambios registrados todavía.</div>
        `}
      </div>
    </div>
  `;

  container.querySelector('#change-log-clear')?.addEventListener('click', () => {
    showConfirm(
      'Limpiar bitácora',
      '¿Seguro que deseas limpiar la Base de Datos de Cambios? Esta acción no borra el Catálogo ni otros datos.',
      () => {
        clearChangeDatabaseLog();
        renderChangeDatabase(container);
        showToast('Base de Datos de Cambios limpiada', 'success');
      }
    );
  });
}

function renderStandardTimes(container) {
  const ops  = state.operations;
  const takt = calculateTaktTime(state.balanceSettings);
  const twc  = calculateTotalWorkContent(getActiveOperations());
  const efficiency = calculateEfficiency(twc, state.balanceSettings.desiredStations, takt);
  const overCount  = ops.filter(o => o.active && o.standardTime > takt).length;

  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Tiempos Estándar</h1>
      <p class="page-subtitle">Base de datos oficial · Los cambios se reflejan inmediatamente en el balanceo</p>
    </div>

    <div class="entity-grid mb-6" style="grid-template-columns:repeat(auto-fill,minmax(170px,1fr))">
      <div class="entity-card">
        <div class="entity-card-label">Takt Time</div>
        <div class="entity-card-name" style="color:var(--green-600)">${fmt(takt)}<span style="font-size:var(--font-14);font-weight:500;color:var(--text-muted)"> seg</span></div>
        <div class="entity-card-meta">${state.balanceSettings.requiredQuantity} piezas / turno</div>
      </div>
      <div class="entity-card">
        <div class="entity-card-label">Contenido de Trabajo</div>
        <div class="entity-card-name">${twc}<span style="font-size:var(--font-14);font-weight:500;color:var(--text-muted)"> seg</span></div>
        <div class="entity-card-meta">${getActiveOperations().length} operaciones activas</div>
      </div>
      <div class="entity-card">
        <div class="entity-card-label">Eficiencia</div>
        <div class="entity-card-name" style="color:${efficiency >= 80 ? 'var(--success)' : efficiency >= 65 ? 'var(--warning)' : 'var(--danger)'}">${fmtPct(efficiency)}</div>
        <div class="entity-card-meta">${state.balanceSettings.desiredStations} estaciones configuradas</div>
      </div>
      <div class="entity-card">
        <div class="entity-card-label">Ops sobre Takt</div>
        <div class="entity-card-name" style="color:${overCount > 0 ? 'var(--danger)' : 'var(--success)'}">${overCount}</div>
        <div class="entity-card-meta">operaciones que exceden el takt</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div class="card-title">Tiempos por Operación</div>
      </div>
      <div style="overflow-x:auto;border-radius:0 0 var(--radius-lg) var(--radius-lg);">
        <table>
          <thead>
            <tr>
              <th style="width:44px">#</th>
              <th>Nombre de Operación</th>
              <th style="width:110px">Tiempo (s)</th>
              <th style="width:80px">Estado</th>
              <th style="width:115px">Fecha Efectiva</th>
              <th>Actualizado por</th>
              <th class="td-actions">Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${ops.map(op => {
              const st      = state.standardTimes.find(s => s.operationId === op.id) || {};
              const pct     = Math.round((op.standardTime / takt) * 100);
              const overTakt = op.active && op.standardTime > takt;
              return `
                <tr class="${!op.active ? 'row--inactive' : overTakt ? 'row--overload' : ''}">
                  <td class="font-mono" style="color:var(--text-muted);font-size:var(--font-12)">${op.sequence}</td>
                  <td>
                    ${esc(op.name)}
                    ${!op.active ? '<span class="badge badge--neutral" style="margin-left:6px">Inactivo</span>' : ''}
                    ${op.isTemporary ? '<span class="badge badge--warning" style="margin-left:6px">Temporal</span>' : ''}
                  </td>
                  <td>
                    <strong class="font-mono" style="${overTakt ? 'color:var(--danger)' : ''}">${op.standardTime}</strong>
                    ${overTakt ? '<span class="badge badge--danger" style="margin-left:4px;font-size:10px">⚠</span>' : ''}
                  </td>
                  <td>
                    ${(st.status ?? 'active') === 'active'
                      ? '<span class="badge badge--success">Activo</span>'
                      : '<span class="badge badge--neutral">Inactivo</span>'}
                  </td>
                  <td style="font-size:var(--font-12);color:var(--text-muted)">${esc(st.effectiveDate ?? '—')}</td>
                  <td style="font-size:var(--font-12);color:var(--text-muted)">${esc(st.updatedBy ?? '—')}</td>
                  <td class="td-actions">
                    <button class="btn btn--secondary btn--sm" data-edit-time="${op.id}">Editar</button>
                    <button class="btn btn--ghost btn--sm" data-toggle-std="${op.id}">${(st.status ?? 'active') === 'active' ? 'Inactivar' : 'Activar'}</button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  container.querySelectorAll('[data-edit-time]').forEach(btn =>
    btn.addEventListener('click', () => openEditTimeModal(btn.dataset.editTime)));
  container.querySelectorAll('[data-toggle-std]').forEach(btn =>
    btn.addEventListener('click', () => toggleStdTimeStatus(btn.dataset.toggleStd)));
}

function renderTimeStudy(container) {
  normalizeTimeStudies();
  const tab = state.timeStudyTab || 'capture';
  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Estudios de Tiempo</h1>
      <p class="page-subtitle">Toma y análisis de tiempos por operación · ${esc(state.line.name)}</p>
    </div>
    <div class="ts-tabs mb-6">
      <button class="ts-tab-btn ${tab === 'capture' ? 'active' : ''}" data-ts-tab="capture">Toma de tiempos</button>
      <button class="ts-tab-btn ${tab === 'records' ? 'active' : ''}" data-ts-tab="records">Registros de estudios</button>
      <button class="ts-tab-btn ${tab === 'frequency' ? 'active' : ''}" data-ts-tab="frequency">Análisis de frecuencias</button>
    </div>
    <div id="ts-tab-content"></div>
  `;

  container.querySelectorAll('[data-ts-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.timeStudyTab = btn.dataset.tsTab;
      saveState();
      renderTimeStudy(container);
    });
  });

  const content = container.querySelector('#ts-tab-content');
  if (tab === 'capture') renderTSCaptureSection(content);
  else if (tab === 'records') renderTSRecordsSection(content);
  else renderTSFrequencySection(content);
}

function renderTSCaptureSection(container) {
  container.innerHTML = `
    <div class="card mb-6">
      <div class="card-header">
        <div>
          <div class="card-title">Toma de tiempos</div>
          <div class="card-subtitle">Define los pasos de la operación y captura tiempos con cronómetro</div>
        </div>
        <button class="btn btn--primary" id="btn-new-time-study">+ Nuevo estudio</button>
      </div>
      <div class="card-body">
        <p style="color:var(--text-muted);font-size:var(--font-14);line-height:1.6">
          Crea un estudio de tiempo definiendo los pasos de la operación y el número de capturas por paso.
          El sistema te guiará para cronometrar cada captura y calculará el promedio automáticamente.
        </p>
      </div>
    </div>
  `;

  container.querySelector('#btn-new-time-study')?.addEventListener('click', openNewTimeStudyModal);
}

function tsBadgeForStatus(status) {
  const map = {
    draft:       ['badge--neutral', 'Borrador'],
    in_progress: ['badge--warning', 'En progreso'],
    completed:   ['badge--success', 'Completado']
  };
  const [cls, label] = map[status] || ['badge--neutral', status || 'Borrador'];
  return `<span class="badge ${cls}">${label}</span>`;
}

function tsProgressOf(study) {
  const steps = study.steps || [];
  const total = steps.reduce((sum, s) => sum + (s.requiredCaptures || 0), 0);
  const done  = steps.reduce((sum, s) => sum + (s.captures || []).length, 0);
  return { done, total };
}

function renderTSRecordsSection(container) {
  const studies = state.timeStudies || [];

  // Summary stats
  const totalCaptures = studies.reduce((sum, s) =>
    sum + (s.steps || []).reduce((ss, step) => ss + (step.captures || []).length, 0), 0);
  const countByStatus = { draft: 0, in_progress: 0, completed: 0 };
  studies.forEach(s => { if (countByStatus[s.status] !== undefined) countByStatus[s.status]++; });

  const summaryHTML = `
    <div class="kpi-grid" style="grid-template-columns:repeat(auto-fill,minmax(160px,1fr));margin-bottom:var(--sp-4)">
      <div class="kpi-card">
        <div class="kpi-label">Total estudios</div>
        <div class="kpi-value">${studies.length}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Borrador</div>
        <div class="kpi-value" style="color:var(--text-muted)">${countByStatus.draft}</div>
      </div>
      <div class="kpi-card kpi-card--warning">
        <div class="kpi-label">En progreso</div>
        <div class="kpi-value kpi-value--warning">${countByStatus.in_progress}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Completados</div>
        <div class="kpi-value kpi-value--green">${countByStatus.completed}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Capturas registradas</div>
        <div class="kpi-value">${totalCaptures}</div>
      </div>
    </div>
  `;

  if (studies.length === 0) {
    container.innerHTML = `
      ${summaryHTML}
      <div class="card">
        <div class="card-header">
          <div class="card-title">Estudios guardados</div>
          <div class="btn-group">
            <label class="btn btn--secondary btn--sm" style="cursor:pointer" title="Importar estudios desde JSON">
              Importar JSON
              <input type="file" accept=".json,application/json" style="display:none" id="ts-import-input" />
            </label>
          </div>
        </div>
        <div class="card-body">
          <div class="ts-empty-state">
            <div class="ts-empty-state-title">Aún no hay estudios de tiempo guardados.</div>
            <div class="ts-empty-state-body">Crea tu primer estudio desde la pestaña <strong>Toma de tiempos</strong>.</div>
          </div>
        </div>
      </div>
    `;
    _bindTSImportInput(container, container);
    return;
  }

  container.innerHTML = `
    ${summaryHTML}
    <div class="card">
      <div class="card-header">
        <div style="display:flex;align-items:center;gap:var(--sp-3)">
          <div class="card-title">Estudios guardados</div>
          <span class="badge badge--neutral">${studies.length}</span>
        </div>
        <div class="btn-group">
          <button class="btn btn--secondary btn--sm" id="ts-export-all" title="Exportar todos los estudios como JSON">Exportar todos</button>
          <label class="btn btn--secondary btn--sm" style="cursor:pointer" title="Importar estudios desde JSON">
            Importar JSON
            <input type="file" accept=".json,application/json" style="display:none" id="ts-import-input" />
          </label>
        </div>
      </div>
      <div class="card-body" style="border-bottom:1px solid var(--border);padding-bottom:var(--sp-4)">
        <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:var(--sp-3);align-items:end">
          <div class="form-group" style="margin:0">
            <label class="form-label" for="ts-search">Buscar</label>
            <input class="form-input w-full" id="ts-search" type="search" placeholder="Nombre del estudio o paso..." value="${esc(_tsFilter.search)}" />
          </div>
          <div class="form-group" style="margin:0">
            <label class="form-label" for="ts-status-filter">Estado</label>
            <select class="form-select" id="ts-status-filter">
              <option value="all"${_tsFilter.status === 'all' ? ' selected' : ''}>Todos</option>
              <option value="draft"${_tsFilter.status === 'draft' ? ' selected' : ''}>Borrador</option>
              <option value="in_progress"${_tsFilter.status === 'in_progress' ? ' selected' : ''}>En progreso</option>
              <option value="completed"${_tsFilter.status === 'completed' ? ' selected' : ''}>Completado</option>
            </select>
          </div>
          <div class="form-group" style="margin:0">
            <label class="form-label" for="ts-sort">Ordenar</label>
            <select class="form-select" id="ts-sort">
              <option value="newest"${_tsFilter.sort === 'newest' ? ' selected' : ''}>Más recientes</option>
              <option value="oldest"${_tsFilter.sort === 'oldest' ? ' selected' : ''}>Más antiguos</option>
              <option value="name-az"${_tsFilter.sort === 'name-az' ? ' selected' : ''}>Nombre A-Z</option>
              <option value="name-za"${_tsFilter.sort === 'name-za' ? ' selected' : ''}>Nombre Z-A</option>
              <option value="progress-desc"${_tsFilter.sort === 'progress-desc' ? ' selected' : ''}>Mayor progreso</option>
              <option value="progress-asc"${_tsFilter.sort === 'progress-asc' ? ' selected' : ''}>Menor progreso</option>
            </select>
          </div>
        </div>
      </div>
      <div style="overflow-x:auto">
        <table class="time-study-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th style="width:110px">Actualizado</th>
              <th class="text-right" style="width:66px">Pasos</th>
              <th style="width:120px">Estado</th>
              <th style="width:110px">Progreso</th>
              <th style="min-width:310px">Acciones</th>
            </tr>
          </thead>
          <tbody id="ts-records-tbody"></tbody>
        </table>
      </div>
    </div>
  `;

  const refreshTable = () => {
    const search = _tsFilter.search.toLowerCase().trim();
    const statusFilter = _tsFilter.status;
    const sort = _tsFilter.sort;

    let filtered = studies.filter(s => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (search) {
        const nameMatch = s.name.toLowerCase().includes(search);
        const stepMatch = (s.steps || []).some(step => step.name.toLowerCase().includes(search));
        if (!nameMatch && !stepMatch) return false;
      }
      return true;
    });

    filtered.sort((a, b) => {
      if (sort === 'newest')        return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
      if (sort === 'oldest')        return new Date(a.updatedAt || a.createdAt) - new Date(b.updatedAt || b.createdAt);
      if (sort === 'name-az')       return a.name.localeCompare(b.name, 'es');
      if (sort === 'name-za')       return b.name.localeCompare(a.name, 'es');
      if (sort === 'progress-desc') {
        const pa = tsProgressOf(a); const pb = tsProgressOf(b);
        return (pb.total > 0 ? pb.done / pb.total : 0) - (pa.total > 0 ? pa.done / pa.total : 0);
      }
      if (sort === 'progress-asc') {
        const pa = tsProgressOf(a); const pb = tsProgressOf(b);
        return (pa.total > 0 ? pa.done / pa.total : 0) - (pb.total > 0 ? pb.done / pb.total : 0);
      }
      return 0;
    });

    const tbody = container.querySelector('#ts-records-tbody');
    if (!tbody) return;

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:var(--sp-8);color:var(--text-muted)">No hay estudios que coincidan con la búsqueda o filtros actuales.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(s => {
      const { done, total } = tsProgressOf(s);
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      const date = s.updatedAt || s.createdAt;
      return `
        <tr>
          <td><strong>${esc(s.name)}</strong></td>
          <td style="color:var(--text-muted);font-size:var(--font-13)">${date ? new Date(date).toLocaleDateString('es-MX') : '—'}</td>
          <td class="text-right">${(s.steps || []).length}</td>
          <td>${tsBadgeForStatus(s.status)}</td>
          <td style="min-width:90px">
            <div style="font-size:var(--font-12);color:var(--text-muted);margin-bottom:3px">${done}/${total} · ${pct}%</div>
            <div class="ts-progress-bar"><div class="ts-progress-bar-fill" style="width:${pct}%"></div></div>
          </td>
          <td>
            <div class="ts-row-actions">
              <button class="btn btn--ghost btn--sm" data-ts-action="view"      data-study-id="${esc(s.id)}" title="Ver detalle">Ver</button>
              <button class="btn btn--ghost btn--sm" data-ts-action="edit"      data-study-id="${esc(s.id)}" title="Editar">Editar</button>
              <button class="btn btn--ghost btn--sm" data-ts-action="duplicate" data-study-id="${esc(s.id)}" title="Duplicar">Duplicar</button>
              <button class="btn btn--ghost btn--sm" data-ts-action="export"    data-study-id="${esc(s.id)}" title="Exportar JSON">Exportar</button>
              <button class="btn btn--ghost btn--sm ts-btn-danger" data-ts-action="delete" data-study-id="${esc(s.id)}" title="Eliminar">Eliminar</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('[data-ts-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.studyId;
        const action = btn.dataset.tsAction;
        if      (action === 'view')      openTimeStudyDetailModal(id);
        else if (action === 'edit')      openEditTimeStudyModal(id, () => renderTSRecordsSection(container));
        else if (action === 'duplicate') { tsDuplicateStudy(id); renderTSRecordsSection(container); }
        else if (action === 'export')    tsExportStudy(id);
        else if (action === 'delete')    tsDeleteStudy(id, container);
      });
    });
  };

  refreshTable();

  container.querySelector('#ts-search')?.addEventListener('input', e => {
    _tsFilter.search = e.target.value;
    refreshTable();
  });
  container.querySelector('#ts-status-filter')?.addEventListener('change', e => {
    _tsFilter.status = e.target.value;
    refreshTable();
  });
  container.querySelector('#ts-sort')?.addEventListener('change', e => {
    _tsFilter.sort = e.target.value;
    refreshTable();
  });

  container.querySelector('#ts-export-all')?.addEventListener('click', tsExportAllStudies);
  _bindTSImportInput(container, container);
}

function openNewTimeStudyModal() {
  let steps = [{ id: generateId('STP'), name: '', captures: 3 }];

  function buildStepsHTML() {
    return steps.map((step, i) => `
      <div class="ts-step-row" data-step-idx="${i}">
        <span class="ts-step-num">${i + 1}</span>
        <input class="form-input ts-step-name" type="text" placeholder="Nombre del paso"
          value="${esc(step.name)}" data-step-idx="${i}" />
        <input class="form-input ts-step-captures" type="number" min="1" step="1"
          value="${step.captures}" data-step-idx="${i}" style="width:80px;text-align:right" />
        <button class="btn btn--ghost btn--sm ts-step-remove" data-step-idx="${i}"
          ${steps.length === 1 ? 'disabled' : ''} title="Eliminar paso">&times;</button>
        <button class="btn btn--ghost btn--sm" data-step-idx="${i}" disabled
          title="Disponible en la siguiente fase">Cronómetro</button>
      </div>
    `).join('');
  }

  function refreshStepsList() {
    const list = document.getElementById('tsc-steps-list');
    if (!list) return;
    list.innerHTML = buildStepsHTML();

    list.querySelectorAll('.ts-step-name').forEach(input => {
      input.addEventListener('input', () => {
        steps[parseInt(input.dataset.stepIdx)].name = input.value;
      });
    });

    list.querySelectorAll('.ts-step-captures').forEach(input => {
      input.addEventListener('change', () => {
        const val = Math.max(1, parseInt(input.value) || 1);
        steps[parseInt(input.dataset.stepIdx)].captures = val;
        input.value = val;
      });
    });

    list.querySelectorAll('.ts-step-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.stepIdx);
        if (steps.length > 1) {
          steps.splice(idx, 1);
          refreshStepsList();
        }
      });
    });
  }

  openModal('Nuevo estudio de tiempo', `
    <div class="ts-creator-form">
      <div class="form-group">
        <label class="form-label" for="tsc-name">Nombre del estudio <span style="color:var(--danger)">*</span></label>
        <input class="form-input w-full" id="tsc-name" type="text" placeholder="Ej. Ensamble conector A" />
      </div>

      <div class="form-group">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--sp-2)">
          <label class="form-label" style="margin:0">Pasos / Operaciones <span style="color:var(--danger)">*</span></label>
          <button class="btn btn--ghost btn--sm" id="tsc-add-step">+ Agregar paso</button>
        </div>
        <div class="ts-step-header">
          <span></span>
          <span>Nombre del paso</span>
          <span style="text-align:right">Capturas</span>
          <span></span>
          <span></span>
        </div>
        <div id="tsc-steps-list"></div>
      </div>

      <div class="modal-actions">
        <button class="btn btn--ghost" id="tsc-cancel">Cancelar</button>
        <button class="btn btn--primary" id="tsc-save">Crear estudio</button>
      </div>
    </div>
  `);

  refreshStepsList();

  document.getElementById('tsc-cancel')?.addEventListener('click', closeModal);

  document.getElementById('tsc-add-step')?.addEventListener('click', () => {
    steps.push({ id: generateId('STP'), name: '', captures: 3 });
    refreshStepsList();
  });

  document.getElementById('tsc-save')?.addEventListener('click', () => {
    const nameEl = document.getElementById('tsc-name');
    const name = nameEl ? nameEl.value.trim() : '';
    if (!name) { showToast('El nombre del estudio es requerido', 'warning'); return; }
    if (steps.length === 0) { showToast('Agrega al menos un paso', 'warning'); return; }
    const stepWithoutName = steps.find(s => !s.name.trim());
    if (stepWithoutName) { showToast('Todos los pasos deben tener nombre', 'warning'); return; }
    const stepBadCaptures = steps.find(s => s.captures < 1);
    if (stepBadCaptures) { showToast('Cada paso debe tener al menos 1 captura', 'warning'); return; }

    const now = new Date().toISOString();
    const study = {
      id: generateId('TST'),
      name,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      steps: steps.map(s => ({
        id: s.id,
        name: s.name.trim(),
        requiredCaptures: s.captures,
        captures: [],
        averageTime: null,
        isComplete: false
      }))
    };

    if (!Array.isArray(state.timeStudies)) state.timeStudies = [];
    state.timeStudies.push(study);
    state.timeStudyTab = 'records';
    saveState();
    closeModal();
    showToast(`Estudio "${name}" creado`, 'success');
    renderPage('timeStudy');
  });
}

function openTimeStudyDetailModal(studyId) {
  const study = (state.timeStudies || []).find(s => s.id === studyId);
  if (!study) return;

  const steps = study.steps || [];
  const { done, total } = tsProgressOf(study);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const completeSteps = steps.filter(s => s.isComplete).length;
  const pendingSteps = steps.length - completeSteps;
  const totalAvg = tsCalculateTotalAvg(study);
  const createdDate = study.createdAt ? new Date(study.createdAt).toLocaleDateString('es-MX') : '—';
  const updatedDate = study.updatedAt ? new Date(study.updatedAt).toLocaleDateString('es-MX') : '—';
  const completedDate = study.completedAt ? new Date(study.completedAt).toLocaleDateString('es-MX') : null;
  const isCompleted = study.status === 'completed';
  const canFinalize = !isCompleted && steps.length > 0 && steps.every(s => s.isComplete);

  const stepRows = steps.map((step, i) => {
    const taken = (step.captures || []).length;
    const needed = step.requiredCaptures || 0;
    const isComplete = step.isComplete || taken >= needed;
    const avg = step.averageTime != null ? fmtMs(step.averageTime) : '—';
    const stepPct = needed > 0 ? Math.round((taken / needed) * 100) : 0;
    return `
      <tr>
        <td class="font-mono" style="color:var(--text-muted)">${i + 1}</td>
        <td>${esc(step.name)}</td>
        <td class="text-right">${needed}</td>
        <td class="text-right">${taken}</td>
        <td style="min-width:80px">
          <div style="font-size:var(--font-12);color:var(--text-muted);margin-bottom:3px">${stepPct}%</div>
          <div class="ts-progress-bar"><div class="ts-progress-bar-fill" style="width:${stepPct}%"></div></div>
        </td>
        <td class="text-right font-mono">${avg}</td>
        <td>${isComplete
          ? '<span class="badge badge--success">Completo</span>'
          : '<span class="badge badge--neutral">Pendiente</span>'}</td>
        <td>
          <div class="ts-detail-actions">
            <button class="btn btn--ghost btn--sm" data-ts-action="captures"
              data-study-id="${esc(study.id)}" data-step-id="${esc(step.id)}">Ver capturas</button>
            <button class="btn ${isComplete ? 'btn--ghost' : 'btn--primary'} btn--sm"
              data-ts-action="stopwatch" data-study-id="${esc(study.id)}" data-step-id="${esc(step.id)}">
              ${isComplete ? 'Continuar' : 'Capturar'}
            </button>
            <button class="btn btn--ghost btn--sm ts-btn-danger" data-ts-action="repeat"
              data-study-id="${esc(study.id)}" data-step-id="${esc(step.id)}"
              data-step-name="${esc(step.name)}">Repetir</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  openModal(esc(study.name), `
    <div style="padding:var(--sp-5) var(--sp-6)">
      <div style="display:flex;align-items:center;gap:var(--sp-3);flex-wrap:wrap;margin-bottom:var(--sp-4)">
        ${tsBadgeForStatus(study.status)}
        <span style="color:var(--text-muted);font-size:var(--font-13)">Creado: ${createdDate}</span>
        <span style="color:var(--text-muted);font-size:var(--font-13)">Actualizado: ${updatedDate}</span>
        ${completedDate ? `<span style="color:var(--text-muted);font-size:var(--font-13)">Finalizado: ${completedDate}</span>` : ''}
      </div>

      <div class="ts-detail-summary">
        <div class="ts-detail-summary-title">Resumen del estudio</div>
        <div class="ts-detail-summary-grid">
          <div class="ts-detail-stat">
            <span class="ts-detail-stat-label">Pasos completos</span>
            <span class="ts-detail-stat-value ${pendingSteps > 0 ? 'ts-detail-stat-value--warn' : 'ts-detail-stat-value--ok'}">${completeSteps}/${steps.length}</span>
          </div>
          <div class="ts-detail-stat">
            <span class="ts-detail-stat-label">Pasos pendientes</span>
            <span class="ts-detail-stat-value ${pendingSteps > 0 ? 'ts-detail-stat-value--warn' : ''}">${pendingSteps}</span>
          </div>
          <div class="ts-detail-stat">
            <span class="ts-detail-stat-label">Capturas tomadas</span>
            <span class="ts-detail-stat-value">${done}/${total}</span>
          </div>
          <div class="ts-detail-stat">
            <span class="ts-detail-stat-label">Promedio total</span>
            <span class="ts-detail-stat-value font-mono">${totalAvg != null ? fmtMs(totalAvg) : '—'}</span>
          </div>
        </div>
        <div class="ts-progress-bar-wrap">
          <div class="ts-progress-bar-label">
            <span>Progreso general</span>
            <span>${done}/${total} capturas · ${pct}%</span>
          </div>
          <div class="ts-progress-bar"><div class="ts-progress-bar-fill" style="width:${pct}%"></div></div>
        </div>
      </div>

      <div style="overflow-x:auto;margin-bottom:var(--sp-5)">
        <table class="time-study-table">
          <thead>
            <tr>
              <th style="width:40px">No.</th>
              <th>Paso</th>
              <th class="text-right" style="width:80px">Requerid.</th>
              <th class="text-right" style="width:70px">Tomadas</th>
              <th style="width:90px">Progreso</th>
              <th class="text-right" style="width:90px">Promedio</th>
              <th style="width:90px">Estado</th>
              <th style="min-width:220px">Acciones</th>
            </tr>
          </thead>
          <tbody>${stepRows || '<tr><td colspan="8" style="text-align:center;color:var(--text-muted)">Sin pasos</td></tr>'}</tbody>
        </table>
      </div>

      <div class="modal-actions" style="margin-top:0">
        <button class="btn btn--ghost" id="tsd-close">Cerrar</button>
        ${isCompleted
          ? '<button class="btn btn--secondary" id="tsd-reopen">Reabrir estudio</button>'
          : `<button class="btn btn--primary" id="tsd-finalize"
               ${canFinalize ? '' : 'disabled'}
               title="${canFinalize ? 'Finalizar el estudio de tiempo' : 'Completa todos los pasos para poder finalizar'}">
               Finalizar estudio
             </button>`
        }
      </div>
    </div>
  `, 'modal-box--xl');

  document.getElementById('tsd-close')?.addEventListener('click', closeModal);

  if (isCompleted) {
    document.getElementById('tsd-reopen')?.addEventListener('click', () => {
      showConfirm(
        'Reabrir estudio',
        '¿Deseas reabrir este estudio? El estado cambiará a En progreso y podrás continuar o repetir pasos.',
        () => {
          tsReopenStudy(studyId);
          closeModal();
          showToast('Estudio reabierto', 'success');
          renderPage('timeStudy');
        }
      );
    });
  } else {
    document.getElementById('tsd-finalize')?.addEventListener('click', () => {
      if (!canFinalize) return;
      const incomplete = steps.filter(s => !s.isComplete);
      if (incomplete.length > 0) {
        showToast(`No puedes finalizar. Aún hay ${incomplete.length} paso(s) incompleto(s).`, 'warning');
        return;
      }
      showConfirm(
        'Finalizar estudio',
        '¿Confirmas finalizar este estudio de tiempo? Después podrás consultarlo desde Registros.',
        () => {
          if (tsFinalizeStudy(studyId)) {
            closeModal();
            showToast('Estudio finalizado exitosamente', 'success');
            renderPage('timeStudy');
          }
        }
      );
    });
  }

  document.querySelectorAll('[data-ts-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.tsAction;
      const sid = btn.dataset.studyId;
      const pid = btn.dataset.stepId;
      if (action === 'stopwatch') {
        closeModal();
        openStopwatchModal(sid, pid);
      } else if (action === 'captures') {
        openStepCapturesModal(sid, pid);
      } else if (action === 'repeat') {
        const stepName = btn.dataset.stepName;
        showConfirm(
          'Repetir paso',
          `¿Deseas repetir el paso "${stepName}"? Se eliminarán todas sus capturas actuales.`,
          () => {
            tsRepeatStep(sid, pid);
            showToast(`Capturas de "${stepName}" eliminadas`, 'info');
            openTimeStudyDetailModal(studyId);
          }
        );
      }
    });
  });
}

function openStepCapturesModal(studyId, stepId) {
  const study = tsGetStudy(studyId);
  if (!study) return;
  const step = tsGetStep(study, stepId);
  if (!step) return;

  const captures = step.captures || [];
  const avg = step.averageTime;
  const min = captures.length > 0 ? Math.min(...captures.map(c => c.valueMs)) : null;
  const max = captures.length > 0 ? Math.max(...captures.map(c => c.valueMs)) : null;
  const diff = (min != null && max != null) ? max - min : null;

  const rows = captures.length > 0
    ? captures.map((c, i) => `
        <tr>
          <td class="font-mono" style="color:var(--text-muted)">${i + 1}</td>
          <td>${esc(c.label || `Tiempo ${i + 1}`)}</td>
          <td class="text-right font-mono">${fmtMs(c.valueMs)}</td>
          <td class="text-right" style="color:var(--text-muted);font-size:var(--font-13)">${c.createdAt ? new Date(c.createdAt).toLocaleString('es-MX') : '—'}</td>
        </tr>
      `).join('')
    : `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:var(--sp-5)">Sin capturas registradas</td></tr>`;

  openModal(`Capturas · ${esc(step.name)}`, `
    <div style="padding:var(--sp-5) var(--sp-6)">
      <div style="color:var(--text-muted);font-size:var(--font-13);margin-bottom:var(--sp-4)">${esc(study.name)}</div>
      <div class="ts-capture-stats">
        <div class="ts-capture-stat">
          <span class="ts-capture-stat-label">Promedio</span>
          <span class="ts-capture-stat-value">${avg != null ? fmtMs(avg) : '—'}</span>
        </div>
        <div class="ts-capture-stat">
          <span class="ts-capture-stat-label">Mínimo</span>
          <span class="ts-capture-stat-value">${min != null ? fmtMs(min) : '—'}</span>
        </div>
        <div class="ts-capture-stat">
          <span class="ts-capture-stat-label">Máximo</span>
          <span class="ts-capture-stat-value">${max != null ? fmtMs(max) : '—'}</span>
        </div>
        <div class="ts-capture-stat">
          <span class="ts-capture-stat-label">Diferencia</span>
          <span class="ts-capture-stat-value">${diff != null ? fmtMs(diff) : '—'}</span>
        </div>
      </div>
      <div style="overflow-x:auto;margin-bottom:var(--sp-5)">
        <table class="time-study-table">
          <thead>
            <tr>
              <th style="width:40px">No.</th>
              <th>Captura</th>
              <th class="text-right" style="width:100px">Tiempo</th>
              <th class="text-right" style="width:160px">Fecha/Hora</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="modal-actions" style="margin-top:0">
        <button class="btn btn--ghost" id="tssc-back">← Volver al detalle</button>
        <button class="btn btn--ghost" id="tssc-close">Cerrar</button>
      </div>
    </div>
  `, 'modal-box--xl');

  document.getElementById('tssc-close')?.addEventListener('click', closeModal);
  document.getElementById('tssc-back')?.addEventListener('click', () => openTimeStudyDetailModal(studyId));
}

function openEditTimeStudyModal(studyId, onSave) {
  const study = (state.timeStudies || []).find(s => s.id === studyId);
  if (!study) return;

  let steps = (study.steps || []).map(s => ({
    id: s.id,
    name: s.name,
    captures: s.requiredCaptures || 1,
    takenCount: (s.captures || []).length
  }));

  function buildStepsHTML() {
    return steps.map((step, i) => {
      const minVal = step.takenCount > 0 ? step.takenCount : 1;
      return `
        <div class="ts-step-row" data-step-idx="${i}">
          <span class="ts-step-num">${i + 1}</span>
          <input class="form-input ts-step-name" type="text" placeholder="Nombre del paso"
            value="${esc(step.name)}" data-step-idx="${i}" />
          <input class="form-input ts-step-captures" type="number" min="${minVal}" step="1"
            value="${step.captures}" data-step-idx="${i}" style="width:80px;text-align:right"
            ${step.takenCount > 0 ? `title="Mínimo ${step.takenCount} (capturas ya tomadas)"` : ''} />
          <button class="btn btn--ghost btn--sm ts-step-remove" data-step-idx="${i}"
            ${steps.length === 1 ? 'disabled' : ''} title="Eliminar paso">&times;</button>
          <button class="btn btn--ghost btn--sm" disabled
            title="Disponible en la siguiente fase">Cronómetro</button>
        </div>
      `;
    }).join('');
  }

  function refreshStepsList() {
    const list = document.getElementById('tsc-steps-list');
    if (!list) return;
    list.innerHTML = buildStepsHTML();

    list.querySelectorAll('.ts-step-name').forEach(input => {
      input.addEventListener('input', () => { steps[parseInt(input.dataset.stepIdx)].name = input.value; });
    });

    list.querySelectorAll('.ts-step-captures').forEach(input => {
      input.addEventListener('change', () => {
        const idx  = parseInt(input.dataset.stepIdx);
        const minV = steps[idx].takenCount > 0 ? steps[idx].takenCount : 1;
        const val  = Math.max(minV, parseInt(input.value) || minV);
        steps[idx].captures = val;
        input.value = val;
      });
    });

    list.querySelectorAll('.ts-step-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.stepIdx);
        if (steps.length > 1) { steps.splice(idx, 1); refreshStepsList(); }
      });
    });
  }

  openModal('Editar estudio', `
    <div class="ts-creator-form">
      <div class="form-group">
        <label class="form-label" for="tsc-name">Nombre del estudio <span style="color:var(--danger)">*</span></label>
        <input class="form-input w-full" id="tsc-name" type="text" value="${esc(study.name)}" />
      </div>
      <div class="form-group">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--sp-2)">
          <label class="form-label" style="margin:0">Pasos / Operaciones <span style="color:var(--danger)">*</span></label>
          <button class="btn btn--ghost btn--sm" id="tsc-add-step">+ Agregar paso</button>
        </div>
        <div class="ts-step-header">
          <span></span><span>Nombre del paso</span>
          <span style="text-align:right">Capturas</span><span></span><span></span>
        </div>
        <div id="tsc-steps-list"></div>
      </div>
      <div class="modal-actions">
        <button class="btn btn--ghost" id="tsc-cancel">Cancelar</button>
        <button class="btn btn--primary" id="tsc-save">Guardar cambios</button>
      </div>
    </div>
  `);

  refreshStepsList();

  document.getElementById('tsc-cancel')?.addEventListener('click', closeModal);

  document.getElementById('tsc-add-step')?.addEventListener('click', () => {
    steps.push({ id: generateId('STP'), name: '', captures: 3, takenCount: 0 });
    refreshStepsList();
  });

  document.getElementById('tsc-save')?.addEventListener('click', () => {
    const name = document.getElementById('tsc-name')?.value.trim() || '';
    if (!name)                              { showToast('El nombre del estudio es requerido', 'warning'); return; }
    if (steps.length === 0)                 { showToast('Agrega al menos un paso', 'warning'); return; }
    if (steps.find(s => !s.name.trim()))    { showToast('Todos los pasos deben tener nombre', 'warning'); return; }
    if (steps.find(s => s.captures < 1))   { showToast('Cada paso debe tener al menos 1 captura', 'warning'); return; }

    const existing = (state.timeStudies || []).find(s => s.id === studyId);
    if (!existing) return;

    existing.name      = name;
    existing.updatedAt = new Date().toISOString();
    existing.steps = steps.map(s => {
      const prev = (existing.steps || []).find(p => p.id === s.id);
      return {
        id: s.id,
        name: s.name.trim(),
        requiredCaptures: s.captures,
        captures:    prev ? (prev.captures    || [])   : [],
        averageTime: prev ? (prev.averageTime || null) : null,
        isComplete:  prev ? (prev.isComplete  || false): false
      };
    });

    if (onSave) onSave();
    closeModal();
    showToast(`Estudio "${name}" actualizado`, 'success');
  });
}

function tsDuplicateStudy(studyId) {
  const original = (state.timeStudies || []).find(s => s.id === studyId);
  if (!original) return;
  const now  = new Date().toISOString();
  const copy = {
    id:        generateId('TST'),
    name:      `${original.name} (Copia)`,
    status:    'draft',
    createdAt: now,
    updatedAt: now,
    steps: (original.steps || []).map(step => ({
      id:               generateId('STP'),
      name:             step.name,
      requiredCaptures: step.requiredCaptures,
      captures:         [],
      averageTime:      null,
      isComplete:       false
    }))
  };
  if (!Array.isArray(state.timeStudies)) state.timeStudies = [];
  state.timeStudies.push(copy);
  saveState();
  showToast(`Estudio duplicado como "${copy.name}"`, 'success');
}

function tsDeleteStudy(studyId, container) {
  const study = (state.timeStudies || []).find(s => s.id === studyId);
  if (!study) return;
  showConfirm(
    'Eliminar estudio',
    `¿Eliminar "${study.name}"? Esta acción no se puede deshacer.`,
    () => {
      state.timeStudies = (state.timeStudies || []).filter(s => s.id !== studyId);
      saveState();
      showToast('Estudio eliminado', 'success');
      renderTSRecordsSection(container);
    }
  );
}

// ── Time Study: capture data layer ────────────
function tsGetStudy(studyId) {
  return (state.timeStudies || []).find(s => s.id === studyId) || null;
}

function tsGetStep(study, stepId) {
  return (study?.steps || []).find(s => s.id === stepId) || null;
}

function tsRecalcStep(step) {
  const captures = step.captures || [];
  step.isComplete = captures.length >= step.requiredCaptures;
  if (captures.length > 0) {
    const sum = captures.reduce((total, c) => total + c.valueMs, 0);
    step.averageTime = sum / captures.length;
  } else {
    step.averageTime = null;
  }
}

function tsUpdateStudyStatus(study) {
  const steps = study.steps || [];
  if (steps.length === 0) { study.status = 'draft'; study.completedAt = null; return; }
  const totalCaptures = steps.reduce((sum, s) => sum + (s.captures || []).length, 0);
  if (totalCaptures === 0) { study.status = 'draft'; study.completedAt = null; return; }
  const allComplete = steps.every(s => s.isComplete);
  if (study.status === 'completed' && !allComplete) {
    study.status = 'in_progress';
    study.completedAt = null;
  } else if (study.status !== 'completed') {
    study.status = 'in_progress';
  }
}

function tsAddCapture(studyId, stepId, valueMs) {
  const study = tsGetStudy(studyId);
  if (!study) return false;
  const step = tsGetStep(study, stepId);
  if (!step) return false;
  if (!Array.isArray(step.captures)) step.captures = [];
  if (step.captures.length >= step.requiredCaptures) return false;
  step.captures.push({
    id: generateId('CAP'),
    valueMs,
    label: `Tiempo ${step.captures.length + 1}`,
    createdAt: new Date().toISOString()
  });
  tsRecalcStep(step);
  tsUpdateStudyStatus(study);
  study.updatedAt = new Date().toISOString();
  saveState();
  return true;
}

function tsDiscardLastCapture(studyId, stepId) {
  const study = tsGetStudy(studyId);
  if (!study) return false;
  const step = tsGetStep(study, stepId);
  if (!step || !Array.isArray(step.captures) || step.captures.length === 0) return false;
  step.captures.pop();
  tsRecalcStep(step);
  tsUpdateStudyStatus(study);
  study.updatedAt = new Date().toISOString();
  saveState();
  return true;
}

// ── Time Study: Phase 4 helpers ───────────────
function tsCalculateTotalAvg(study) {
  const stepsWithAvg = (study.steps || []).filter(s => s.isComplete && s.averageTime != null);
  if (stepsWithAvg.length === 0) return null;
  return stepsWithAvg.reduce((sum, s) => sum + s.averageTime, 0) / stepsWithAvg.length;
}

function tsRepeatStep(studyId, stepId) {
  const study = tsGetStudy(studyId);
  if (!study) return false;
  const step = tsGetStep(study, stepId);
  if (!step) return false;
  step.captures = [];
  step.averageTime = null;
  step.isComplete = false;
  tsUpdateStudyStatus(study);
  study.updatedAt = new Date().toISOString();
  saveState();
  return true;
}

function tsFinalizeStudy(studyId) {
  const study = tsGetStudy(studyId);
  if (!study) return false;
  if (!(study.steps || []).every(s => s.isComplete)) return false;
  const now = new Date().toISOString();
  study.status = 'completed';
  study.completedAt = now;
  study.updatedAt = now;
  saveState();
  return true;
}

function tsReopenStudy(studyId) {
  const study = tsGetStudy(studyId);
  if (!study) return false;
  study.status = 'in_progress';
  study.completedAt = null;
  study.updatedAt = new Date().toISOString();
  saveState();
  return true;
}

// ── Time Study: Phase 5 — export / import ─────
function sanitizeFilename(name) {
  return String(name || '').toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'estudio';
}

function tsExportStudy(studyId) {
  const study = tsGetStudy(studyId);
  if (!study) return;
  const blob = new Blob([JSON.stringify(study, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `estudio-tiempo-${sanitizeFilename(study.name)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`Estudio "${study.name}" exportado`, 'success');
}

function tsExportAllStudies() {
  const studies = state.timeStudies || [];
  if (studies.length === 0) { showToast('No hay estudios para exportar', 'warning'); return; }
  const blob = new Blob([JSON.stringify(studies, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'kaiflow-estudios-tiempo-backup.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`${studies.length} estudio(s) exportados`, 'success');
}

function tsImportStudiesFromJSON(jsonText, sectionContainer) {
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    showToast('Archivo JSON inválido o dañado', 'danger');
    return;
  }

  const list = Array.isArray(parsed)
    ? parsed
    : (parsed && typeof parsed === 'object' && parsed.id ? [parsed] : null);

  if (!list || list.length === 0) {
    showToast('El archivo no contiene estudios de tiempo reconocibles', 'danger');
    return;
  }

  const valid = list.filter(s => s && typeof s === 'object' && s.name && Array.isArray(s.steps));
  if (valid.length === 0) {
    showToast('Ningún estudio en el archivo tiene formato válido', 'danger');
    return;
  }

  showConfirm(
    'Importar estudios',
    `Se importarán ${valid.length} estudio(s) desde este archivo. No se eliminarán tus estudios actuales. ¿Deseas continuar?`,
    () => {
      const existingIds = new Set((state.timeStudies || []).map(s => s.id));
      const now = new Date().toISOString();
      const imported = valid.map(s => {
        const needsNewId = !s.id || existingIds.has(s.id);
        return {
          id: needsNewId ? generateId('TST') : s.id,
          name: s.name || 'Sin nombre',
          status: ['draft', 'in_progress', 'completed'].includes(s.status) ? s.status : 'draft',
          createdAt: s.createdAt || now,
          updatedAt: s.updatedAt || now,
          completedAt: s.completedAt || null,
          steps: (s.steps || []).map(step => ({
            id: step.id || generateId('STP'),
            name: step.name || '',
            requiredCaptures: Math.max(1, Number(step.requiredCaptures) || 1),
            captures: Array.isArray(step.captures) ? step.captures : [],
            averageTime: step.averageTime != null ? Number(step.averageTime) : null,
            isComplete: Boolean(step.isComplete)
          }))
        };
      });
      if (!Array.isArray(state.timeStudies)) state.timeStudies = [];
      state.timeStudies.push(...imported);
      saveState();
      showToast(`${imported.length} estudio(s) importados correctamente`, 'success');
      renderTSRecordsSection(sectionContainer);
    }
  );
}

function _bindTSImportInput(container, sectionContainer) {
  const input = container.querySelector('#ts-import-input');
  if (!input) return;
  input.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      tsImportStudiesFromJSON(evt.target.result, sectionContainer);
      input.value = '';
    };
    reader.readAsText(file);
  });
}

// ── Stopwatch: core ───────────────────────────
function swGetElapsed() {
  if (!_sw.active) return _sw.elapsedMs;
  return _sw.elapsedMs + (Date.now() - _sw.startMs);
}

function swStop() {
  if (_sw.rafId) { cancelAnimationFrame(_sw.rafId); _sw.rafId = null; }
  if (_sw.active) {
    _sw.elapsedMs += Date.now() - _sw.startMs;
    _sw.active = false;
  }
}

function swLoop() {
  const display = document.getElementById('sw-timer-display');
  if (display && _sw.active) {
    display.textContent = fmtMs(swGetElapsed());
    _sw.rafId = requestAnimationFrame(swLoop);
  }
}

function buildCapturesHTML(step) {
  const captures = step.captures || [];
  if (captures.length === 0) {
    return `<div class="sw-no-captures">Aún no hay capturas</div>`;
  }
  return `
    <table class="sw-captures-table">
      <thead><tr><th>Captura</th><th class="text-right">Tiempo</th></tr></thead>
      <tbody>
        ${captures.map(c => `
          <tr>
            <td>${esc(c.label || '')}</td>
            <td class="text-right font-mono">${fmtMs(c.valueMs)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function buildStopwatchHTML(study, step) {
  const taken      = (step.captures || []).length;
  const needed     = step.requiredCaptures || 0;
  const isComplete = step.isComplete || taken >= needed;
  const remaining  = Math.max(0, needed - taken);

  return `
    <div class="sw-box">
      <div class="sw-header">
        <div class="sw-study-name">${esc(study.name)}</div>
        <button class="sw-close-btn" id="sw-close" aria-label="Cerrar">&times;</button>
      </div>

      <div class="sw-step-info">
        <span class="sw-step-name">${esc(step.name)}</span>
        <span class="sw-step-progress">${taken}/${needed}</span>
        <span class="sw-step-status ${isComplete ? 'sw-status--complete' : 'sw-status--pending'}">
          ${isComplete ? 'Completado' : 'Pendiente'}
        </span>
      </div>

      <div class="sw-mode-selector">
        <label class="sw-mode-opt">
          <input type="radio" name="sw-mode" value="reset" ${_sw.mode === 'reset' ? 'checked' : ''} />
          <span>Reiniciar por vuelta</span>
        </label>
        <label class="sw-mode-opt">
          <input type="radio" name="sw-mode" value="continuous" ${_sw.mode === 'continuous' ? 'checked' : ''} />
          <span>Modo continuo</span>
        </label>
      </div>

      <div class="sw-timer-display" id="sw-timer-display">${fmtMs(_sw.elapsedMs)}</div>

      <div class="sw-controls">
        <button class="btn sw-btn sw-btn--start" id="sw-start">${_sw.active ? 'Pausar' : 'Iniciar'}</button>
        <button class="btn sw-btn sw-btn--lap" id="sw-lap" ${isComplete ? 'disabled' : ''}>Vuelta</button>
        <button class="btn sw-btn sw-btn--secondary" id="sw-reset">Reiniciar</button>
        <button class="btn sw-btn sw-btn--secondary" id="sw-discard" ${taken === 0 ? 'disabled' : ''}>Descartar última</button>
        <button class="btn sw-btn sw-btn--secondary" id="sw-repeat" ${taken === 0 ? 'disabled' : ''}>Repetir última</button>
      </div>

      <div class="sw-captures-section">
        <div class="sw-captures-header">
          <span>Capturas</span>
          ${step.averageTime != null ? `<span class="sw-avg">Promedio: <strong>${fmtMs(step.averageTime)}</strong></span>` : '<span></span>'}
        </div>
        <div class="sw-captures-list" id="sw-captures-list">${buildCapturesHTML(step)}</div>
        <div class="sw-captures-remaining" id="sw-captures-remaining">
          ${isComplete ? 'Paso completado' : remaining > 0 ? `Capturas restantes: <strong>${remaining}</strong>` : ''}
        </div>
      </div>
    </div>
  `;
}

function swRefreshStepInfo(overlay) {
  const study = tsGetStudy(_sw.studyId);
  const step  = tsGetStep(study, _sw.stepId);
  if (!study || !step) return;

  const taken      = (step.captures || []).length;
  const needed     = step.requiredCaptures || 0;
  const isComplete = step.isComplete;
  const remaining  = Math.max(0, needed - taken);

  const progressEl   = overlay.querySelector('.sw-step-progress');
  const statusEl     = overlay.querySelector('.sw-step-status');
  const lapBtn       = overlay.querySelector('#sw-lap');
  const discardBtn   = overlay.querySelector('#sw-discard');
  const repeatBtn    = overlay.querySelector('#sw-repeat');
  const capturesList = overlay.querySelector('#sw-captures-list');
  const remainingEl  = overlay.querySelector('#sw-captures-remaining');
  const captHeaderEl = overlay.querySelector('.sw-captures-header');

  if (progressEl) progressEl.textContent = `${taken}/${needed}`;
  if (statusEl) {
    statusEl.textContent = isComplete ? 'Completado' : 'Pendiente';
    statusEl.className = `sw-step-status ${isComplete ? 'sw-status--complete' : 'sw-status--pending'}`;
  }
  if (lapBtn)     lapBtn.disabled     = isComplete;
  if (discardBtn) discardBtn.disabled = taken === 0;
  if (repeatBtn)  repeatBtn.disabled  = taken === 0;
  if (capturesList) capturesList.innerHTML = buildCapturesHTML(step);
  if (remainingEl) remainingEl.innerHTML = isComplete
    ? 'Paso completado'
    : remaining > 0 ? `Capturas restantes: <strong>${remaining}</strong>` : '';
  if (captHeaderEl) {
    const avgSpan = captHeaderEl.querySelector('.sw-avg');
    if (step.averageTime != null) {
      if (avgSpan) avgSpan.innerHTML = `Promedio: <strong>${fmtMs(step.averageTime)}</strong>`;
      else captHeaderEl.innerHTML = `<span>Capturas</span><span class="sw-avg">Promedio: <strong>${fmtMs(step.averageTime)}</strong></span>`;
    }
  }

  if (isComplete) {
    swStop();
    const startBtn = overlay.querySelector('#sw-start');
    if (startBtn) { startBtn.textContent = 'Iniciar'; startBtn.className = 'btn sw-btn sw-btn--start'; }
    showToast(`Paso "${step.name}" completado`, 'success');
  }
}

function bindStopwatchEvents(overlay) {
  overlay.querySelector('#sw-close').addEventListener('click', closeStopwatchModal);

  overlay.querySelectorAll('[name="sw-mode"]').forEach(radio => {
    radio.addEventListener('change', () => { _sw.mode = radio.value; });
  });

  const startBtn = overlay.querySelector('#sw-start');
  startBtn.addEventListener('click', () => {
    if (_sw.active) {
      swStop();
      startBtn.textContent = 'Iniciar';
      startBtn.className = 'btn sw-btn sw-btn--start';
    } else {
      _sw.startMs = Date.now();
      _sw.active  = true;
      startBtn.textContent = 'Pausar';
      startBtn.className = 'btn sw-btn sw-btn--pause';
      swLoop();
    }
  });

  overlay.querySelector('#sw-lap').addEventListener('click', () => {
    if (!_sw.active) { showToast('Inicia el cronómetro antes de registrar una vuelta', 'warning'); return; }
    const step = tsGetStep(tsGetStudy(_sw.studyId), _sw.stepId);
    if (!step || step.isComplete) return;

    const elapsed = swGetElapsed();
    let captureMs;
    if (_sw.mode === 'continuous') {
      captureMs    = elapsed - _sw.lastLapMs;
      _sw.lastLapMs = elapsed;
    } else {
      captureMs   = elapsed;
      _sw.elapsedMs = 0;
      _sw.startMs   = Date.now();
      _sw.lastLapMs  = 0;
    }

    if (!tsAddCapture(_sw.studyId, _sw.stepId, Math.round(captureMs))) {
      showToast('No se pudo registrar la captura', 'warning');
      return;
    }
    if (_sw.mode === 'reset') {
      const display = overlay.querySelector('#sw-timer-display');
      if (display) display.textContent = '00:00.00';
    }
    swRefreshStepInfo(overlay);
  });

  overlay.querySelector('#sw-reset').addEventListener('click', () => {
    if (_sw.active) _sw.startMs = Date.now();
    _sw.elapsedMs  = 0;
    _sw.lastLapMs   = 0;
    const display = overlay.querySelector('#sw-timer-display');
    if (display) display.textContent = '00:00.00';
  });

  overlay.querySelector('#sw-discard').addEventListener('click', () => {
    if (!tsDiscardLastCapture(_sw.studyId, _sw.stepId)) return;
    swRefreshStepInfo(overlay);
    showToast('Última captura descartada', 'info');
  });

  overlay.querySelector('#sw-repeat').addEventListener('click', () => {
    if (!tsDiscardLastCapture(_sw.studyId, _sw.stepId)) return;
    _sw.elapsedMs  = 0;
    _sw.lastLapMs   = 0;
    if (_sw.active) _sw.startMs = Date.now();
    const display = overlay.querySelector('#sw-timer-display');
    if (display) display.textContent = '00:00.00';
    swRefreshStepInfo(overlay);
    showToast('Captura eliminada. Cronómetro listo para repetir.', 'info');
  });
}

function openStopwatchModal(studyId, stepId) {
  const study = tsGetStudy(studyId);
  if (!study) return;
  const step = tsGetStep(study, stepId);
  if (!step) return;

  swStop();
  _sw = { active: false, startMs: 0, elapsedMs: 0, lastLapMs: 0, mode: 'reset', studyId, stepId, rafId: null };

  const overlay = document.createElement('div');
  overlay.className = 'sw-overlay';
  overlay.id        = 'sw-overlay';
  overlay.innerHTML = buildStopwatchHTML(study, step);
  document.body.appendChild(overlay);

  bindStopwatchEvents(overlay);

  if (_sw.active) swLoop();
}

function closeStopwatchModal() {
  swStop();
  const overlay = document.getElementById('sw-overlay');
  if (overlay) overlay.remove();
  renderPage('timeStudy');
}

function renderTSFrequencySection(container) {
  ensureTimeStudyStructure();
  const { station, subset } = getSelectedTimeStudyContext();
  const stationTotal = calculateStationTimeStudyTotal(station);
  const subsetTotal = calculateSubsetTotal(subset);
  const totalAcrossSubsets = state.timeStudyStructure.reduce((sum, st) => sum + calculateStationTimeStudyTotal(st), 0);

  const stationButtons = state.timeStudyStructure.map(st => `
    <button class="btn ${st.id === station.id ? 'btn--primary' : 'btn--secondary'} btn--sm" data-ts-station="${esc(st.id)}">
      ${esc(st.name)}
    </button>
  `).join('');

  const subsetButtons = station.subconjuntos.map(sub => `
    <button class="btn ${sub.id === subset.id ? 'btn--primary' : 'btn--ghost'} btn--sm" data-ts-subset="${esc(sub.id)}">
      ${esc(sub.name)}
      <span class="badge badge--neutral" style="margin-left:4px">${fmt(calculateSubsetTotal(sub), 2)}s</span>
    </button>
  `).join('');

  container.innerHTML = `
    <div class="entity-grid mb-6" style="grid-template-columns:repeat(auto-fill,minmax(180px,1fr))">
      <div class="entity-card">
        <div class="entity-card-label">Estación seleccionada</div>
        <div class="entity-card-name">${esc(station.name)}</div>
        <div class="entity-card-meta">${fmt(stationTotal, 2)} seg acumulados</div>
      </div>
      <div class="entity-card">
        <div class="entity-card-label">Subconjunto</div>
        <div class="entity-card-name">${esc(subset.name)}</div>
        <div class="entity-card-meta">${subset.actividades.length} actividades</div>
      </div>
      <div class="entity-card">
        <div class="entity-card-label">Total subconjunto</div>
        <div class="entity-card-name" id="ts-subset-total-card" style="color:var(--green-600)">${fmt(subsetTotal, 2)}<span style="font-size:var(--font-14);font-weight:500;color:var(--text-muted)"> seg</span></div>
        <div class="entity-card-meta">Suma de TC</div>
      </div>
      <div class="entity-card">
        <div class="entity-card-label">Total estudios</div>
        <div class="entity-card-name">${fmt(totalAcrossSubsets, 2)}<span style="font-size:var(--font-14);font-weight:500;color:var(--text-muted)"> seg</span></div>
        <div class="entity-card-meta">Todas las estaciones</div>
      </div>
    </div>

    <div class="card mb-6">
      <div class="card-header">
        <div>
          <div class="card-title">Selección de estación y subconjunto</div>
          <div class="card-subtitle">Cada subconjunto conserva sus propias frecuencias</div>
        </div>
      </div>
      <div class="card-body">
        <div class="time-study-selector">
          <div>
            <div class="form-label">Estación</div>
            <div class="btn-group">${stationButtons}</div>
          </div>
          <div>
            <div class="form-label">Subconjunto</div>
            <div class="btn-group">${subsetButtons}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="two-col-layout">
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">${esc(station.name)} · ${esc(subset.name)}</div>
            <div class="card-subtitle">TC = STD × Frecuencia</div>
          </div>
          <button class="btn btn--ghost btn--sm" id="ts-reset-subset">Limpiar frecuencias</button>
        </div>
        <div style="overflow-x:auto;border-radius:0 0 var(--radius-lg) var(--radius-lg)">
          <table class="time-study-table">
            <thead>
              <tr>
                <th style="width:56px">No.</th>
                <th>Actividad</th>
                <th class="text-right" style="width:100px">STD</th>
                <th class="text-right" style="width:140px">Frecuencia</th>
                <th class="text-right" style="width:100px">TC</th>
              </tr>
            </thead>
            <tbody>
              ${subset.actividades.map(activity => `
                <tr>
                  <td class="font-mono" style="color:var(--text-muted)">${activity.no}</td>
                  <td>${esc(activity.name)}</td>
                  <td class="text-right font-mono">${fmt(activity.std, 2)}</td>
                  <td class="text-right">
                    <input
                      class="form-input time-study-frequency"
                      data-activity-id="${esc(activity.activityId)}"
                      type="number"
                      min="0"
                      step="0.01"
                      value="${activity.frequency}"
                    />
                  </td>
                  <td class="text-right font-mono">
                    <strong data-tc="${esc(activity.activityId)}">${fmt(calculateActivityTC(activity), 2)}</strong>
                  </td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="4" style="text-align:right;font-weight:700">Total Subconjunto</td>
                <td class="text-right font-mono"><strong id="ts-subset-total">${fmt(subsetTotal, 2)}</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:var(--sp-4)">
        <div class="card">
          <div class="card-header">
            <div class="card-title">Totales por subconjunto</div>
          </div>
          <div class="card-body">
            <div class="time-study-total-list">
              ${state.timeStudyStructure.map(st => `
                <div class="time-study-total-group">
                  <div class="time-study-total-station">
                    <span>${esc(st.name)}</span>
                    <strong>${fmt(calculateStationTimeStudyTotal(st), 2)}s</strong>
                  </div>
                  ${st.subconjuntos.map(sub => `
                    <button class="time-study-total-row ${sub.id === subset.id ? 'active' : ''}" data-ts-jump="${esc(st.id)}:${esc(sub.id)}">
                      <span>${esc(sub.name)}</span>
                      <strong>${fmt(calculateSubsetTotal(sub), 2)}s</strong>
                    </button>
                  `).join('')}
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div class="card-title">Reglas de cálculo</div>
          </div>
          <div class="card-body">
            <div class="time-study-rule">
              <span>Frecuencia = 0</span>
              <strong>TC = 0.00s</strong>
            </div>
            <div class="time-study-rule">
              <span>Frecuencia editable</span>
              <strong>Actualiza TC</strong>
            </div>
            <div class="time-study-rule">
              <span>Total Subconjunto</span>
              <strong>Suma de TC</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  container.querySelectorAll('[data-ts-station]').forEach(btn => {
    btn.addEventListener('click', () => {
      const nextStation = state.timeStudyStructure.find(st => st.id === btn.dataset.tsStation);
      if (!nextStation) return;
      state.timeStudySelection.stationId = nextStation.id;
      state.timeStudySelection.subsetId = nextStation.subconjuntos[0]?.id;
      saveState();
      renderTSFrequencySection(container);
    });
  });

  container.querySelectorAll('[data-ts-subset]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.timeStudySelection.subsetId = btn.dataset.tsSubset;
      saveState();
      renderTSFrequencySection(container);
    });
  });

  container.querySelectorAll('[data-ts-jump]').forEach(btn => {
    btn.addEventListener('click', () => {
      const [stationId, subsetId] = btn.dataset.tsJump.split(':');
      state.timeStudySelection.stationId = stationId;
      state.timeStudySelection.subsetId = subsetId;
      saveState();
      renderTSFrequencySection(container);
    });
  });

  container.querySelectorAll('.time-study-frequency').forEach(input => {
    input.addEventListener('input', () => {
      const activity = subset.actividades.find(item => item.activityId === input.dataset.activityId);
      if (!activity) return;
      const value = Math.max(0, parseFloat(input.value) || 0);
      activity.frequency = Math.round(value * 100) / 100;
      const tc = calculateActivityTC(activity);
      const tcEl = container.querySelector(`[data-tc="${activity.activityId}"]`);
      if (tcEl) tcEl.textContent = fmt(tc, 2);
      const total = calculateSubsetTotal(subset);
      const totalEl = container.querySelector('#ts-subset-total');
      const cardEl = container.querySelector('#ts-subset-total-card');
      if (totalEl) totalEl.textContent = fmt(total, 2);
      if (cardEl) cardEl.innerHTML = `${fmt(total, 2)}<span style="font-size:var(--font-14);font-weight:500;color:var(--text-muted)"> seg</span>`;
      saveState();
    });
  });

  container.querySelector('#ts-reset-subset')?.addEventListener('click', () => {
    subset.actividades.forEach(activity => { activity.frequency = 0; });
    saveState();
    renderTSFrequencySection(container);
    showToast(`Frecuencias limpiadas para ${subset.name}`, 'success');
  });
}

function _bnkSimApplyReduction(assignments, bottleneckStation, pct) {
  const factor = 1 - pct / 100;
  return assignments.map(a => {
    if (a.station !== bottleneckStation) return a;
    return Object.assign({}, a, { standardTime: Math.round(a.standardTime * factor * 10) / 10 });
  });
}

function renderBalance(container) {
  const s         = state.balanceSettings;
  const ops       = getActiveOperations();
  const takt      = calculateTaktTime(s);
  const twc       = calculateTotalWorkContent(ops);
  const reqOps    = calculateRequiredOperators(twc, takt);
  const available = calculateAvailableTime(s);

  if (!state.stationAssignments.length) {
    state.stationAssignments = autoBalanceOperations();
  }

  const stationLoads = calculateStationLoads(state.stationAssignments);
  const numStations  = Object.keys(stationLoads).length;
  const bottleneck   = detectBottleneck(stationLoads);
  const efficiency   = calculateEfficiency(twc, numStations, takt);
  const capacity     = calculateCapacity(bottleneck.load);
  const hasOver      = bottleneck.load > takt;
  const cvSim        = _yamazumiComputeChart(state.stationAssignments, takt, ops);

  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Balanceo de Línea</h1>
      <p class="page-subtitle">Asignación de operaciones a estaciones · ${esc(state.line.name)}</p>
    </div>

    <div class="card mb-6">
      <div class="card-header"><div class="card-title">Parámetros del Turno</div></div>
      <div class="card-body">
        <div class="form-row" style="grid-template-columns:repeat(auto-fill,minmax(145px,1fr))">
          <div class="form-group">
            <label class="form-label" for="bal-qty">Piezas / turno</label>
            <input class="form-input" id="bal-qty" type="number" min="1" value="${s.requiredQuantity}" />
          </div>
          <div class="form-group">
            <label class="form-label" for="bal-hrs">Horas turno</label>
            <input class="form-input" id="bal-hrs" type="number" min="1" max="12" step="0.5" value="${s.shiftHours}" />
          </div>
          <div class="form-group">
            <label class="form-label" for="bal-brk">Descanso (min)</label>
            <input class="form-input" id="bal-brk" type="number" min="0" value="${s.breakMinutes}" />
          </div>
          <div class="form-group">
            <label class="form-label" for="bal-mtg">Reuniones (min)</label>
            <input class="form-input" id="bal-mtg" type="number" min="0" value="${s.meetingMinutes}" />
          </div>
          <div class="form-group">
            <label class="form-label">Tiempo disponible</label>
            <input class="form-input font-mono" value="${available.toLocaleString('es-MX')} seg" readonly
              style="background:var(--surface-bg)" />
          </div>
          <div class="form-group">
            <label class="form-label">Takt Time</label>
            <input class="form-input font-mono" value="${fmt(takt)} seg" readonly
              style="background:var(--green-50);color:var(--green-700);font-weight:700" />
          </div>
          <div class="form-group">
            <label class="form-label" for="bal-st">Est. deseadas</label>
            <input class="form-input" id="bal-st" type="number" min="1" value="${s.desiredStations}" />
          </div>
        </div>
      </div>
    </div>

    <div class="kpi-grid mb-6">
      <div class="kpi-card">
        <div class="kpi-label">Contenido de trabajo</div>
        <div class="kpi-value">${twc}<span class="kpi-unit">seg</span></div>
        <div class="kpi-meta">${ops.length} operaciones activas</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Operadores teóricos</div>
        <div class="kpi-value">${fmt(twc / takt, 2)}</div>
        <div class="kpi-meta">mín. ${reqOps} requeridos</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Estaciones actuales</div>
        <div class="kpi-value kpi-value--green">${numStations}</div>
      </div>
      <div class="kpi-card ${efficiency < 70 ? 'kpi-card--warning' : ''}">
        <div class="kpi-label">Eficiencia de balanceo</div>
        <div class="kpi-value ${efficiency >= 80 ? 'kpi-value--green' : efficiency >= 65 ? 'kpi-value--warning' : 'kpi-value--danger'}">${fmtPct(efficiency)}</div>
        <div class="kpi-meta">${efficiency >= 80 ? 'Óptima' : efficiency >= 65 ? 'Aceptable' : 'Mejorar asignación'}</div>
      </div>
      <div class="kpi-card ${hasOver ? 'kpi-card--danger' : ''}">
        <div class="kpi-label">Ciclo / cuello de botella</div>
        <div class="kpi-value" style="color:${hasOver ? 'var(--danger)' : 'var(--text-primary)'}">
          ${fmt(bottleneck.load)}<span class="kpi-unit">seg</span>
        </div>
        <div class="kpi-meta">Estación ${bottleneck.station}${hasOver ? ' ⚠ Sobrecargada' : ' (mayor carga)'}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Capacidad / hora</div>
        <div class="kpi-value">${capacity}</div>
        <div class="kpi-meta">piezas por hora</div>
      </div>
    </div>

    <div class="card mb-6">
      <div class="card-header bsim-header" id="bsim-toggle" style="cursor:pointer;user-select:none">
        <div>
          <div class="card-title">Simulador de Mejora — Cuello de Botella</div>
          <div class="card-subtitle">Arrastra el slider para aplanar Est.&nbsp;${bottleneck.station} y ver el impacto en tiempo real</div>
        </div>
        <span id="bsim-chevron" style="font-size:18px;color:var(--text-muted)">▾</span>
      </div>
      <div id="bsim-body" class="card-body">
        <div class="bsim-slider-wrap">
          <div class="bsim-slider-labels">
            <span style="color:var(--text-muted);font-size:var(--font-12)">Sin mejora</span>
            <div style="display:flex;flex-direction:column;align-items:center;gap:2px">
              <span id="bsim-pct-label" style="font-size:var(--font-32);font-weight:800;color:var(--green-700);line-height:1;font-variant-numeric:tabular-nums">0%</span>
              <span style="font-size:var(--font-11);color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px">reducción</span>
            </div>
            <span style="color:var(--text-muted);font-size:var(--font-12)">−50%</span>
          </div>
          <input type="range" class="bsim-range" id="bsim-range" min="0" max="50" step="1" value="0" />
          <div class="bsim-range-ticks">
            ${Array.from({length:6},(_,i)=>`<span>${i*10}%</span>`).join('')}
          </div>
        </div>
        <div class="bsim-kpis">
          <div class="bsim-kpi">
            <div class="bsim-kpi-label">Ciclo simulado</div>
            <div class="bsim-kpi-val" id="bsim-cycle">${fmt(bottleneck.load)}<span class="bsim-kpi-unit">s</span></div>
            <div class="bsim-kpi-meta">antes: ${fmt(bottleneck.load)} s</div>
          </div>
          <div class="bsim-kpi">
            <div class="bsim-kpi-label">Eficiencia</div>
            <div class="bsim-kpi-val" id="bsim-eff">${fmtPct(efficiency)}</div>
            <div class="bsim-kpi-meta">antes: ${fmtPct(efficiency)}</div>
          </div>
          <div class="bsim-kpi">
            <div class="bsim-kpi-label">Capacidad / hora</div>
            <div class="bsim-kpi-val" id="bsim-cap">${capacity}<span class="bsim-kpi-unit">pzas</span></div>
            <div class="bsim-kpi-meta">antes: ${capacity} pzas/h</div>
          </div>
          <div class="bsim-kpi">
            <div class="bsim-kpi-label">Estado vs Takt</div>
            <div class="bsim-kpi-val" id="bsim-status" style="color:${hasOver ? 'var(--danger)' : 'var(--success)'};font-size:var(--font-14)">
              ${hasOver ? '⚠ Sobre Takt' : '✓ Dentro de Takt'}
            </div>
            <div class="bsim-kpi-meta">Takt: ${fmt(takt)} s</div>
          </div>
        </div>
        <div id="bsim-chart" style="margin-top:var(--sp-2)">
          ${_yamazumiChartHTML(cvSim, takt, 200)}
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">Asignación por Estación</div>
          <div class="card-subtitle">Edita la columna "Estación" para reasignación manual</div>
        </div>
        <button class="btn btn--primary btn--sm" id="btn-auto-bal">↺ Auto-Balancear</button>
      </div>

      <div class="station-chips">
        ${Object.entries(stationLoads)
          .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
          .map(([st, load]) => {
            const cls = load > takt ? 'over' : load / takt > 0.9 ? 'warn' : 'ok';
            return `<div class="station-chip station-chip--${cls}">
              <span class="station-chip-label">Est. ${st}</span>
              <span class="station-chip-value">${fmt(load)}s</span>
            </div>`;
          }).join('')}
      </div>

      <div style="overflow-x:auto;border-radius:0 0 var(--radius-lg) var(--radius-lg)">
        <table>
          <thead>
            <tr>
              <th style="width:44px">#</th>
              <th>Operación</th>
              <th style="width:100px">Tiempo (s)</th>
              <th style="width:140px">Estación</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            ${buildBalanceRows(state.stationAssignments, stationLoads, takt)}
          </tbody>
        </table>
      </div>
    </div>
  `;

  ['bal-qty','bal-hrs','bal-brk','bal-mtg','bal-st'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
      state.balanceSettings.requiredQuantity = parseInt(document.getElementById('bal-qty').value)   || 900;
      state.balanceSettings.shiftHours       = parseFloat(document.getElementById('bal-hrs').value) || 8;
      state.balanceSettings.breakMinutes     = parseInt(document.getElementById('bal-brk').value)   || 0;
      state.balanceSettings.meetingMinutes   = parseInt(document.getElementById('bal-mtg').value)   || 0;
      state.balanceSettings.desiredStations  = parseInt(document.getElementById('bal-st').value)    || 8;
      state.stationAssignments = autoBalanceOperations();
      saveState();
      renderBalance(document.getElementById('main-content'));
    });
  });

  document.getElementById('btn-auto-bal')?.addEventListener('click', () => {
    state.stationAssignments = autoBalanceOperations();
    saveState();
    renderBalance(document.getElementById('main-content'));
    showToast('Balance automático aplicado', 'success');
  });

  container.querySelectorAll('.station-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const assign = state.stationAssignments.find(a => a.operationId === sel.dataset.opId);
      if (assign) assign.station = parseInt(sel.value);
      saveState();
      renderBalance(document.getElementById('main-content'));
    });
  });

  // ── Bottleneck Simulator ──
  const bsimUpdate = (pct) => {
    const rangeEl = document.getElementById('bsim-range');
    if (rangeEl) {
      const fillPct = (pct / 50) * 100;
      rangeEl.style.background = `linear-gradient(to right, var(--green-500) ${fillPct}%, var(--border) ${fillPct}%)`;
    }
    const baseAssigns = state.stationAssignments.length ? state.stationAssignments : autoBalanceOperations();
    const simAssigns  = _bnkSimApplyReduction(baseAssigns, bottleneck.station, pct);
    const simLoads    = calculateStationLoads(simAssigns);
    const simBnk      = detectBottleneck(simLoads);
    const simNumSt    = Object.keys(simLoads).length;
    const simEff      = calculateEfficiency(twc, simNumSt, takt);
    const simCap      = calculateCapacity(simBnk.load);
    const simOver     = simBnk.load > takt;

    const pctEl  = document.getElementById('bsim-pct-label');
    const cycleEl = document.getElementById('bsim-cycle');
    const effEl  = document.getElementById('bsim-eff');
    const capEl  = document.getElementById('bsim-cap');
    const statEl = document.getElementById('bsim-status');

    if (pctEl)   pctEl.textContent  = pct + '%';
    if (cycleEl) cycleEl.innerHTML  = fmt(simBnk.load) + '<span class="bsim-kpi-unit">s</span>';
    if (effEl)   effEl.textContent  = fmtPct(simEff);
    if (capEl)   capEl.innerHTML    = simCap + '<span class="bsim-kpi-unit">pzas</span>';
    if (statEl) {
      statEl.textContent = simOver ? '⚠ Sobre Takt' : '✓ Dentro de Takt';
      statEl.style.color = simOver ? 'var(--danger)' : 'var(--success)';
    }

    const cv2  = _yamazumiComputeChart(simAssigns, takt, ops);
    const chrEl = document.getElementById('bsim-chart');
    if (chrEl) chrEl.innerHTML = _yamazumiChartHTML(cv2, takt, 200);
  };

  document.getElementById('bsim-range')?.addEventListener('input', e => {
    bsimUpdate(parseInt(e.target.value));
  });

  document.getElementById('bsim-toggle')?.addEventListener('click', () => {
    const body    = document.getElementById('bsim-body');
    const chevron = document.getElementById('bsim-chevron');
    if (!body) return;
    const isOpen = body.style.display !== 'none';
    body.style.display = isOpen ? 'none' : '';
    if (chevron) chevron.textContent = isOpen ? '▸' : '▾';
  });
}

// ── Yamazumi helpers ──────────────────────────
function _yamazumiComputeChart(assignments, takt, ops) {
  const stationLoads = calculateStationLoads(assignments);
  const numStations  = Object.keys(stationLoads).length;
  const bottleneck   = detectBottleneck(stationLoads);
  const twc          = calculateTotalWorkContent(ops);
  const efficiency   = calculateEfficiency(twc, numStations, takt);
  const byStation    = {};
  assignments.forEach(a => {
    if (!byStation[a.station]) byStation[a.station] = [];
    byStation[a.station].push(a);
  });
  const stations   = Object.keys(byStation).map(Number).sort((a, b) => a - b);
  const opColorMap = {};
  ops.forEach((op, i) => { opColorMap[op.id] = (i % 10) + 1; });
  return { stationLoads, numStations, bottleneck, twc, efficiency, byStation, stations, opColorMap };
}

function _yamazumiKpiHTML(cv, takt, ops, s) {
  return `
    <div class="entity-card">
      <div class="entity-card-label">Takt Time</div>
      <div class="entity-card-name" style="color:var(--green-600)">${fmt(takt)}<span style="font-size:14px;font-weight:500;color:var(--text-muted)"> seg</span></div>
      <div class="entity-card-meta">${s.requiredQuantity} piezas / turno</div>
    </div>
    <div class="entity-card">
      <div class="entity-card-label">Estaciones</div>
      <div class="entity-card-name">${cv.numStations}</div>
      <div class="entity-card-meta">${ops.length} operaciones activas</div>
    </div>
    <div class="entity-card">
      <div class="entity-card-label">Cuello de Botella</div>
      <div class="entity-card-name" style="color:${cv.bottleneck.load > takt ? 'var(--danger)' : 'var(--text-primary)'}">Est. ${cv.bottleneck.station}</div>
      <div class="entity-card-meta">${fmt(cv.bottleneck.load)} seg${cv.bottleneck.load > takt ? ' ⚠ Sobrecargada' : ''}</div>
    </div>
    <div class="entity-card">
      <div class="entity-card-label">Eficiencia</div>
      <div class="entity-card-name" style="color:${cv.efficiency >= 80 ? 'var(--success)' : cv.efficiency >= 65 ? 'var(--warning)' : 'var(--danger)'}">${fmtPct(cv.efficiency)}</div>
      <div class="entity-card-meta">${cv.efficiency >= 80 ? 'Óptima' : cv.efficiency >= 65 ? 'Aceptable' : 'Mejorar balance'}</div>
    </div>
  `;
}

function _yamazumiChartHTML(cv, takt, chartH = 340) {
  const CHART_H  = chartH, LABEL_H = 42, TOTAL_H = CHART_H + LABEL_H;
  const maxLoad  = Math.max(...Object.values(cv.stationLoads), takt);
  const maxVal   = Math.ceil((maxLoad * 1.2) / 10) * 10;
  const scale    = CHART_H / maxVal;
  const taktPx   = Math.round(takt * scale);
  const tickStep = maxVal <= 60 ? 10 : 20;
  const ticks    = Array.from({ length: Math.floor(maxVal / tickStep) + 1 }, (_, i) => i * tickStep);

  return `
    <div style="display:flex;gap:0;overflow:hidden">
      <div style="position:relative;height:${TOTAL_H}px;width:48px;flex-shrink:0;border-right:2px solid var(--border-strong);margin-right:var(--sp-2)">
        ${ticks.map(t => {
          const btm = LABEL_H + Math.round(t * scale);
          return `<div style="position:absolute;bottom:${btm}px;left:0;right:0;display:flex;align-items:center;justify-content:flex-end;transform:translateY(50%)">
            <span style="font-size:10px;color:var(--text-muted);font-variant-numeric:tabular-nums;margin-right:5px;line-height:1">${t}</span>
            <div style="width:5px;height:1px;background:var(--border-strong)"></div>
          </div>`;
        }).join('')}
        <div style="position:absolute;bottom:${LABEL_H}px;left:0;right:0;height:2px;background:var(--border-strong)"></div>
      </div>
      <div style="flex:1;overflow-x:auto;overflow-y:hidden">
        <div style="position:relative;height:${TOTAL_H}px;min-width:${cv.stations.length * 104 + 16}px">
          ${ticks.map(t => `<div style="position:absolute;bottom:${LABEL_H + Math.round(t * scale)}px;left:0;right:0;height:1px;background:var(--border);pointer-events:none"></div>`).join('')}
          <div style="position:absolute;bottom:${LABEL_H + taktPx}px;left:0;right:0;border-top:2px dashed var(--takt-line);z-index:10;pointer-events:none">
            <span style="position:absolute;right:4px;top:-19px;font-size:10px;font-weight:700;color:var(--takt-line);background:white;padding:1px 5px;border-radius:3px;white-space:nowrap;border:1px solid rgba(220,38,38,0.25)">Takt ${fmt(takt)}s</span>
          </div>
          <div style="position:absolute;bottom:0;left:var(--sp-2);right:var(--sp-2);display:flex;gap:var(--sp-3)">
            ${cv.stations.map(stNum => {
              const stOps  = cv.byStation[stNum].sort((a, b) => a.sequence - b.sequence);
              const load   = cv.stationLoads[stNum] || 0;
              const barH   = Math.round(load * scale);
              const isOver = load > takt;
              const isBot  = stNum === cv.bottleneck.station;
              const outline = isBot
                ? 'outline:3px solid var(--danger);outline-offset:2px;box-shadow:0 0 16px rgba(220,38,38,0.22);'
                : isOver ? 'outline:2px solid var(--danger);outline-offset:1px;' : '';
              return `
                <div style="width:90px;flex-shrink:0;position:relative">
                  <div style="position:absolute;bottom:${LABEL_H + barH + 3}px;left:0;right:0;text-align:center;font-size:11px;font-weight:700;color:${isOver ? 'var(--danger)' : 'var(--text-primary)'};font-variant-numeric:tabular-nums;z-index:8;pointer-events:none;text-shadow:0 1px 0 white">${fmt(load)}s</div>
                  <div style="height:${CHART_H}px;display:flex;flex-direction:column-reverse;overflow:hidden;border-radius:var(--radius-sm) var(--radius-sm) 0 0;${outline}">
                    ${stOps.map(a => {
                      const segH     = Math.max(Math.round(a.standardTime * scale), 2);
                      const colorIdx = cv.opColorMap[a.operationId] || 1;
                      const showLbl  = segH >= 18;
                      return `<div style="height:${segH}px;flex-shrink:0;width:100%;background:var(--op-${colorIdx});display:flex;align-items:center;justify-content:center;border-top:1px solid rgba(255,255,255,0.18);transition:filter 0.12s ease;cursor:default"
                        title="${esc(a.name)}: ${a.standardTime}s"
                        onmouseover="this.style.filter='brightness(1.14)'"
                        onmouseout="this.style.filter=''">
                        ${showLbl ? `<span style="font-size:10px;font-weight:600;color:rgba(255,255,255,0.93);text-shadow:0 1px 2px rgba(0,0,0,0.35);pointer-events:none;font-variant-numeric:tabular-nums">${a.standardTime}s</span>` : ''}
                      </div>`;
                    }).join('')}
                  </div>
                  <div style="height:${LABEL_H}px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding-top:var(--sp-1)">
                    <span style="font-size:12px;font-weight:700;color:${isBot || isOver ? 'var(--danger)' : 'var(--text-secondary)'}">Est. ${stNum}</span>
                    ${isBot ? '<span style="font-size:9px;font-weight:700;color:var(--danger);text-transform:uppercase;letter-spacing:0.4px">⚠ Bottleneck</span>' : ''}
                  </div>
                </div>`;
            }).join('')}
          </div>
        </div>
      </div>
    </div>`;
}

function _yamazumiSummaryRows(cv, takt) {
  return cv.stations.map(stNum => {
    const load   = cv.stationLoads[stNum] || 0;
    const idle   = takt - load;
    const pct    = Math.round((load / takt) * 100);
    const isOver = load > takt;
    const isBot  = stNum === cv.bottleneck.station;
    return `
      <tr class="${isOver ? 'row--overload' : ''}">
        <td><strong>Est. ${stNum}</strong>${isBot ? '<span class="badge badge--danger" style="margin-left:4px;font-size:10px">Bottleneck</span>' : ''}</td>
        <td class="font-mono" style="color:${isOver ? 'var(--danger)' : 'var(--text-primary)'}"><strong>${fmt(load)}</strong></td>
        <td class="font-mono" style="color:${idle < 0 ? 'var(--danger)' : 'var(--text-muted)'}">${idle >= 0 ? fmt(idle) : '+' + fmt(-idle)}</td>
        <td>
          <div style="display:flex;align-items:center;gap:6px">
            <div class="takt-bar-bg"><div class="takt-bar-fill ${isOver ? 'takt-bar-fill--over' : ''}" style="width:${Math.min(pct,100)}%"></div></div>
            <span class="font-mono" style="font-size:var(--font-12);min-width:36px;color:${isOver ? 'var(--danger)' : 'var(--text-secondary)'}">${pct}%</span>
          </div>
        </td>
        <td>${isOver ? '<span class="badge badge--danger">⚠ Sobrecargada</span>' : pct > 90 ? '<span class="badge badge--warning">Al límite</span>' : '<span class="badge badge--success">OK</span>'}</td>
      </tr>`;
  }).join('');
}

function renderYamazumi(container) {
  if (!_redistribActive && !state.stationAssignments.length) {
    state.stationAssignments = autoBalanceOperations();
  }

  const s    = state.balanceSettings;
  const takt = calculateTaktTime(s);
  const ops  = getActiveOperations();
  const assignments = _redistribActive ? _redistribAssignments : state.stationAssignments;
  const cv   = _yamazumiComputeChart(assignments, takt, ops);
  const maxSt = cv.numStations + 3;

  const redistribPanel = _redistribActive ? `
    <div class="card mb-4" style="border:2px solid var(--info)">
      <div style="padding:var(--sp-4) var(--sp-5);border-bottom:1px solid rgba(37,99,235,0.15);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:var(--sp-3);background:var(--info-bg);border-radius:var(--radius-lg) var(--radius-lg) 0 0">
        <div>
          <div style="font-size:var(--font-14);font-weight:700;color:var(--info)">Modo Redistribución activo</div>
          <div style="font-size:var(--font-12);color:var(--text-secondary);margin-top:2px">Cambia la estación de cada operación. La gráfica se actualiza en tiempo real.</div>
        </div>
        <div style="display:flex;gap:var(--sp-2);flex-wrap:wrap">
          <button class="btn btn--primary btn--sm" id="btn-redistrib-apply">Aplicar al estado actual</button>
          <button class="btn btn--secondary btn--sm" id="btn-redistrib-save">Guardar como Escenario</button>
          <button class="btn btn--ghost btn--sm" id="btn-redistrib-cancel">Cancelar</button>
        </div>
      </div>
      <div style="overflow-x:auto">
        <table class="table">
          <thead>
            <tr>
              <th>Seq.</th>
              <th>Operación</th>
              <th class="text-right">Tiempo (s)</th>
              <th>Estación asignada</th>
              <th>Carga est.</th>
            </tr>
          </thead>
          <tbody>
            ${ops.map(op => {
              const current = (_redistribAssignments.find(a => a.operationId === op.id)?.station) || 1;
              const colorIdx = cv.opColorMap[op.id] || 1;
              const stLoad   = cv.stationLoads[current] || 0;
              const isOver   = stLoad > takt;
              const stOptions = Array.from({ length: maxSt }, (_, i) => i + 1)
                .map(n => `<option value="${n}" ${n === current ? 'selected' : ''}>Est. ${n}</option>`)
                .join('');
              return `<tr>
                <td style="color:var(--text-muted)">${op.sequence}</td>
                <td>
                  <div style="display:flex;align-items:center;gap:var(--sp-2)">
                    <div style="width:10px;height:10px;border-radius:2px;background:var(--op-${colorIdx});flex-shrink:0"></div>
                    ${esc(op.name)}
                  </div>
                </td>
                <td class="text-right font-mono">${op.standardTime}</td>
                <td>
                  <select class="form-input redistrib-select" data-op-id="${esc(op.id)}"
                    style="width:auto;min-width:90px;padding:4px 8px;font-size:var(--font-12)">
                    ${stOptions}
                  </select>
                </td>
                <td class="font-mono" style="color:${isOver ? 'var(--danger)' : 'var(--text-secondary)'}">
                  ${fmt(stLoad)}s ${isOver ? '⚠' : ''}
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  ` : '';

  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Yamazumi${_redistribActive ? ' <span style="font-size:var(--font-14);font-weight:500;color:var(--info);vertical-align:middle">[Redistribución]</span>' : ''}</h1>
      <p class="page-subtitle">Gráfica de balance por estación · Takt: ${fmt(takt)} seg · ${esc(state.line.name)}</p>
    </div>

    ${!_redistribActive ? `
    <div class="btn-group mb-4 no-print">
      <button class="btn btn--secondary" id="btn-redistrib-open">
        <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><line x1="3" y1="6" x2="17" y2="6"/><line x1="3" y1="10" x2="11" y2="10"/><line x1="3" y1="14" x2="14" y2="14"/><circle cx="15" cy="10" r="2.5"/><path d="M15 7.5v-2M15 12.5v2"/></svg>
        Redistribuir operaciones
      </button>
      <button class="btn btn--ghost" data-nav="balance">Ir a Balanceo manual</button>
    </div>` : redistribPanel}

    <div id="yama-kpi-cards" class="entity-grid mb-6" style="grid-template-columns:repeat(auto-fill,minmax(170px,1fr))">
      ${_yamazumiKpiHTML(cv, takt, ops, s)}
    </div>

    <div class="card mb-6">
      <div class="card-header">
        <div class="card-title">Gráfica Yamazumi</div>
        <div class="yama-takt-legend">
          <div class="yama-takt-legend-line"></div>
          <span>Línea de Takt (${fmt(takt)} seg)</span>
        </div>
      </div>
      <div class="card-body" style="padding:var(--sp-4) var(--sp-5)">
        <div id="yama-chart-area">${_yamazumiChartHTML(cv, takt)}</div>
      </div>
    </div>

    <div class="two-col-layout">
      <div class="card">
        <div class="card-header"><div class="card-title">Leyenda de Operaciones</div></div>
        <div class="card-body" style="padding:var(--sp-3) var(--sp-5)">
          <div style="display:flex;flex-direction:column;gap:var(--sp-2)">
            ${ops.map((op, i) => {
              const colorIdx = (i % 10) + 1;
              return `<div style="display:flex;align-items:center;gap:var(--sp-2)">
                <div style="width:14px;height:14px;border-radius:3px;flex-shrink:0;background:var(--op-${colorIdx})"></div>
                <div style="flex:1;font-size:var(--font-12);color:var(--text-secondary)">
                  <span style="color:var(--text-muted);margin-right:2px">${op.sequence}.</span>${esc(op.name)}
                </div>
                <span style="font-size:var(--font-12);color:var(--text-muted);font-variant-numeric:tabular-nums;flex-shrink:0">${op.standardTime}s</span>
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">Resumen por Estación</div></div>
        <div style="overflow-x:auto;border-radius:0 0 var(--radius-lg) var(--radius-lg)">
          <table>
            <thead>
              <tr>
                <th>Estación</th><th>Carga (s)</th><th>Inactivo (s)</th>
                <th style="width:150px">% Takt</th><th>Estado</th>
              </tr>
            </thead>
            <tbody id="yama-station-summary">
              ${_yamazumiSummaryRows(cv, takt)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  // ── Event listeners ──
  if (_redistribActive) {
    // Live partial refresh when station selector changes
    container.querySelectorAll('.redistrib-select').forEach(sel => {
      sel.addEventListener('change', () => {
        const a = _redistribAssignments.find(x => x.operationId === sel.dataset.opId);
        if (a) a.station = parseInt(sel.value);
        const cv2 = _yamazumiComputeChart(_redistribAssignments, takt, ops);
        const kpiEl  = container.querySelector('#yama-kpi-cards');
        const chrEl  = container.querySelector('#yama-chart-area');
        const sumEl  = container.querySelector('#yama-station-summary');
        if (kpiEl) kpiEl.innerHTML = _yamazumiKpiHTML(cv2, takt, ops, s);
        if (chrEl) chrEl.innerHTML = _yamazumiChartHTML(cv2, takt);
        if (sumEl) sumEl.innerHTML = _yamazumiSummaryRows(cv2, takt);
        // Update station-load column in redistrib table
        container.querySelectorAll('.redistrib-select').forEach(s2 => {
          const st2   = parseInt(s2.value);
          const load2 = cv2.stationLoads[st2] || 0;
          const over2 = load2 > takt;
          const td    = s2.closest('tr')?.lastElementChild;
          if (td) td.innerHTML = `<span class="font-mono" style="color:${over2 ? 'var(--danger)' : 'var(--text-secondary)'}">${fmt(load2)}s ${over2 ? '⚠' : ''}</span>`;
        });
      });
    });

    container.querySelector('#btn-redistrib-apply')?.addEventListener('click', () => {
      state.stationAssignments = deepClone(_redistribAssignments);
      _redistribActive = false;
      _redistribAssignments = null;
      saveState();
      renderYamazumi(container);
      showToast('Distribución aplicada al estado actual', 'success');
    });

    container.querySelector('#btn-redistrib-save')?.addEventListener('click', () => {
      openModal('Guardar como Escenario', `
        <div class="form-group">
          <label class="form-label" for="rsave-name">Nombre <span style="color:var(--danger)">*</span></label>
          <input class="form-input w-full" id="rsave-name" type="text" placeholder="Ej. Redistribución optimizada"/>
        </div>
        <div class="form-group">
          <label class="form-label" for="rsave-desc">Descripción</label>
          <input class="form-input w-full" id="rsave-desc" type="text" placeholder="Descripción breve del escenario"/>
        </div>
        <div class="modal-actions">
          <button class="btn btn--ghost" id="rsave-cancel">Cancelar</button>
          <button class="btn btn--primary" id="rsave-ok">Guardar Escenario</button>
        </div>
      `);
      document.getElementById('rsave-cancel').addEventListener('click', closeModal);
      document.getElementById('rsave-ok').addEventListener('click', () => {
        const name = document.getElementById('rsave-name').value.trim();
        if (!name) { showToast('El nombre es requerido', 'warning'); return; }
        const newScn = {
          id: generateId('SCN'), name,
          description: document.getElementById('rsave-desc').value.trim(),
          isBaseline: false, isCustom: true,
          params: {
            requiredQuantity: state.balanceSettings.requiredQuantity,
            shiftHours:       state.balanceSettings.shiftHours,
            breakMinutes:     state.balanceSettings.breakMinutes,
            meetingMinutes:   state.balanceSettings.meetingMinutes,
            extraOperators:   0,
            improvementOperationId: null,
            improvementPercent: 0,
            customAssignments: deepClone(_redistribAssignments)
          }
        };
        state.scenarios.push(newScn);
        saveState();
        closeModal();
        showToast(`Escenario "${name}" guardado. Puedes verlo en Escenarios.`, 'success');
      });
    });

    container.querySelector('#btn-redistrib-cancel')?.addEventListener('click', () => {
      _redistribActive = false;
      _redistribAssignments = null;
      renderYamazumi(container);
    });
  } else {
    container.querySelector('#btn-redistrib-open')?.addEventListener('click', () => {
      _redistribActive = true;
      _redistribAssignments = deepClone(state.stationAssignments);
      renderYamazumi(container);
    });
    container.querySelectorAll('[data-nav]').forEach(el => {
      el.addEventListener('click', () => navigate(el.dataset.nav));
    });
  }
}

// ── Scenario engine ───────────────────────────
function autoBalanceForOps(ops, takt) {
  const assignments = [];
  let station = 1, stationLoad = 0;
  ops.forEach(op => {
    if (stationLoad + op.standardTime <= takt || stationLoad === 0) {
      stationLoad += op.standardTime;
    } else {
      station++;
      stationLoad = op.standardTime;
    }
    assignments.push({
      operationId: op.id, station,
      standardTime: op.standardTime,
      sequence: op.sequence, name: op.name
    });
  });
  return assignments;
}

function computeScenario(scenario) {
  const p = scenario.params;
  const settings = {
    requiredQuantity: p.requiredQuantity,
    shiftHours:       p.shiftHours,
    breakMinutes:     p.breakMinutes,
    meetingMinutes:   p.meetingMinutes
  };
  const available = calculateAvailableTime(settings);
  const takt      = available / p.requiredQuantity;

  const ops = state.operations
    .filter(op => op.active)
    .map(op => {
      if (p.improvementOperationId === op.id && p.improvementPercent > 0) {
        return { ...op, standardTime: op.standardTime * (1 - p.improvementPercent / 100) };
      }
      return { ...op };
    });

  const twc = calculateTotalWorkContent(ops);

  let assignments;
  if (p.customAssignments && p.customAssignments.length) {
    // Custom redistribution scenario — update standardTimes from modified ops
    assignments = p.customAssignments.map(ca => {
      const op = ops.find(o => o.id === ca.operationId);
      return op ? { ...ca, standardTime: op.standardTime, name: op.name, sequence: op.sequence } : ca;
    });
  } else {
    assignments = autoBalanceForOps(ops, takt);
  }

  const loads = calculateStationLoads(assignments);
  let numStations   = Object.keys(loads).length;
  const bottleneck  = detectBottleneck(loads);

  numStations += (p.extraOperators || 0);

  const efficiency = calculateEfficiency(twc, numStations, takt);
  const capacity   = calculateCapacity(bottleneck.load);
  const maxLoad    = bottleneck.load;

  let feasibility;
  if (maxLoad > takt)        feasibility = 'red';
  else if (maxLoad > takt * 0.9) feasibility = 'yellow';
  else                       feasibility = 'green';

  return { takt, available, twc, numStations, efficiency, bottleneck, capacity, feasibility };
}

function openNewScenarioModal() {
  const opOptions = state.operations
    .filter(o => o.active)
    .map(o => `<option value="${esc(o.id)}">${esc(o.name)} (${o.standardTime}s)</option>`)
    .join('');

  openModal('Nuevo Escenario', `
    <div class="form-row">
      <div class="form-group" style="flex:2">
        <label class="form-label" for="scn-name">Nombre <span style="color:var(--danger)">*</span></label>
        <input class="form-input w-full" id="scn-name" type="text" placeholder="Ej. Demanda +15%"/>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label" for="scn-desc">Descripción</label>
      <input class="form-input w-full" id="scn-desc" type="text" placeholder="Descripción breve del escenario"/>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label" for="scn-qty">Demanda (piezas/turno)</label>
        <input class="form-input" id="scn-qty" type="number" min="1" value="${state.balanceSettings.requiredQuantity}"/>
      </div>
      <div class="form-group">
        <label class="form-label" for="scn-hours">Horas de turno</label>
        <input class="form-input" id="scn-hours" type="number" min="1" max="24" step="0.5" value="${state.balanceSettings.shiftHours}"/>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label" for="scn-break">Descanso (min)</label>
        <input class="form-input" id="scn-break" type="number" min="0" value="${state.balanceSettings.breakMinutes}"/>
      </div>
      <div class="form-group">
        <label class="form-label" for="scn-meet">Reuniones (min)</label>
        <input class="form-input" id="scn-meet" type="number" min="0" value="${state.balanceSettings.meetingMinutes}"/>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label" for="scn-extra">Operadores extra</label>
        <input class="form-input" id="scn-extra" type="number" min="0" value="0"/>
        <span class="form-hint">Se suman a las estaciones calculadas</span>
      </div>
    </div>
    <fieldset style="border:1px solid var(--border);border-radius:var(--radius-sm);padding:var(--sp-3) var(--sp-4);margin-top:var(--sp-2)">
      <legend style="font-size:var(--font-12);font-weight:600;padding:0 var(--sp-2);color:var(--text-secondary)">Mejora de operación (opcional)</legend>
      <div class="form-row">
        <div class="form-group" style="flex:2">
          <label class="form-label" for="scn-op">Operación a mejorar</label>
          <select class="form-input" id="scn-op">
            <option value="">— Ninguna —</option>
            ${opOptions}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" for="scn-pct">% de reducción</label>
          <input class="form-input" id="scn-pct" type="number" min="0" max="99" step="1" value="0"/>
        </div>
      </div>
    </fieldset>

    <fieldset id="scn-dist-fieldset" style="border:1px solid var(--border);border-radius:var(--radius-sm);padding:var(--sp-3) var(--sp-4);margin-top:var(--sp-3)">
      <legend style="font-size:var(--font-12);font-weight:600;padding:0 var(--sp-2);color:var(--text-secondary)">Distribución de operaciones (opcional)</legend>
      <label style="display:flex;align-items:center;gap:var(--sp-2);cursor:pointer;font-size:var(--font-14);margin-bottom:var(--sp-2)">
        <input type="checkbox" id="scn-custom-dist"/>
        <span>Definir distribución manual de operaciones</span>
      </label>
      <div id="scn-dist-table" style="display:none;margin-top:var(--sp-2)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--sp-2)">
          <span style="font-size:var(--font-12);color:var(--text-muted)">Asigna cada operación a una estación</span>
          <button class="btn btn--ghost btn--sm" type="button" id="scn-dist-recalc">↺ Recalcular sugerencia</button>
        </div>
        <div style="overflow-x:auto;border:1px solid var(--border);border-radius:var(--radius-sm)">
          <table class="table" style="margin:0">
            <thead><tr><th>Seq.</th><th>Operación</th><th class="text-right">Tiempo (s)</th><th>Estación</th></tr></thead>
            <tbody id="scn-dist-tbody"></tbody>
          </table>
        </div>
      </div>
    </fieldset>

    <div class="modal-actions">
      <button class="btn btn--ghost" id="scn-cancel">Cancelar</button>
      <button class="btn btn--primary" id="scn-save">Crear Escenario</button>
    </div>
  `);

  // Helper: build assignment rows for a given takt
  function _buildDistRows(takt) {
    const ops = getActiveOperations();
    const suggested = autoBalanceForOps(ops, takt);
    const maxSt = Object.keys(calculateStationLoads(suggested)).length + 3;
    return ops.map(op => {
      const current = suggested.find(a => a.operationId === op.id)?.station || 1;
      const opts = Array.from({ length: maxSt }, (_, i) => i + 1)
        .map(n => `<option value="${n}" ${n === current ? 'selected' : ''}>Est. ${n}</option>`).join('');
      return `<tr>
        <td style="color:var(--text-muted)">${op.sequence}</td>
        <td style="font-size:var(--font-12)">${esc(op.name)}</td>
        <td class="text-right font-mono">${op.standardTime}</td>
        <td><select class="form-input scn-dist-select" data-op-id="${esc(op.id)}"
          style="width:auto;min-width:80px;padding:3px 6px;font-size:var(--font-12)">${opts}</select></td>
      </tr>`;
    }).join('');
  }

  const customDistChk = document.getElementById('scn-custom-dist');
  const distTable = document.getElementById('scn-dist-table');
  const distTbody = document.getElementById('scn-dist-tbody');

  function getCurrentTakt() {
    const qty   = parseFloat(document.getElementById('scn-qty').value) || state.balanceSettings.requiredQuantity;
    const hours = parseFloat(document.getElementById('scn-hours').value) || 8;
    const brk   = parseInt(document.getElementById('scn-break').value) || 0;
    const mtg   = parseInt(document.getElementById('scn-meet').value) || 0;
    const avail = (hours * 3600) - (brk * 60) - (mtg * 60);
    return avail / qty;
  }

  customDistChk.addEventListener('change', () => {
    if (customDistChk.checked) {
      distTbody.innerHTML = _buildDistRows(getCurrentTakt());
      distTable.style.display = 'block';
    } else {
      distTable.style.display = 'none';
    }
  });

  document.getElementById('scn-dist-recalc').addEventListener('click', () => {
    distTbody.innerHTML = _buildDistRows(getCurrentTakt());
  });

  document.getElementById('scn-cancel').addEventListener('click', closeModal);
  document.getElementById('scn-save').addEventListener('click', () => {
    const name = document.getElementById('scn-name').value.trim();
    if (!name) { showToast('El nombre es requerido', 'warning'); return; }
    const qty = parseFloat(document.getElementById('scn-qty').value) || state.balanceSettings.requiredQuantity;
    if (qty <= 0) { showToast('La demanda debe ser mayor a 0', 'warning'); return; }

    let customAssignments = null;
    if (customDistChk.checked) {
      const ops = getActiveOperations();
      customAssignments = [...document.querySelectorAll('.scn-dist-select')].map(sel => {
        const op = ops.find(o => o.id === sel.dataset.opId);
        return op ? {
          operationId: op.id,
          station: parseInt(sel.value),
          standardTime: op.standardTime,
          sequence: op.sequence,
          name: op.name
        } : null;
      }).filter(Boolean);
    }

    const newScenario = {
      id: generateId('SCN'),
      name,
      description: document.getElementById('scn-desc').value.trim(),
      isBaseline: false,
      isCustom: true,
      params: {
        requiredQuantity:       qty,
        shiftHours:             parseFloat(document.getElementById('scn-hours').value) || 8,
        breakMinutes:           parseInt(document.getElementById('scn-break').value) || 0,
        meetingMinutes:         parseInt(document.getElementById('scn-meet').value) || 0,
        extraOperators:         parseInt(document.getElementById('scn-extra').value) || 0,
        improvementOperationId: document.getElementById('scn-op').value || null,
        improvementPercent:     parseFloat(document.getElementById('scn-pct').value) || 0,
        customAssignments
      }
    };

    state.scenarios.push(newScenario);
    saveState();
    closeModal();
    renderScenarios(document.getElementById('main-content'));
    showToast(`Escenario "${name}" creado`, 'success');
  });
}

function renderScenarios(container) {
  const computed = state.scenarios.map(scn => ({ scn, result: computeScenario(scn) }));

  const feasibilityLabel = { green: 'Factible', yellow: 'Al límite', red: 'No factible' };
  const feasibilityText  = { green: 'Ninguna estación supera el takt', yellow: 'Alguna estación supera 90% del takt', red: 'Estación supera el takt' };

  const cardsHTML = computed.map(({ scn, result: r }) => `
    <div class="scenario-card scenario-card--${scn.isBaseline ? 'baseline' : r.feasibility}">
      <div class="scenario-card-header">
        <div>
          <div class="scenario-card-name">${esc(scn.name)}${scn.isBaseline ? ' <span style="font-size:10px;color:var(--text-muted);font-weight:500">(Base)</span>' : ''}</div>
          <div class="scenario-card-desc">${esc(scn.description)}</div>
        </div>
        <span class="feasibility-badge feasibility-badge--${r.feasibility}" title="${feasibilityText[r.feasibility]}">
          ${feasibilityLabel[r.feasibility]}
        </span>
      </div>
      <div class="scenario-kpi-row">
        <div class="scenario-kpi">
          <div class="scenario-kpi-label">Takt</div>
          <div class="scenario-kpi-value">${fmt(r.takt)}<span style="font-size:11px;font-weight:500;color:var(--text-muted)"> seg</span></div>
        </div>
        <div class="scenario-kpi">
          <div class="scenario-kpi-label">Estaciones</div>
          <div class="scenario-kpi-value">${r.numStations}</div>
        </div>
        <div class="scenario-kpi">
          <div class="scenario-kpi-label">Eficiencia</div>
          <div class="scenario-kpi-value" style="color:${r.efficiency >= 80 ? 'var(--success)' : r.efficiency >= 65 ? 'var(--warning)' : 'var(--danger)'}">${fmtPct(r.efficiency)}</div>
        </div>
        <div class="scenario-kpi">
          <div class="scenario-kpi-label">Cap./hora</div>
          <div class="scenario-kpi-value">${r.capacity}</div>
        </div>
      </div>
      <div style="font-size:var(--font-12);color:var(--text-secondary)">
        <strong>Cuello:</strong> Est. ${r.bottleneck.station} — ${fmt(r.bottleneck.load)}s
        ${r.bottleneck.load > r.takt ? '<span style="color:var(--danger);margin-left:4px">⚠ Sobrecargado</span>' : ''}
      </div>
      <div class="scenario-actions">
        ${!scn.isBaseline ? `<button class="btn btn--primary btn--sm" data-apply="${esc(scn.id)}">Aplicar</button>` : '<span class="badge badge--success" style="font-size:11px">Estado actual</span>'}
        ${scn.isCustom ? `<button class="btn btn--ghost btn--sm" style="color:var(--danger)" data-delete="${esc(scn.id)}">Eliminar</button>` : ''}
      </div>
    </div>
  `).join('');

  const tableRows = computed.map(({ scn, result: r }) => `
    <tr>
      <td style="font-weight:600">${esc(scn.name)}</td>
      <td class="text-right">${scn.params.requiredQuantity.toLocaleString('es-MX')}</td>
      <td class="text-right">${fmt(r.takt)}</td>
      <td class="text-right">${r.numStations}</td>
      <td class="text-right" style="color:${r.efficiency >= 80 ? 'var(--success)' : r.efficiency >= 65 ? 'var(--warning)' : 'var(--danger)'};font-weight:600">${fmtPct(r.efficiency)}</td>
      <td class="text-right">${fmt(r.bottleneck.load)}</td>
      <td class="text-right">${r.capacity}</td>
      <td><span class="feasibility-badge feasibility-badge--${r.feasibility}">${feasibilityLabel[r.feasibility]}</span></td>
    </tr>
  `).join('');

  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Escenarios</h1>
      <p class="page-subtitle">Comparación y análisis de escenarios de producción</p>
    </div>

    <div class="section-header">
      <div>
        <div class="section-title">Escenarios disponibles</div>
        <div class="section-subtitle">${state.scenarios.length} escenarios · Haz clic en "Aplicar" para actualizar el estado actual</div>
      </div>
      <button class="btn btn--primary" id="btn-new-scenario">+ Nuevo Escenario</button>
    </div>

    <div class="scenario-grid">${cardsHTML}</div>

    <div class="section-header mt-2">
      <div>
        <div class="section-title">Comparación detallada</div>
        <div class="section-subtitle">Todos los escenarios en una vista</div>
      </div>
    </div>
    <div class="card p-0 mb-6">
      <div class="table-wrapper">
        <table class="table">
          <thead>
            <tr>
              <th>Escenario</th>
              <th class="text-right">Demanda</th>
              <th class="text-right">Takt (s)</th>
              <th class="text-right">Estaciones</th>
              <th class="text-right">Eficiencia</th>
              <th class="text-right">Cuello (s)</th>
              <th class="text-right">Cap./hora</th>
              <th>Viabilidad</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
    </div>
  `;

  container.querySelector('#btn-new-scenario').addEventListener('click', openNewScenarioModal);

  container.querySelectorAll('[data-apply]').forEach(btn => {
    btn.addEventListener('click', () => {
      const scn = state.scenarios.find(s => s.id === btn.dataset.apply);
      if (!scn) return;
      showConfirm(
        `Aplicar "${scn.name}"`,
        'Esto actualizará los parámetros del balanceo actual (demanda, turno, mejoras). El estado se guardará. ¿Continuar?',
        () => {
          const p = scn.params;
          state.balanceSettings = {
            requiredQuantity: p.requiredQuantity,
            shiftHours:       p.shiftHours,
            breakMinutes:     p.breakMinutes,
            meetingMinutes:   p.meetingMinutes,
            desiredStations:  state.balanceSettings.desiredStations
          };
          if (p.improvementOperationId && p.improvementPercent > 0) {
            const op = state.operations.find(o => o.id === p.improvementOperationId);
            if (op) {
              const st = state.standardTimes.find(st => st.operationId === op.id);
              op.standardTime = op.standardTime * (1 - p.improvementPercent / 100);
              if (st) {
                const parts = (st.version || 'v1.0').replace('v','').split('.');
                st.version = `v${parts[0]}.${(parseInt(parts[1]||0)+1)}`;
                st.updatedAt = new Date().toISOString().slice(0,10);
                st.isTemporary = true;
              }
            }
          }
          state.stationAssignments = autoBalanceOperations();
          saveState();
          renderApp();
          showToast(`Escenario "${scn.name}" aplicado al estado actual`, 'success');
        }
      );
    });
  });

  container.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', () => {
      const scn = state.scenarios.find(s => s.id === btn.dataset.delete);
      if (!scn) return;
      showConfirm(
        `Eliminar "${scn.name}"`,
        'Esta acción no se puede deshacer. ¿Eliminar el escenario personalizado?',
        () => {
          state.scenarios = state.scenarios.filter(s => s.id !== scn.id);
          saveState();
          renderScenarios(document.getElementById('main-content'));
          showToast(`Escenario "${scn.name}" eliminado`, 'info');
        }
      );
    });
  });
}

// ── CSV Export ────────────────────────────────
function exportReportCSV() {
  const s   = computeSummary();
  const takt = s.takt;
  const BOM = '﻿';

  const rows = ['Resumen de Balanceo'];
  rows.push(['Estación','No.','Actividad','Tiempo (s)','Carga Estación (s)','Takt (s)','Estado'].map(csvCell).join(','));

  const stLoads = s.stationLoads;
  s.assignments.forEach(a => {
    const load   = stLoads[a.station] || 0;
    const status = load > takt ? 'Sobrecargado' : load > takt * 0.9 ? 'Al límite' : 'OK';
    rows.push([
      a.station,
      a.sequence,
      csvCell(a.name),
      fmt(a.standardTime, 2),
      fmt(load, 2),
      fmt(takt, 2),
      csvCell(status)
    ].join(','));
  });

  ensureTimeStudyStructure();
  rows.push('');
  rows.push('Estudios de Tiempo');
  rows.push(['Estación','Subconjunto','No.','Actividad','STD','Frecuencia','TC'].map(csvCell).join(','));
  state.timeStudyStructure.forEach(station => {
    station.subconjuntos.forEach(subset => {
      subset.actividades.forEach(activity => {
        rows.push([
          csvCell(station.name),
          csvCell(subset.name),
          activity.no,
          csvCell(activity.name),
          fmt(activity.std, 2),
          fmt(activity.frequency, 2),
          fmt(calculateActivityTC(activity), 2)
        ].join(','));
      });
      rows.push([
        csvCell(station.name),
        csvCell(subset.name),
        '',
        csvCell('Total Subconjunto'),
        '',
        '',
        fmt(calculateSubsetTotal(subset), 2)
      ].join(','));
    });
  });

  const blob = new Blob([BOM + rows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href     = url;
  link.download = `KaiFlow_${state.line.name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showToast('CSV exportado correctamente', 'success');
}

function renderReport(container) {
  const s    = computeSummary();
  const takt = s.takt;
  const now  = new Date().toLocaleDateString('es-MX', { year:'numeric', month:'long', day:'numeric' });
  const availH = (s.available / 3600).toFixed(2);
  const effClass = s.efficiency >= 80 ? 'var(--success)' : s.efficiency >= 65 ? 'var(--warning)' : 'var(--danger)';

  const stationNumbers = [...new Set(s.assignments.map(a => a.station))].sort((a,b) => a-b);

  const stationRows = stationNumbers.map(st => {
    const load    = s.stationLoads[st] || 0;
    const idle    = takt - load;
    const ops     = s.assignments.filter(a => a.station === st);
    const status  = load > takt ? 'Sobrecargado' : load > takt * 0.9 ? 'Al límite' : 'OK';
    const badgeCls = load > takt ? 'badge--danger' : load > takt * 0.9 ? 'badge--warning' : 'badge--success';
    return `
      <tr>
        <td style="font-weight:700">Est. ${st}${st === s.bottleneck.station ? ' ⚠' : ''}</td>
        <td class="text-right">${ops.length}</td>
        <td class="text-right">${fmt(load)}</td>
        <td class="text-right">${idle >= 0 ? fmt(idle) : '—'}</td>
        <td class="text-right">${fmtPct((load / takt) * 100)}</td>
        <td><span class="badge ${badgeCls}">${status}</span></td>
      </tr>`;
  }).join('');

  const opRows = s.assignments.map(a => {
    const load    = s.stationLoads[a.station] || 0;
    return `
      <tr>
        <td style="font-weight:600">Est. ${a.station}</td>
        <td>${a.sequence}</td>
        <td>${esc(a.name)}</td>
        <td class="text-right">${fmt(a.standardTime)}</td>
        <td class="text-right">${fmt(load)}</td>
      </tr>`;
  }).join('');

  ensureTimeStudyStructure();
  const timeStudyReportSections = state.timeStudyStructure.map(station => `
    <div class="report-time-study-station">
      <h3>${esc(station.name)} <span>${fmt(calculateStationTimeStudyTotal(station), 2)} seg</span></h3>
      ${station.subconjuntos.map(subset => `
        <div class="report-time-study-subset">
          <div class="report-time-study-title">
            <strong>Subconjunto: ${esc(subset.name)}</strong>
            <span>Total: ${fmt(calculateSubsetTotal(subset), 2)} seg</span>
          </div>
          <div class="table-wrapper">
            <table class="table">
              <thead>
                <tr>
                  <th style="width:56px">No.</th>
                  <th>Actividad</th>
                  <th class="text-right">STD</th>
                  <th class="text-right">Frecuencia</th>
                  <th class="text-right">TC</th>
                </tr>
              </thead>
              <tbody>
                ${subset.actividades.map(activity => `
                  <tr>
                    <td class="font-mono" style="color:var(--text-muted)">${activity.no}</td>
                    <td>${esc(activity.name)}</td>
                    <td class="text-right font-mono">${fmt(activity.std, 2)}</td>
                    <td class="text-right font-mono">${fmt(activity.frequency, 2)}</td>
                    <td class="text-right font-mono"><strong>${fmt(calculateActivityTC(activity), 2)}</strong></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `).join('')}
    </div>
  `).join('');

  const scenarioRows = state.scenarios.map(scn => {
    const r = computeScenario(scn);
    const feasLabel = { green: 'Factible', yellow: 'Al límite', red: 'No factible' };
    const bCls = { green: 'badge--success', yellow: 'badge--warning', red: 'badge--danger' };
    return `
      <tr>
        <td style="font-weight:600">${esc(scn.name)}</td>
        <td class="text-right">${scn.params.requiredQuantity.toLocaleString('es-MX')}</td>
        <td class="text-right">${fmt(r.takt)}</td>
        <td class="text-right">${r.numStations}</td>
        <td class="text-right" style="color:${r.efficiency >= 80 ? 'var(--success)' : r.efficiency >= 65 ? 'var(--warning)' : 'var(--danger)'};font-weight:600">${fmtPct(r.efficiency)}</td>
        <td class="text-right">${r.capacity}</td>
        <td><span class="badge ${bCls[r.feasibility]}">${feasLabel[r.feasibility]}</span></td>
      </tr>`;
  }).join('');

  container.innerHTML = `
    <div class="page-header no-print">
      <h1 class="page-title">Reporte</h1>
      <p class="page-subtitle">Resumen ejecutivo de balanceo · ${now}</p>
    </div>

    <div class="btn-group mb-6 no-print">
      <button class="btn btn--primary" id="btn-print">
        <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M6 2h8v4H6z"/><path d="M6 14H4a2 2 0 01-2-2V8a2 2 0 012-2h12a2 2 0 012 2v4a2 2 0 01-2 2h-2"/><rect x="6" y="12" width="8" height="6" rx="1"/></svg>
        Imprimir
      </button>
      <button class="btn btn--secondary" id="btn-export-csv">
        <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M13 2H5a1 1 0 00-1 1v14a1 1 0 001 1h10a1 1 0 001-1V6l-3-4z"/><line x1="10" y1="9" x2="10" y2="15"/><polyline points="7 12 10 15 13 12"/></svg>
        Exportar CSV
      </button>
    </div>

    <!-- Report header -->
    <div class="report-header-block">
      <svg width="40" height="40" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="16" cy="16" r="15" stroke="#D946EF" stroke-width="2" fill="none"/>
        <rect x="8" y="20" width="4" height="6" rx="1" fill="#7E2CA3"/>
        <rect x="14" y="16" width="4" height="10" rx="1" fill="#A33BC2"/>
        <rect x="20" y="12" width="4" height="14" rx="1" fill="#F472B6"/>
        <polyline points="9,18 14,12 20,10 26,8" stroke="#EC4899" stroke-width="1.5" fill="none" stroke-linecap="round"/>
        <circle cx="26" cy="8" r="2" fill="#F472B6"/>
      </svg>
      <div class="report-logo-text">
        <h2>KaiFlow — Balanceo de Línea</h2>
        <p>OnKaizen Intelligence · Reporte generado el ${now}</p>
      </div>
    </div>

    <!-- Planta / Línea -->
    <div class="report-section">
      <div class="report-section-title">Identificación</div>
      <div class="report-meta-grid">
        <div class="report-meta-item"><label>Planta</label><span>${esc(state.plant.name)}</span></div>
        <div class="report-meta-item"><label>Área</label><span>${esc(state.area.name)}</span></div>
        <div class="report-meta-item"><label>Línea</label><span>${esc(state.line.name)}</span></div>
        <div class="report-meta-item"><label>Proceso</label><span>${esc(state.process.name)}</span></div>
      </div>
    </div>

    <!-- Parámetros de turno -->
    <div class="report-section">
      <div class="report-section-title">Parámetros de Producción</div>
      <div class="report-meta-grid">
        <div class="report-meta-item"><label>Demanda / turno</label><span>${state.balanceSettings.requiredQuantity.toLocaleString('es-MX')} piezas</span></div>
        <div class="report-meta-item"><label>Horas de turno</label><span>${state.balanceSettings.shiftHours} h</span></div>
        <div class="report-meta-item"><label>Descansos</label><span>${state.balanceSettings.breakMinutes} min</span></div>
        <div class="report-meta-item"><label>Reuniones</label><span>${state.balanceSettings.meetingMinutes} min</span></div>
        <div class="report-meta-item"><label>Tiempo disponible</label><span>${availH} h (${s.available.toLocaleString('es-MX')} seg)</span></div>
      </div>
    </div>

    <!-- KPIs -->
    <div class="report-section">
      <div class="report-section-title">Indicadores Clave</div>
      <div class="kpi-grid" style="grid-template-columns:repeat(auto-fill,minmax(180px,1fr))">
        <div class="kpi-card">
          <div class="kpi-label">Takt Time</div>
          <div class="kpi-value ${s.hasBottleneck ? 'kpi-value--danger' : 'kpi-value--green'}">${fmt(takt)}<span class="kpi-unit">seg</span></div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Contenido total</div>
          <div class="kpi-value">${s.twc}<span class="kpi-unit">seg</span></div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Operadores teóricos</div>
          <div class="kpi-value">${s.reqOps}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Estaciones</div>
          <div class="kpi-value">${s.numStations}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Eficiencia</div>
          <div class="kpi-value" style="color:${effClass}">${fmtPct(s.efficiency)}</div>
        </div>
        <div class="kpi-card ${s.hasBottleneck ? 'kpi-card--danger' : ''}">
          <div class="kpi-label">Cuello de botella</div>
          <div class="kpi-value" style="font-size:var(--font-16);font-weight:700;color:${s.hasBottleneck ? 'var(--danger)' : 'var(--success)'}">Est. ${s.bottleneck.station}</div>
          <div class="kpi-meta">${fmt(s.bottleneck.load)} seg ${s.hasBottleneck ? '⚠' : ''}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Capacidad máx.</div>
          <div class="kpi-value">${s.capacity}<span class="kpi-unit">pzas/h</span></div>
        </div>
      </div>
    </div>

    <!-- Estudios de tiempo -->
    <div class="report-section">
      <div class="report-section-title">Estudios de Tiempo por Estación y Subconjunto</div>
      ${timeStudyReportSections}
    </div>

    <!-- Estaciones -->
    <div class="report-section">
      <div class="report-section-title">Resumen por Estación</div>
      <div class="table-wrapper">
        <table class="table">
          <thead>
            <tr>
              <th>Estación</th>
              <th class="text-right">Operaciones</th>
              <th class="text-right">Carga (s)</th>
              <th class="text-right">Tiempo inactivo (s)</th>
              <th class="text-right">% Takt</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>${stationRows}</tbody>
        </table>
      </div>
    </div>

    <!-- Asignación de operaciones -->
    <div class="report-section">
      <div class="report-section-title">Asignación de Operaciones</div>
      <div class="table-wrapper">
        <table class="table">
          <thead>
            <tr>
              <th>Estación</th>
              <th>No.</th>
              <th>Actividad</th>
              <th class="text-right">STD (s)</th>
              <th class="text-right">Carga Est. (s)</th>
            </tr>
          </thead>
          <tbody>${opRows}</tbody>
        </table>
      </div>
    </div>

    <!-- Comparación de escenarios -->
    <div class="report-section">
      <div class="report-section-title">Comparación de Escenarios</div>
      <div class="table-wrapper">
        <table class="table">
          <thead>
            <tr>
              <th>Escenario</th>
              <th class="text-right">Demanda</th>
              <th class="text-right">Takt (s)</th>
              <th class="text-right">Estaciones</th>
              <th class="text-right">Eficiencia</th>
              <th class="text-right">Cap./hora</th>
              <th>Viabilidad</th>
            </tr>
          </thead>
          <tbody>${scenarioRows}</tbody>
        </table>
      </div>
    </div>
  `;

  container.querySelector('#btn-print').addEventListener('click', () => window.print());
  container.querySelector('#btn-export-csv').addEventListener('click', exportReportCSV);
}

function renderPermissions(container) {
  const permsConfig = [
    { key: 'editCatalogs',     label: 'Editar Captura' },
    { key: 'editStandardTimes',label: 'Editar Tiempos Estándar' },
    { key: 'runBalance',       label: 'Ejecutar Balanceo' },
    { key: 'approveBalance',   label: 'Aprobar Balance' },
    { key: 'viewReports',      label: 'Ver Reportes' },
    { key: 'manageUsers',      label: 'Gestionar Usuarios' }
  ];

  const check = `<div class="perm-check" aria-label="Permitido">
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 10 8 14 16 6"/></svg>
  </div>`;
  const cross = `<div class="perm-x" aria-label="No permitido">
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="5" x2="15" y2="15"/><line x1="15" y1="5" x2="5" y2="15"/></svg>
  </div>`;

  const headerCells = state.roles.map(r => `<th style="text-align:center"><span class="role-badge">${esc(r.name)}</span></th>`).join('');
  const rows = permsConfig.map(p => {
    const cells = state.roles.map(r => `<td>${r.permissions[p.key] ? check : cross}</td>`).join('');
    return `<tr><td style="font-weight:600">${esc(p.label)}</td>${cells}</tr>`;
  }).join('');

  const roleCards = state.roles.map(r => {
    const allowed = permsConfig.filter(p => r.permissions[p.key]).map(p => p.label);
    const denied  = permsConfig.filter(p => !r.permissions[p.key]).map(p => p.label);
    return `
      <div class="card p-4">
        <div style="display:flex;align-items:center;gap:var(--sp-3);margin-bottom:var(--sp-3)">
          <span class="role-badge" style="font-size:var(--font-14);padding:4px 14px">${esc(r.name)}</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-2)">
          <div>
            ${allowed.map(l => `<div style="display:flex;align-items:center;gap:6px;font-size:var(--font-12);color:var(--success);margin-bottom:4px">
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 10 8 14 16 6"/></svg>
              ${esc(l)}
            </div>`).join('')}
          </div>
          <div>
            ${denied.map(l => `<div style="display:flex;align-items:center;gap:6px;font-size:var(--font-12);color:var(--text-muted);margin-bottom:4px">
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="5" x2="15" y2="15"/><line x1="15" y1="5" x2="5" y2="15"/></svg>
              ${esc(l)}
            </div>`).join('')}
          </div>
        </div>
      </div>`;
  }).join('');

  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Permisos</h1>
      <p class="page-subtitle">Roles y permisos del sistema · Solo lectura (demo)</p>
    </div>

    <div class="section-header">
      <div>
        <div class="section-title">Matriz de permisos</div>
        <div class="section-subtitle">Qué puede hacer cada rol en el sistema</div>
      </div>
    </div>
    <div class="card p-0 mb-6">
      <div class="table-wrapper">
        <table class="table permissions-table">
          <thead>
            <tr>
              <th>Permiso</th>
              ${headerCells}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>

    <div class="section-header">
      <div>
        <div class="section-title">Detalle por rol</div>
        <div class="section-subtitle">Permisos otorgados y restringidos por rol</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:var(--sp-4);margin-bottom:var(--sp-6)">
      ${roleCards}
    </div>

    <div class="card p-4" style="background:var(--green-50);border-color:var(--green-200)">
      <div style="display:flex;align-items:flex-start;gap:var(--sp-3)">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--green-600)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:1px"><circle cx="10" cy="10" r="8"/><line x1="10" y1="7" x2="10" y2="10"/><circle cx="10" cy="13.5" r="0.5" fill="var(--green-600)"/></svg>
        <div>
          <div style="font-size:var(--font-14);font-weight:600;color:var(--green-700);margin-bottom:4px">Nota sobre este módulo</div>
          <div style="font-size:var(--font-14);color:var(--text-secondary);line-height:1.6">
            Este módulo es de referencia visual. En una implementación real, la autenticación y autorización estarían respaldadas por un servidor. Los roles mostrados son: <strong>Administrador</strong>, <strong>Ingeniería Industrial</strong>, <strong>Supervisor de Producción</strong>, <strong>Calidad</strong> y <strong>Visualizador</strong>.
          </div>
        </div>
      </div>
    </div>
  `;
}

// ── Toast ─────────────────────────────────────
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  toast.setAttribute('role', 'status');
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// ── Confirm dialog ────────────────────────────
function showConfirm(title, body, onOk) {
  const backdrop = document.getElementById('confirm-backdrop');
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-body').textContent  = body;
  backdrop.classList.remove('hidden');

  const ok     = document.getElementById('confirm-ok');
  const cancel = document.getElementById('confirm-cancel');

  function close() { backdrop.classList.add('hidden'); }

  ok.onclick = () => { close(); onOk(); };
  cancel.onclick = close;
  backdrop.onclick = (e) => { if (e.target === backdrop) close(); };
}

// ── Modal ─────────────────────────────────────
function openModal(title, bodyHTML, extraClass = '') {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML    = bodyHTML;
  const box = document.querySelector('#modal-backdrop .modal-box');
  if (box) box.className = ['modal-box modal-box--lg', extraClass].filter(Boolean).join(' ');
  document.getElementById('modal-backdrop').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-backdrop').classList.add('hidden');
  const box = document.querySelector('#modal-backdrop .modal-box');
  if (box) box.className = 'modal-box modal-box--lg';
}

// ── HTML Escape ───────────────────────────────
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Catalog helpers ───────────────────────────
function openOperationModal(opId) {
  const op      = opId ? state.operations.find(o => o.id === opId) : null;
  const nextSeq = op
    ? op.sequence
    : Math.max(0, ...state.operations.map(o => o.sequence)) + 1;
  const taktStr = fmt(calculateTaktTime(state.balanceSettings));

  openModal(op ? 'Editar Operación' : 'Agregar Operación', `
    <div class="form-group">
      <label class="form-label" for="op-name">Actividad <span style="color:var(--danger)">*</span></label>
      <input class="form-input w-full" id="op-name" type="text"
        value="${esc(op?.name ?? '')}" placeholder="Ej. Colocar etiqueta" />
    </div>
    <div class="form-group">
      <label class="form-label" for="op-seq">No.</label>
      <input class="form-input" id="op-seq" type="number" min="1" value="${nextSeq}" />
    </div>
    <div class="form-group">
      <label class="form-label" for="op-time">Tiempo estándar (seg) <span style="color:var(--danger)">*</span></label>
      <input class="form-input w-full" id="op-time" type="number" min="0.1" step="0.1"
        value="${op?.standardTime ?? ''}" placeholder="Ej. 18" />
      <span class="form-hint">Takt actual: <strong>${taktStr} seg</strong></span>
    </div>
    ${op ? `<div class="form-group">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--font-14)">
        <input type="checkbox" id="op-active" ${op.active ? 'checked' : ''} />
        <span>Operación activa</span>
      </label>
    </div>` : ''}
    <div class="modal-actions">
      <button class="btn btn--ghost" id="op-cancel">Cancelar</button>
      <button class="btn btn--primary" id="op-save">Guardar</button>
    </div>
  `);

  document.getElementById('op-cancel').addEventListener('click', closeModal);
  document.getElementById('op-save').addEventListener('click', () => {
    const name = document.getElementById('op-name').value.trim();
    const time = parseFloat(document.getElementById('op-time').value);
    if (!name) { showToast('El nombre es requerido', 'warning'); return; }
    if (!time || time <= 0) { showToast('Ingresa un tiempo válido mayor a 0', 'warning'); return; }

    if (op) {
      op.name         = name;
      op.sequence     = parseInt(document.getElementById('op-seq').value) || op.sequence;
      op.standardTime = time;
      op.active       = document.getElementById('op-active').checked;
    } else {
      const today = new Date().toISOString().slice(0, 10);
      const newOp = {
        id: generateId('OP'),
        sequence:     parseInt(document.getElementById('op-seq').value) || nextSeq,
        name, standardTime: time, active: true, isTemporary: false
      };
      state.operations.push(newOp);
      state.standardTimes.push({
        operationId: newOp.id, version: 'v1.0', status: 'active',
        effectiveDate: today, updatedAt: today, updatedBy: 'Usuario', isTemporary: false
      });
    }

    state.operations.sort((a, b) => a.sequence - b.sequence);
    state.stationAssignments = autoBalanceOperations();
    saveState();
    closeModal();
    renderCatalogs(document.getElementById('main-content'));
    showToast(op ? 'Operación actualizada' : 'Operación agregada', 'success');
  });
}

function confirmDeleteOp(opId) {
  const op = state.operations.find(o => o.id === opId);
  if (!op) return;
  showConfirm(
    'Eliminar operación',
    `¿Eliminar "${op.name}"? Esta acción no se puede deshacer.`,
    () => {
      state.operations      = state.operations.filter(o => o.id !== opId);
      state.standardTimes   = state.standardTimes.filter(s => s.operationId !== opId);
      state.stationAssignments = autoBalanceOperations();
      saveState();
      renderCatalogs(document.getElementById('main-content'));
      showToast('Operación eliminada', 'success');
    }
  );
}

function toggleOperationActive(opId) {
  const op = state.operations.find(o => o.id === opId);
  if (!op) return;
  op.active = !op.active;
  state.stationAssignments = autoBalanceOperations();
  saveState();
  renderCatalogs(document.getElementById('main-content'));
  showToast(`Operación ${op.active ? 'activada' : 'desactivada'}`, 'success');
}

function moveOperation(opId, dir) {
  const idx    = state.operations.findIndex(o => o.id === opId);
  if (idx < 0) return;
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= state.operations.length) return;
  [state.operations[idx], state.operations[newIdx]] = [state.operations[newIdx], state.operations[idx]];
  state.operations.forEach((op, i) => { op.sequence = i + 1; });
  state.stationAssignments = autoBalanceOperations();
  saveState();
  renderCatalogs(document.getElementById('main-content'));
}

// ── Balance helpers ───────────────────────────
function buildBalanceRows(assignments, stationLoads, takt) {
  const numStations = Math.max(...Object.keys(stationLoads).map(Number), 1);
  const byStation   = {};
  assignments.forEach(a => {
    if (!byStation[a.station]) byStation[a.station] = [];
    byStation[a.station].push(a);
  });

  let html = '';
  Object.keys(byStation)
    .map(Number).sort((a, b) => a - b)
    .forEach(stNum => {
      const stOps  = byStation[stNum].sort((a, b) => a.sequence - b.sequence);
      const load   = stationLoads[stNum] || 0;
      const idle   = takt - load;
      const isOver = load > takt;

      html += `
        <tr class="station-header-row ${isOver ? 'station-header-row--over' : ''}">
          <td colspan="5">
            <div class="station-row-meta">
              <strong>Estación ${stNum}</strong>
              <span class="station-row-load font-mono" style="color:${isOver ? 'var(--danger)' : 'var(--text-primary)'}">
                ${fmt(load)} seg
              </span>
              <span style="font-size:var(--font-12);color:${isOver ? 'var(--danger)' : 'var(--text-muted)'}">
                ${isOver
                  ? `+${fmt(load - takt)} seg sobre takt`
                  : `tiempo inactivo: ${fmt(idle)} seg`}
              </span>
              ${isOver
                ? '<span class="badge badge--danger">⚠ Sobrecargada</span>'
                : idle / takt < 0.10
                  ? '<span class="badge badge--warning">Al límite</span>'
                  : '<span class="badge badge--success">OK</span>'}
            </div>
          </td>
        </tr>
      `;

      stOps.forEach(a => {
        html += `
          <tr class="${isOver ? 'row--overload' : ''}">
            <td class="font-mono" style="color:var(--text-muted);font-size:var(--font-12);padding-left:var(--sp-8)">${a.sequence}</td>
            <td>${esc(a.name)}</td>
            <td class="font-mono"><strong>${a.standardTime}</strong></td>
            <td>
              <select class="form-select station-select" data-op-id="${a.operationId}"
                style="font-size:var(--font-12);padding:2px var(--sp-2)">
                ${Array.from({length: numStations + 2}, (_, i) => i + 1)
                  .map(n => `<option value="${n}"${n === stNum ? ' selected' : ''}>Est. ${n}</option>`)
                  .join('')}
              </select>
            </td>
            <td>
              ${isOver ? '<span class="badge badge--danger" style="font-size:10px">Exc. takt</span>' : ''}
            </td>
          </tr>
        `;
      });
    });

  return html;
}

// ── Standard Times helpers ────────────────────
function openEditTimeModal(opId) {
  const op = state.operations.find(o => o.id === opId);
  const st = state.standardTimes.find(s => s.operationId === opId);
  if (!op) return;
  const takt = calculateTaktTime(state.balanceSettings);

  openModal(`Editar Tiempo — ${op.name}`, `
    <div style="background:var(--surface-bg);padding:var(--sp-3) var(--sp-4);border-radius:var(--radius-md);margin-bottom:var(--sp-4)">
      <span style="font-size:var(--font-12);color:var(--text-muted)">
        Actividad No. <strong>${esc(op.sequence)}</strong> · Versión actual: <strong>${esc(st?.version ?? 'v1.0')}</strong>
      </span>
    </div>
    <div class="form-group">
      <label class="form-label" for="et-time">Nuevo tiempo estándar (seg) <span style="color:var(--danger)">*</span></label>
      <input class="form-input w-full" id="et-time" type="number" min="0.1" step="0.1" value="${op.standardTime}" />
      <span class="form-hint">Tiempo actual: <strong>${op.standardTime} seg</strong> · Takt: <strong>${fmt(takt)} seg</strong></span>
    </div>
    <div class="form-group">
      <label class="form-label" for="et-by">Actualizado por</label>
      <input class="form-input w-full" id="et-by" type="text"
        value="${esc(st?.updatedBy ?? '')}" placeholder="Nombre del ingeniero" />
    </div>
    <div class="modal-actions">
      <button class="btn btn--ghost" id="et-cancel">Cancelar</button>
      <button class="btn btn--primary" id="et-save">Aplicar Cambio</button>
    </div>
  `);

  document.getElementById('et-cancel').addEventListener('click', closeModal);
  document.getElementById('et-save').addEventListener('click', () => {
    const newTime = parseFloat(document.getElementById('et-time').value);
    const by      = document.getElementById('et-by').value.trim() || 'Usuario';
    if (!newTime || newTime <= 0) { showToast('Ingresa un tiempo válido', 'warning'); return; }

    op.standardTime = newTime;
    if (st) {
      const parts  = (st.version || 'v1.0').replace('v', '').split('.');
      st.version   = `v${parts[0]}.${parseInt(parts[1] || '0') + 1}`;
      st.updatedAt = new Date().toISOString().slice(0, 10);
      st.updatedBy = by;
    }
    state.stationAssignments = autoBalanceOperations();
    saveState();
    closeModal();
    renderStandardTimes(document.getElementById('main-content'));
    showToast(`Tiempo actualizado a ${newTime} seg`, 'success');
  });
}

function toggleStdTimeStatus(opId) {
  const st = state.standardTimes.find(s => s.operationId === opId);
  if (!st) return;
  st.status = st.status === 'active' ? 'inactive' : 'active';
  saveState();
  renderStandardTimes(document.getElementById('main-content'));
  showToast(`Tiempo estándar ${st.status === 'active' ? 'activado' : 'inactivado'}`, 'success');
}

// ── Init ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadState();

  // Sidebar navigation
  document.querySelectorAll('.nav-item[data-page]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      navigate(el.dataset.page);
    });
  });

  // Reset button
  document.getElementById('btn-reset')?.addEventListener('click', resetState);

  // Modal close
  document.getElementById('modal-close')?.addEventListener('click', closeModal);
  document.getElementById('modal-backdrop')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-backdrop')) closeModal();
  });

  // Keyboard escape closes modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (document.getElementById('sw-overlay')) { closeStopwatchModal(); return; }
      closeModal();
      document.getElementById('confirm-backdrop')?.classList.add('hidden');
    }
  });

  // Update header info
  const headerPlant = document.getElementById('header-plant');
  const headerLine  = document.getElementById('header-line');
  if (headerPlant) headerPlant.textContent = state.plant.name;
  if (headerLine)  headerLine.textContent  = state.line.name;
  renderAuthWidget();

  renderApp();
});
