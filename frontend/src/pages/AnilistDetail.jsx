
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { addAnimeToWatchlist, getAnimeById, getAnimeReviews, searchAnime } from "../api/backend";

function AnilistDetail() {
  const { id } = useParams();
  const [anime, setAnime] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [status, setStatus] = useState("loading");
  const [added, setAdded] = useState(false);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    const requestedId = decodeURIComponent(id);
    const animeRequest = /^\d+$/.test(requestedId)
      ? getAnimeById(requestedId, controller.signal)
      : searchAnime(requestedId, { perPage: 1, signal: controller.signal }).then((page) => page.media?.[0]);
    animeRequest
      .then((animeData) => {
        if (!animeData) throw new Error("ไม่พบอนิเมะเรื่องนี้");
        return getAnimeReviews(animeData.id, controller.signal)
          .catch((error) => error.name === "AbortError" ? Promise.reject(error) : [])
          .then((reviewData) => [animeData, reviewData]);
      })
      .then(([animeData, reviewData]) => {
        setAnime(animeData);
        setReviews(reviewData);
        setStatus("ready");
      })
      .catch((error) => {
        if (error.name !== "AbortError") setStatus("error");
      });
    return () => controller.abort();
  }, [id]);

  async function handleWatchlist(statusValue) {
    try {
      setActionError("");
      await addAnimeToWatchlist(anime.id, statusValue);
      setAdded(true);
    } catch (error) {
      setActionError(error.message || "เพิ่มรายการไม่สำเร็จ");
    }
  }

  if (status === "loading") return <main className="min-h-screen bg-[#080a16] p-10 text-center text-slate-400">กำลังโหลดข้อมูลอนิเมะ...</main>;
  if (status === "error" || !anime) return <main className="min-h-screen bg-[#080a16] p-10 text-center text-red-300"><p>ไม่สามารถโหลดข้อมูลอนิเมะได้</p><Link to="/" className="mt-4 inline-block text-sm text-slate-400 hover:text-white">กลับหน้าแรก</Link></main>;

  const title = anime.title?.userPreferred || anime.title?.english || anime.title?.romaji || "Untitled anime";
  const description = anime.description?.replace(/<[^>]+>/g, " ") || "ยังไม่มีเรื่องย่อของอนิเมะเรื่องนี้";
  const score = anime.averageScore ? (anime.averageScore / 10).toFixed(1) : "-";

  return (
    <main className="min-h-screen bg-[#080a16] text-white">
      <section className="relative isolate overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 -z-20 bg-cover bg-center opacity-30 blur-sm" style={{ backgroundImage: `url(${anime.bannerImage || anime.coverImage?.large})` }} />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#080a16] via-[#080a16]/95 to-[#080a16]/70" />
        <div className="mx-auto max-w-6xl px-6 py-6 lg:px-10"><Link to="/" className="text-sm text-slate-400 transition hover:text-white">← กลับหน้าหลัก</Link></div>
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 pb-16 pt-8 md:flex-row md:items-center lg:px-10">
          <img src={anime.coverImage?.extraLarge || anime.coverImage?.large} alt={title} className="w-48 rounded-2xl shadow-2xl shadow-black/60 md:w-64" />
          <div className="max-w-3xl">
            <div className="mb-4 flex flex-wrap gap-2">{anime.genres?.map((genre) => <span key={genre} className="rounded-full border border-red-400/40 px-3 py-1 text-xs text-red-300">{genre}</span>)}</div>
            <h1 className="text-4xl font-black tracking-tight sm:text-6xl">{title}</h1>
            {anime.title?.native && <p className="mt-2 text-slate-400">{anime.title.native}</p>}
            <div className="mt-6 flex flex-wrap gap-5 text-sm text-slate-300"><span className="text-amber-300">★ {score} / 10</span><span>{anime.episodes || "ไม่ระบุ"} ตอน</span><span>{anime.format || "ANIME"}</span><span>{anime.status || "ไม่ระบุ"}</span></div>
            <button type="button" onClick={() => handleWatchlist("planned")} className="mt-8 rounded-xl bg-red-500 px-5 py-3 font-bold transition hover:bg-red-400">{added ? "เพิ่มในรายการอยากดูแล้ว ✓" : "เพิ่มลงรายการอยากดู +"}</button>
            {actionError && <p className="mt-3 text-sm text-red-300">{actionError}</p>}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-12 px-6 py-14 lg:grid-cols-[1.25fr_1fr] lg:px-10">
        <article><h2 className="text-2xl font-bold">เรื่องย่อ</h2><p className="mt-4 whitespace-pre-line leading-8 text-slate-300">{description}</p></article>
        <article><div className="flex items-center justify-between"><h2 className="text-2xl font-bold">รีวิวจากผู้ชม</h2><span className="text-sm text-slate-500">{reviews.length} รีวิว</span></div><div className="mt-4 space-y-4">{reviews.length ? reviews.map((review) => <div key={review.id} className="rounded-xl border border-white/10 bg-white/5 p-4"><div className="flex justify-between gap-3 text-sm"><strong>{review.user?.name || "ผู้ชม AniList"}</strong><span className="text-amber-300">★ {review.score || review.rating || 0}</span></div><p className="mt-2 text-sm leading-6 text-slate-400">{review.body || review.text || review.summary}</p></div>) : <p className="text-slate-500">ยังไม่มีรีวิวสำหรับเรื่องนี้</p>}</div></article>
      </section>
    </main>
  );
}

export default AnilistDetail;
