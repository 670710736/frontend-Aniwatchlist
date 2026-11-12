import AnilistCard from "./AnilistCard";

// แสดงรายการอนิเมะตามสถานะ loading | error | success
// success ที่ไม่มีข้อมูลจะแสดง empty state
function AniGrid({ anime, status, error, onRetry }) {
  if (status === "loading") {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="animate-pulse overflow-hidden rounded-2xl border border-white/10 bg-[#111426]">
            <div className="aspect-[3/4] bg-[#171a31]" />
            <div className="space-y-2 p-4">
              <div className="h-4 w-3/4 rounded bg-white/10" />
              <div className="h-3 w-1/2 rounded bg-white/10" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-8 text-center">
        <p className="font-medium text-red-300">โหลดข้อมูลอนิเมะไม่สำเร็จ</p>
        <p className="mt-1 text-sm text-red-200/80">{error?.message || error || "กรุณาลองใหม่อีกครั้ง"}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 rounded-lg border border-red-400/50 bg-transparent px-4 py-2 text-sm text-red-200 transition hover:bg-red-500/20"
          >
            ลองใหม่
          </button>
        )}
      </div>
    );
  }

  if (!anime || anime.length === 0) {
    return <p className="py-16 text-center text-slate-400">ไม่พบอนิเมะที่ค้นหา ลองคำอื่นดู</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {anime.map((item) => <AnilistCard key={item.id} anime={item} />)}
    </div>
  );
}

export default AniGrid;
