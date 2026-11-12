
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AnilistCard from "../components/AnilistCard";
import { getFavorites, removeAnimeFromFavorites } from "../api/backend";

function Favorites() {
  const [favorites, setFavorites] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    getFavorites(controller.signal)
      .then((items) => {
        setFavorites(items);
        setStatus("ready");
      })
      .catch((requestError) => {
        if (requestError.name !== "AbortError") {
          setError(requestError.message || "โหลดรายการโปรดไม่สำเร็จ");
          setStatus("error");
        }
      });
    return () => controller.abort();
  }, []);

  async function handleRemove(anime) {
    try {
      setError("");
      await removeAnimeFromFavorites(anime.id);
      setFavorites((items) => items.filter((item) => item.id !== anime.id));
    } catch (requestError) {
      setError(requestError.message || "นำออกจากรายการโปรดไม่สำเร็จ");
    }
  }

  return (
    <main className="min-h-screen bg-[#080a16] px-6 py-12 text-white lg:px-10">
      <div className="mx-auto max-w-7xl">
        <Link to="/" className="text-sm text-slate-400 hover:text-white">← กลับหน้าหลัก</Link>
        <div className="mb-8 mt-8">
          <p className="text-xs font-bold tracking-[0.25em] text-red-400">MY COLLECTION</p>
          <h1 className="mt-2 text-4xl font-black">รายการโปรดของฉัน</h1>
          <p className="mt-3 text-slate-400">อนิเมะที่คุณกดเก็บไว้ดูภายหลัง</p>
        </div>
        {status === "loading" && <p className="py-20 text-center text-slate-400">กำลังโหลดรายการโปรด...</p>}
        {status === "error" && <p className="py-20 text-center text-red-300">{error}</p>}
        {status === "ready" && !favorites.length && <p className="rounded-2xl border border-white/10 bg-white/5 py-20 text-center text-slate-400">ยังไม่มีอนิเมะในรายการโปรด ลองกด ♡ ที่หน้าอนิเมะที่ชอบ</p>}
        {status === "ready" && favorites.length > 0 && (
          <>
            <div className="mb-6 text-sm text-slate-500">{favorites.length} เรื่อง</div>
            {error && <p className="mb-4 text-sm text-red-300">{error}</p>}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {favorites.map((anime) => <AnilistCard key={anime.id} anime={anime} isFavorite onFavoriteToggle={handleRemove} />)}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

export default Favorites;
