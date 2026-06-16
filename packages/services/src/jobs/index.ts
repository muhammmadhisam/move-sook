// Jobs domain service layer. HTTP routing is a thin wrapper in
// apps/api/src/routes/jobs.ts; these functions take the authenticated `sub`
// (+ role / validated input) and return wire DTOs or throw HTTPException.

export * from './quote';
export * from './lifecycle';
export * from './payment';
export * from './reviews';
export * from './disputes';
export * from './documents';
export * from './tracking';
