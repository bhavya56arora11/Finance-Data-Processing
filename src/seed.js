import './config/env.js';
import { connectDB } from './config/db.js';
import User from './models/User.js';
import Transaction from './models/Transaction.js';
import Category from './models/Category.js';
import { ROLES } from './constants/roles.js';
import { TRANSACTION_TYPES, TRANSACTION_STATUSES } from './constants/transactionTypes.js';
import mongoose from 'mongoose';

// Seed Users ──

const SEED_USERS = [
  { name: 'Alice Thornton', email: 'alice@fintech.dev', password: 'SuperAdmin@123', role: ROLES.SUPER_ADMIN, department: 'Executive', status: 'active' },
  { name: 'Bob Harrington', email: 'bob@fintech.dev', password: 'Admin@123456', role: ROLES.ADMIN, department: 'Operations', status: 'active' },
  { name: 'Carol Osei', email: 'carol@fintech.dev', password: 'Finance@123456', role: ROLES.FINANCE_MANAGER, department: 'Finance', status: 'active' },
  { name: 'David Kim', email: 'david@fintech.dev', password: 'Accountant@123', role: ROLES.ACCOUNTANT, department: 'Finance', status: 'active' },
  { name: 'Eva Martínez', email: 'eva@fintech.dev', password: 'Auditor@123456', role: ROLES.AUDITOR, department: 'Compliance', status: 'active' },
  { name: 'Frank Liu', email: 'frank@fintech.dev', password: 'Analyst@123456', role: ROLES.ANALYST, department: 'Analytics', status: 'active' },
  { name: 'Grace Nwosu', email: 'grace@fintech.dev', password: 'Viewer@1234567', role: ROLES.VIEWER, department: 'Engineering', status: 'active' },
];

// Default Categories 

const DEFAULT_CATEGORIES = [
  { name: 'Payroll', type: 'both', color: '#4F46E5', icon: 'wallet', isDefault: true },
  { name: 'Consulting Revenue', type: 'income', color: '#10B981', icon: 'briefcase', isDefault: true },
  { name: 'Investment Income', type: 'income', color: '#06B6D4', icon: 'trending-up', isDefault: true },
  { name: 'Government Grant', type: 'income', color: '#8B5CF6', icon: 'award', isDefault: true },
  { name: 'Property Income', type: 'income', color: '#F59E0B', icon: 'home', isDefault: true },
  { name: 'SaaS Subscriptions', type: 'expense', color: '#EF4444', icon: 'cloud', isDefault: true },
  { name: 'Contractor Payments', type: 'expense', color: '#F97316', icon: 'users', isDefault: true },
  { name: 'Business Travel', type: 'expense', color: '#EC4899', icon: 'plane', isDefault: true },
  { name: 'Quarterly Tax Payment', type: 'expense', color: '#DC2626', icon: 'file-text', isDefault: true },
  { name: 'Office Utilities', type: 'expense', color: '#84CC16', icon: 'zap', isDefault: true },
  { name: 'Hardware Purchase', type: 'expense', color: '#A855F7', icon: 'cpu', isDefault: true },
  { name: 'Marketing', type: 'expense', color: '#F43F5E', icon: 'megaphone', isDefault: true },
  { name: 'Operating Reserve', type: 'both', color: '#6366F1', icon: 'shield', isDefault: true },
  { name: 'Vendor Payment', type: 'both', color: '#0EA5E9', icon: 'send', isDefault: true },
  { name: 'Business Loan', type: 'both', color: '#FB923C', icon: 'credit-card', isDefault: true },
  { name: 'Corporate Card', type: 'expense', color: '#E11D48', icon: 'credit-card', isDefault: true },
  { name: 'Office Equipment', type: 'expense', color: '#7C3AED', icon: 'package', isDefault: true },
  { name: 'Asset Depreciation', type: 'expense', color: '#9CA3AF', icon: 'arrow-down', isDefault: true },
  { name: 'Ledger Correction', type: 'both', color: '#FBBF24', icon: 'edit', isDefault: true },
  { name: 'Bad Debt Write-off', type: 'expense', color: '#B91C1C', icon: 'x-circle', isDefault: true },
];

