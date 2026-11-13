// ชั้นกลางสำหรับคุยกับ AniList ทุกหน้าเรียกผ่านไฟล์นี้เท่านั้น
// หน้าอื่นไม่ต้องรู้จัก GraphQL URL หรือรายละเอียด query
import { onceADay } from "./cache";

const BASE = "https://graphql.anilist.co";
export const CACHE_KEY = "anilist.anime";

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

function isAllowedAnime(item) {
  return !item?.genres?.some((genre) => String(genre).toLowerCase() === "ecchi");
}

// ตัวช่วยกลาง: ส่ง GraphQL request ตรวจผลลัพธ์ และแปลงเป็น object
export async function getJSON(query, variables = {}, signal) {
  const response = await fetch(BASE, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal,
  });

  const payload = await response.json();
  if (!response.ok || payload.errors?.length) {
    throw new Error(payload.errors?.[0]?.message || `AniList ตอบกลับ ${response.status}`);
  }
  return payload.data;
}

// แปลงข้อมูล AniList ให้เป็นรูปร่างเดียวกันทุกหน้าที่นำไปใช้
export function toAnime(media) {
  return {
    ...media,
    id: media.id,
    title: media.title || {},
    coverImage: media.coverImage || {},
    genres: media.genres || [],
    description: media.description || "ยังไม่มีเรื่องย่อภาษาไทย",
    averageScore: media.averageScore || null,
  };
}

export async function getTrendingAnime({ page = 1, perPage = 8, signal } = {}) {
  const safePerPage = Math.min(Math.max(perPage, 1), 25);
  const data = await getJSON(`query Trending($page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { currentPage hasNextPage }
      media(sort: TRENDING_DESC, type: ANIME, isAdult: false) { ${ANIME_FIELDS} }
    }
  }`, { page, perPage: safePerPage }, signal);

  return {
    ...data.Page,
    media: (data.Page.media || []).filter(isAllowedAnime).map(toAnime),
  };
}

async function loadMovies(total = 100, signal) {
  const perPage = 25;
  const pages = Math.max(Math.ceil(total / perPage), 6);
  const responses = await Promise.all(
    Array.from({ length: pages }, (_, index) => getTrendingAnime({ page: index + 1, perPage, signal }))
  );

  return responses
    .flatMap((page) => page.media || [])
    .filter(isAllowedAnime)
    .slice(0, total);
}

// ข้อมูลทั้งหมดโหลดจริงวันละครั้ง ที่เหลืออ่านจาก localStorage
export function getMovies({ total = 100, signal } = {}) {
  return onceADay(`${CACHE_KEY}.${total}`, () => loadMovies(total, signal));
}

export async function getPopularAnime({ total = 100, signal } = {}) {
  const items = await getMovies({ total, signal });
  return { items, total: items.length };
}

export async function searchAnime(search, { page = 1, perPage = 12, genre, signal } = {}) {
  const data = await getJSON(`query SearchAnime($search: String, $page: Int, $perPage: Int, $genre: String) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { currentPage hasNextPage }
      media(search: $search, genre: $genre, type: ANIME, sort: SEARCH_MATCH, isAdult: false) { ${ANIME_FIELDS} }
    }
  }`, { search, page, perPage, genre }, signal);

  return {
    ...data.Page,
    media: (data.Page.media || []).filter(isAllowedAnime).map(toAnime),
  };
}

export async function getAnime(id, signal) {
  const data = await getJSON(`query Anime($id: Int) {
    Media(id: $id, type: ANIME) { ${ANIME_FIELDS} }
  }`, { id: Number(id) }, signal);

  if (!data.Media || !isAllowedAnime(data.Media)) throw new Error("ไม่พบอนิเมะเรื่องนี้");
  return toAnime(data.Media);
}

export const getAnimeById = getAnime;

export function forgetMovies() {
  return localStorage.removeItem(`${CACHE_KEY}.100`);
}
