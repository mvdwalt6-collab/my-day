// Placeholder — replace with output of `supabase gen types typescript` once the schema is applied.
// `any` for now to unblock the scaffold; real types come in Phase 3.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any;

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];