// Transaction Templates ──

function buildTransactions(createdById, categoryMap) {
  const now = new Date();
  const daysAgo = (n) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

  return [
    { amount: 85000, type: TRANSACTION_TYPES.INCOME, subtype: 'salary', category: categoryMap['Payroll'], description: 'Monthly engineering payroll', department: 'Engineering', currency: 'USD', date: daysAgo(1), status: TRANSACTION_STATUSES.APPROVED, notes: 'Monthly engineering payroll disbursement', referenceNumber: 'INC-2025-001', counterparty: 'HR System', tags: ['payroll', 'engineering'] },
    { amount: 12000, type: TRANSACTION_TYPES.INCOME, subtype: 'freelance', category: categoryMap['Consulting Revenue'], description: 'Q1 consulting — Acme Corp', department: 'Finance', currency: 'USD', date: daysAgo(3), status: TRANSACTION_STATUSES.APPROVED, notes: 'Q1 consulting services', referenceNumber: 'INC-2025-002', counterparty: 'Acme Corp', tags: ['consulting', 'q1'] },
    { amount: 4500, type: TRANSACTION_TYPES.INCOME, subtype: 'investment_return', category: categoryMap['Investment Income'], description: 'Vanguard dividend Q1', department: 'Finance', currency: 'USD', date: daysAgo(7), status: TRANSACTION_STATUSES.APPROVED, referenceNumber: 'INC-2025-003', counterparty: 'Vanguard' },
    { amount: 25000, type: TRANSACTION_TYPES.INCOME, subtype: 'grant', category: categoryMap['Government Grant'], description: 'SBIR Phase 1 grant', department: 'Operations', currency: 'USD', date: daysAgo(14), status: TRANSACTION_STATUSES.PENDING_APPROVAL, notes: 'Pending finance manager approval', referenceNumber: 'INC-2025-004', counterparty: 'SBA', tags: ['grant', 'government'] },
    { amount: 3200, type: TRANSACTION_TYPES.EXPENSE, subtype: 'subscription', category: categoryMap['SaaS Subscriptions'], description: 'AWS + GitHub Enterprise billing', department: 'Engineering', currency: 'USD', date: daysAgo(5), status: TRANSACTION_STATUSES.APPROVED, notes: 'Monthly billing', referenceNumber: 'EXP-2025-001', counterparty: 'Amazon Web Services', tags: ['cloud', 'infrastructure'] },
    { amount: 18500, type: TRANSACTION_TYPES.EXPENSE, subtype: 'payroll', category: categoryMap['Contractor Payments'], description: 'Toptal contractor payments', department: 'Engineering', currency: 'USD', date: daysAgo(2), status: TRANSACTION_STATUSES.APPROVED, referenceNumber: 'EXP-2025-002', counterparty: 'Toptal', tags: ['contractors'] },
    { amount: 750, type: TRANSACTION_TYPES.EXPENSE, subtype: 'travel', category: categoryMap['Business Travel'], description: 'NYC conference travel', department: 'Operations', currency: 'USD', date: daysAgo(10), status: TRANSACTION_STATUSES.DRAFT, notes: 'Awaiting receipts', referenceNumber: 'EXP-2025-003' },
    { amount: 9800, type: TRANSACTION_TYPES.EXPENSE, subtype: 'tax', category: categoryMap['Quarterly Tax Payment'], description: 'Q1 federal tax payment', department: 'Finance', currency: 'USD', date: daysAgo(30), status: TRANSACTION_STATUSES.APPROVED, referenceNumber: 'EXP-2025-004', counterparty: 'IRS', tags: ['tax', 'quarterly'] },
    { amount: 2100, type: TRANSACTION_TYPES.EXPENSE, subtype: 'utility', category: categoryMap['Office Utilities'], description: 'March office utilities', department: 'Operations', currency: 'USD', date: daysAgo(15), status: TRANSACTION_STATUSES.APPROVED, referenceNumber: 'EXP-2025-005' },
    { amount: 5600, type: TRANSACTION_TYPES.EXPENSE, subtype: 'equipment', category: categoryMap['Hardware Purchase'], description: 'Developer station upgrade', department: 'Engineering', currency: 'USD', date: daysAgo(20), status: TRANSACTION_STATUSES.REJECTED, notes: 'Rejected — exceeded budget', referenceNumber: 'EXP-2025-006', tags: ['hardware', 'rejected'] },
    { amount: 50000, type: TRANSACTION_TYPES.TRANSFER, subtype: 'internal_transfer', category: categoryMap['Operating Reserve'], description: 'Transfer to ops reserve', department: 'Finance', currency: 'USD', date: daysAgo(8), status: TRANSACTION_STATUSES.APPROVED, notes: 'Revenue to operations', referenceNumber: 'TRF-2025-001' },
    { amount: 15000, type: TRANSACTION_TYPES.TRANSFER, subtype: 'bank_transfer', category: categoryMap['Vendor Payment'], description: 'Stripe platform payment', department: 'Finance', currency: 'USD', date: daysAgo(4), status: TRANSACTION_STATUSES.PENDING_APPROVAL, referenceNumber: 'TRF-2025-002', counterparty: 'Stripe Inc.' },
    { amount: 100000, type: TRANSACTION_TYPES.LIABILITY, subtype: 'loan_taken', category: categoryMap['Business Loan'], description: 'SVB credit line draw', department: 'Finance', currency: 'USD', date: daysAgo(60), status: TRANSACTION_STATUSES.APPROVED, notes: '18-month term', referenceNumber: 'LIA-2025-001', counterparty: 'Silicon Valley Bank', tags: ['loan'] },
    { amount: 8000, type: TRANSACTION_TYPES.LIABILITY, subtype: 'credit_used', category: categoryMap['Corporate Card'], description: 'March corporate card spend', department: 'Operations', currency: 'USD', date: daysAgo(12), status: TRANSACTION_STATUSES.PENDING_APPROVAL, referenceNumber: 'LIA-2025-002', counterparty: 'Brex' },
    { amount: 22000, type: TRANSACTION_TYPES.ASSET, subtype: 'asset_purchase', category: categoryMap['Office Equipment'], description: 'Ergonomic furniture order', department: 'Operations', currency: 'USD', date: daysAgo(45), status: TRANSACTION_STATUSES.APPROVED, notes: 'Standing desks + chairs', referenceNumber: 'AST-2025-001', counterparty: 'Steelcase', tags: ['office'] },
    { amount: 3000, type: TRANSACTION_TYPES.ASSET, subtype: 'depreciation', category: categoryMap['Asset Depreciation'], description: 'Server hardware depreciation', department: 'Finance', currency: 'USD', date: daysAgo(1), status: TRANSACTION_STATUSES.APPROVED, notes: 'Monthly depreciation run', referenceNumber: 'AST-2025-002', tags: ['depreciation'] },
    { amount: 1200, type: TRANSACTION_TYPES.ADJUSTMENT, subtype: 'correction', category: categoryMap['Ledger Correction'], description: 'Q4 travel reclassification', department: 'Finance', currency: 'USD', date: daysAgo(5), status: TRANSACTION_STATUSES.APPROVED, notes: 'Correcting misclassified Q4 expenses', referenceNumber: 'ADJ-2025-001', tags: ['correction'] },
    { amount: 500, type: TRANSACTION_TYPES.ADJUSTMENT, subtype: 'write_off', category: categoryMap['Bad Debt Write-off'], description: 'Client XYZ bad debt', department: 'Finance', currency: 'USD', date: daysAgo(25), status: TRANSACTION_STATUSES.APPROVED, referenceNumber: 'ADJ-2025-002', counterparty: 'Client XYZ', tags: ['write-off'] },
    { amount: 4200, type: TRANSACTION_TYPES.EXPENSE, subtype: 'operational', category: categoryMap['Marketing'], description: 'EU Meta ads campaign', department: 'Operations', currency: 'EUR', date: daysAgo(6), status: TRANSACTION_STATUSES.DRAFT, notes: 'Currency conversion pending', referenceNumber: 'EXP-2025-007', counterparty: 'Meta Ads', tags: ['marketing', 'eu'] },
    { amount: 67000, type: TRANSACTION_TYPES.INCOME, subtype: 'rental_income', category: categoryMap['Property Income'], description: 'Legacy property rental', department: 'Finance', currency: 'USD', date: daysAgo(90), status: TRANSACTION_STATUSES.VOIDED, notes: 'Voided — duplicate from migration', referenceNumber: 'INC-2025-005', tags: ['voided', 'legacy'] },
  ].map((t) => ({ ...t, createdBy: createdById, convertedAmount: t.amount, baseCurrency: 'USD' }));
}

