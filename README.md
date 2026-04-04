# Finance Dashboard Backend

A backend API for a multi-role finance dashboard system. Built as an internship assignment for Zorvyn, this project goes beyond basic CRUD to demonstrate how real financial systems handle access control, data integrity, audit trails, and reporting.

## What This Project Does

Imagine a company where different employees need different levels of access to financial data. An accountant should be able to log transactions but not delete them. An auditor should be able to see everything including deleted records. A viewer from the marketing department should only see their own department's data.

This backend handles all of that. It manages users, their roles, financial transactions, reports, and notifications — while making sure every action is properly authorized, validated, and logged.

## Tech Stack

| What | Why |

| Node.js + Express | Lightweight, fast to set up, great ecosystem for REST APIs |
| MongoDB + Mongoose | Flexible document model works well for financial records with varying fields |
| JWT | Stateless authentication — no server-side session storage needed |
| Zod | Schema-based validation that catches bad input before it reaches the database |
| bcryptjs | Secure password hashing — passwords are never stored in plain text |
| express-rate-limit | Prevents brute force attacks on login and abuse on heavy endpoints |
| Jest + Supertest | Testing without spinning up a real server or database |
| Swagger UI | Auto-generated interactive API documentation |

## Getting Started

You need Node.js 18 or higher and a running MongoDB instance before starting.
```bash
# Step 1 — Clone the project and install dependencies
git clone (to clone the repository)
npm install

# Step 2 — Create your environment file
cp .env.example .env
```

Open `.env` and fill in these values:
```
PORT=3000
MONGO_URI=mongodb://localhost:27017/finance-dashboard
JWT_SECRET=pick_a_long_random_string
JWT_REFRESH_SECRET=pick_a_different_long_random_string
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d
NODE_ENV=development
BASE_CURRENCY=USD
```
```bash
# Step 3 — Seed the database with sample users, categories, and transactions
npm run seed

# Step 4 — Start the development server
npm run dev
```

Once running, visit `http://localhost:3000/health` to confirm the server is up.

## Exploring the API

The easiest way to explore all endpoints is through the interactive Swagger docs:
```
http://localhost:3000/api-docs
```

Every endpoint is documented there with request examples, required fields, and response shapes. You can make real API calls directly from the browser.

## Seeded Users

After running `npm run seed`, these users are available to test with. Every role in the system has a corresponding test account:

| Role | Email | Password |

| super_admin | superadmin@finance.dev | Password123 |
| admin | admin@finance.dev | Password123 |
| finance_manager | manager@finance.dev | Password123 |
| accountant | accountant@finance.dev | Password123 |
| auditor | auditor@finance.dev | Password123 |
| analyst | analyst@finance.dev | Password123 |
| viewer | viewer@finance.dev | Password123 |
| external_auditor | external@finance.dev | Password123 |

## How Roles Work

Instead of checking roles directly in routes (like `if role === 'admin'`), this system uses permissions. Each role is assigned a set of permissions, and routes check for a specific permission rather than a specific role.

This means if you ever need to add a new role or adjust what an existing role can do, you only change one place — the `ROLE_PERMISSIONS` map in `src/constants/roles.js` — and it automatically applies everywhere.

Here is what each role can do:

| Role | What they can do |

| `super_admin` | Everything |
| `admin` | Full transaction management, user management, audit logs, export, dashboard |
| `finance_manager` | Create and update transactions, approve or reject pending ones, export, dashboard insights |
| `accountant` | Create and update transactions (goes to approval queue), view dashboard |
| `auditor` | Read-only access including soft-deleted records, audit logs, export |
| `analyst` | Read transactions, view dashboard and insights |
| `viewer` | Read transactions from their own department only, basic dashboard |
| `external_auditor` | Read-only access limited to specific records assigned by an admin |

## How Authentication Works

Login returns two tokens:

- **Access token** — valid for 15 minutes, sent in the `Authorization: Bearer` header with every request
- **Refresh token** — valid for 7 days, stored in an httpOnly cookie and used to get a new access token without logging in again

When a refresh token is used, a new one is issued and the old one is immediately invalidated. If someone tries to reuse an old refresh token, the system detects it and kills the session entirely. This protects against token theft.

## Transaction Lifecycle

Transactions do not just exist in two states. They move through a defined workflow:
```
draft → pending_approval → approved
                        → rejected
approved → voided
```

Who controls each step:

