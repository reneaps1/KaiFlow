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
const DASHBOARD_PERIOD_SECONDS = { Hora: 3600, Turno: 28800 };

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    state = raw ? JSON.parse(raw) : deepClone(DEFAULT_STATE);
  } catch {
    state = deepClone(DEFAULT_STATE);
  }
  const catalogMigrated = normalizeManufacturingCatalog();
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

function resetState() {
  showConfirm(
    'Restaurar datos demo',
    '¿Deseas restaurar todos los datos al estado original? Los cambios de esta sesión se perderán.',
    () => {
      localStorage.removeItem(STORAGE_KEY);
      state = deepClone(DEFAULT_STATE);
      state.stationAssignments = autoBalanceOperations(state);
      ensureDashboardState();
      saveState();
      renderApp();
      showToast('Datos restaurados al estado original', 'success');
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
  return `${area}||${line}`;
}

function getDefaultDashboardConfig(area = DASHBOARD_DEFAULT_AREA, line = DASHBOARD_DEFAULT_LINE) {
  return {
    area,
    line,
    period: 'Turno',
    requiredPieces: 0,
    availableSeconds: DASHBOARD_PERIOD_SECONDS.Turno
  };
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
  state.dashboardLineConfigs = state.dashboardLineConfigs || {};
}

function getDashboardLineConfig(area, line) {
  ensureDashboardState();
  const saved = state.dashboardLineConfigs[dashboardLineKey(area, line)];
  return saved ? { ...getDefaultDashboardConfig(area, line), ...saved, area, line } : getDefaultDashboardConfig(area, line);
}

function saveDashboardLineConfig(config) {
  ensureDashboardState();
  state.dashboardLineConfigs[dashboardLineKey(config.area, config.line)] = {
    area: config.area,
    line: config.line,
    period: config.period,
    requiredPieces: Number(config.requiredPieces) || 0,
    availableSeconds: Number(config.availableSeconds) || 0
  };
}

function findDashboardStoredBalance(area, line) {
  const key = dashboardLineKey(area, line);
  const stores = [
    state.dashboardLineBalances,
    state.savedLineBalances,
    state.lineBalances,
    state.balanceosGuardados
  ].filter(Boolean);

  for (const store of stores) {
    if (Array.isArray(store)) {
      const match = store.find(item =>
        item &&
        (item.area === area || item.areaName === area) &&
        (item.line === line || item.lineName === line)
      );
      if (match) return match;
    } else if (store[key]) {
      return store[key];
    }
  }

  if (area === DASHBOARD_DEFAULT_AREA && line === DASHBOARD_DEFAULT_LINE && state.stationAssignments?.length) {
    return { assignments: state.stationAssignments };
  }

  return null;
}

function getDashboardOperatorLoads(area, line) {
  const balance = findDashboardStoredBalance(area, line);
  if (!balance) return [];

  if (Array.isArray(balance)) {
    const loads = calculateStationLoads(balance);
    return Object.keys(loads).map(Number).sort((a, b) => a - b).map((station, index) => ({
      label: `OP${index + 1}`,
      time: loads[station] || 0
    }));
  }

  const assignments = balance.assignments || balance.stationAssignments || balance.asignaciones;
  if (Array.isArray(assignments) && assignments.length) {
    const loads = calculateStationLoads(assignments);
    return Object.keys(loads).map(Number).sort((a, b) => a - b).map((station, index) => ({
      label: `OP${index + 1}`,
      time: loads[station] || 0
    }));
  }

  const operatorRows = balance.operatorLoads || balance.operators || balance.operadores;
  if (Array.isArray(operatorRows) && operatorRows.length) {
    return operatorRows.map((op, index) => ({
      label: `OP${index + 1}`,
      time: Number(op.time ?? op.load ?? op.totalTime ?? op.standardTime ?? op.seconds ?? 0)
    })).filter(op => op.time > 0);
  }

  const stationLoads = balance.stationLoads || balance.loads;
  if (stationLoads && typeof stationLoads === 'object') {
    return Object.keys(stationLoads).map(Number).sort((a, b) => a - b).map((station, index) => ({
      label: `OP${index + 1}`,
      time: Number(stationLoads[station] || 0)
    })).filter(op => op.time > 0);
  }

  return [];
}

function computeDashboardMetrics(config, operatorLoads) {
  const requiredPieces = Math.max(0, Number(config.requiredPieces) || 0);
  const availableSeconds = Math.max(0, Number(config.availableSeconds) || 0);
  const takt = requiredPieces > 0 ? availableSeconds / requiredPieces : 0;
  const totalWorkContent = operatorLoads.reduce((sum, op) => sum + op.time, 0);
  const operatorCount = operatorLoads.length;
  const bottleneck = operatorLoads.reduce((max, op) => op.time > max.time ? op : max, { label: 'N/A', time: 0 });
  const efficiency = operatorCount > 0 && takt > 0 ? (totalWorkContent / (operatorCount * takt)) * 100 : 0;
  const capacity = bottleneck.time > 0 ? Math.floor(availableSeconds / bottleneck.time) : 0;

  return {
    requiredPieces,
    availableSeconds,
    takt,
    totalWorkContent,
    operatorCount,
    bottleneck,
    efficiency,
    capacity,
    hasBalance: operatorCount > 0
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
  catalogs:      'Catálogos',
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
function renderDashboardMetricCards(metrics, period) {
  if (!metrics.hasBalance) {
    return `
      <div class="dashboard-empty-state">
        <strong>No hay balanceo guardado para esta línea. Crea o asigna un balanceo primero.</strong>
        <span>Los cálculos se mostrarán cuando exista una carga por operador para la línea seleccionada.</span>
      </div>`;
  }

  const piecesLabel = period === 'Hora' ? 'Piezas requeridas por hora' : 'Piezas requeridas por turno';
  const taktValue = metrics.takt > 0 ? fmt(metrics.takt, 2) : 'N/A';
  const bottleneckLabel = metrics.bottleneck.time > 0
    ? `${metrics.bottleneck.label} · ${fmt(metrics.bottleneck.time, 2)}s`
    : 'N/A';

  return `
    <div class="kpi-grid dashboard-kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">${piecesLabel}</div>
        <div class="kpi-value">${metrics.requiredPieces.toLocaleString('es-MX')}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Tiempo disponible</div>
        <div class="kpi-value">${metrics.availableSeconds.toLocaleString('es-MX')}<span class="kpi-unit">seg</span></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Takt Time</div>
        <div class="kpi-value">${taktValue}<span class="kpi-unit">${metrics.takt > 0 ? 'seg' : ''}</span></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Número de operadores</div>
        <div class="kpi-value">${metrics.operatorCount}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Eficiencia</div>
        <div class="kpi-value ${metrics.efficiency >= 80 ? 'kpi-value--green' : metrics.efficiency >= 65 ? 'kpi-value--warning' : 'kpi-value--danger'}">${fmtPct(metrics.efficiency)}</div>
      </div>
      <div class="kpi-card ${metrics.bottleneck.time > metrics.takt && metrics.takt > 0 ? 'kpi-card--danger' : ''}">
        <div class="kpi-label">Cuello de botella</div>
        <div class="kpi-value" style="font-size:var(--font-16);font-weight:700">${bottleneckLabel}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Capacidad máxima</div>
        <div class="kpi-value">${metrics.capacity}</div>
      </div>
    </div>`;
}

function renderDashboardOperatorChart(metrics, operatorLoads) {
  if (!metrics.hasBalance) {
    return `
      <div class="dashboard-chart-empty">
        <span>Sin datos de operadores para graficar</span>
      </div>`;
  }

  const chartHeight = 260;
  const maxLoad = Math.max(...operatorLoads.map(op => op.time), metrics.takt || 0, 1);
  const maxVal = Math.ceil((maxLoad * 1.2) / 10) * 10 || 10;
  const scale = chartHeight / maxVal;
  const taktBottom = metrics.takt > 0 ? Math.round(metrics.takt * scale) : 0;

  return `
    <div class="dashboard-chart">
      ${metrics.takt > 0 ? `
        <div class="dashboard-chart-takt" style="bottom:${taktBottom}px">
          <span>Takt ${fmt(metrics.takt, 2)}s</span>
        </div>` : ''}
      <div class="dashboard-chart-bars">
        ${operatorLoads.map(op => {
          const height = Math.max(Math.round(op.time * scale), 2);
          const status = metrics.takt > 0 && op.time > metrics.takt
            ? 'over'
            : metrics.takt > 0 && op.time >= metrics.takt * 0.9
              ? 'near'
              : 'ok';
          const isBottleneck = op.label === metrics.bottleneck.label;
          return `
            <div class="dashboard-chart-bar-col">
              <div class="dashboard-chart-value">${fmt(op.time, 1)}s</div>
              <div class="dashboard-chart-bar dashboard-chart-bar--${status}${isBottleneck ? ' bottleneck' : ''}" style="height:${height}px"></div>
              <div class="dashboard-chart-label">${op.label}</div>
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

  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Dashboard</h1>
      <p class="page-subtitle">Indicadores de balanceo por área y línea</p>
    </div>

    <div class="card mb-6">
      <div class="card-header">
        <div>
          <div class="card-title">Filtros y periodo</div>
          <div class="card-subtitle">La configuración se guarda de forma independiente por línea</div>
        </div>
        <button class="btn btn--primary" id="dashboard-save">Actualizar Dashboard</button>
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
            <label class="form-label" for="dashboard-period">Periodo</label>
            <select class="form-select" id="dashboard-period">
              <option value="Hora"${config.period === 'Hora' ? ' selected' : ''}>Hora</option>
              <option value="Turno"${config.period === 'Turno' ? ' selected' : ''}>Turno</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" id="dashboard-pieces-label" for="dashboard-pieces">${config.period === 'Hora' ? 'Piezas requeridas por hora' : 'Piezas requeridas por turno'}</label>
            <input class="form-input" id="dashboard-pieces" type="number" min="0" step="1" value="${config.requiredPieces}" />
          </div>
          <div class="form-group">
            <label class="form-label" for="dashboard-available">Tiempo disponible en segundos</label>
            <input class="form-input" id="dashboard-available" type="number" min="0" step="1" value="${config.availableSeconds}" />
          </div>
        </div>
      </div>
    </div>

    <div id="dashboard-metrics"></div>

    <div class="card dashboard-chart-card">
      <div class="card-header">
        <div>
          <div class="card-title">Gráfico de tiempos por operador</div>
          <div class="card-subtitle">Comparación de OP1, OP2, OP3 contra Takt Time</div>
        </div>
      </div>
      <div class="card-body" id="dashboard-chart-wrap"></div>
    </div>
  `;

  const areaEl = container.querySelector('#dashboard-area');
  const lineEl = container.querySelector('#dashboard-line');
  const periodEl = container.querySelector('#dashboard-period');
  const piecesEl = container.querySelector('#dashboard-pieces');
  const availableEl = container.querySelector('#dashboard-available');
  const piecesLabel = container.querySelector('#dashboard-pieces-label');
  const metricsEl = container.querySelector('#dashboard-metrics');
  const chartEl = container.querySelector('#dashboard-chart-wrap');

  const readDraft = () => ({
    area: areaEl.value,
    line: lineEl.value,
    period: periodEl.value,
    requiredPieces: Math.max(0, parseInt(piecesEl.value) || 0),
    availableSeconds: Math.max(0, parseInt(availableEl.value) || 0)
  });

  const refreshDashboard = () => {
    const draft = readDraft();
    piecesLabel.textContent = draft.period === 'Hora' ? 'Piezas requeridas por hora' : 'Piezas requeridas por turno';
    const operatorLoads = getDashboardOperatorLoads(draft.area, draft.line);
    const metrics = computeDashboardMetrics(draft, operatorLoads);
    metricsEl.innerHTML = renderDashboardMetricCards(metrics, draft.period);
    chartEl.innerHTML = renderDashboardOperatorChart(metrics, operatorLoads);
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

  periodEl.addEventListener('change', () => {
    availableEl.value = DASHBOARD_PERIOD_SECONDS[periodEl.value];
    refreshDashboard();
  });

  [piecesEl, availableEl].forEach(input => {
    input.addEventListener('input', refreshDashboard);
  });

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

// ── Stubs para fases futuras ──────────────────
function renderCatalogs(container) {
  const ops    = state.operations;
  const active = ops.filter(o => o.active).length;
  const takt   = calculateTaktTime(state.balanceSettings);
  const twc    = calculateTotalWorkContent(getActiveOperations());

  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Catálogos</h1>
      <p class="page-subtitle">Estructura jerárquica y operaciones de la línea de producción</p>
    </div>

    <div class="entity-grid mb-6">
      <div class="entity-card">
        <div class="entity-card-label">Planta</div>
        <div class="entity-card-name">${esc(state.plant.name)}</div>
        <div class="entity-card-meta">${esc(state.plant.location)}</div>
      </div>
      <div class="entity-card">
        <div class="entity-card-label">Área</div>
        <div class="entity-card-name">${esc(state.area.name)}</div>
        <div class="entity-card-meta">${esc(state.process.name)}</div>
      </div>
      <div class="entity-card">
        <div class="entity-card-label">Línea de Producción</div>
        <div class="entity-card-name">${esc(state.line.name)}</div>
        <div class="entity-card-meta">${esc(state.line.type)}</div>
      </div>
      <div class="entity-card">
        <div class="entity-card-label">Proceso</div>
        <div class="entity-card-name">${esc(state.process.name)}</div>
        <div class="entity-card-meta">${active} actividades activas</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">Operaciones</div>
          <div class="card-subtitle">${ops.length} registradas · ${active} activas · TWC: ${twc} seg · Takt: ${fmt(takt)} seg</div>
        </div>
        <button class="btn btn--primary btn--sm" id="btn-add-op">+ Agregar Operación</button>
      </div>
      <div style="overflow-x:auto;border-radius:0 0 var(--radius-lg) var(--radius-lg);">
        <table>
          <thead>
            <tr>
              <th style="width:44px">#</th>
              <th>Actividad</th>
              <th style="width:130px">Tiempo Est. (s)</th>
              <th style="width:90px">Estado</th>
              <th style="width:90px">Orden</th>
              <th class="td-actions">Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${ops.map((op, i) => `
              <tr class="${!op.active ? 'row--inactive' : op.standardTime > takt ? 'row--overload' : ''}">
                <td class="font-mono" style="color:var(--text-muted);font-size:var(--font-12)">${op.sequence}</td>
                <td>
                  ${esc(op.name)}
                  ${op.isTemporary ? '<span class="badge badge--warning" style="margin-left:6px">Temporal</span>' : ''}
                </td>
                <td>
                  <strong class="font-mono" style="${op.standardTime > takt ? 'color:var(--danger)' : ''}">${op.standardTime}</strong>
                  ${op.standardTime > takt && op.active ? '<span class="badge badge--danger" style="margin-left:4px;font-size:10px">Excede takt</span>' : ''}
                </td>
                <td>
                  ${op.active
                    ? '<span class="badge badge--success">Activo</span>'
                    : '<span class="badge badge--neutral">Inactivo</span>'}
                </td>
                <td class="td-actions">
                  <button class="btn btn--ghost btn--sm" data-up-op="${op.id}"${i === 0 ? ' disabled' : ''} title="Subir">↑</button>
                  <button class="btn btn--ghost btn--sm" data-down-op="${op.id}"${i === ops.length - 1 ? ' disabled' : ''} title="Bajar">↓</button>
                </td>
                <td class="td-actions">
                  <button class="btn btn--ghost btn--sm" data-edit-op="${op.id}">Editar</button>
                  <button class="btn btn--ghost btn--sm" data-toggle-op="${op.id}">${op.active ? 'Desactivar' : 'Activar'}</button>
                  <button class="btn btn--ghost btn--sm" style="color:var(--danger)" data-delete-op="${op.id}">Eliminar</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById('btn-add-op').addEventListener('click', () => openOperationModal());
  container.querySelectorAll('[data-edit-op]').forEach(btn =>
    btn.addEventListener('click', () => openOperationModal(btn.dataset.editOp)));
  container.querySelectorAll('[data-delete-op]').forEach(btn =>
    btn.addEventListener('click', () => confirmDeleteOp(btn.dataset.deleteOp)));
  container.querySelectorAll('[data-toggle-op]').forEach(btn =>
    btn.addEventListener('click', () => toggleOperationActive(btn.dataset.toggleOp)));
  container.querySelectorAll('[data-up-op]').forEach(btn =>
    btn.addEventListener('click', () => moveOperation(btn.dataset.upOp, -1)));
  container.querySelectorAll('[data-down-op]').forEach(btn =>
    btn.addEventListener('click', () => moveOperation(btn.dataset.downOp, 1)));
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
              <th style="width:150px">% del Takt</th>
              <th style="width:80px">Versión</th>
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
                    <div style="display:flex;align-items:center;gap:6px">
                      <div class="takt-bar-bg">
                        <div class="takt-bar-fill ${overTakt ? 'takt-bar-fill--over' : ''}" style="width:${Math.min(pct,100)}%"></div>
                      </div>
                      <span class="font-mono" style="font-size:var(--font-12);min-width:36px;color:${overTakt ? 'var(--danger)' : 'var(--text-secondary)'}">${pct}%</span>
                    </div>
                  </td>
                  <td><span class="badge badge--neutral">${esc(st.version ?? 'v1.0')}</span></td>
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
    <div class="page-header">
      <h1 class="page-title">Estudios de Tiempo</h1>
      <p class="page-subtitle">Catálogo de actividades por estación y subconjunto · ${esc(state.line.name)}</p>
    </div>

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
      renderTimeStudy(container);
    });
  });

  container.querySelectorAll('[data-ts-subset]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.timeStudySelection.subsetId = btn.dataset.tsSubset;
      saveState();
      renderTimeStudy(container);
    });
  });

  container.querySelectorAll('[data-ts-jump]').forEach(btn => {
    btn.addEventListener('click', () => {
      const [stationId, subsetId] = btn.dataset.tsJump.split(':');
      state.timeStudySelection.stationId = stationId;
      state.timeStudySelection.subsetId = subsetId;
      saveState();
      renderTimeStudy(container);
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
    renderTimeStudy(container);
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
    { key: 'editCatalogs',     label: 'Editar Catálogos' },
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
function openModal(title, bodyHTML) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML    = bodyHTML;
  document.getElementById('modal-backdrop').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-backdrop').classList.add('hidden');
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
      closeModal();
      document.getElementById('confirm-backdrop')?.classList.add('hidden');
    }
  });

  // Update header info
  const headerPlant = document.getElementById('header-plant');
  const headerLine  = document.getElementById('header-line');
  if (headerPlant) headerPlant.textContent = state.plant.name;
  if (headerLine)  headerLine.textContent  = state.line.name;

  renderApp();
});
