# Expense Tracker Pro (Expo + Supabase)

A simple, elegant, multi-user expense tracker with per-project monthly budgets, recurring expenses, and monthly analytics.

## Features
- Email/password auth
- Projects with roles (admin/member)
- Admin:
  - Set monthly budgets per project
  - Manage categories
  - Create and manage recurring expenses (daily/weekly/monthly/yearly; custom interval)
- Multi-user expenses per project
- Real-time budget tracking and monthly analytics (pie + 30-day trend)
- Default categories seeded from your list
- Currency: INR; Language: English

## Quick start
1. Create a Supabase project
2. In Supabase SQL Editor, paste and run `supabase/schema.sql`
3. In Project Settings → API, copy the `Project URL` and `anon` key
4. Open `app.json` and set:
```json
"extra": {
  "supabaseUrl": "https://YOUR-PROJECT.supabase.co",
  "supabaseAnonKey": "YOUR-ANON-KEY"
}
```
5. Install and run
```bash
npm i
npm run start
```
6. In the app:
   - Create an account, create a project (defaults to INR currency).
   - Set a monthly budget (Admin tab).
   - Add categories if needed (Admin tab).
   - Add recurring rules (Admin tab). The app auto-applies due occurrences on Dashboard open.
   - Start logging expenses.

## Recurring details
- Cadence: daily, weekly, monthly, yearly with `interval_count` (e.g., every 2 weeks).
- Start date is normalized to today if in the past; end date optional.
- A secure RPC (`apply_recurring_expenses`) materializes missing occurrences up to today.
- Duplicate inserts are prevented via a unique index on `(recurring_id, recurring_occurrence_date)`.

## Notes
- RLS ensures members only access their projects; only admins can set budgets, categories, and recurring rules.
- Budget is tracked per project per month.
- Amounts are formatted using the `en-IN` locale and INR currency.

## Next steps
- Invite members via email and role management UI
- Receipt uploads using Supabase Storage
- Alerts when budget crosses thresholds (e.g., 80%, 100%)
- Offline cache with SQLite and background sync