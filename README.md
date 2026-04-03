# Finance Dashboard Backend

A production-thinking backend for a fintech company's finance dashboard, built to demonstrate architecture, security, and code quality decisions — not just working endpoints.

---

## Project Overview

This API serves a multi-role finance dashboard with full transaction lifecycle management, permission-based access control, structured audit logging, and aggregation-driven reporting. Every design decision prioritizes correctness and security over brevity.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 18+ (ES Modules) |
| Framework | Express 4 |
| Database | MongoDB via Mongoose 8 |
| Authentication | JWT (jsonwebtoken) — dual-token strategy |
| Validation | Zod — schema-first, with cross-field rules |
| Password Hashing | bcryptjs (rounds: 12) |
| Request Logging | Morgan |
| Rate Limiting | express-rate-limit |
| Unique IDs | uuid (per-request correlation IDs) |

---

## Architecture Decisions

### 1. Permission-Based Middleware, Not Role-Based
Routes use `requirePermission('read:transactions')` rather than `requireRole('admin')`. This means:
- Roles are data (defined in `constants/roles.js`), not code
- Adding a new role never requires touching middleware or routes
- A single role change in `ROLE_PERMISSIONS` propagates everywhere automatically

### 2. Soft Delete on Transactions
Hard deletes are irreversible and destroy the audit trail. Soft delete (`isDeleted`, `deletedAt`, `deletedBy`) means:
- Auditors can query deleted records with `view:deleted` permission
- The change history is preserved
- The `Transaction` model's `pre('find')` hook automatically hides deleted records unless the caller sets `_includeDeleted: true`

### 3. JWT Over Sessions
Sessions require server-side state (Redis, DB) — JWT is stateless. Trade-off: role changes don't take effect until the next token refresh (15 minutes max). This is acceptable for this use case and documented in Known Tradeoffs.

### 4. Two-Token Strategy
- **Access token** (15m): short-lived, carried in `Authorization: Bearer` header
- **Refresh token** (7d): longer-lived, stored in `httpOnly; SameSite=Strict` cookie scoped to `/auth/refresh` only — inaccessible to JavaScript, not sent with other API requests

### 5. Centralized Error Infrastructure
All errors extend `AppError`. The global handler in `errorHandler.js` maps 7 different error origins (AppError, Mongoose validation, CastError, duplicate key, JWT errors, unknowns) to a single consistent JSON envelope. No raw Express HTML ever reaches the client.

### 6. Audit Log as a Service
`auditService.log()` is the only entrypoint to `AuditLog.create()`. Failures are caught and logged to stderr — they never propagate to the caller, so a DB hiccup during logging cannot fail a user-facing operation.

---

## Setup Instructions

```bash
# 1. Clone and install
git clone <repo-url>
cd finance-backend
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — fill in MONGO_URI, JWT_SECRET, JWT_REFRESH_SECRET

# 3. Seed the database (creates 7 users + 20 sample transactions)
npm run seed

# 4. Start development server
npm run dev

# 5. Health check
curl http://localhost:3000/health
```

> **Requirements**: Node.js ≥ 18, MongoDB running locally or connection string in `.env`

---

## Role System

| Role | Permissions |
|---|---|
| `super_admin` | All permissions |
| `admin` | read, create, update, delete transactions · manage users · view audit logs · export · dashboard · insights |
| `finance_manager` | read, create, update, **approve** transactions · dashboard · insights · export |
| `accountant` | read, create, update transactions · dashboard |
| `auditor` | read + **view deleted** transactions · view audit logs · dashboard · export |
| `analyst` | read transactions · dashboard · **insights** |
| `viewer` | read transactions (own department only) · dashboard |
| `external_auditor` | read (scoped to assigned record IDs only) · dashboard |

> Role permissions are defined as data in `src/constants/roles.js` — `ROLE_PERMISSIONS` map.

---

## API Reference

### Auth

| Method | Path | Permission | Description |
|---|---|---|---|
| `POST` | `/auth/register` | Public | Self-register (always assigns viewer role) |
| `POST` | `/auth/login` | Public | Login, receive access token + refresh cookie |
| `POST` | `/auth/refresh` | Public (cookie) | Exchange refresh cookie for new access token |
| `POST` | `/auth/logout` | Public | Clear refresh token cookie |

### Users

| Method | Path | Permission | Description |
|---|---|---|---|
| `GET` | `/users` | `manage:users` | List users (filters: role, status, department; paginated) |
| `GET` | `/users/:id` | `manage:users` OR own profile | Get single user |
| `PATCH` | `/users/:id` | `manage:users` | Update name / department / status |
| `PATCH` | `/users/:id/role` | `manage:roles` | Change role (super_admin protection enforced) |
| `DELETE` | `/users/:id` | `manage:users` | Soft-delete (sets status inactive) |

### Transactions

