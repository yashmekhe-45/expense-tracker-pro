-- Requires: pgcrypto or uuid-ossp for gen_random_uuid()
create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

-- ========== BASE TABLES ==========
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  currency text not null default 'INR',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone default now()
);

create table if not exists public.project_memberships (
  project_id uuid references public.projects(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','member')),
  created_at timestamp with time zone default now(),
  primary key (project_id, user_id)
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  name text not null,
  unique (project_id, name)
);

create table if not exists public.project_budgets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  month int not null check (month between 1 and 12),
  year int not null check (year between 2000 and 2100),
  amount numeric(12,2) not null check (amount >= 0),
  unique (project_id, month, year)
);

-- ========== RECURRING SUPPORT ==========
do $$
begin
  if not exists (select 1 from pg_type where typname = 'recurrence_cadence') then
    create type public.recurrence_cadence as enum ('daily','weekly','monthly','yearly');
  end if;
end$$;

create table if not exists public.recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'INR',
  cadence public.recurrence_cadence not null,
  interval_count int not null default 1 check (interval_count >= 1),
  start_date date not null,
  end_date date null,
  note text,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  last_applied_on date null,
  created_at timestamp with time zone default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'INR',
  spent_at date not null default now(),
  note text,
  recurring_id uuid references public.recurring_expenses(id) on delete set null,
  recurring_occurrence_date date,
  created_at timestamp with time zone default now()
);

-- Unique to avoid duplicate inserts for a given recurrence occurrence
do $$
begin
  if not exists (
    select 1 from pg_indexes where schemaname = 'public' and indexname = 'uniq_expenses_recurring_occurrence'
  ) then
    create unique index uniq_expenses_recurring_occurrence
      on public.expenses (recurring_id, recurring_occurrence_date)
      where recurring_id is not null;
  end if;
end$$;

-- VIEW
create or replace view public.expenses_view as
  select e.*, c.name as category_name
  from public.expenses e
  left join public.categories c on c.id = e.category_id;

-- ========== FUNCTIONS (helpers) ==========
create or replace function public.create_project_with_membership(p_name text)
returns uuid
language plpgsql
security definer
as $$
declare pid uuid;
begin
  insert into public.projects(name, created_by) values (p_name, auth.uid()) returning id into pid;
  insert into public.project_memberships(project_id, user_id, role) values (pid, auth.uid(), 'admin');
  insert into public.categories(project_id, name)
  select pid, name from public.categories where project_id is null;
  return pid;
end; $$;

create or replace function public.get_my_projects()
returns table (id uuid, name text)
language sql
stable
as $$
  select p.id, p.name
  from public.projects p
  join public.project_memberships m on m.project_id = p.id
  where m.user_id = auth.uid()
  order by p.created_at desc;
$$;

create or replace function public.get_project_categories(p_project_id uuid)
returns table (id uuid, name text)
language sql
stable
as $$
  select id, name from public.categories
  where project_id = p_project_id
  union
  select id, name from public.categories where project_id is null
  order by name;
$$;

create or replace function public.add_project_category(p_project_id uuid, p_name text)
returns uuid
language plpgsql
security definer
as $$
  insert into public.categories(project_id, name) values (p_project_id, p_name)
  returning id;
$$;

create or replace function public.upsert_project_budget(p_project_id uuid, p_month int, p_year int, p_amount numeric)
returns void
language sql
security definer
as $$
  insert into public.project_budgets(project_id, month, year, amount)
  values (p_project_id, p_month, p_year, p_amount)
  on conflict (project_id, month, year) do update set amount = excluded.amount;
$$;

create or replace function public.get_monthly_summary(p_project_id uuid, p_month int, p_year int)
returns table (category text, total numeric)
language sql
stable
as $$
  select coalesce(c.name, 'Uncategorized') as category, sum(e.amount)::numeric as total
  from public.expenses e
  left join public.categories c on c.id = e.category_id
  where e.project_id = p_project_id
    and extract(month from e.spent_at) = p_month
    and extract(year from e.spent_at) = p_year
  group by 1
  order by total desc;
$$;

create or replace function public.get_budget_status(p_project_id uuid, p_month int, p_year int)
returns table (budget numeric, spent numeric, remaining numeric, pct numeric)
language sql
stable
as $$
  with b as (
    select amount from public.project_budgets
    where project_id = p_project_id and month = p_month and year = p_year
  ),
  s as (
    select coalesce(sum(amount),0)::numeric as total
    from public.expenses
    where project_id = p_project_id
      and extract(month from spent_at) = p_month
      and extract(year from spent_at) = p_year
  )
  select
    coalesce((select amount from b), 0) as budget,
    (select total from s) as spent,
    coalesce((select amount from b), 0) - (select total from s) as remaining,
    case when coalesce((select amount from b), 0) = 0 then 0
         else round(((select total from s) / (select amount from b)) * 100, 2) end as pct;
