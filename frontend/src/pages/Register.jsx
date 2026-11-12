
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { request } from "../api/backend";
import { useAuth } from "../auth/AuthContext";

function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState(null);
  const [status, setStatus] = useState("typing");
  const location = useLocation();
  const navigate = useNavigate();
  const { login } = useAuth();
  const from = location.state?.from || "/";

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน");
      return;
    }

    if (password.length < 4) {
      setError("รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร");
      return;
    }

    setStatus("submitting");

    try {
      const result = await request("/api/auth/register", {
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
          <h1 className="mt-3 text-3xl font-bold">สมัครสมาชิก</h1>
          <p className="mt-2 text-sm text-slate-400">สร้างบัญชีเพื่อเก็บอนิเมะเรื่องโปรดของคุณ</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label htmlFor="register-email" className="mb-2 block text-sm font-medium text-slate-300">อีเมล</label>
            <input id="register-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="อีเมล" autoComplete="email" required
              className="w-full rounded-xl border border-white/10 bg-[#080a16] px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-red-400 focus:ring-2 focus:ring-red-400/20" />
          </div>

          <div>
            <label htmlFor="register-password" className="mb-2 block text-sm font-medium text-slate-300">รหัสผ่าน</label>
            <input id="register-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="รหัสผ่านอย่างน้อย 4 ตัวอักษร" autoComplete="new-password" minLength="4" required
              className="w-full rounded-xl border border-white/10 bg-[#080a16] px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-red-400 focus:ring-2 focus:ring-red-400/20" />
          </div>

          <div>
            <label htmlFor="confirm-password" className="mb-2 block text-sm font-medium text-slate-300">ยืนยันรหัสผ่าน</label>
            <input id="confirm-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="กรอกรหัสผ่านอีกครั้ง" autoComplete="new-password" required
              className="w-full rounded-xl border border-white/10 bg-[#080a16] px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-red-400 focus:ring-2 focus:ring-red-400/20" />
          </div>

          <button type="submit" disabled={status === "submitting"}
            className="w-full rounded-xl bg-red-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:bg-slate-700">
            {status === "submitting" ? "กำลังสมัครสมาชิก..." : "สมัครสมาชิก"}
          </button>

          {error && <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
        </form>

        <p className="mt-6 text-center text-sm text-slate-400">
          มีบัญชีอยู่แล้ว? <Link to="/login" className="font-medium text-red-400 hover:text-red-300 hover:underline">เข้าสู่ระบบ</Link>
        </p>
      </section>
    </main>
  );
}

export default Register;
