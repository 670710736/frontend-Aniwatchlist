import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

function Logout() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    logout();
    navigate("/", { replace: true });
  }, [logout, navigate]);

  return (
    <main className="flex min-h-[calc(100vh-72px)] items-center justify-center px-4 text-slate-100">
      <p className="text-slate-400">กำลังออกจากระบบ...</p>
    </main>
  );
}

export default Logout;
