import type { SavedTrip } from "@/lib/speedo/types";

export async function listCloudTrips(): Promise<SavedTrip[]> {
  return [];
}

export async function saveCloudTrip(_args: { data: SavedTrip }) {
  return { ok: false as const };
}

export async function deleteCloudTrip(_args: { data: string }) {
  return { ok: false as const };
}
