import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from server directory or root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const configSchema = z.object({
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  DATABASE_PATH: z.string().default('./data/knowledge.db'),
  GROQ_API_KEY: z.string().min(1, 'GROQ_API_KEY is required').optional(),
  GROQ_MODEL: z.string().default('llama-3.3-70b-versatile'),
  CHUNK_SIZE: z.coerce.number().default(200),
  CHUNK_OVERLAP: z.coerce.number().default(40),
  TOP_K: z.coerce.number().default(5),
  SIMILARITY_THRESHOLD: z.coerce.number().default(0.30),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(60),
  LOG_LEVEL: z.string().default('info'),
});

const parsed = configSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Configuration validation failed:');
  for (const issue of parsed.error.issues) {
    console.error(`   - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

// Fail fast if GROQ_API_KEY is missing outside test environment
if (parsed.data.NODE_ENV !== 'test' && !parsed.data.GROQ_API_KEY) {
  console.error('❌ Configuration Error: GROQ_API_KEY environment variable is missing.');
  console.error('Please set GROQ_API_KEY in your .env file or environment before starting the server.');
  process.exit(1);
}

export const config = {
  ...parsed.data,
  isProduction: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
};
