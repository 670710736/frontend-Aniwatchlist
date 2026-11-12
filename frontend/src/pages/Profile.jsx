
import { useAuth } from "../auth/AuthContext";

function Profile() {
  const { user } = useAuth();
  const displayName = user?.displayName || "ผู้ใช้งาน AnimeWatchlist";

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
    </main>
  );
}

export default Profile;
