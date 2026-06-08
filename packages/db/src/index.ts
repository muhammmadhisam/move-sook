import { PrismaClient } from './generated/prisma';

// Singleton Prisma client — prevents exhausting the connection pool during
// Next.js / dev hot-reloads where modules are re-evaluated repeatedly.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Re-export generated types + enums so consumers depend only on @movesook/db.
export * from './generated/prisma';
export { PrismaClient } from './generated/prisma';
