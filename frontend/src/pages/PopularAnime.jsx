import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AnilistCard from "../components/AnilistCard";
import { getPopularAnime } from "../api/anilist";

function PopularAnime() {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    const controller = new AbortController();

    getPopularAnime({ total: 100, signal: controller.signal })
      .then((result) => {
        setItems(result.items);
        setStatus("ready");
      })
      .catch((error) => {
        if (error.name !== "AbortError") setStatus("error");
      });

    return () => controller.abort();
  }, []);

  return (
    <main className="min-h-screen bg-[#080a16] px-6 py-12 text-white lg:px-10">
      <div className="mx-auto max-w-7xl">
        <Link to="/" className="text-sm text-slate-400 transition hover:text-white">← กลับหน้าหลัก</Link>
        <div className="mt-8 mb-8">
          <p className="text-xs font-bold tracking-[0.25em] text-red-400">POPULAR ANIME</p>
          <h1 className="mt-2 text-4xl font-black">อนิเมะยอดนิยมในขณะนี้</h1>
          <p className="mt-3 text-slate-400">รายการอนิเมะยอดนิยม 100 เรื่องจาก AniList</p>
        </div>

        {status === "loading" && <p className="py-20 text-center text-slate-400">กำลังโหลดอนิเมะยอดนิยม...</p>}
        {status === "error" && <p className="py-20 text-center text-red-300">ไม่สามารถโหลดข้อมูลจาก AniList ได้</p>}
        {status === "ready" && <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">{items.map((anime) => <AnilistCard anime={anime} key={anime.id} />)}</div>}
      </div>
    </main>
  );
}

export default PopularAnime;
