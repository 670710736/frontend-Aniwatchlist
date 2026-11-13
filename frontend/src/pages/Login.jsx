
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { request } from "../api/backend";
import { useAuth } from "../auth/AuthContext";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [status, setStatus] = useState("typing");
  const location = useLocation();
  const navigate = useNavigate();
  const { login } = useAuth();
  const from = location.state?.from || "/";

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus("submitting");
    setError(null);

    try {
      const result = await request("/api/auth/login", {
        method: "POST",
        body: { email, password },
      });

      login(result.token, result.user);
      navigate(from, { replace: true });
    } catch (requestError) {
      setError(requestError.message);
      setStatus("typing");
    }
  }

  return (
    <main className="flex min-h-[calc(100vh-72px)] items-center justify-center px-4 py-12 text-slate-100">
      <section className="w-full max-w-md rounded-2xl border border-white/10 bg-[#111426] p-6 shadow-2xl shadow-black/20 sm:p-8">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-red-400">AnimeWatchlist</p>
          <h1 className="mt-3 text-3xl font-bold">เข้าสู่ระบบ</h1>
          <p className="mt-2 text-sm text-slate-400">ใช้บัญชีที่สมัครไว้เพื่อเข้าสู่ระบบ</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-300">อีเมล</label>
            <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="อีเมล" autoComplete="email" required
              className="w-full rounded-xl border border-white/10 bg-[#080a16] px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-red-400 focus:ring-2 focus:ring-red-400/20" />
          </div>

          <div>
            <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-300">รหัสผ่าน</label>
            <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="รหัสผ่าน" autoComplete="current-password" required
              className="w-full rounded-xl border border-white/10 bg-[#080a16] px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-red-400 focus:ring-2 focus:ring-red-400/20" />
          </div>

          <button type="submit" disabled={status === "submitting"}
            className="w-full rounded-xl bg-red-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:bg-slate-700">
            {status === "submitting" ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </button>

          {error && <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
        </form>

        <p className="mt-6 text-center text-sm text-slate-400">
          ยังไม่มีบัญชี? <Link to="/register" className="font-medium text-red-400 hover:text-red-300 hover:underline">สมัครสมาชิก</Link>
        </p>
      </section>
    </main>
  );
}

export default Login;
