import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import type { SavedTrip } from "@/lib/speedo/types";

const tripSchema = z.object({
  id: z.string(),
  title: z.string(),
  startedAt: z.string(),
  endedAt: z.string(),
  durationMs: z.number(),
  stoppedDurationMs: z.number(),
  distanceMeters: z.number(),
  maxSpeedKmh: z.number(),
  avgSpeedKmh: z.number(),
  logs: z.array(
    z.object({
      time: z.string(),
      lat: z.number(),
      lon: z.number(),
      alt: z.number(),
      speed: z.number(),
      heading: z.number(),
      accuracy: z.number(),
    }),
  ),
});

type TripRow = {
  id: string;
  title: string;
  started_at: string;
  ended_at: string;
  duration_ms: number;
  stopped_duration_ms: number;
  distance_m: number;
  max_speed_kmh: number;
  avg_speed_kmh: number;
  logs_json: string;
};

function rowToTrip(row: TripRow): SavedTrip {
  let logs: SavedTrip["logs"] = [];
  try {
    logs = JSON.parse(row.logs_json) as SavedTrip["logs"];
  } catch {
    logs = [];
  }
  return {
    id: row.id,
    title: row.title,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationMs: Number(row.duration_ms),
    stoppedDurationMs: Number(row.stopped_duration_ms),
    distanceMeters: Number(row.distance_m),
    maxSpeedKmh: Number(row.max_speed_kmh),
    avgSpeedKmh: Number(row.avg_speed_kmh),
    logs,
  };
}

export const listCloudTrips = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<TripRow>`
      select id, title, started_at, ended_at, duration_ms, stopped_duration_ms,
             distance_m, max_speed_kmh, avg_speed_kmh, logs_json
      from trips
      where user_id = ${context.userId}
      order by started_at desc
      limit 20
    `;
    return rows.map(rowToTrip);
  });

export const saveCloudTrip = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: unknown) => tripSchema.parse(data))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const logsJson = JSON.stringify(data.logs.slice(0, 4000));
    await sql`
      insert into trips (
        id, user_id, title, started_at, ended_at, duration_ms, stopped_duration_ms,
        distance_m, max_speed_kmh, avg_speed_kmh, logs_json
      ) values (
        ${data.id}, ${context.userId}, ${data.title}, ${data.startedAt}, ${data.endedAt},
        ${data.durationMs}, ${data.stoppedDurationMs}, ${data.distanceMeters},
        ${data.maxSpeedKmh}, ${data.avgSpeedKmh}, ${logsJson}
      )
      on conflict (id) do update set
        title = excluded.title,
        started_at = excluded.started_at,
        ended_at = excluded.ended_at,
        duration_ms = excluded.duration_ms,
        stopped_duration_ms = excluded.stopped_duration_ms,
        distance_m = excluded.distance_m,
        max_speed_kmh = excluded.max_speed_kmh,
        avg_speed_kmh = excluded.avg_speed_kmh,
        logs_json = excluded.logs_json
      where trips.user_id = ${context.userId}
    `;
    return { ok: true };
  });

export const deleteCloudTrip = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: unknown) => z.string().parse(id))
  .handler(async ({ context, data: id }) => {
    const sql = await getSql();
    await sql`delete from trips where id = ${id} and user_id = ${context.userId}`;
    return { ok: true };
  });
