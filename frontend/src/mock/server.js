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
  const authorization = options.headers?.Authorization || options.headers?.authorization || "";
  const tokenMemberId = authorization.match(/^Bearer mock-token-(\d+)$/)?.[1];
  return Number(options.memberId || options.userId || tokenMemberId || 1);
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

  if (parts[0] === "api" && parts[1] === "reviews") {
    const animeId = Number(url.searchParams.get("animeId") || body.animeId);
    if (!Number.isInteger(animeId) || animeId <= 0) {
      return json({ message: "รหัสอนิเมะไม่ถูกต้อง" }, 400);
    }

    if (method === "GET") {
      const items = database.reviews
        .filter((review) => review.animeId === animeId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return json({ items });
    }

    if (method === "POST") {
      const memberId = currentMemberId(options);
      const member = database.members.find((item) => item.id === memberId);
      const text = String(body.text || "").trim();
      const rating = Number(body.rating);
      if (!member) return json({ message: "กรุณาเข้าสู่ระบบก่อนโพสต์รีวิว" }, 401);
      if (!text) return json({ message: "กรุณาเขียนรีวิวก่อนโพสต์" }, 400);
      if (!Number.isInteger(rating) || rating < 1 || rating > 10) {
        return json({ message: "คะแนนรีวิวต้องอยู่ระหว่าง 1 ถึง 10" }, 400);
      }

      const review = {
        id: database.nextReviewId++,
        animeId,
        rating,
        text,
        user: { id: member.id, name: member.displayName },
        createdAt: new Date().toISOString(),
      };
      database.reviews.push(review);
      return json(review, 201);
    }
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
    const animeId = url.searchParams.get("animeId");
    if (animeId) {
      const numericAnimeId = Number(animeId);
      return json({
        animeId: numericAnimeId,
        count: database.favorites.filter((item) => item.animeId === numericAnimeId).length,
        favorited: database.favorites.some((item) => item.memberId === memberId && item.animeId === numericAnimeId),
      });
    }
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

  if (method === "DELETE" && parts[0] === "api" && parts[1] === "favorites" && parts[2]) {
    const memberId = currentMemberId(options);
    const animeId = Number(parts[2]);
    database.favorites = database.favorites.filter((item) => !(item.memberId === memberId && item.animeId === animeId));
    return json({ animeId, memberId, favorite: false });
  }

  if (method === "POST" && parts[0] === "api" && parts[1] === "auth" && parts[2] === "register") {
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (!email || password.length < 4) {
      return json({ message: "กรุณากรอกอีเมลและรหัสผ่านอย่างน้อย 4 ตัวอักษร" }, 400);
    }

    if (database.members.some((item) => item.email.toLowerCase() === email)) {
      return json({ message: "อีเมลนี้ถูกใช้งานแล้ว" }, 409);
    }

    const member = {
      id: database.nextMemberId++,
      email,
      displayName: email.split("@")[0],
      role: "member",
      passwordDigest: mockPasswordDigest(password),
    };
    database.members.push(member);

    return json({
      user: { id: member.id, email: member.email, displayName: member.displayName, role: member.role },
      token: `mock-token-${member.id}`,
    }, 201);
  }

  if (method === "POST" && parts[0] === "api" && parts[1] === "auth" && parts[2] === "login") {
    const member = database.members.find((item) => item.email === body.email && item.passwordDigest === mockPasswordDigest(body.password));
    return member ? json({ user: { id: member.id, email: member.email, displayName: member.displayName, role: member.role }, token: `mock-token-${member.id}` }) : json({ message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" }, 401);
  }

  return json({ message: "ไม่พบ endpoint นี้" }, 404);
}

export default mockRequest;
