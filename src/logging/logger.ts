import pino from 'pino';

import { getEnv } from '@/config/env.js';

export const logger = pino({
  level: getEnv().NODE_ENV === 'production' ? 'info' : 'debug',
  base: null,
});
