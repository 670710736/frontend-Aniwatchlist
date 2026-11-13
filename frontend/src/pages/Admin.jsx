import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import {
  createAdminAnime,
  deleteAdminAnime,
  getAdminAnimeList,
  getAdminMembers,
  getAdminStats,
  setAdminMemberRole,
  updateAdminAnime,
} from "../api/backend";
import { searchAnime as searchAniListAnime } from "../api/anilist";

const EMPTY_FORM = {
  id: "", romaji: "", english: "", native: "", userPreferred: "",
  coverLarge: "", coverExtraLarge: "", bannerImage: "", description: "",
  genres: "", averageScore: "", popularity: "0", episodes: "",
  status: "FINISHED", format: "TV",
};

const fields = [
  ["id", "AniList ID", "number"], ["romaji", "ชื่อ Romaji"], ["english", "ชื่ออังกฤษ"],
  ["native", "ชื่อดั้งเดิม"], ["userPreferred", "ชื่อที่ใช้แสดง"],
  ["coverLarge", "URL รูปปก"], ["coverExtraLarge", "URL รูปปกขนาดใหญ่"], ["bannerImage", "URL แบนเนอร์"],
  ["genres", "Genres (คั่นด้วย ,)"], ["averageScore", "คะแนน 0–100", "number"],
  ["popularity", "ความนิยม", "number"], ["episodes", "จำนวนตอน", "number"],
];

function titleOf(anime) {
  return anime?.title?.userPreferred || anime?.title?.english || anime?.title?.romaji || `AniList #${anime?.id}`;
}

function animeToForm(anime) {
  return {
    ...EMPTY_FORM,
    id: String(anime.id ?? ""), romaji: anime.title?.romaji || "", english: anime.title?.english || "",
    native: anime.title?.native || "", userPreferred: anime.title?.userPreferred || "",
    coverLarge: anime.coverImage?.large || "", coverExtraLarge: anime.coverImage?.extraLarge || "",
    bannerImage: anime.bannerImage || "", description: anime.description || "",
    genres: (anime.genres || []).join(", "), averageScore: anime.averageScore ?? "",
    popularity: anime.popularity ?? 0, episodes: anime.episodes ?? "",
    status: anime.status || "FINISHED", format: anime.format || "TV",
  };
}

function formToAnime(form) {
  const optionalNumber = (value) => value === "" ? null : Number(value);
  return {
    id: Number(form.id),
    title: {
      romaji: form.romaji.trim() || null, english: form.english.trim() || null,
      native: form.native.trim() || null, userPreferred: form.userPreferred.trim() || null,
    },
    coverImage: { large: form.coverLarge.trim(), extraLarge: form.coverExtraLarge.trim() || form.coverLarge.trim() },
    bannerImage: form.bannerImage.trim() || null,
    description: form.description.trim() || null,
    genres: form.genres.split(",").map((genre) => genre.trim()).filter(Boolean),
    averageScore: optionalNumber(form.averageScore), popularity: Number(form.popularity || 0),
    episodes: optionalNumber(form.episodes), status: form.status, format: form.format,
  };
}

function StatCard({ label, value }) {
  return <div className="rounded-xl border border-white/10 bg-[#121522] p-5"><p className="text-sm text-slate-400">{label}</p><p className="mt-2 text-3xl font-bold text-white">{value ?? "—"}</p></div>;
}

