// Mock data for the AniList Watchlist frontend.
// The records mirror the fields returned by the AniList GraphQL API closely
// enough to use during local development without a network request.

export const genres = [
  "Action",
  "Adventure",
  "Comedy",
  "Drama",
  "Fantasy",
  "Romance",
  "Sci-Fi",
  "Supernatural",
];

const animeSeeds = [
  ["Attack on Titan", "ผ่าพิภพไททัน", "Action", "Drama", 16498, "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx16498-7gWfD3M9Q9mF.jpg", 9.1, 25],
  ["Jujutsu Kaisen", "มหาเวทย์ผนึกมาร", "Action", "Supernatural", 113415, "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx113415-3wM8L8zY0xY5.jpg", 8.7, 24],
  ["One Punch Man", "เทพบุตรหมัดเดียวจอด", "Action", "Comedy", 21087, "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21087-7V7b7eK8z8wS.jpg", 8.5, 12],
  ["Tokyo Ghoul", "โตเกียวกูล", "Action", "Horror", 20605, "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx20605-Q6n5s6H4v4Jx.jpg", 7.8, 12],
  ["One Piece", "วันพีซ", "Adventure", "Fantasy", 21, "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21-7p5j6J8m3VtL.jpg", 8.7, null],
  ["Frieren: Beyond Journey's End", "คำอธิษฐานในวันที่จากลา", "Adventure", "Drama", 154587, "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx154587-0qK6qQ8m8sJp.jpg", 9.3, 28],
  ["Demon Slayer", "ดาบพิฆาตอสูร", "Action", "Fantasy", 101922, "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx101922-yZ4h4H2Q7PpR.jpg", 8.6, 26],
  ["Spy x Family", "สปาย แฟมิลี", "Comedy", "Action", 140960, "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx140960-6wT5J8Q3Xr7P.jpg", 8.6, 25],
];

export const anime = animeSeeds.map(([title, nativeTitle, genre, subGenre, id, coverImage, averageScore, episodes]) => ({
  id,
  title: { romaji: title, english: title, native: nativeTitle },
  coverImage: { large: coverImage, color: "#e63946" },
  bannerImage: coverImage,
  genres: [genre, subGenre],
  averageScore: Math.round(averageScore * 10),
  episodes,
  status: episodes === null ? "RELEASING" : "FINISHED",
  format: "TV",
  description: `${nativeTitle} — เรื่องราวอนิเมะสำหรับใช้ทดลองระบบ AniList Watchlist`,
}));

// Keep the same deterministic mock digest shape used by the original demo.
// Real authentication should be handled by the backend with bcrypt and JWT.
export function mockPasswordDigest(password) {
  let hash1 = 2166136261;
  let hash2 = 5381;
  for (const char of String(password)) {
    hash1 = Math.imul(hash1 ^ char.charCodeAt(0), 16777619);
    hash2 = Math.imul(hash2, 33) ^ char.charCodeAt(0);
  }
  return `mock-only:${(hash1 >>> 0).toString(16)}:${(hash2 >>> 0).toString(16)}`;
}

export function createSeedData() {
  const passwordDigest = mockPasswordDigest("ExamplePassword123");
  const demoPasswordDigest = mockPasswordDigest("1234");
  const members = [
    { id: 1, email: "demo@example.com", displayName: "นักดูอนิเมะตัวอย่าง", role: "member", passwordDigest },
    { id: 2, email: "admin@example.com", displayName: "ผู้ดูแลระบบ", role: "admin", passwordDigest },
    { id: 3, email: "otaku@example.com", displayName: "นักสะสมอนิเมะ", role: "member", passwordDigest },
    { id: 4, email: "demo@moviehub.test", displayName: "MovieHub Demo", role: "member", passwordDigest: demoPasswordDigest },
  ];

  const reviews = anime.slice(0, 6).flatMap((item, index) => [
    { id: index * 2 + 1, animeId: item.id, memberId: 1, rating: 5, text: "ดูสนุกมาก เนื้อเรื่องน่าติดตามและงานภาพดี", createdAt: "2026-11-11T08:00:00Z" },
    { id: index * 2 + 2, animeId: item.id, memberId: 3, rating: index % 2 ? 4 : 5, text: "เป็นเรื่องที่อยากแนะนำให้ลองดู", createdAt: "2026-11-11T10:30:00Z" },
  ]);

  return {
    version: 1,
    anime,
    members,
    reviews,
    favorites: [
      { memberId: 1, animeId: 16498 },
      { memberId: 1, animeId: 154587 },
    ],
    watchlist: [
      { memberId: 1, animeId: 21, status: "watching", progress: 12 },
      { memberId: 1, animeId: 113415, status: "completed", progress: 24 },
    ],
    sessions: {},
    nextMemberId: 5,
    nextReviewId: reviews.length + 1,
  };
}
