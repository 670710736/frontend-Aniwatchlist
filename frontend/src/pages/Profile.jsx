
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AnilistCard from "../components/AnilistCard";
import { getAnimeById } from "../api/anilist";
import { getFavorites, getMyReviews } from "../api/backend";
import { request } from "../api/backend";
import { useAuth } from "../auth/AuthContext";

function Profile() {
  const { user } = useAuth();
  const [favorites, setFavorites] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordNotice, setPasswordNotice] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const displayName = user?.displayName || "ผู้ใช้งาน AnimeWatchlist";

  async function handlePasswordChange(event) {
    event.preventDefault();
    setPasswordError("");
    setPasswordNotice("");
    if (newPassword !== confirmPassword) {
      setPasswordError("รหัสผ่านใหม่และการยืนยันไม่ตรงกัน");
      return;
    }
    if (newPassword.length < 4) {
      setPasswordError("รหัสผ่านใหม่ต้องมีอย่างน้อย 4 ตัวอักษร");
      return;
    }

    setPasswordSaving(true);
    try {
      await request("/api/auth/password", {
        method: "PUT",
        body: { currentPassword, newPassword },
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordNotice("เปลี่ยนรหัสผ่านเรียบร้อยแล้ว");
    } catch (requestError) {
      setPasswordError(requestError.message || "เปลี่ยนรหัสผ่านไม่สำเร็จ");
    } finally {
      setPasswordSaving(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function loadProfileData() {
      setStatus("loading");
      setError("");
      try {
        const [favoriteItems, reviewItems] = await Promise.all([
          getFavorites(controller.signal),
          getMyReviews(controller.signal),
        ]);
        const reviewsWithAnime = await Promise.all(reviewItems.map(async (review) => {
          try {
            const anime = await getAnimeById(review.animeId, controller.signal);
            return { ...review, anime };
          } catch (requestError) {
            if (requestError.name === "AbortError") throw requestError;
            return { ...review, anime: null };
          }
        }));
        if (active) {
          setFavorites(favoriteItems);
          setReviews(reviewsWithAnime);
          setStatus("ready");
        }
      } catch (requestError) {
        if (active && requestError.name !== "AbortError") {
          setError(requestError.message || "โหลดข้อมูลโปรไฟล์ไม่สำเร็จ");
          setStatus("error");
        }
      }
    }

    loadProfileData();
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  return (
    <main className="mx-auto min-h-[calc(100vh-72px)] max-w-2xl px-4 py-12 text-slate-100 sm:px-6">
      <section className="rounded-2xl border border-white/10 bg-[#111426] p-6 sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-red-400">My account</p>
        <h1 className="mt-3 text-3xl font-bold">โปรไฟล์ของฉัน</h1>
        <div className="mt-8 flex items-center gap-4 rounded-xl bg-[#080a16] p-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-xl font-bold">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="font-semibold">{displayName}</h2>
            <p className="mt-1 text-sm text-slate-400">{user?.email || "สมาชิก AnimeWatchlist"}</p>
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-white/10 bg-[#111426] p-6 sm:p-8">
        <h2 className="text-xl font-bold">เปลี่ยนรหัสผ่าน</h2>
        <p className="mt-1 text-sm text-slate-400">กรอกรหัสผ่านปัจจุบันก่อนตั้งรหัสผ่านใหม่</p>
        <form onSubmit={handlePasswordChange} className="mt-5 space-y-4">
          <label className="block text-sm text-slate-300">รหัสผ่านเดิม
            <input type="password" autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#080a16] px-4 py-3 text-white outline-none focus:border-red-400" />
          </label>
          <label className="block text-sm text-slate-300">รหัสผ่านใหม่
            <input type="password" autoComplete="new-password" minLength="4" required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#080a16] px-4 py-3 text-white outline-none focus:border-red-400" />
          </label>
          <label className="block text-sm text-slate-300">ยืนยันรหัสผ่านใหม่
            <input type="password" autoComplete="new-password" minLength="4" required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#080a16] px-4 py-3 text-white outline-none focus:border-red-400" />
          </label>
          {passwordError && <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{passwordError}</p>}
          {passwordNotice && <p role="status" className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{passwordNotice}</p>}
          <button type="submit" disabled={passwordSaving} className="rounded-xl bg-red-500 px-5 py-3 text-sm font-bold text-white hover:bg-red-400 disabled:opacity-60">
            {passwordSaving ? "กำลังเปลี่ยนรหัสผ่าน..." : "เปลี่ยนรหัสผ่าน"}
          </button>
        </form>
      </section>

      {status === "loading" && <p className="mt-8 text-center text-slate-400">กำลังโหลดรายการของคุณ...</p>}
      {status === "error" && <p role="alert" className="mt-8 text-center text-red-300">{error}</p>}
      {status === "ready" && (
        <div className="mt-8 space-y-8">
          <section>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-2xl font-bold">อนิเมะที่ฉันรีวิว</h2>
              <span className="text-sm text-slate-500">{reviews.length} เรื่อง</span>
            </div>
            {reviews.length ? (
              <div className="space-y-3">
                {reviews.map((review) => {
                  const title = review.anime?.title?.userPreferred
                    || review.anime?.title?.english
                    || review.anime?.title?.romaji
                    || `Anime #${review.animeId}`;
                  const image = review.anime?.coverImage?.extraLarge || review.anime?.coverImage?.large;
                  return (
                    <article key={review.id} className="flex gap-4 rounded-xl border border-white/10 bg-[#111426] p-4">
                      <Link to={`/anilist/${review.animeId}`} className="h-28 w-20 shrink-0 overflow-hidden rounded-lg bg-[#080a16]">
                        {image ? <img src={image} alt={title} className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center text-xs text-slate-500">ไม่มีรูป</span>}
                      </Link>
                      <div className="min-w-0">
                        <Link to={`/anilist/${review.animeId}`} className="font-semibold hover:text-red-300">{title}</Link>
                        <p className="mt-1 text-sm text-amber-300">★ {review.score ?? "-"}/10</p>
                        <p className="mt-2 whitespace-pre-line text-sm text-slate-400">{review.text}</p>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="rounded-xl border border-white/10 bg-white/5 p-5 text-slate-400">
                คุณยังไม่ได้เขียนรีวิว <Link to="/anime" className="text-red-300 hover:underline">เลือกอนิเมะเพื่อเขียนรีวิว</Link>
              </p>
            )}
          </section>

          <section>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-2xl font-bold">รายการโปรดของฉัน</h2>
              <span className="text-sm text-slate-500">{favorites.length} เรื่อง</span>
            </div>
            {favorites.length ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {favorites.map((anime) => <AnilistCard key={anime.id} anime={anime} />)}
              </div>
            ) : (
              <p className="rounded-xl border border-white/10 bg-white/5 p-5 text-slate-400">
                ยังไม่มีอนิเมะในรายการโปรด <Link to="/anime" className="text-red-300 hover:underline">ไปเลือกอนิเมะ</Link>
              </p>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

export default Profile;