function Admin() {
  const { user } = useAuth();
  const [tab, setTab] = useState("overview");
  const [stats, setStats] = useState(null);
  const [members, setMembers] = useState([]);
  const [anime, setAnime] = useState([]);
  const [query, setQuery] = useState("");
  const [remoteQuery, setRemoteQuery] = useState("");
  const [remoteResults, setRemoteResults] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refreshStats = useCallback(async () => setStats(await getAdminStats()), []);
  const refreshMembers = useCallback(async () => setMembers(await getAdminMembers()), []);
  const refreshAnime = useCallback(async (search = "") => setAnime(await getAdminAnimeList(search)), []);

  useEffect(() => {
    Promise.all([refreshStats(), refreshMembers(), refreshAnime("")]).catch((err) => {
      setError(err.message || "โหลดข้อมูลหลังบ้านไม่สำเร็จ");
    });
  }, [refreshStats, refreshMembers, refreshAnime]);

  async function run(action, successMessage) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); if (successMessage) setNotice(successMessage); }
    catch (err) { setError(err.message || "ทำรายการไม่สำเร็จ"); }
    finally { setBusy(false); }
  }

  async function findAnime(event) {
    event.preventDefault();
    await run(() => refreshAnime(query), "โหลดรายการอนิเมะแล้ว");
  }

  async function findAniList(event) {
    event.preventDefault();
    await run(async () => {
      const result = await searchAniListAnime(remoteQuery, { perPage: 8 });
      setRemoteResults(result.media || []);
    });
  }

  async function saveAnime(event) {
    event.preventDefault();
    const payload = formToAnime(form);
    await run(async () => {
      if (editing) await updateAdminAnime(payload.id, payload);
      else await createAdminAnime(payload);
      setForm(EMPTY_FORM); setEditing(false); setRemoteResults([]);
      await Promise.all([refreshAnime(query), refreshStats()]);
    }, editing ? "บันทึกการแก้ไขแล้ว" : "เพิ่มอนิเมะในระบบแล้ว");
  }

  function editAnime(item) { setForm(animeToForm(item)); setEditing(true); setNotice(""); setError(""); window.scrollTo({ top: 0, behavior: "smooth" }); }

  function chooseAniList(item) {
    setForm(animeToForm(item)); setEditing(false); setTab("anime");
    setNotice(`นำข้อมูล ${titleOf(item)} มาใส่ฟอร์มแล้ว`); setError("");
  }

  async function changeRole(memberId, role) {
    await run(async () => {
      const updated = await setAdminMemberRole(memberId, role);
      setMembers((current) => current.map((member) => member.id === updated.id ? updated : member));
    }, "เปลี่ยนบทบาทสมาชิกแล้ว");
  }

  async function removeAnime(item) {
    if (!window.confirm(`ลบ ${titleOf(item)} ออกจากแคตตาล็อกหรือไม่?`)) return;
    await run(async () => {
      await deleteAdminAnime(item.id);
      await Promise.all([refreshAnime(query), refreshStats()]);
      if (String(form.id) === String(item.id)) { setForm(EMPTY_FORM); setEditing(false); }
    }, "ลบอนิเมะออกจากแคตตาล็อกแล้ว");
  }

  const tabs = [["overview", "ภาพรวม"], ["anime", "จัดการอนิเมะ"], ["members", "สมาชิก"]];
  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-8 text-white sm:px-8">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-bold tracking-[0.25em] text-red-400">ADMIN PANEL</p><h1 className="mt-2 text-3xl font-bold">จัดการระบบ</h1><p className="mt-1 text-sm text-slate-400">เข้าสู่ระบบในชื่อ {user?.displayName || user?.email}</p></div>
        <div className="flex gap-2 rounded-xl border border-white/10 bg-[#111321] p-1">{tabs.map(([key, label]) => <button key={key} onClick={() => setTab(key)} className={`rounded-lg px-4 py-2 text-sm ${tab === key ? "bg-red-500 text-white" : "text-slate-300 hover:bg-white/5"}`}>{label}</button>)}</div>
      </div>
      {error && <div role="alert" className="mb-4 rounded-lg border border-red-400/20 bg-red-950/40 px-4 py-3 text-sm text-red-300">{error}</div>}
      {notice && <div role="status" className="mb-4 rounded-lg border border-emerald-400/20 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-300">{notice}</div>}

      {tab === "overview" && <>
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="อนิเมะในแคตตาล็อก" value={stats?.animeCount} /><StatCard label="สมาชิก" value={stats?.memberCount} />
          <StatCard label="รีวิว" value={stats?.reviewCount} /><StatCard label="รายการอยากดู" value={stats?.watchlistEntryCount} /><StatCard label="รายการโปรด" value={stats?.favoriteEntryCount} />
        </section>
        <section className="mt-6 rounded-xl border border-white/10 bg-[#121522] p-5"><h2 className="text-lg font-semibold">ทางลัด</h2><p className="mt-2 text-sm text-slate-400">จัดการข้อมูลอนิเมะที่บันทึกในระบบ หรือดูสมาชิกและกำหนดบทบาทผู้ใช้</p><div className="mt-4 flex gap-3"><button onClick={() => setTab("anime")} className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold">จัดการอนิเมะ</button><button onClick={() => setTab("members")} className="rounded-lg border border-white/15 px-4 py-2 text-sm">ดูสมาชิก</button></div></section>
      </>}

      {tab === "members" && <section className="overflow-hidden rounded-xl border border-white/10 bg-[#121522]">
        <div className="border-b border-white/10 p-5"><h2 className="text-lg font-semibold">สมาชิกทั้งหมด</h2><p className="mt-1 text-sm text-slate-400">แอดมินเปลี่ยนบทบาทของตัวเองไม่ได้</p></div>
        {members.length ? <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-white/[0.03] text-slate-400"><tr><th className="px-5 py-3">สมาชิก</th><th className="px-5 py-3">อีเมล</th><th className="px-5 py-3">สมัครเมื่อ</th><th className="px-5 py-3">บทบาท</th></tr></thead><tbody>{members.map((member) => <tr key={member.id} className="border-t border-white/[0.07]"><td className="px-5 py-4 font-medium">{member.displayName}</td><td className="px-5 py-4 text-slate-300">{member.email}</td><td className="px-5 py-4 text-slate-400">{member.createdAt ? new Date(member.createdAt).toLocaleDateString("th-TH") : "—"}</td><td className="px-5 py-4"><select aria-label={`บทบาทของ ${member.email}`} value={member.role} disabled={busy || String(member.id) === String(user?.id)} onChange={(event) => changeRole(member.id, event.target.value)} className="rounded-lg border border-white/10 bg-[#090b16] px-3 py-2 disabled:opacity-50"><option value="member">สมาชิก</option><option value="admin">แอดมิน</option></select>{String(member.id) === String(user?.id) && <span className="ml-2 text-xs text-slate-500">บัญชีของคุณ</span>}</td></tr>)}</tbody></table></div> : <p className="p-5 text-sm text-slate-400">ยังไม่มีข้อมูลสมาชิก</p>}
      </section>}

      {tab === "anime" && <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(380px,0.9fr)]">
        <section className="rounded-xl border border-white/10 bg-[#121522] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">แคตตาล็อกอนิเมะ</h2><p className="mt-1 text-sm text-slate-400">รายการนี้แสดงข้อมูลอนิเมะที่บันทึกใน backend</p></div><button onClick={() => { setForm(EMPTY_FORM); setEditing(false); }} className="rounded-lg bg-red-500 px-3 py-2 text-sm font-semibold">เพิ่มรายการ</button></div>
          <form onSubmit={findAnime} className="mt-4 flex gap-2"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาชื่อในแคตตาล็อก" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#090b16] px-3 py-2 text-sm outline-none focus:border-red-400"/><button disabled={busy} className="rounded-lg border border-white/15 px-4 text-sm">ค้นหา</button></form>
          <div className="mt-4 divide-y divide-white/[0.07]">{anime.map((item) => <div key={item.id} className="flex items-center gap-3 py-3"><img src={item.coverImage?.large || item.coverImage?.extraLarge} alt="" className="h-14 w-10 rounded object-cover"/><div className="min-w-0 flex-1"><p className="truncate font-medium">{titleOf(item)}</p><p className="text-xs text-slate-400">ID {item.id} · {(item.genres || []).join(" · ")}</p></div><button onClick={() => editAnime(item)} className="rounded-md border border-white/15 px-3 py-1.5 text-xs">แก้ไข</button><button onClick={() => removeAnime(item)} disabled={busy} className="rounded-md border border-red-400/30 px-3 py-1.5 text-xs text-red-300">ลบ</button></div>)}{anime.length === 0 && <p className="py-5 text-sm text-slate-400">ไม่พบรายการ ใช้ค้นหา AniList ทางด้านขวาเพื่อเลือกข้อมูลมาเพิ่มได้</p>}</div>
        </section>

        <section className="rounded-xl border border-white/10 bg-[#121522] p-5">
          <h2 className="text-lg font-semibold">{editing ? "แก้ไขอนิเมะ" : "เพิ่มหรือค้นหาข้อมูลอนิเมะ"}</h2>
          <form onSubmit={findAniList} className="mt-3 flex gap-2"><input value={remoteQuery} onChange={(event) => setRemoteQuery(event.target.value)} placeholder="ค้นหาชื่อจาก AniList" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#090b16] px-3 py-2 text-sm outline-none focus:border-red-400"/><button disabled={busy || !remoteQuery.trim()} className="rounded-lg bg-white/10 px-4 text-sm">ค้นหา</button></form>
          {remoteResults.length > 0 && <div className="mt-3 max-h-48 overflow-y-auto rounded-lg border border-white/10">{remoteResults.map((item) => <button type="button" key={item.id} onClick={() => chooseAniList(item)} className="flex w-full items-center gap-3 border-b border-white/[0.06] p-2 text-left last:border-0 hover:bg-white/5"><img src={item.coverImage?.large} alt="" className="h-12 w-9 rounded object-cover"/><span className="min-w-0 flex-1 truncate text-sm">{titleOf(item)}</span><span className="text-xs text-slate-400">#{item.id}</span></button>)}</div>}
          <form onSubmit={saveAnime} className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">{fields.map(([key, label, type]) => <label key={key} className="block text-xs text-slate-300">{label}<input required={key === "id" || key === "coverLarge" || key === "romaji"} type={type || "text"} min={type === "number" ? "0" : undefined} value={form[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#090b16] px-3 py-2 text-sm text-white outline-none focus:border-red-400"/></label>)}</div>
            <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs text-slate-300">สถานะ<select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#090b16] px-3 py-2 text-sm">{["FINISHED", "RELEASING", "NOT_YET_RELEASED", "CANCELLED", "HIATUS"].map((value) => <option key={value}>{value}</option>)}</select></label><label className="text-xs text-slate-300">รูปแบบ<select value={form.format} onChange={(event) => setForm((current) => ({ ...current, format: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#090b16] px-3 py-2 text-sm">{["TV", "TV_SHORT", "MOVIE", "SPECIAL", "OVA", "ONA", "MUSIC"].map((value) => <option key={value}>{value}</option>)}</select></label></div>
            <label className="block text-xs text-slate-300">เรื่องย่อ<textarea rows="4" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#090b16] px-3 py-2 text-sm outline-none focus:border-red-400"/></label>
            <div className="flex gap-2"><button disabled={busy} className="rounded-lg bg-red-500 px-4 py-2.5 text-sm font-semibold disabled:opacity-50">{busy ? "กำลังบันทึก…" : editing ? "บันทึกการแก้ไข" : "เพิ่มอนิเมะ"}</button>{editing && <button type="button" onClick={() => { setForm(EMPTY_FORM); setEditing(false); }} className="rounded-lg border border-white/15 px-4 py-2.5 text-sm">ยกเลิก</button>}</div>
          </form>
        </section>
      </div>}
    </main>
  );
}

export default Admin;
