import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AnilistCard from "../components/AnilistCard";
import { getPopularAnime } from "../api/backend";

function Anime() {
  const [items, setItems] = useState([]);
  const [allAnime, setAllAnime] = useState([]);
  const [categories, setCategories] = useState(["All"]);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    const controller = new AbortController();
    getPopularAnime({ total: 100, signal: controller.signal })
      .then((result) => {
        const animeItems = result.items || [];
        const animeCategories = [...new Set(animeItems.flatMap((anime) => anime.genres || []))].sort();
        setAllAnime(animeItems);
        setItems(animeItems);
        setCategories(["All", ...animeCategories]);
        setStatus("ready");
      })
      .catch((error) => {
        if (error.name !== "AbortError") setStatus("error");
      });
    return () => controller.abort();
  }, []);

  function handleCategory(category) {
    setSelectedCategory(category);
    const filteredAnime = category === "All"
      ? allAnime
      : allAnime.filter((anime) => anime.genres?.includes(category));
    setItems(filteredAnime);
    setStatus("ready");
  }

  return (
    <main className="min-h-screen bg-[#080a16] px-6 py-12 text-white lg:px-10">
      <div className="mx-auto max-w-7xl">
        <Link to="/" className="text-sm text-slate-400 hover:text-white">← กลับหน้าหลัก</Link>
        <div className="mb-8 mt-8"><p className="text-xs font-bold tracking-[0.25em] text-red-400">FIND YOUR NEXT FAVORITE</p><h1 className="mt-2 text-4xl font-black">ค้นหาอนิเมะตามหมวดหมู่</h1><p className="mt-3 text-slate-400">เลือก categories เพื่อค้นหาเรื่องที่ตรงกับความชอบของคุณ</p></div>
        <div className="mb-10 flex flex-wrap gap-3">{categories.map((category) => <button key={category} type="button" onClick={() => handleCategory(category)} className={`rounded-full border px-4 py-2 text-sm transition ${selectedCategory === category ? "border-red-400 bg-red-500 text-white" : "border-white/15 text-slate-300 hover:border-red-400 hover:bg-red-500/10 hover:text-white"}`}>{category}</button>)}</div>
        <div className="mb-6 flex items-center justify-between"><h2 className="text-2xl font-bold">{selectedCategory === "All" ? "อนิเมะยอดนิยม 100 เรื่อง" : selectedCategory}</h2><span className="text-sm text-slate-500">{items.length} เรื่อง</span></div>
        {status === "loading" && <p className="py-20 text-center text-slate-400">กำลังโหลดข้อมูลอนิเมะ...</p>}
        {status === "error" && <p className="py-20 text-center text-red-300">ไม่สามารถโหลดข้อมูลจาก AniList ได้</p>}
        {status === "ready" && <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">{items.map((anime) => <AnilistCard anime={anime} key={anime.id} />)}</div>}
      </div>
    </main>
  );
}

export default Anime;
