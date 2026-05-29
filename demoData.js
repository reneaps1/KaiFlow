/* ═══════════════════════════════════════════════
   KaiFlow · demoData.js
   Estado inicial demo — Fujikura Puebla
   ═══════════════════════════════════════════════ */

const DEFAULT_STATE = {
  currentPage: 'dashboard',

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

  operations: [
    { id: 'OP-01', sequence: 1,  code: 'WC-001', name: 'Preparación de corte de cable',    standardTime: 8,  active: true },
    { id: 'OP-02', sequence: 2,  code: 'TC-002', name: 'Crimpado de terminales',            standardTime: 18, active: true },
    { id: 'OP-03', sequence: 3,  code: 'SI-003', name: 'Inserción de sellos',               standardTime: 12, active: true },
    { id: 'OP-04', sequence: 4,  code: 'CL-004', name: 'Carga de conectores',               standardTime: 22, active: true },
    { id: 'OP-05', sequence: 5,  code: 'SR-005', name: 'Enrutamiento de sub-ensamble',      standardTime: 35, active: true },
    { id: 'OP-06', sequence: 6,  code: 'CI-006', name: 'Instalación de clips',              standardTime: 16, active: true },
    { id: 'OP-07', sequence: 7,  code: 'TW-007', name: 'Encinchado con cinta',              standardTime: 42, active: true },
    { id: 'OP-08', sequence: 8,  code: 'VI-008', name: 'Inspección visual',                standardTime: 20, active: true },
    { id: 'OP-09', sequence: 9,  code: 'ET-009', name: 'Prueba eléctrica',                 standardTime: 30, active: true },
    { id: 'OP-10', sequence: 10, code: 'FP-010', name: 'Empaque final',                    standardTime: 15, active: true }
  ],

  standardTimes: [
    { operationId: 'OP-01', version: 'v1.0', status: 'active', effectiveDate: '2025-01-15', updatedAt: '2025-01-15', updatedBy: 'Ing. García', isTemporary: false },
    { operationId: 'OP-02', version: 'v1.0', status: 'active', effectiveDate: '2025-01-15', updatedAt: '2025-01-15', updatedBy: 'Ing. García', isTemporary: false },
    { operationId: 'OP-03', version: 'v1.0', status: 'active', effectiveDate: '2025-01-15', updatedAt: '2025-01-15', updatedBy: 'Ing. López', isTemporary: false },
    { operationId: 'OP-04', version: 'v1.0', status: 'active', effectiveDate: '2025-01-15', updatedAt: '2025-02-03', updatedBy: 'Ing. López', isTemporary: false },
    { operationId: 'OP-05', version: 'v2.0', status: 'active', effectiveDate: '2025-02-10', updatedAt: '2025-02-10', updatedBy: 'Ing. Martínez', isTemporary: false },
    { operationId: 'OP-06', version: 'v1.0', status: 'active', effectiveDate: '2025-01-15', updatedAt: '2025-01-15', updatedBy: 'Ing. García', isTemporary: false },
    { operationId: 'OP-07', version: 'v1.1', status: 'active', effectiveDate: '2025-03-01', updatedAt: '2025-03-01', updatedBy: 'Ing. Martínez', isTemporary: false },
    { operationId: 'OP-08', version: 'v1.0', status: 'active', effectiveDate: '2025-01-15', updatedAt: '2025-01-15', updatedBy: 'Ing. López', isTemporary: false },
    { operationId: 'OP-09', version: 'v1.2', status: 'active', effectiveDate: '2025-03-15', updatedAt: '2025-03-15', updatedBy: 'Ing. García', isTemporary: false },
    { operationId: 'OP-10', version: 'v1.0', status: 'active', effectiveDate: '2025-01-15', updatedAt: '2025-01-15', updatedBy: 'Ing. Martínez', isTemporary: false }
  ],

  timeStudies: [],

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
      description: 'Reducir tiempo del cuello de botella (Encinchado) en 15%',
      isBaseline: false,
      isCustom: false,
      params: {
        requiredQuantity: 900,
        shiftHours: 8,
        breakMinutes: 30,
        meetingMinutes: 0,
        extraOperators: 0,
        improvementOperationId: 'OP-07',
        improvementPercent: 15
      }
    },
    {
      id: 'SCN-005',
      name: 'Reducir Encinchado -20%',
      description: 'Mejora de método en encinchado con cinta, reducción 20%',
      isBaseline: false,
      isCustom: false,
      params: {
        requiredQuantity: 900,
        shiftHours: 8,
        breakMinutes: 30,
        meetingMinutes: 0,
        extraOperators: 0,
        improvementOperationId: 'OP-07',
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
