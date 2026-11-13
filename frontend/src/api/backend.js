import mockRequest from "../mock/server";

// Mock mode is enabled by default so the frontend can run without a backend.
// Set REACT_APP_USE_MOCK=false and REACT_APP_API_URL when using the real API.
export const isMockMode = process.env.REACT_APP_USE_MOCK !== "false";
const API_URL = (process.env.REACT_APP_API_URL || "").replace(/\/+$/, "");
const ANILIST_API_URL = "https://graphql.anilist.co";
const BLOCKED_GENRES = new Set(["ecchi"]);

function isAllowedAnime(item) {
  return !item?.genres?.some((genre) => BLOCKED_GENRES.has(String(genre).toLowerCase()));
}
const TOKEN_KEY = "anilist.token";
let memoryToken = null;

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function setToken(token) {
  memoryToken = token || null;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Keep the session in memory when browser storage is unavailable.
  }
}

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || memoryToken;
  } catch {
    return memoryToken;
  }
}

// Convert the local mock response into the same small Response interface
// consumed by request(). This keeps switching between mock and real API easy.
export async function mockFetch(path, options = {}) {
  const result = await mockRequest(path, options);
  return {
    ok: result.ok,
    status: result.status,
    async json() {
      return result.data;
    },
  };
}

export async function request(path, { method = "GET", body, signal, memberId } = {}) {
  const headers = { Accept: "application/json" };
  const publicAuth = path === "/api/auth/login" || path === "/api/auth/register";
  const token = publicAuth ? null : getToken();

  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const options = { method, headers, signal };
  if (body !== undefined) options.body = JSON.stringify(body);
  if (memberId !== undefined) options.memberId = memberId;

  let response;
  try {
    if (!isMockMode && !API_URL) {
      throw new ApiError(0, "CONFIGURATION_ERROR", "กรุณาตั้ง REACT_APP_API_URL เป็น URL ของ Backend");
    }
    response = await (isMockMode ? mockFetch : fetch)(`${API_URL}${path}`, options);
  } catch (error) {
    if (error.name === "AbortError" || error instanceof ApiError) throw error;
    throw new ApiError(0, "NETWORK_ERROR", "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองอีกครั้ง");
  }

  if (response.status === 204) return null;

  let payload;
  try {
    payload = await response.json();
  } catch {
    if (response.ok) throw new ApiError(502, "INVALID_RESPONSE", "เซิร์ฟเวอร์ส่งข้อมูลที่ไม่ถูกต้อง");
  }

  if (!response.ok) {
    const errorPayload = payload?.error || payload || {};
    if (response.status === 401 && token && token === getToken()) {
      setToken(null);
      if (typeof window !== "undefined") window.dispatchEvent(new Event("anilist:unauthorized"));
    }
    throw new ApiError(response.status, errorPayload.code || "HTTP_ERROR", errorPayload.message || `เกิดข้อผิดพลาด (${response.status})`);
  }

  return payload;
}

const ANIME_FIELDS = `
  id
  title { romaji english native userPreferred }
  coverImage { large extraLarge color }
  bannerImage
  description(asHtml: false)
  genres
  averageScore
  episodes
  status
  format
`;

export async function aniListRequest(query, variables = {}, signal) {
  let response;
  try {
    response = await fetch(ANILIST_API_URL, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
      signal,
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new ApiError(0, "NETWORK_ERROR", "เชื่อมต่อ AniList ไม่ได้ กรุณาลองอีกครั้ง");
  }

  const payload = await response.json();
  if (!response.ok || payload.errors?.length) {
    throw new ApiError(response.status || 502, "ANILIST_ERROR", payload.errors?.[0]?.message || "AniList ส่งข้อมูลผิดพลาด");
  }
  return payload.data;
}

export async function getTrendingAnime({ page = 1, perPage = 8, signal } = {}) {
  const safePerPage = Math.min(Math.max(perPage, 1), 25);
  const data = await aniListRequest(`query Trending($page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { currentPage hasNextPage }
      media(sort: TRENDING_DESC, type: ANIME, isAdult: false) { ${ANIME_FIELDS} }
    }
  }`, { page, perPage: safePerPage }, signal);
  return {
    ...data.Page,
    media: (data.Page.media || []).filter(isAllowedAnime),
  };
}

export async function getPopularAnime({ total = 100, signal } = {}) {
  const perPage = 25;
  const pages = Math.max(Math.ceil(total / perPage), 6);
  const responses = await Promise.all(
    Array.from({ length: pages }, (_, index) =>
      getTrendingAnime({ page: index + 1, perPage, signal })
    )
  );

  return {
    items: responses
      .flatMap((page) => page.media || [])
      .filter(isAllowedAnime)
      .slice(0, total),
    total,
  };
}

export async function searchAnime(search, { page = 1, perPage = 12, genre, signal } = {}) {
  const data = await aniListRequest(`query SearchAnime($search: String, $page: Int, $perPage: Int, $genre: String) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { currentPage hasNextPage }
      media(search: $search, genre: $genre, type: ANIME, sort: SEARCH_MATCH, isAdult: false) { ${ANIME_FIELDS} }
    }
  }`, { search, page, perPage, genre }, signal);
  return {
    ...data.Page,
    media: (data.Page.media || []).filter(isAllowedAnime),
  };
}

export async function getAnimeById(id, signal) {
  try {
    const data = await aniListRequest(`query Anime($id: Int) {
      Media(id: $id, type: ANIME) { ${ANIME_FIELDS} }
    }`, { id: Number(id) }, signal);
    if (data.Media && isAllowedAnime(data.Media)) return data.Media;
    throw new ApiError(404, "ANIME_NOT_FOUND", "ไม่พบอนิเมะเรื่องนี้");
  } catch (error) {
    if (error.name === "AbortError") throw error;
    if (isMockMode) {
      const result = await request(`/api/anime/${encodeURIComponent(id)}`, { signal });
      return result;
    }
    throw error;
  }
}

export async function getAnimeReviews(id, signal) {
  const result = await request(`/api/reviews?animeId=${encodeURIComponent(id)}`, { signal });
  return result.items || [];
}

export function addAnimeToWatchlist(animeId, status = "planned") {
  return request("/api/watchlist", { method: "POST", body: { animeId: Number(animeId), status } });
}

export async function getFavorites(signal) {
  const result = await request("/api/favorites", { signal });
  return result.items || [];
}

export function addAnimeToFavorites(animeId) {
  return request("/api/favorites", { method: "POST", body: { animeId: Number(animeId) } });
}

export function removeAnimeFromFavorites(animeId) {
  return request(`/api/favorites/${encodeURIComponent(animeId)}`, { method: "DELETE" });
}

export async function getAnimeFavoriteStatus(animeId, signal) {
  return request(`/api/favorites?animeId=${encodeURIComponent(animeId)}`, { signal });
}

export function postAnimeReview(animeId, { rating, text }) {
  return request("/api/reviews", {
    method: "POST",
    body: { animeId: Number(animeId), rating: Number(rating), text },
  });
}
