/**
 * Database Seed Script
 *
 * Creates representative users across all roles and 20 sample transactions.
 * Run with: npm run seed
 *
 * WARNING: This will not overwrite existing records — it checks by email/referenceNumber first.
 */

import './config/env.js';
import { connectDB } from './config/db.js';
import User from './models/User.js';
import Transaction from './models/Transaction.js';
import { ROLES } from './constants/roles.js';
import {
  TRANSACTION_TYPES,
  TRANSACTION_STATUSES,
} from './constants/transactionTypes.js';
import mongoose from 'mongoose';

// ─── Seed Data ────────────────────────────────────────────────────────────────

const SEED_USERS = [
  {
    name:       'Alice Thornton',
    email:      'alice@fintech.dev',
    password:   'SuperAdmin@123',
    role:       ROLES.SUPER_ADMIN,
    department: 'Executive',
    status:     'active',
  },
  {
    name:       'Bob Harrington',
    email:      'bob@fintech.dev',
    password:   'Admin@123456',
    role:       ROLES.ADMIN,
    department: 'Operations',
    status:     'active',
  },
  {
    name:       'Carol Osei',
    email:      'carol@fintech.dev',
    password:   'Finance@123456',
    role:       ROLES.FINANCE_MANAGER,
    department: 'Finance',
    status:     'active',
  },
  {
    name:       'David Kim',
    email:      'david@fintech.dev',
    password:   'Accountant@123',
    role:       ROLES.ACCOUNTANT,
    department: 'Finance',
    status:     'active',
  },
  {
    name:       'Eva Martínez',
    email:      'eva@fintech.dev',
    password:   'Auditor@123456',
    role:       ROLES.AUDITOR,
    department: 'Compliance',
    status:     'active',
  },
  {
    name:       'Frank Liu',
    email:      'frank@fintech.dev',
    password:   'Analyst@123456',
    role:       ROLES.ANALYST,
    department: 'Analytics',
    status:     'active',
  },
  {
    name:       'Grace Nwosu',
    email:      'grace@fintech.dev',
    password:   'Viewer@1234567',
    role:       ROLES.VIEWER,
    department: 'Engineering',
    status:     'active',
  },
];

// ─── Transaction Templates ─────────────────────────────────────────────────────

