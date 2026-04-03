import mongoose from 'mongoose';
import { env } from './env.js';

/**
 * Establishes a connection to MongoDB with retry-friendly event logging.
 * Exits the process on initial connection failure to prevent silent startup errors.
 */
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
      // Mongoose 8+ has these as defaults, but keeping explicit for clarity
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
  } catch (err) {
    console.error('[MongoDB] Initial connection failed:', err.message);
    process.exit(1);
  }
}
