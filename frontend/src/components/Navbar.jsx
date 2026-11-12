
import { Link } from "react-router-dom";

function Navbar() {
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

        <Link to="/login" className="hover:text-red-400">
          Login
        </Link>

        <Link to="/register" className="hover:text-red-400">
          Register
        </Link>

      </div>
    </nav>
  );
}

export default Navbar;