function buildTransactions(createdById) {
  const now = new Date();
  const daysAgo = (n) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

  return [
    // ── INCOME ────────────────────────────────────────────────────────────────
    {
      amount: 85000,    type: TRANSACTION_TYPES.INCOME,    subtype: 'salary',
      category: 'Payroll', department: 'Engineering', currency: 'USD',
      date: daysAgo(1),  status: TRANSACTION_STATUSES.APPROVED,
      notes: 'Monthly engineering payroll disbursement',
      referenceNumber: 'INC-2025-001', counterparty: 'HR System',
      tags: ['payroll', 'engineering'],
    },
    {
      amount: 12000,    type: TRANSACTION_TYPES.INCOME,    subtype: 'freelance',
      category: 'Consulting Revenue', department: 'Finance', currency: 'USD',
      date: daysAgo(3),  status: TRANSACTION_STATUSES.APPROVED,
      notes: 'Q1 consulting services — Acme Corp',
      referenceNumber: 'INC-2025-002', counterparty: 'Acme Corp',
      tags: ['consulting', 'q1'],
    },
    {
      amount: 4500,     type: TRANSACTION_TYPES.INCOME,    subtype: 'investment_return',
      category: 'Investment Income', department: 'Finance', currency: 'USD',
      date: daysAgo(7),  status: TRANSACTION_STATUSES.APPROVED,
      referenceNumber: 'INC-2025-003', counterparty: 'Vanguard',
    },
    {
      amount: 25000,    type: TRANSACTION_TYPES.INCOME,    subtype: 'grant',
      category: 'Government Grant', department: 'Operations', currency: 'USD',
      date: daysAgo(14), status: TRANSACTION_STATUSES.PENDING_APPROVAL,
      notes: 'SBIR Phase 1 grant — pending finance manager approval',
      referenceNumber: 'INC-2025-004', counterparty: 'SBA',
      tags: ['grant', 'government'],
    },
    // ── EXPENSES ──────────────────────────────────────────────────────────────
    {
      amount: 3200,     type: TRANSACTION_TYPES.EXPENSE,   subtype: 'subscription',
      category: 'SaaS Subscriptions', department: 'Engineering', currency: 'USD',
      date: daysAgo(5),  status: TRANSACTION_STATUSES.APPROVED,
      notes: 'AWS + GitHub Enterprise monthly billing',
      referenceNumber: 'EXP-2025-001', counterparty: 'Amazon Web Services',
      tags: ['cloud', 'infrastructure'],
    },
    {
      amount: 18500,    type: TRANSACTION_TYPES.EXPENSE,   subtype: 'payroll',
      category: 'Contractor Payments', department: 'Engineering', currency: 'USD',
      date: daysAgo(2),  status: TRANSACTION_STATUSES.APPROVED,
      referenceNumber: 'EXP-2025-002', counterparty: 'Toptal',
      tags: ['contractors'],
    },
    {
      amount: 750,      type: TRANSACTION_TYPES.EXPENSE,   subtype: 'travel',
      category: 'Business Travel', department: 'Operations', currency: 'USD',
      date: daysAgo(10), status: TRANSACTION_STATUSES.DRAFT,
      notes: 'NYC conference travel — awaiting receipts',
      referenceNumber: 'EXP-2025-003',
    },
    {
      amount: 9800,     type: TRANSACTION_TYPES.EXPENSE,   subtype: 'tax',
      category: 'Quarterly Tax Payment', department: 'Finance', currency: 'USD',
      date: daysAgo(30), status: TRANSACTION_STATUSES.APPROVED,
      referenceNumber: 'EXP-2025-004', counterparty: 'IRS',
      tags: ['tax', 'quarterly'],
    },
    {
      amount: 2100,     type: TRANSACTION_TYPES.EXPENSE,   subtype: 'utility',
      category: 'Office Utilities', department: 'Operations', currency: 'USD',
      date: daysAgo(15), status: TRANSACTION_STATUSES.APPROVED,
      referenceNumber: 'EXP-2025-005',
    },
    {
      amount: 5600,     type: TRANSACTION_TYPES.EXPENSE,   subtype: 'equipment',
      category: 'Hardware Purchase', department: 'Engineering', currency: 'USD',
      date: daysAgo(20), status: TRANSACTION_STATUSES.REJECTED,
      notes: 'Rejected — exceeded department budget. Resubmit in Q2.',
      referenceNumber: 'EXP-2025-006',
      tags: ['hardware', 'rejected'],
    },
    // ── TRANSFERS ─────────────────────────────────────────────────────────────
    {
      amount: 50000,    type: TRANSACTION_TYPES.TRANSFER,  subtype: 'internal_transfer',
      category: 'Operating Reserve', department: 'Finance', currency: 'USD',
      date: daysAgo(8),  status: TRANSACTION_STATUSES.APPROVED,
      notes: 'Transfer from revenue account to operations reserve',
      referenceNumber: 'TRF-2025-001',
    },
    {
      amount: 15000,    type: TRANSACTION_TYPES.TRANSFER,  subtype: 'bank_transfer',
      category: 'Vendor Payment', department: 'Finance', currency: 'USD',
      date: daysAgo(4),  status: TRANSACTION_STATUSES.PENDING_APPROVAL,
      referenceNumber: 'TRF-2025-002', counterparty: 'Stripe Inc.',
    },
    // ── LIABILITY ─────────────────────────────────────────────────────────────
    {
      amount: 100000,   type: TRANSACTION_TYPES.LIABILITY, subtype: 'loan_taken',
      category: 'Business Loan', department: 'Finance', currency: 'USD',
      date: daysAgo(60), status: TRANSACTION_STATUSES.APPROVED,
      notes: 'SVB business line of credit — 18-month term',
      referenceNumber: 'LIA-2025-001', counterparty: 'Silicon Valley Bank',
      tags: ['loan', 'line-of-credit'],
    },
    {
      amount: 8000,     type: TRANSACTION_TYPES.LIABILITY, subtype: 'credit_used',
      category: 'Corporate Card', department: 'Operations', currency: 'USD',
      date: daysAgo(12), status: TRANSACTION_STATUSES.PENDING_APPROVAL,
      referenceNumber: 'LIA-2025-002', counterparty: 'Brex',
    },
    // ── ASSET ─────────────────────────────────────────────────────────────────
    {
      amount: 22000,    type: TRANSACTION_TYPES.ASSET,     subtype: 'asset_purchase',
      category: 'Office Equipment', department: 'Operations', currency: 'USD',
      date: daysAgo(45), status: TRANSACTION_STATUSES.APPROVED,
      notes: 'Standing desks and ergonomic chairs for new hires',
      referenceNumber: 'AST-2025-001', counterparty: 'Steelcase',
      tags: ['office', 'furniture'],
    },
    {
      amount: 3000,     type: TRANSACTION_TYPES.ASSET,     subtype: 'depreciation',
      category: 'Asset Depreciation', department: 'Finance', currency: 'USD',
      date: daysAgo(1),  status: TRANSACTION_STATUSES.APPROVED,
      notes: 'Monthly depreciation run — server hardware',
      referenceNumber: 'AST-2025-002',
      tags: ['depreciation', 'automated'],
    },
    // ── ADJUSTMENT ────────────────────────────────────────────────────────────
    {
      amount: 1200,     type: TRANSACTION_TYPES.ADJUSTMENT, subtype: 'correction',
      category: 'Ledger Correction', department: 'Finance', currency: 'USD',
      date: daysAgo(5),  status: TRANSACTION_STATUSES.APPROVED,
      notes: 'Correcting misclassified Q4 travel expenses',
      referenceNumber: 'ADJ-2025-001',
      tags: ['correction', 'q4'],
    },
    {
      amount: 500,      type: TRANSACTION_TYPES.ADJUSTMENT, subtype: 'write_off',
      category: 'Bad Debt Write-off', department: 'Finance', currency: 'USD',
      date: daysAgo(25), status: TRANSACTION_STATUSES.APPROVED,
      referenceNumber: 'ADJ-2025-002', counterparty: 'Client XYZ',
      tags: ['write-off'],
    },
    {
      amount: 4200,     type: TRANSACTION_TYPES.EXPENSE,    subtype: 'operational',
      category: 'Marketing', department: 'Operations', currency: 'EUR',
      date: daysAgo(6),  status: TRANSACTION_STATUSES.DRAFT,
      notes: 'EU campaign spend — currency conversion pending',
      referenceNumber: 'EXP-2025-007', counterparty: 'Meta Ads',
      tags: ['marketing', 'eu', 'draft'],
    },
    {
      amount: 67000,    type: TRANSACTION_TYPES.INCOME,     subtype: 'rental_income',
      category: 'Property Income', department: 'Finance', currency: 'USD',
      date: daysAgo(90), status: TRANSACTION_STATUSES.VOIDED,
      notes: 'Voided — duplicate entry from legacy system migration',
      referenceNumber: 'INC-2025-005',
      tags: ['voided', 'legacy'],
    },
  ].map((t) => ({ ...t, createdBy: createdById, convertedAmount: t.amount, baseCurrency: 'USD' }));
}