// Seeder 

async function seed() {
  await connectDB();
  console.log('\nFinance Dashboard Seed ─');

  // ── Categories 
  console.log('\n[Categories] Creating default categories...\n');
  const categoryMap = {};
  for (const catData of DEFAULT_CATEGORIES) {
    const slug = catData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    let cat = await Category.findOne({ slug });
    if (!cat) {
      cat = await Category.create(catData);
      console.log(`  ✅ Created: ${cat.name} (${cat.type})`);
    } else {
      console.log(`  ⏭  Skipped: ${cat.name}`);
    }
    categoryMap[catData.name] = cat._id;
  }

  // ── Users ─
  console.log('\n[Users] Creating seed users...\n');
  const createdUsers = [];
  for (const userData of SEED_USERS) {
    const existing = await User.findOne({ email: userData.email });
    if (existing) {
      console.log(`  ⏭  Skipped: ${userData.email}`);
      createdUsers.push(existing);
      continue;
    }
    const user = await User.create(userData);
    createdUsers.push(user);
    console.log(`  ✅ Created [${user.role.padEnd(16)}] ${user.name} <${user.email}>`);
    console.log(`       Password: ${userData.password}`);
  }

  const superAdmin = createdUsers.find((u) => u.role === ROLES.SUPER_ADMIN);

  // ── Transactions 
  console.log('\n[Transactions] Creating sample transactions...\n');
  const transactions = buildTransactions(superAdmin._id, categoryMap);
  let created = 0, skipped = 0;

  for (const txData of transactions) {
    const existing = txData.referenceNumber
      ? await Transaction.findOne({ referenceNumber: txData.referenceNumber }).setOptions({ _includeDeleted: true })
      : null;
    if (existing) { skipped++; continue; }

    const tx = new Transaction(txData);
    if (txData.status === TRANSACTION_STATUSES.APPROVED) {
      tx.approvedBy = superAdmin._id;
      tx.approvedAt = txData.date;
    }
    await tx.save();
    created++;
  }
  console.log(`  ✅ Created ${created} transactions (${skipped} skipped)`);

  // ── Credentials ─
  console.log('\nSeed Complete ');
  console.log('\nCredentials:');
  console.log('┌┬─┬──┐');
  console.log('│ Role             │ Email                    │ Password             │');
  console.log('├┼─┼──┤');
  for (const u of SEED_USERS) {
    console.log(`│ ${u.role.padEnd(16)} │ ${u.email.padEnd(24)} │ ${u.password.padEnd(20)} │`);
  }
  console.log('└┴─┴──┘\n');

  await mongoose.connection.close();
  console.log('[MongoDB] Seed finished.\n');
}

seed().catch((err) => { console.error('[Seed] Fatal:', err); process.exit(1); });
