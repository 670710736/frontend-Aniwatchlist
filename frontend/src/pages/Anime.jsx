import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AniGrid from "../components/AniGrid";
import { CACHE_KEY, getMovies } from "../api/anilist";
import { forget } from "../api/cache";

function animeTitle(anime) {
  return anime.title?.userPreferred || anime.title?.english || anime.title?.romaji || "";
}

function Anime() {
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("all");
  const [anime, setAnime] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let ignore = false;

    async function load() {
      setStatus("loading");
      setError(null);
      try {
        const items = await getMovies();
        if (!ignore) {
          setAnime(items);
          setStatus("success");
        }
      } catch (requestError) {
        if (!ignore) {
          setError(requestError);
          setStatus("error");
        }
      }
    }

    load();
    return () => { ignore = true; };
  }, [reloadKey]);

  const genres = useMemo(
    () => [...new Set(anime.flatMap((item) => item.genres || []))].sort(),
    [anime]
  );

  const shown = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return anime.filter((item) => {
      const title = animeTitle(item).toLowerCase();
      const nativeTitle = (item.title?.native || "").toLowerCase();
      return (genre === "all" || item.genres?.includes(genre))
        && (!normalizedQuery || title.includes(normalizedQuery) || nativeTitle.includes(normalizedQuery));
    });
  }, [anime, genre, query]);

  const chipClass = (active) => `rounded-full border px-3 py-1 text-sm transition ${active
    ? "border-red-400 bg-red-500 text-white"
    : "border-white/15 bg-white/5 text-slate-300 hover:border-red-400 hover:bg-red-500/10"}`;

  function retry() {
    forget(`${CACHE_KEY}.100`);
    setReloadKey((key) => key + 1);
  }

  return (
    <main className="min-h-screen bg-[#080a16] px-6 py-12 text-white lg:px-10">
      <div className="mx-auto max-w-7xl">
        <Link to="/" className="text-sm text-slate-400 transition hover:text-white">← กลับหน้าหลัก</Link>
        <div className="mb-4 mt-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-4xl font-black">อนิเมะทั้งหมด</h1>
            <p className="mt-3 text-sm text-slate-400">
              แหล่งข้อมูล: AniList (โหลดวันละครั้ง) {status === "success" && `| พบ ${shown.length} จาก ${anime.length} เรื่อง`}
            </p>
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="พิมพ์ชื่ออนิเมะเพื่อกรอง..."
            className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-red-400 md:w-72"
          />
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          <button type="button" onClick={() => setGenre("all")} className={chipClass(genre === "all")}>ทุกแนว</button>
          {genres.map((item) => <button key={item} type="button" onClick={() => setGenre(item)} className={chipClass(genre === item)}>{item}</button>)}
        </div>

        <AniGrid anime={shown} status={status} error={error} onRetry={retry} />
      </div>
    </main>
  );
}

export default Anime;
