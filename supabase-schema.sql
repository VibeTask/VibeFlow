-- ============================================
-- TaskFlow Database Schema
-- Paste this entire file into Supabase SQL Editor
-- (Dashboard > SQL Editor > New Query > paste > Run)
-- ============================================

-- Groups table (people and projects)
create table groups (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  name text not null,
  archived boolean default false,
  created_at timestamptz default now()
);

-- Tasks table
create table tasks (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  group_id uuid references groups on delete cascade not null,
  title text not null,
  notes text default '',
  done boolean default false,
  activate_date date,
  due_date date,
  position float default 0,
  created_at timestamptz default now()
);

-- Enable Row Level Security (keeps each user's data private)
alter table groups enable row level security;
alter table tasks enable row level security;

-- Policies: users can only see and modify their own data
create policy "Users manage own groups" on groups
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage own tasks" on tasks
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Indexes for performance
create index idx_groups_user on groups (user_id);
create index idx_tasks_group on tasks (group_id);
create index idx_tasks_user on tasks (user_id);
