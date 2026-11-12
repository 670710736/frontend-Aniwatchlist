import { Link } from "react-router-dom";

function AnilistCard({ anime, isFavorite = false, onFavoriteToggle }) {
  if (!anime) return null;

  const title = anime.title?.userPreferred || anime.title?.english || anime.title?.romaji || anime.title || "Untitled anime";
  const image = anime.coverImage?.extraLarge || anime.coverImage?.large || anime.image;
  const genres = anime.genres?.slice(0, 2).join(" · ");
  const score = anime.averageScore ? `${(anime.averageScore / 10).toFixed(1)} / 10` : "ยังไม่มีคะแนน";
  return (
    <article className="group overflow-hidden rounded-2xl border border-white/10 bg-[#111426] transition duration-300 hover:-translate-y-1 hover:border-red-400/50 hover:shadow-xl hover:shadow-red-950/20">
      <Link to={`/anilist/${anime.id}`} className="block">
        <div className="relative aspect-[3/4] overflow-hidden bg-[#171a31]">
          {image ? <img src={image} alt={title} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /> : <div className="flex h-full items-center justify-center text-sm text-slate-500">ไม่มีรูปภาพ</div>}
          <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#111426] to-transparent" />
          {anime.averageScore ? <span className="absolute right-3 top-3 rounded-full bg-black/70 px-2.5 py-1 text-xs font-bold text-amber-300 backdrop-blur">★ {(anime.averageScore / 10).toFixed(1)}</span> : null}
        </div>
        <div className="p-4">
          <h3 className="truncate font-bold text-white">{title}</h3>
          {anime.title?.native ? <p className="mt-1 truncate text-xs text-slate-500">{anime.title.native}</p> : null}
          <div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-400">
            <span className="truncate">{genres || "Anime"}</span>
            <span className="shrink-0 text-amber-300">{score}</span>
          </div>
        </div>
      </Link>
      {onFavoriteToggle && (
        <button
          type="button"
          onClick={() => onFavoriteToggle(anime)}
          className="mx-4 mb-4 w-[calc(100%-2rem)] rounded-lg border border-red-400/40 px-3 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-500/15"
        >
          {isFavorite ? "♥ นำออกจากรายการโปรด" : "♡ เพิ่มในรายการโปรด"}
        </button>
      )}
    </article>
  );
}

export default AnilistCard;