$$;

create or replace function public.get_last_30_days(p_project_id uuid)
returns table (d date, total numeric)
language sql
stable
as $$
  select dd::date as d,
         coalesce((select sum(amount) from public.expenses e where e.project_id = p_project_id and e.spent_at = dd::date),0)::numeric as total
  from generate_series(current_date - interval '29 day', current_date, interval '1 day') dd
  order by 1;
$$;

-- ===== Recurring RPCs =====
create or replace function public.get_recurring_expenses(p_project_id uuid)
returns table (
  id uuid,
  category_name text,
  amount numeric,
  cadence public.recurrence_cadence,
  interval_count int,
  start_date date,
  end_date date,
  active boolean,
  note text,
  last_applied_on date
)
language sql
stable
as $$
  select r.id,
         c.name as category_name,
         r.amount, r.cadence, r.interval_count, r.start_date, r.end_date, r.active, r.note, r.last_applied_on
  from public.recurring_expenses r
  left join public.categories c on c.id = r.category_id
  where r.project_id = p_project_id
  order by r.created_at desc;
$$;

create or replace function public.add_recurring_expense(
  p_project_id uuid,
  p_category_id uuid,
  p_amount numeric,
  p_cadence public.recurrence_cadence,
  p_interval_count int,
  p_start_date date,
  p_end_date date,
  p_note text
) returns uuid
language plpgsql
security definer
as $$
declare rid uuid;
begin
  if not exists (select 1 from public.project_memberships m where m.project_id = p_project_id and m.user_id = auth.uid() and m.role = 'admin') then
    raise exception 'Only admins can add recurring expenses';
  end if;

  insert into public.recurring_expenses(project_id, category_id, amount, cadence, interval_count, start_date, end_date, note, created_by)
  values (p_project_id, p_category_id, p_amount, p_cadence, greatest(p_start_date, current_date), p_end_date, p_note, auth.uid())
  returning id into rid;

  return rid;
end $$;

create or replace function public.toggle_recurring_expense(p_id uuid, p_active boolean)
returns void
language plpgsql
security definer
as $$
declare pid uuid;
begin
  select project_id into pid from public.recurring_expenses where id = p_id;
  if pid is null then
    raise exception 'Recurring not found';
  end if;

  if not exists (select 1 from public.project_memberships m where m.project_id = pid and m.user_id = auth.uid() and m.role = 'admin') then
    raise exception 'Only admins can manage recurring expenses';
  end if;

  update public.recurring_expenses set active = p_active where id = p_id;
end $$;

create or replace function public.apply_recurring_expenses(p_project_id uuid, p_today date default current_date)
returns void
language plpgsql
security definer
as $$
declare
  rec record;
  step interval;
  next_date date;
  last_date date;
begin
  if not exists (select 1 from public.project_memberships m where m.project_id = p_project_id and m.user_id = auth.uid()) then
    raise exception 'You are not a member of this project';
  end if;

  for rec in
    select *
    from public.recurring_expenses
    where project_id = p_project_id
      and active = true
      and (end_date is null or end_date >= p_today)
  loop
    if rec.cadence = 'daily' then step := make_interval(days => rec.interval_count);
    elsif rec.cadence = 'weekly' then step := make_interval(weeks => rec.interval_count);
    elsif rec.cadence = 'monthly' then step := make_interval(months => rec.interval_count);
    else step := make_interval(years => rec.interval_count);
    end if;

    next_date := greatest(coalesce(rec.last_applied_on + step, rec.start_date), rec.start_date);

    while next_date <= p_today and (rec.end_date is null or next_date <= rec.end_date) loop
      insert into public.expenses(project_id, user_id, category_id, amount, currency, spent_at, note, recurring_id, recurring_occurrence_date)
      values (rec.project_id, rec.created_by, rec.category_id, rec.amount, rec.currency, next_date, coalesce(rec.note, '') || ' (recurring)', rec.id, next_date)
      on conflict on constraint uniq_expenses_recurring_occurrence do nothing;

      last_date := next_date;
      next_date := (next_date + step);
    end loop;

    if last_date is not null then
      update public.recurring_expenses set last_applied_on = last_date where id = rec.id;
    end if;
  end loop;
end $$;