/**
 * Centralized permission registry.
 * All permission strings live here — never hardcode them in routes or middleware.
 */
export const PERMISSIONS = {
  READ_TRANSACTIONS:    'read:transactions',
  CREATE_TRANSACTIONS:  'create:transactions',
  UPDATE_TRANSACTIONS:  'update:transactions',
  DELETE_TRANSACTIONS:  'delete:transactions',
  APPROVE_TRANSACTIONS: 'approve:transactions',
  VIEW_DELETED:         'view:deleted',
  MANAGE_USERS:         'manage:users',
  MANAGE_ROLES:         'manage:roles',
  VIEW_AUDIT_LOGS:      'view:audit_logs',
  EXPORT_DATA:          'export:data',
  VIEW_DASHBOARD:       'view:dashboard',
  VIEW_INSIGHTS:        'view:insights',
};
