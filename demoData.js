/* ═══════════════════════════════════════════════
   KaiFlow · demoData.js
   Estado inicial — limpio para seed
   ═══════════════════════════════════════════════ */

const CATALOG_VERSION = 'manufacturing-v1';

/* Catálogo de actividades vacío — se poblará vía seed */
const MANUFACTURING_ACTIVITY_CATALOG = [];

/* Estaciones de estudio de tiempos vacías — se poblarán vía seed */
const TIME_STUDY_STATIONS = [];

function buildActivityRows(frequencies = {}) {
  return MANUFACTURING_ACTIVITY_CATALOG.map(activity => ({
    activityId: activity.id,
    no: activity.no,
    name: activity.name,
    std: activity.std,
    frequency: Number(frequencies[activity.id] ?? frequencies[activity.no] ?? 0)
  }));
}

function buildTimeStudyStructure(seed = {}) {
  return TIME_STUDY_STATIONS.map(station => ({
    id: station.id,
    name: station.name,
    subconjuntos: station.subsets.map((subsetName, index) => {
      const subsetId = `${station.id}-subset-${index + 1}`;
      const seedFreq = seed[subsetId] || seed[subsetName] || {};
      return {
        id: subsetId,
        name: subsetName,
        actividades: buildActivityRows(seedFreq)
      };
    })
  }));
}

function buildDefaultOperations() {
  return MANUFACTURING_ACTIVITY_CATALOG.map(activity => ({
    id: activity.id,
    sequence: activity.no,
    name: activity.name,
    standardTime: activity.std,
    active: true
  }));
}

function buildDefaultStandardTimes() {
  return MANUFACTURING_ACTIVITY_CATALOG.map(activity => ({
    operationId: activity.id,
    version: 'v1.0',
    status: 'active',
    effectiveDate: '2026-05-28',
    updatedAt: '2026-05-28',
    updatedBy: 'Ingeniería Industrial',
    isTemporary: false
  }));
}

const DEFAULT_STATE = {
  currentPage: 'dashboard',
  catalogVersion: CATALOG_VERSION,
  activityCatalog: [],

  plant: {
    id: 'PLT-001',
    name: 'Fujikura Puebla',
    code: 'FJK-PUE',
    location: 'Puebla, México'
  },

  area: {
    id: 'AREA-001',
    name: 'Ensamble',
    code: 'ASSY',
    plantId: 'PLT-001'
  },

  line: {
    id: 'LINE-001',
    name: 'Harness Line 01',
    code: 'HL-01',
    areaId: 'AREA-001',
    type: 'Ensamble de Arnés Automotriz'
  },

  process: {
    id: 'PROC-001',
    name: 'Ensamble de Arnés Automotriz',
    code: 'AHA-01',
    lineId: 'LINE-001'
  },

  operations: [],
  standardTimes: [],

  timeStudies: [],
  timeStudySelection: { stationId: null, subsetId: null },
  timeStudyStructure: [],

  balanceSettings: {
    requiredQuantity: 900,
    shiftHours: 8,
    breakMinutes: 30,
    meetingMinutes: 0,
    desiredStations: 8
  },

  stationAssignments: [],

  scenarios: [],

  roles: [
    {
      id: 'ROLE-001',
      name: 'Administrador',
      code: 'ADMIN',
      permissions: {
        editCatalogs: true,
        editStandardTimes: true,
        runBalance: true,
        approveBalance: true,
        viewReports: true,
        manageUsers: true
      }
    },
    {
      id: 'ROLE-002',
      name: 'Ingeniería Industrial',
      code: 'IE',
      permissions: {
        editCatalogs: true,
        editStandardTimes: true,
        runBalance: true,
        approveBalance: false,
        viewReports: true,
        manageUsers: false
      }
    },
    {
      id: 'ROLE-003',
      name: 'Supervisor de Producción',
      code: 'PROD',
      permissions: {
        editCatalogs: false,
        editStandardTimes: false,
        runBalance: true,
        approveBalance: true,
        viewReports: true,
        manageUsers: false
      }
    },
    {
      id: 'ROLE-004',
      name: 'Calidad',
      code: 'QA',
      permissions: {
        editCatalogs: false,
        editStandardTimes: false,
        runBalance: false,
        approveBalance: false,
        viewReports: true,
        manageUsers: false
      }
    },
    {
      id: 'ROLE-005',
      name: 'Visualizador',
      code: 'VIEWER',
      permissions: {
        editCatalogs: false,
        editStandardTimes: false,
        runBalance: false,
        approveBalance: false,
        viewReports: true,
        manageUsers: false
      }
    }
  ]
};

const STORAGE_KEY = 'fujikuraLineBalanceDemo';
