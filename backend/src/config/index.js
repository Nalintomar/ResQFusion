import 'dotenv/config';

const num = (v, d) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? d : Number(v));

export const config = {
  port: num(process.env.PORT, 4000),
  jwtSecret: process.env.JWT_SECRET || 'dev-only-change-me',
  mlUrl: process.env.ML_URL || 'http://localhost:5001',
  mlTimeoutMs: num(process.env.ML_TIMEOUT_MS, 4000),
  mongoUri: process.env.MONGO_URI || '',
  mongoDb: process.env.MONGO_DB || 'resqfusion',
  pgUrl: process.env.DATABASE_URL || '',
  owmKey: process.env.OPENWEATHER_API_KEY || '',
  xBearer: process.env.X_BEARER_TOKEN || '',
  s3Bucket: process.env.S3_BUCKET || '',
  awsRegion: process.env.AWS_REGION || 'ap-south-1',
  // Demo-friendly default: one pipeline cycle every 5 s. In production-like use set 300000 (5 min).
  ingestIntervalMs: num(process.env.INGEST_INTERVAL_MS, 5000),
  autoStart: process.env.AUTO_START_PIPELINE !== 'false',
  simSeed: num(process.env.SIM_SEED, 2026),
  corsOrigin: process.env.CORS_ORIGIN || '*',
};
