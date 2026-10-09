import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Loads `.env` from the repository root into `process.env`, for API keys and local paths the
 * maintainer keeps out of the shell. A variable already set in the environment wins, so a one-off
 * `KM_SCREENCASTS_FRESH=1 npm run video …` still works. Imported first by every CLI entry point,
 * before any module reads `process.env` at load time; the tests never import it.
 */
const path = resolve(import.meta.dirname, '..', '.env');
if (existsSync(path)) process.loadEnvFile(path);
