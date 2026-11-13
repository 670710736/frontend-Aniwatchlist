import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getAnimeById } from "../api/anilist";
import { getWatchlist, removeAnimeFromWatchlist } from "../api/backend";

const statusLabels = {
  planned: "อยากดู",
  watching: "กำลังดู",
  completed: "ดูจบแล้ว",
};

function Watchlist() {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [removingId, setRemovingId] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function load() {
      setStatus("loading");
      setError("");
      try {
        const entries = await getWatchlist(controller.signal);
        const withAnime = await Promise.all(entries.map(async (entry) => {
          try {
            const anime = await getAnimeById(entry.animeId, controller.signal);
            return { ...entry, anime };
          } catch (requestError) {
            if (requestError.name === "AbortError") throw requestError;
            return { ...entry, anime: null };
          }
        }));
        if (active) {
          setItems(withAnime);
          setStatus("ready");
        }
      } catch (requestError) {
        if (active && requestError.name !== "AbortError") {
          setError(requestError.message || "โหลดรายการอยากดูไม่สำเร็จ");
          setStatus("error");
        }
      }
    }

    load();
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  async function handleRemove(animeId) {
    setRemovingId(animeId);
    setError("");
    try {
      await removeAnimeFromWatchlist(animeId);
      setItems((current) => current.filter((item) => item.animeId !== animeId));
    } catch (requestError) {
      setError(requestError.message || "นำอนิเมะออกจากรายการไม่สำเร็จ");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#080a16] px-6 py-12 text-white lg:px-10">
      <div className="mx-auto max-w-7xl">
        <Link to="/anime" className="text-sm text-slate-400 hover:text-white">← กลับไปหน้าอนิเมะ</Link>
        <div className="mb-8 mt-8">
          <p className="text-xs font-bold tracking-[0.25em] text-red-400">MY COLLECTION</p>
          <h1 className="mt-2 text-4xl font-black">รายการอยากดู</h1>
          <p className="mt-3 text-slate-400">อนิเมะที่บันทึกไว้ในรายการของคุณ</p>
        </div>

        {status === "loading" && <p className="py-20 text-center text-slate-400">กำลังโหลดรายการอยากดู...</p>}
        {status === "error" && <p role="alert" className="py-20 text-center text-red-300">{error}</p>}
        {status === "ready" && !items.length && (
          <p className="rounded-2xl border border-white/10 bg-white/5 py-20 text-center text-slate-400">
            ยังไม่มีอนิเมะในรายการอยากดู ไปเลือกเรื่องที่สนใจแล้วกด “เพิ่มลงรายการอยากดู”
          </p>
        )}
        {status === "ready" && items.length > 0 && (
          <>
            <p className="mb-6 text-sm text-slate-500">{items.length} เรื่อง</p>
            {error && <p role="alert" className="mb-4 text-sm text-red-300">{error}</p>}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => {
                const anime = item.anime;
                const title = anime?.title?.userPreferred || anime?.title?.english || anime?.title?.romaji || `Anime #${item.animeId}`;
                const image = anime?.coverImage?.extraLarge || anime?.coverImage?.large;
                return (
                  <article key={item.animeId} className="flex gap-4 rounded-2xl border border-white/10 bg-[#111426] p-4">
                    <Link to={`/anilist/${item.animeId}`} className="h-36 w-24 shrink-0 overflow-hidden rounded-lg bg-[#080a16]">
                      {image ? <img src={image} alt={title} className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center text-xs text-slate-500">ไม่มีรูป</span>}
                    </Link>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <Link to={`/anilist/${item.animeId}`} className="line-clamp-2 font-bold hover:text-red-300">{title}</Link>
                      <span className="mt-2 w-fit rounded-full bg-red-500/10 px-2.5 py-1 text-xs text-red-300">
                        {statusLabels[item.status] || statusLabels.planned}
                      </span>
                      {anime?.averageScore ? <p className="mt-2 text-sm text-amber-300">★ {(anime.averageScore / 10).toFixed(1)} / 10</p> : null}
                      <button
                        type="button"
                        onClick={() => handleRemove(item.animeId)}
                        disabled={removingId === item.animeId}
                        className="mt-auto pt-3 text-left text-sm text-slate-400 hover:text-red-300 disabled:opacity-50"
                      >
                        {removingId === item.animeId ? "กำลังนำออก..." : "นำออกจากรายการ"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

export default Watchlist;
