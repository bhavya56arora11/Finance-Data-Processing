import { PERMISSIONS } from './permissions.js';

const P = PERMISSIONS;

export const ROLES = {
  SUPER_ADMIN:      'super_admin',
  ADMIN:            'admin',
  FINANCE_MANAGER:  'finance_manager',
  ACCOUNTANT:       'accountant',
  AUDITOR:          'auditor',
  ANALYST:          'analyst',
  VIEWER:           'viewer',
  EXTERNAL_AUDITOR: 'external_auditor',
};

export const ROLE_PERMISSIONS = {
  [ROLES.SUPER_ADMIN]: Object.values(P),

  [ROLES.ADMIN]: [
    P.READ_TRANSACTIONS,
    P.CREATE_TRANSACTIONS,
    P.UPDATE_TRANSACTIONS,
    P.DELETE_TRANSACTIONS,
    P.MANAGE_USERS,
    P.VIEW_AUDIT_LOGS,
    P.EXPORT_DATA,
    P.VIEW_DASHBOARD,
    P.VIEW_INSIGHTS,
  ],

  [ROLES.FINANCE_MANAGER]: [
    P.READ_TRANSACTIONS,
    P.CREATE_TRANSACTIONS,
    P.UPDATE_TRANSACTIONS,
    P.APPROVE_TRANSACTIONS,
    P.VIEW_DASHBOARD,
    P.VIEW_INSIGHTS,
    P.EXPORT_DATA,
  ],

  [ROLES.ACCOUNTANT]: [
    P.READ_TRANSACTIONS,
    P.CREATE_TRANSACTIONS,
    P.UPDATE_TRANSACTIONS,
    P.VIEW_DASHBOARD,
  ],

  [ROLES.AUDITOR]: [
    P.READ_TRANSACTIONS,
    P.VIEW_DELETED,
    P.VIEW_AUDIT_LOGS,
    P.VIEW_DASHBOARD,
    P.EXPORT_DATA,
  ],

  [ROLES.ANALYST]: [
    P.READ_TRANSACTIONS,
    P.VIEW_DASHBOARD,
    P.VIEW_INSIGHTS,
  ],

  [ROLES.VIEWER]: [
    P.READ_TRANSACTIONS,
    P.VIEW_DASHBOARD,
  ],

  [ROLES.EXTERNAL_AUDITOR]: [
    P.READ_TRANSACTIONS,
    P.VIEW_DASHBOARD,
  ],
};

export function getRolePermissions(role) {
  return ROLE_PERMISSIONS[role] ?? [];
}