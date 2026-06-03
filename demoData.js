/* ═══════════════════════════════════════════════
   KaiFlow · demoData.js
   Estado inicial demo — Fujikura Puebla
   ═══════════════════════════════════════════════ */

const CATALOG_VERSION = 'manufacturing-v1';

const MANUFACTURING_ACTIVITY_CATALOG = [
  { id: 'ACT-001', no: 1,  name: 'Tomar y escanear',                                std: 4.4 },
  { id: 'ACT-002', no: 2,  name: 'Seleccionar planificación',                       std: 2.7 },
  { id: 'ACT-003', no: 3,  name: 'Tomar conector y colocar en contra',              std: 3.44 },
  { id: 'ACT-004', no: 4,  name: 'Encliquetar circuito + PULL',                     std: 3.6 },
  { id: 'ACT-005', no: 5,  name: 'Realizar prueba de continuidad',                  std: 2.6 },
  { id: 'ACT-006', no: 6,  name: 'Colocar tapón en conector',                       std: 4.68 },
  { id: 'ACT-007', no: 7,  name: 'Desmontar',                                       std: 7.09 },
  { id: 'ACT-008', no: 8,  name: 'Cerrar seguridad',                                std: 1.8 },
  { id: 'ACT-009', no: 9,  name: 'Colocar seguridad a conector',                    std: 4.32 },
  { id: 'ACT-010', no: 10, name: 'Enfilar tubo corrugado',                          std: 14.39 },
  { id: 'ACT-011', no: 11, name: 'Coger y colocar pieza final de tubo',             std: 7.91 },
  { id: 'ACT-012', no: 12, name: 'Coger y colocar capuchón en conector',            std: 8.99 },
  { id: 'ACT-013', no: 13, name: 'Cerrar tapa a conector',                          std: 5.4 },
  { id: 'ACT-014', no: 14, name: 'Colocar bridas en conector',                      std: 6.47 },
  { id: 'ACT-015', no: 15, name: 'Colocar gomas',                                   std: 10.31 },
  { id: 'ACT-016', no: 16, name: 'Colocar etiqueta',                                std: 12.95 },
  { id: 'ACT-017', no: 17, name: 'Marcas de garantía',                              std: 0.0 },
  { id: 'ACT-018', no: 18, name: 'Enrollar manualmente cables (Diam. aro = 600mm)', std: 6.76 },
  { id: 'ACT-019', no: 19, name: 'Colocar liga',                                    std: 7.5 },
  { id: 'ACT-020', no: 20, name: 'Empaque / colgar SUB',                            std: 4.82 }
];

const TIME_STUDY_STATIONS = [
  { id: 'station-1', name: 'Estación 1', subsets: ['SGD_Q500', 'BFS/BFS-R'] },
  { id: 'station-2', name: 'Estación 2', subsets: ['4MOVO', 'WWB', 'ASE1/ASE-NAR'] }
];

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
  activityCatalog: MANUFACTURING_ACTIVITY_CATALOG,

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

  operations: buildDefaultOperations(),

  standardTimes: buildDefaultStandardTimes(),

  timeStudies: [],
  timeStudySelection: {
    stationId: 'station-1',
    subsetId: 'station-1-subset-1'
  },
  timeStudyStructure: buildTimeStudyStructure(),

  balanceSettings: {
    requiredQuantity: 900,
    shiftHours: 8,
    breakMinutes: 30,
    meetingMinutes: 0,
    desiredStations: 8
  },

  stationAssignments: [],

  scenarios: [
    {
      id: 'SCN-001',
      name: 'Estado Actual',
      description: 'Condición base sin modificaciones',
      isBaseline: true,
      isCustom: false,
      params: {
        requiredQuantity: 900,
        shiftHours: 8,
        breakMinutes: 30,
        meetingMinutes: 0,
        extraOperators: 0,
        improvementOperationId: null,
        improvementPercent: 0
      }
    },
    {
      id: 'SCN-002',
      name: '+1 Operador',
      description: 'Agregar un operador adicional a la línea',
      isBaseline: false,
      isCustom: false,
      params: {
        requiredQuantity: 900,
        shiftHours: 8,
        breakMinutes: 30,
        meetingMinutes: 0,
        extraOperators: 1,
        improvementOperationId: null,
        improvementPercent: 0
      }
    },
    {
      id: 'SCN-003',
      name: 'Demanda +10%',
      description: 'Incremento de demanda en 10%',
      isBaseline: false,
      isCustom: false,
      params: {
        requiredQuantity: 990,
        shiftHours: 8,
        breakMinutes: 30,
        meetingMinutes: 0,
        extraOperators: 0,
        improvementOperationId: null,
        improvementPercent: 0
      }
    },
    {
      id: 'SCN-004',
      name: 'Mejorar cuello -15%',
      description: 'Reducir tiempo del cuello de botella (Enfilar tubo corrugado) en 15%',
      isBaseline: false,
      isCustom: false,
      params: {
        requiredQuantity: 900,
        shiftHours: 8,
        breakMinutes: 30,
        meetingMinutes: 0,
        extraOperators: 0,
        improvementOperationId: 'ACT-010',
        improvementPercent: 15
      }
    },
    {
      id: 'SCN-005',
      name: 'Reducir tubo corrugado -20%',
      description: 'Mejora de método en enfilar tubo corrugado, reducción 20%',
      isBaseline: false,
      isCustom: false,
      params: {
        requiredQuantity: 900,
        shiftHours: 8,
        breakMinutes: 30,
        meetingMinutes: 0,
        extraOperators: 0,
        improvementOperationId: 'ACT-010',
        improvementPercent: 20
      }
    }
  ],

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
