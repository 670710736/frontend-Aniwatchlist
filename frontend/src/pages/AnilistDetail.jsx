import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { getAnimeById, searchAnime } from "../api/anilist";
import {
  addAnimeToFavorites,
  addAnimeToWatchlist,
  getAnimeFavoriteStatus,
  removeAnimeFromFavorites,
  getAnimeReviews,
  postAnimeReview,
} from "../api/backend";
import { useAuth } from "../auth/AuthContext";

function AnilistDetail() {
  const { id } = useParams();
  const { isLoggedIn } = useAuth();
  const [anime, setAnime] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);
  const [added, setAdded] = useState(false);
  const [actionError, setActionError] = useState("");
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteCount, setFavoriteCount] = useState(0);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [reviewRating, setReviewRating] = useState("10");
  const [reviewText, setReviewText] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let ignore = false;

    async function load() {
      setStatus("loading");
      setError(null);

      try {
        const requestedId = decodeURIComponent(id || "");
        const animeData = /^\d+$/.test(requestedId)
          ? await getAnimeById(requestedId, controller.signal)
          : (await searchAnime(requestedId, { perPage: 1, signal: controller.signal })).media?.[0];

        if (!animeData) throw new Error("ไม่พบอนิเมะเรื่องนี้");

        const [reviewData, favoriteData] = await Promise.all([
          getAnimeReviews(animeData.id, controller.signal).catch((requestError) => {
            if (requestError.name === "AbortError") throw requestError;
            return [];
          }),
          getAnimeFavoriteStatus(animeData.id, controller.signal).catch((requestError) => {
            if (requestError.name === "AbortError") throw requestError;
            return { count: 0, favorited: false };
          }),
        ]);

        if (!ignore) {
          setAnime(animeData);
          setReviews(reviewData);
          setFavoriteCount(Number(favoriteData.count || 0));
          setIsFavorite(isLoggedIn && Boolean(favoriteData.favorited));
          setStatus("success");
        }
      } catch (requestError) {
        if (!ignore && requestError.name !== "AbortError") {
          setError(requestError);
          setStatus("error");
        }
      }
    }

    load();
    return () => {
      ignore = true;
      controller.abort();
    };
  }, [id, isLoggedIn]);

  async function handleWatchlist(statusValue) {
    try {
      setActionError("");
      await addAnimeToWatchlist(anime.id, statusValue);
      setAdded(true);
    } catch (requestError) {
      setActionError(requestError.message || "เพิ่มรายการไม่สำเร็จ");
    }
  }

  async function handleFavorite() {
    if (!isLoggedIn) return;

    try {
      setFavoriteLoading(true);
      setActionError("");
      if (isFavorite) {
        await removeAnimeFromFavorites(anime.id);
        setIsFavorite(false);
        setFavoriteCount((count) => Math.max(0, count - 1));
      } else {
        await addAnimeToFavorites(anime.id);
        setIsFavorite(true);
        setFavoriteCount((count) => count + 1);
      }
    } catch (requestError) {
      setActionError(requestError.message || "เปลี่ยนรายการโปรดไม่สำเร็จ");
    } finally {
      setFavoriteLoading(false);
    }
  }

  async function handleReviewSubmit(event) {
    event.preventDefault();
    setReviewError("");
    setReviewSubmitting(true);
    try {
      const review = await postAnimeReview(anime.id, { rating: reviewRating, text: reviewText });
      setReviews((current) => [review, ...current]);
      setReviewText("");
      setReviewRating("10");
    } catch (requestError) {
      setReviewError(requestError.message || "โพสต์รีวิวไม่สำเร็จ");
    } finally {
      setReviewSubmitting(false);
    }
  }

  if (status === "loading") {
    return (
      <main className="mx-auto max-w-5xl animate-pulse px-4 py-10 md:px-6">
        <div className="mb-6 h-4 w-40 rounded bg-[#171a31]" />
        <div className="flex flex-col gap-8 md:flex-row">
          <div className="aspect-[2/3] w-48 shrink-0 rounded-xl bg-[#171a31]" />
          <div className="flex-1 space-y-4">
            <div className="h-9 w-2/3 rounded bg-[#171a31]" />
            <div className="h-4 w-1/3 rounded bg-[#171a31]" />
            <div className="h-5 w-1/2 rounded bg-[#171a31]" />
            <div className="h-28 w-full rounded bg-[#171a31]" />
          </div>
        </div>
      </main>
    );
  }

  if (status === "error" || !anime) {
    return (
      <main className="mx-auto max-w-xl px-4 py-20 text-center">
        <p className="text-lg text-slate-200">ไม่พบอนิเมะเรื่องนี้ 😢</p>
        <p className="mt-2 text-sm text-slate-400">{error?.message || "ไม่สามารถโหลดข้อมูลได้"}</p>
        <Link to="/anime" className="mt-6 inline-block text-sm text-slate-400 underline hover:text-white">
          กลับไปหน้าอนิเมะทั้งหมด
        </Link>
      </main>
    );
  }

  const title = anime.title?.userPreferred || anime.title?.english || anime.title?.romaji || "Untitled anime";
  const description = anime.description?.replace(/<[^>]+>/g, " ") || "ยังไม่มีเรื่องย่อของอนิเมะเรื่องนี้";
  const score = anime.averageScore ? (anime.averageScore / 10).toFixed(1) : "-";
  const poster = anime.coverImage?.extraLarge || anime.coverImage?.large;

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 md:px-6">
      <Link to="/anime" className="text-sm text-slate-400 hover:text-white">
        ← กลับไปหน้าอนิเมะทั้งหมด
      </Link>

      <div className="mt-5 flex flex-col gap-8 md:flex-row">
        {poster ? (
          <img src={poster} alt={`โปสเตอร์ ${title}`} className="w-48 shrink-0 self-start rounded-xl border border-white/10" />
        ) : (
          <div className="grid aspect-[2/3] w-48 shrink-0 place-items-center rounded-xl bg-[#171a31] text-5xl">🎬</div>
        )}

        <div className="flex-1">
          <h1 className="text-3xl font-semibold text-white md:text-4xl">{title}</h1>
          {anime.title?.native && <p className="mt-1 text-slate-400">{anime.title.native}</p>}
          <p className="mt-3 text-sm text-slate-400">
            ⭐ {score} / 10{anime.genres?.length ? ` | ${anime.genres.join(" · ")}` : ""}
            {anime.episodes ? ` | ${anime.episodes} ตอน` : ""}
          </p>

          <p className="mt-5 whitespace-pre-line leading-relaxed text-slate-300">{description}</p>

          {isLoggedIn && (
            <div className="mt-7 flex flex-wrap gap-3">
              <button type="button" onClick={() => handleWatchlist("planned")} className="rounded-lg bg-red-500 px-4 py-2 font-semibold text-white hover:bg-red-400">
                {added ? "เพิ่มในรายการอยากดูแล้ว ✓" : "เพิ่มลงรายการอยากดู +"}
              </button>
              <button type="button" onClick={handleFavorite} disabled={favoriteLoading} className={`rounded-lg border px-4 py-2 font-semibold transition disabled:opacity-60 ${isFavorite ? "border-red-400 bg-red-500/20 text-red-200" : "border-white/20 bg-white/5 text-white hover:border-red-400"}`}>
                {favoriteLoading ? "กำลังบันทึก..." : isFavorite ? "♥ นำออกจากรายการโปรด" : "♡ เพิ่มในรายการโปรด"}
              </button>
            </div>
          )}
          <p className="mt-3 text-sm text-slate-400">♥ มีคนกด favorite แล้ว {favoriteCount} คน</p>
          {actionError && <p className="mt-2 text-sm text-red-300">{actionError}</p>}
        </div>
      </div>

      <section className="mt-12 border-t border-white/10 pt-8">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-2xl font-bold text-white">รีวิวจากผู้ชม</h2>
          <span className="text-sm text-slate-500">{reviews.length} รีวิว</span>
        </div>
        <div className="mt-4 space-y-4">
          {reviews.length ? reviews.map((review) => (
            <article key={review.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex justify-between gap-3 text-sm text-white">
                <strong>{review.user?.name || "ผู้ชม AniList"}</strong>
                <span className="text-amber-300">★ {review.score || review.rating || 0}</span>
              </div>
              <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-400">{review.body || review.text || review.summary}</p>
            </article>
          )) : <p className="text-slate-500">ยังไม่มีรีวิวสำหรับเรื่องนี้</p>}
        </div>
        {isLoggedIn ? (
          <form onSubmit={handleReviewSubmit} className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
            <h3 className="font-semibold text-white">เขียนรีวิวของคุณ</h3>
            <label className="mt-4 block text-sm text-slate-300">
              คะแนน (1–10)
              <select value={reviewRating} onChange={(event) => setReviewRating(event.target.value)} className="ml-3 rounded-lg border border-white/10 bg-[#171a31] px-3 py-2 text-white">
                {Array.from({ length: 10 }, (_, index) => 10 - index).map((rating) => <option key={rating} value={rating}>{rating}</option>)}
              </select>
            </label>
            <label className="mt-4 block text-sm text-slate-300">
              รีวิว
              <textarea required maxLength={2000} value={reviewText} onChange={(event) => setReviewText(event.target.value)} rows={4} placeholder="แบ่งปันความเห็นเกี่ยวกับอนิเมะเรื่องนี้" className="mt-2 w-full rounded-lg border border-white/10 bg-[#080a16] p-3 text-white placeholder:text-slate-500" />
            </label>
            {reviewError && <p role="alert" className="mt-2 text-sm text-red-300">{reviewError}</p>}
            <button type="submit" disabled={reviewSubmitting || !reviewText.trim()} className="mt-3 rounded-lg bg-red-500 px-4 py-2 font-semibold text-white hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-60">
              {reviewSubmitting ? "กำลังโพสต์..." : "โพสต์รีวิว"}
            </button>
          </form>
        ) : (
          <p className="mt-6 text-sm text-slate-400">เข้าสู่ระบบเพื่อเขียนรีวิว</p>
        )}
      </section>
    </main>
  );
}

export default AnilistDetail;