// ─── Seeder ───────────────────────────────────────────────────────────────────

async function seed() {
  await connectDB();

  console.log('\n─── Finance Dashboard Seed ───────────────────────────────────────');

  // ── Users ─────────────────────────────────────────────────────────────────
  console.log('\n[Users] Creating seed users...\n');
  const createdUsers = [];

  for (const userData of SEED_USERS) {
    const existing = await User.findOne({ email: userData.email });
    if (existing) {
      console.log(`  ⏭  Skipped (already exists): ${userData.email}`);
      createdUsers.push(existing);
      continue;
    }

    const user = await User.create(userData);
    createdUsers.push(user);
    console.log(`  ✅ Created [${user.role.padEnd(16)}] ${user.name} <${user.email}>`);
    console.log(`       Password: ${userData.password}`);
  }

  // Use the super_admin as the createdBy for all transactions
  const superAdmin = createdUsers.find((u) => u.role === ROLES.SUPER_ADMIN);

  // ── Transactions ──────────────────────────────────────────────────────────
  console.log('\n[Transactions] Creating sample transactions...\n');
  const transactions = buildTransactions(superAdmin._id);
  let created = 0;
  let skipped = 0;

  for (const txData of transactions) {
    const existing = txData.referenceNumber
      ? await Transaction.findOne({ referenceNumber: txData.referenceNumber }).setOptions({ _includeDeleted: true })
      : null;

    if (existing) {
      skipped++;
      continue;
    }

    // Set approvedBy for approved transactions
    const tx = new Transaction(txData);
    if (txData.status === TRANSACTION_STATUSES.APPROVED) {
      tx.approvedBy = superAdmin._id;
      tx.approvedAt = txData.date;
    }
    await tx.save();
    created++;
  }

  console.log(`  ✅ Created ${created} transactions (${skipped} skipped as duplicates)`);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n─── Seed Complete ────────────────────────────────────────────────');
  console.log('\nCredentials summary:');
  console.log('┌──────────────────┬──────────────────────────┬──────────────────────┐');
  console.log('│ Role             │ Email                    │ Password             │');
  console.log('├──────────────────┼──────────────────────────┼──────────────────────┤');

  for (const u of SEED_USERS) {
    const role  = u.role.padEnd(16);
    const email = u.email.padEnd(24);
    const pass  = u.password.padEnd(20);
    console.log(`│ ${role} │ ${email} │ ${pass} │`);
  }
  console.log('└──────────────────┴──────────────────────────┴──────────────────────┘\n');

  await mongoose.connection.close();
  console.log('[MongoDB] Connection closed. Seed finished.\n');
}

seed().catch((err) => {
  console.error('[Seed] Fatal error:', err);
  process.exit(1);
});
