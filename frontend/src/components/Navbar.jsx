
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

function Navbar() {
  const { isLoggedIn, user } = useAuth();

  return (
    <nav className="bg-gray-950 text-white px-8 py-4 flex justify-between items-center">

      <Link to="/" className="text-2xl font-bold text-red-500">
        AnimeWatchlist
      </Link>

      <div className="flex gap-6">

        <Link to="/" className="hover:text-red-400">
          Home
        </Link>

        <Link to="/favorites" className="hover:text-red-400">
          Favorites
        </Link>

        {isLoggedIn ? (
          <>
            <Link to="/watchlist" className="hover:text-red-400">
              Watchlist
            </Link>
            <Link to="/profile" className="hover:text-red-400">
              Profile
            </Link>
            {user?.role === "admin" && (
              <Link to="/admin" className="hover:text-red-400">
                Admin Panel
              </Link>
            )}
            <Link to="/logout" className="hover:text-red-400">
              Logout
            </Link>
          </>
        ) : (
          <Link to="/login" className="hover:text-red-400">
            Login
          </Link>
        )}

      </div>
    </nav>
  );
}

export default Navbar;