| Method | Path | Permission | Description |
|---|---|---|---|
| `POST` | `/transactions` | `create:transactions` | Create transaction |
| `GET` | `/transactions` | `read:transactions` | List with filters + scope + pagination |
| `GET` | `/transactions/:id` | `read:transactions` | Get single transaction (scope enforced) |
| `PUT` | `/transactions/:id` | `update:transactions` | Update transaction (state machine rules apply) |
| `DELETE` | `/transactions/:id` | `delete:transactions` | Soft-delete (blocked if approved) |
| `PATCH` | `/transactions/:id/approve` | `approve:transactions` | Approve pending transaction |
| `PATCH` | `/transactions/:id/reject` | `approve:transactions` | Reject with required reason |
| `PATCH` | `/transactions/:id/void` | `update:transactions` + privileged role | Void any non-voided transaction |

### Dashboard

| Method | Path | Permission | Description |
|---|---|---|---|
| `GET` | `/dashboard/summary` | `view:dashboard` | Total income, expenses, net, by-status, by-currency (single $facet query) |
| `GET` | `/dashboard/category-breakdown` | `view:dashboard` | Category totals, filterable by type / date / fiscal year |
| `GET` | `/dashboard/trends` | `view:insights` | Monthly or weekly income/expense/net time series |
| `GET` | `/dashboard/department-breakdown` | `view:insights` | Per-department income, expenses, net, count |
| `GET` | `/dashboard/recent-activity` | `view:dashboard` | Last N transactions with creator name (default 10, max 50) |

---

## Error Codes Reference

| Code | HTTP Status | When It Occurs |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Zod or Mongoose schema validation fails |
| `INVALID_ID` | 400 | MongoDB ObjectId is malformed (CastError) |
| `AUTHENTICATION_ERROR` | 401 | Missing, invalid, or expired token; wrong credentials |
| `TOKEN_EXPIRED` | 401 | JWT signature valid but token has expired |
| `AUTHORIZATION_ERROR` | 403 | User authenticated but lacks required permission |
| `SCOPE_VIOLATION` | 403 | User tries to access records outside their data scope |
| `OPERATION_NOT_PERMITTED` | 403 | Role-level restriction beyond permission check (e.g. void by accountant) |
| `NOT_FOUND` | 404 | Requested resource does not exist |
| `CONFLICT` | 409 | Duplicate key (email, referenceNumber) |
| `INVALID_STATE_TRANSITION` | 409 | Invalid status machine move (e.g. approve an already-approved transaction) |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests for the route's limiter window |
| `DATABASE_ERROR` | 500 | Unexpected Mongoose/MongoDB error (no internals leaked) |
| `INTERNAL_SERVER_ERROR` | 500 | Unhandled programming error (no internals leaked in production) |

All error responses follow this exact shape:
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": null,
    "timestamp": "2025-01-01T00:00:00.000Z",
    "requestId": "uuid-v4"
  }
}
```

---

## Assumptions Made

1. **Base currency is USD** — `convertedAmount` and `baseCurrency` fields are placeholders; actual FX conversion is a Phase 2 concern
2. **Fiscal year starts January 1** — calendar year = fiscal year; Q1 = Jan–Mar, Q2 = Apr–Jun, Q3 = Jul–Sep, Q4 = Oct–Dec
3. **Self-registration always produces a viewer** — elevated roles are assigned by an admin via `PATCH /users/:id/role`
4. **External auditor scope is set by admin** — the `scopedRecords` array on the user document is populated by an admin; there's no UI flow for this in this phase
5. **Refresh tokens are stateless** — not stored server-side; revocation is not instant but bounded by the 15-minute access token TTL
6. **Audit logs are append-only** — there is no delete or update API for audit logs
7. **Password-reset flow is out of scope** — would require email delivery (Phase 2)

---

## Known Tradeoffs

| Tradeoff | Rationale |
|---|---|
| No real FX conversion | Requires an external rates API; `convertedAmount` is set to `amount` as a placeholder |
| No email verification | Out of scope for this phase; would require an email provider integration |
| Stateless refresh tokens | No server-side storage means instant revocation isn't possible. Mitigation: short (15m) access token TTL |
| Role changes need refresh | Because permissions are baked into the JWT at login time, a role change doesn't take effect until the user logs in again or refreshes their token |
| Text search requires index warmup | MongoDB text indexes take time to build on large existing datasets |

---

## Phase 2 Enhancements

- **Real FX conversion**: Integrate an exchange rate API (e.g. Open Exchange Rates) to populate `convertedAmount` at creation time
- **Token revocation**: Maintain a Redis-backed token blacklist for immediate refresh token invalidation on logout/role change
- **Email verification & password reset**: SMTP/SendGrid integration with time-limited verification tokens
- **Webhook events**: Emit events on transaction approval/rejection for downstream systems
- **Bulk operations**: Import transactions via CSV with streaming validation
- **Audit log TTL**: Automatic rotation of audit logs older than N days via MongoDB TTL index
- **External auditor management**: Admin UI flow to assign `scopedRecords` to `external_auditor` accounts
- **Two-factor authentication**: TOTP-based 2FA for admin and finance_manager roles
