import type { KVNamespace } from "@cloudflare/workers-types";
import type { Room } from "../types";

const KV_PREFIX = "room:";

export async function createRoom(
  kv: KVNamespace,
  name: string,
  description?: string
): Promise<Room> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const room: Room = {
    id,
    name,
    description,
    root: `rooms/${id}`,
    createdAt: now,
    updatedAt: now,
  };
  await kv.put(`${KV_PREFIX}${id}`, JSON.stringify(room));
  return room;
}

export async function getRoom(kv: KVNamespace, id: string): Promise<Room | null> {
  const value = await kv.get(`${KV_PREFIX}${id}`);
  if (!value) return null;
  return JSON.parse(value) as Room;
}

export async function listRooms(kv: KVNamespace): Promise<Room[]> {
  const list = await kv.list({ prefix: KV_PREFIX });
  const rooms = await Promise.all(
    list.keys.map(async (key) => {
      const value = await kv.get(key.name);
      return value ? (JSON.parse(value) as Room) : null;
    })
  );
  return rooms.filter((r): r is Room => r !== null);
}

export async function deleteRoom(kv: KVNamespace, id: string): Promise<boolean> {
  const existing = await getRoom(kv, id);
  if (!existing) return false;
  await kv.delete(`${KV_PREFIX}${id}`);
  return true;
}
