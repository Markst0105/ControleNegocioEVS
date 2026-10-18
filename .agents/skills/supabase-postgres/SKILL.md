---
name: supabase-postgres
description: Use when building with Supabase for row-level security, real-time subscriptions, Edge Functions, or storage.
---

# Supabase Postgres

## When to Use This Skill
- Setting up row-level security (RLS) policies for multi-tenant apps
- Implementing real-time subscriptions for live data
- Building Edge Functions for serverless logic
- Managing file storage with Storage Buckets
- Running database migrations with the Supabase CLI

## Workflow
1. Install Supabase CLI: `npm install -g supabase`
2. Init project: `supabase init` — creates `supabase/` directory
3. Link to project: `supabase link --project-ref <ref>`
4. Create migrations: `supabase migration new <name>` then write SQL
5. Enable RLS: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
6. Write policies: `CREATE POLICY ... ON ... USING (auth.uid() = user_id)`
7. Deploy: `supabase db push` for migrations, `supabase functions deploy` for Edge Functions
8. Test with the local dev server: `supabase start`

## Rules
- Always enable RLS — never rely on application-level access control alone
- Test RLS policies with `SET ROLE` to simulate different users
- Use Edge Functions for logic that needs access to secrets or external APIs
- Keep migrations idempotent — use `IF NOT EXISTS` and `IF EXISTS`
- Don't expose the service role key to the client — use the anon key with RLS
- Use Storage Bucket policies for file access control
