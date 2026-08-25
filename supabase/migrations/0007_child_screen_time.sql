-- 0007_child_screen_time.sql — per-child screen time start/stop alarms.
-- Nullable: when null the family-wide settings.screen_time_start/_end apply.

alter table public.children add column if not exists screen_start text;
alter table public.children add column if not exists screen_end   text;
