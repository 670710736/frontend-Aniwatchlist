
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getMovies, searchAnime } from "../api/anilist";
import AnilistCard from "../components/AnilistCard";

const featuredAnime = [
  { id: "154587", title: "เริ่มต้นการผจญภัยครั้งใหม่", subtitle: "สำรวจอนิเมะเรื่องโปรดของคุณ", description: "ค้นพบเรื่องราวที่ใช่ ติดตามตอนล่าสุด และสร้าง watchlist ที่เป็นตัวคุณในที่เดียว", image: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/154587-3yMZs1jz6x5x.jpg" },
  { id: "21", title: "One Piece", subtitle: "การเดินทางของโจรสลัดหมวกฟาง", description: "ออกเดินทางไปพร้อมกับลูฟี่และพรรคพวกบนเส้นทางสู่สมบัติ One Piece", image: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/21-qfC2x3GQZQ2t.jpg" },
];

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function Home() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [activeHero, setActiveHero] = useState(0);
  const [picks, setPicks] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const hero = featuredAnime[activeHero];

  useEffect(() => {
    let ignore = false;
    getMovies()
      .then((list) => { if (!ignore) setPicks(shuffle(list)); })
      .catch(() => { if (!ignore) setPicks([]); });
    return () => { ignore = true; };
  }, []);

  useEffect(() => {
    const search = query.trim();

    if (!search) {
      setSuggestions([]);
      setSearching(false);
      return undefined;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);

      try {
        const page = await searchAnime(search, {
          page: 1,
          perPage: 6,
          signal: controller.signal,
        });
        setSuggestions(page.media || []);
      } catch (error) {
        if (error.name !== "AbortError") setSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  async function handleSearch(event) {
    event.preventDefault();
    const search = query.trim();
    if (!search) return;

    try {
      setSearchError("");
      const page = await searchAnime(search, { page: 1, perPage: 1 });
      const firstAnime = page.media?.[0];

      if (!firstAnime) {
        setSearchError("ไม่พบอนิเมะที่ค้นหา");
        return;
      }

      navigate(`/anilist/${firstAnime.id}`);
    } catch {
      navigate(`/anilist/${encodeURIComponent(search)}`);
    }
  }

  const displayedAnime = picks;

  return (
    <main className="min-h-screen overflow-hidden bg-[#080a16] text-white">
      <section className="relative isolate min-h-[620px] border-b border-white/10">
        <div className="absolute inset-0 -z-20 bg-cover bg-center opacity-35 transition-all duration-700" style={{ backgroundImage: `url(${hero.image})` }} />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#080a16] via-[#080a16]/90 to-[#080a16]/20" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#080a16] via-transparent to-[#080a16]/30" />
        <div className="mx-auto flex min-h-[620px] max-w-7xl items-center px-6 py-16 lg:px-10">
          <div className="max-w-2xl">
            <p className="mb-5 flex items-center gap-3 text-xs font-bold tracking-[0.3em] text-red-400"><span className="h-px w-8 bg-red-500" /> ANIME WATCHLIST</p>
            <h1 className="max-w-xl text-5xl font-black leading-[1.05] tracking-tight sm:text-7xl">{hero.title}</h1>
            <p className="mt-6 text-xl font-medium text-slate-200">{hero.subtitle}</p>
            <p className="mt-4 max-w-lg leading-7 text-slate-400">{hero.description}</p>
            <div className="relative mt-8 max-w-xl">
              <form onSubmit={handleSearch} className="flex flex-col gap-3 sm:flex-row">
                <label className="flex flex-1 items-center rounded-xl border border-white/15 bg-white/10 px-4 backdrop-blur-md focus-within:border-red-400"><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาชื่ออนิเมะ..." className="w-full bg-transparent py-3 text-sm outline-none placeholder:text-slate-500" aria-label="ค้นหาชื่ออนิเมะ" /></label>
                <button className="rounded-xl bg-red-500 px-6 py-3 font-bold transition hover:bg-red-400" type="submit">ค้นหา</button>
              </form>

              {query.trim() && <div className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-xl border border-white/10 bg-[#111426]/95 shadow-2xl backdrop-blur-xl">
                {searching ? <p className="px-4 py-3 text-sm text-slate-400">กำลังค้นหา...</p> : suggestions.length ? suggestions.map((anime) => <Link key={anime.id} to={`/anilist/${anime.id}`} onClick={() => setQuery("")} className="flex items-center gap-3 border-b border-white/5 px-4 py-3 transition last:border-0 hover:bg-white/10"><img src={anime.coverImage?.large} alt="" className="h-12 w-9 rounded object-cover" /><span className="min-w-0"><strong className="block truncate text-sm text-white">{anime.title?.userPreferred || anime.title?.english || anime.title?.romaji}</strong><small className="block truncate text-xs text-slate-400">{anime.genres?.slice(0, 2).join(" · ")}</small></span></Link>) : <p className="px-4 py-3 text-sm text-slate-400">ไม่พบอนิเมะ</p>}
              </div>}
            </div>
            {searchError && <p className="mt-3 text-sm text-red-300">{searchError}</p>}
            <div className="mt-8 flex gap-2" aria-label="เลือกเรื่องแนะนำ">{featuredAnime.map((item, index) => <button key={item.id} type="button" onClick={() => setActiveHero(index)} aria-label={`แสดง ${item.title}`} className={`h-1.5 rounded-full transition-all ${index === activeHero ? "w-10 bg-red-400" : "w-5 bg-white/30 hover:bg-white/60"}`} />)}</div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-14 lg:px-10">
        <div className="mb-7 flex items-end justify-between gap-4"><div><p className="text-xs font-bold tracking-[0.25em] text-red-400">TRENDING NOW</p><h2 className="mt-2 text-3xl font-bold">เรื่องที่กำลังมาแรง</h2></div><Link to="/anime" className="text-sm font-semibold text-slate-400 transition hover:text-white">ดูเพิ่มเติม <span aria-hidden="true">↗</span></Link></div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">{displayedAnime.map((item) => <AnilistCard anime={item} key={item.id} />)}</div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-16 text-center lg:px-10"><p className="text-4xl" aria-hidden="true">✦</p><h2 className="mt-4 text-3xl font-bold">เก็บทุกเรื่องที่อยากดูไว้ในที่เดียว</h2><p className="mx-auto mt-3 max-w-xl text-slate-400">สร้าง watchlist ส่วนตัว จัดการอนิเมะที่กำลังดู และไม่พลาดเรื่องใหม่ที่คุณอาจหลงรัก</p><Link to="/register" className="mt-7 inline-block rounded-xl bg-red-500 px-6 py-3 font-bold transition hover:bg-red-400">เริ่มต้นใช้งานฟรี <span aria-hidden="true">↗</span></Link></section>
    </main>
  );
}

export default Home;