- Accountants create transactions — they land in `pending_approval`
- Finance managers and above can approve or reject
- Admins can create pre-approved transactions directly
- Only senior roles can void an approved transaction
- Approved transactions cannot be deleted — they must be voided first

## What Happens When Something Is Deleted

Nothing is permanently deleted from the transactions table. Instead a soft delete marks the record as deleted with a timestamp and who deleted it. The record disappears from normal queries but stays in the database.

Auditors can still see soft-deleted records. Admins can restore them. This preserves the full audit trail which matters a lot in financial systems.

## Reports

Generating a report for a full year or quarter can be slow because it involves heavy database aggregations. Rather than making the client wait, the system works like this:

1. You request a report — the API responds immediately with a report ID and status `generating`
2. The aggregation runs in the background
3. When done, the report status updates to `ready` and you get a notification
4. You fetch the full report data using the report ID

This keeps response times fast and gives you a proper async workflow pattern.

## Notifications

The system generates internal notifications automatically when key things happen — a transaction gets approved or rejected, your role changes, a report finishes generating, your account status changes. Notifications are per-user and never cross between accounts.

## Every Error Looks The Same

No matter what goes wrong, every error response follows this exact shape:
```json
{
  "success": false,
  "error": {
    "code": "AUTHORIZATION_ERROR",
    "message": "Your role (viewer) does not have permission: delete:transactions",
    "details": null,
    "timestamp": "2026-04-04T10:00:00.000Z",
    "requestId": "a1b2c3d4-..."
  }
}
```

This makes it easy for any frontend or client to handle errors consistently without parsing different shapes.

Common error codes you will encounter:

| Code | Status | When it happens |

| `VALIDATION_ERROR` | 400 | A required field is missing or in the wrong format |
| `AUTHENTICATION_ERROR` | 401 | No token, wrong token, or bad credentials |
| `TOKEN_EXPIRED` | 401 | Access token has expired — use refresh token |
| `AUTHORIZATION_ERROR` | 403 | Your role does not have the required permission |
| `SCOPE_VIOLATION` | 403 | You are trying to access data outside your department/scope |
| `OPERATION_NOT_PERMITTED` | 403 | The action is blocked by business rules (e.g. deleting an approved transaction) |
| `NOT_FOUND` | 404 | The requested resource does not exist |
| `CONFLICT` | 409 | Duplicate entry (e.g. email already registered) |
| `INVALID_STATE_TRANSITION` | 409 | Trying to move a record to an invalid status (e.g. approving an already approved transaction) |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests in a short period |
| `INTERNAL_SERVER_ERROR` | 500 | Something unexpected broke — details are logged server-side, never exposed to the client |

## Running Tests
```bash
npm test
```

Tests use an in-memory MongoDB instance so no real database is touched. The test suite covers:

- Auth flow — registration, login, token refresh, rotation, logout
- Access control — every role tested against every sensitive endpoint
- Dashboard accuracy — aggregation results verified against known seeded data
- Transaction lifecycle — state machine rules, soft delete, restore, export
- Pagination — both offset and cursor modes

## Assumptions

A few decisions were made where the requirements left room for interpretation:

- **Base currency is USD** — the schema has fields for currency conversion but actual FX rate lookups are not implemented. This would need a third-party rates API in production.
- **Fiscal year is calendar year** — Q1 is January to March, Q2 is April to June, and so on. Companies with non-standard fiscal years would need this adjusted.
- **Self-registration always creates a viewer** — you cannot self-assign a higher role. An admin must promote you.
- **External auditor scope is admin-assigned** — the records an external auditor can see are set by populating their `scopedRecords` array via the user management endpoints.
- **Audit logs are permanent** — there is no API to delete or edit them. This is intentional.
- **No email delivery** — password reset and email verification are out of scope. They would require integrating an email provider.

## Tradeoffs

Honest notes on what was simplified and why:

- **Refresh tokens stored as hashes** — a more robust approach would be a dedicated `RefreshToken` collection with one row per device. The current approach stores one hash per user which means logging in on a new device invalidates the previous one.
- **Background jobs use async callbacks** — a production system would use a proper job queue like BullMQ with Redis. The current approach runs the aggregation in a detached async function which works but has no retry logic if the server restarts mid-generation.
- **No real currency conversion** — amounts in non-USD currencies are stored as-is. The `convertedAmount` field is a placeholder for when FX integration is added.