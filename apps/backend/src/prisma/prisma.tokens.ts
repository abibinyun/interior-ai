export const PRISMA_LOG_LEVEL = {
  QUERY: 'query',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
} as const;

export const PRISMA_LOG_EVENTS = {
  STDOUT: 'stdout',
  EVENT: 'event',
} as const;

export type PrismaLogLevel = (typeof PRISMA_LOG_LEVEL)[keyof typeof PRISMA_LOG_LEVEL];
export type PrismaLogEvent = (typeof PRISMA_LOG_EVENTS)[keyof typeof PRISMA_LOG_EVENTS];
