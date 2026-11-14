/**
 * TrustLayer uses Supabase without a generated Database schema yet.
 * Until `supabase gen types` is wired, clients are typed loosely so
 * `.from(...).select/update/insert` is not inferred as `never`.
 *
 * Generate real types later:
 *   npx supabase gen types typescript --project-id <id> > src/lib/db/database.types.ts
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TrustLayerDatabase = any;
