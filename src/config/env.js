import dotenv from 'dotenv';

dotenv.config();

const REQUIRED_ENV_VARS = [
  'PORT',
  'MONGO_URI',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'JWT_ACCESS_EXPIRES',
  'JWT_REFRESH_EXPIRES',
  'NODE_ENV',
  'BASE_CURRENCY',
];

/**
 * Validates all required environment variables at startup.
 * Throws an error immediately if any are missing, preventing misconfigured deploys.
 */
function validateEnv() {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `[ENV] Missing required environment variables:\n  ${missing.join('\n  ')}\n` +
        `Copy .env.example to .env and fill in all values.`
    );
  }

  console.log('[ENV] All required environment variables are present.');
}

validateEnv();

export const env = {
  port: parseInt(process.env.PORT, 10) || 3000,
  mongoUri: process.env.MONGO_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  jwtAccessExpires: process.env.JWT_ACCESS_EXPIRES,
  jwtRefreshExpires: process.env.JWT_REFRESH_EXPIRES,
  nodeEnv: process.env.NODE_ENV,
  baseCurrency: process.env.BASE_CURRENCY,
  isDev: process.env.NODE_ENV === 'development',
  isProd: process.env.NODE_ENV === 'production',
};
