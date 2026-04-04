import mongoose from 'mongoose';
import { env } from './env.js';

export async function connectDB() {
  mongoose.connection.on('connected', () => {
    console.log(`[MongoDB] Connected to: ${mongoose.connection.host}/${mongoose.connection.name}`);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('[MongoDB] Disconnected from database.');
  });

  mongoose.connection.on('error', (err) => {
    console.error('[MongoDB] Connection error:', err.message);
  });

  mongoose.connection.on('reconnected', () => {
    console.log('[MongoDB] Reconnected to database.');
  });

  try {
    await mongoose.connect(env.mongoUri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
  } catch (err) {
    console.error('[MongoDB] Initial connection failed:', err.message);
    process.exit(1);
  }
}