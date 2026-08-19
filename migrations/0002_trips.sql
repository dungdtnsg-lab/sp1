-- Saved GPS trips, scoped per authenticated user.
create table if not exists trips (
  id                   text primary key,
  user_id              text not null,
  title                text not null,
  started_at           timestamptz not null,
  ended_at             timestamptz not null,
  duration_ms          integer not null,
  stopped_duration_ms  integer not null,
  distance_m           double precision not null,
  max_speed_kmh        double precision not null,
  avg_speed_kmh        double precision not null,
  logs_json            text not null default '[]',
  created_at           timestamptz not null default now()
);
create index if not exists trips_user_id_idx on trips (user_id, started_at desc);
