/* ═══════════════════════════════════════════════
   KaiFlow · demoData.js
   Estado inicial — limpio para seed
   ═══════════════════════════════════════════════ */

const CATALOG_VERSION = 'manufacturing-v1';

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
