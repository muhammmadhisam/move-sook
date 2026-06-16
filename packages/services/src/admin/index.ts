// Admin domain service layer. HTTP routing lives in apps/api/src/routes/admin.ts —
// these functions take the authenticated admin id (`sub`) + validated input and
// return wire DTOs (or throw HTTPException). Split by sub-area; re-exported here.

export * from './stats';
export * from './analytics';
export * from './reports';
export * from './drivers';
export * from './users';
export * from './customers';
export * from './jobs';
export * from './transactions';
export * from './payouts';
export * from './disputes';
export * from './settings';
export * from './service-areas';
export * from './vehicle-pricing';
export * from './blacklist';
export * from './promos';
export * from './blog';
export * from './ledger';
export * from './invites';
export * from './pdpa';
