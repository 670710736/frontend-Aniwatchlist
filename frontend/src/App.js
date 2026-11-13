
import { BrowserRouter, Routes, Route } from "react-router-dom";

import Navbar from "./components/Navbar";

import Home from "./pages/Home";
import Login from "./pages/Login";
import Logout from "./pages/Logout";
import Register from "./pages/Register";
import AnilistDetail from "./pages/AnilistDetail";
import Favorites from "./pages/Favorites";
import Profile from "./pages/Profile";
import PopularAnime from "./pages/PopularAnime";
import Watchlist from "./pages/Watchlist";
import Anime from "./pages/Anime";
import NotFound from "./pages/NotFound";
import Footer from "./components/Footer";
import ProtectRoute from "./routes/ProtectedRoute";
import Admin from "./pages/Admin";
import { AuthProvider } from "./auth/AuthContext";

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Navbar />
        <div className="min-h-screen bg-[#080a16]">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/logout" element={<Logout />} />
            <Route path="/register" element={<Register />} />
            <Route path="/anilist/:id" element={<AnilistDetail />} />
            <Route path="/popular" element={<PopularAnime />} />
            <Route path="/anime" element={<Anime />} />
            <Route path="/favorites" element={<ProtectRoute><Favorites /></ProtectRoute>} />
            <Route path="/watchlist" element={<ProtectRoute><Watchlist /></ProtectRoute>} />
            <Route path="/profile" element={<ProtectRoute><Profile /></ProtectRoute>} />
            <Route path="/admin" element={<ProtectRoute requiredRole="admin"><Admin /></ProtectRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          <Footer />
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
