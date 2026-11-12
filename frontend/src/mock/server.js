import { createSeedData, genres, mockPasswordDigest } from "./data";

// Browser-only mock API for the AniList Watchlist project.
// It follows the shape of a small REST server so the UI can be developed
// before connecting the real backend or AniList GraphQL API.
let database = createSeedData();

const json = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, data });

function findAnime(id) {
  return database.anime.find((item) => String(item.id) === String(id));
}

function currentMemberId(options) {
  return Number(options.memberId || options.userId || 1);
}

function parseBody(options) {
  if (!options.body) return {};
  return typeof options.body === "string" ? JSON.parse(options.body) : options.body;
}

export function resetMockServer() {
  database = createSeedData();
  return database;
}

export function getMockDatabase() {
  return database;
}

export async function mockRequest(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const url = new URL(path, "http://mock.anilist.local");
  const parts = url.pathname.split("/").filter(Boolean);
  const body = parseBody(options);

  // GET /api/anime/trending
  if (method === "GET" && parts[0] === "api" && parts[1] === "anime" && parts[2] === "trending") {
    const limit = Number(url.searchParams.get("limit") || 8);
    return json({ items: database.anime.slice(0, limit), total: database.anime.length });
  }

  // GET /api/anime/:id
  if (method === "GET" && parts[0] === "api" && parts[1] === "anime" && parts[2]) {
    const item = findAnime(parts[2]);
    return item ? json(item) : json({ message: "ไม่พบอนิเมะเรื่องนี้" }, 404);
  }

  // GET /api/anime?search=jujutsu&genre=Action
  if (method === "GET" && parts[0] === "api" && parts[1] === "anime") {
    const search = (url.searchParams.get("search") || "").toLowerCase();
    const genre = url.searchParams.get("genre");
    const items = database.anime.filter((item) => {
      const title = Object.values(item.title).join(" ").toLowerCase();
      return (!search || title.includes(search)) && (!genre || item.genres.includes(genre));
    });
    return json({ items, total: items.length });
  }

  if (method === "GET" && parts[0] === "api" && parts[1] === "genres") {
    return json({ items: genres });
  }

  if (method === "GET" && parts[0] === "api" && parts[1] === "watchlist") {
    const memberId = currentMemberId(options);
    const items = database.watchlist
      .filter((entry) => entry.memberId === memberId)
      .map((entry) => ({ ...entry, anime: findAnime(entry.animeId) }));
    return json({ items });
  }

  if (method === "POST" && parts[0] === "api" && parts[1] === "watchlist") {
    const memberId = currentMemberId(options);
    const animeId = Number(body.animeId);
    if (!findAnime(animeId)) return json({ message: "ไม่พบอนิเมะเรื่องนี้" }, 404);
    const entry = { memberId, animeId, status: body.status || "planned", progress: Number(body.progress || 0) };
    database.watchlist = [...database.watchlist.filter((item) => !(item.memberId === memberId && item.animeId === animeId)), entry];
    return json({ ...entry, anime: findAnime(animeId) }, 201);
  }

  if (method === "GET" && parts[0] === "api" && parts[1] === "favorites") {
    const memberId = currentMemberId(options);
    const items = database.favorites.filter((entry) => entry.memberId === memberId).map((entry) => findAnime(entry.animeId)).filter(Boolean);
    return json({ items });
  }

  if (method === "POST" && parts[0] === "api" && parts[1] === "favorites") {
    const memberId = currentMemberId(options);
    const animeId = Number(body.animeId);
    if (!findAnime(animeId)) return json({ message: "ไม่พบอนิเมะเรื่องนี้" }, 404);
    if (!database.favorites.some((item) => item.memberId === memberId && item.animeId === animeId)) {
      database.favorites.push({ memberId, animeId });
    }
    return json({ animeId, memberId, favorite: true }, 201);
  }

  if (method === "POST" && parts[0] === "api" && parts[1] === "auth" && parts[2] === "login") {
    const member = database.members.find((item) => item.email === body.email && item.passwordDigest === mockPasswordDigest(body.password));
    return member ? json({ user: { id: member.id, email: member.email, displayName: member.displayName, role: member.role }, token: `mock-token-${member.id}` }) : json({ message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" }, 401);
  }

  return json({ message: "ไม่พบ endpoint นี้" }, 404);
}

export default mockRequest;
