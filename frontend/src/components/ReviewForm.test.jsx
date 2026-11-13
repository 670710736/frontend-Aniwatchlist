import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AnilistDetail from "../pages/AnilistDetail";
import { useAuth } from "../auth/AuthContext";
import { getAnimeById } from "../api/anilist";
import {
  getAnimeFavoriteStatus,
  getAnimeReviews,
  postAnimeReview,
} from "../api/backend";

jest.mock("../auth/AuthContext", () => ({ useAuth: jest.fn() }));
jest.mock("react-router-dom", () => {
  const React = require("react");
  return {
    Link: ({ to, children, ...props }) => React.createElement("a", { href: to, ...props }, children),
    useParams: () => ({ id: "154587" }),
  };
});
jest.mock("../api/anilist", () => ({
  getAnimeById: jest.fn(),
}));
jest.mock("../api/backend", () => ({
  getAnimeFavoriteStatus: jest.fn(),
  getAnimeReviews: jest.fn(),
  postAnimeReview: jest.fn(),
}));

const anime = {
  id: 154587,
  title: {
    romaji: "Frieren: Beyond Journey's End",
    english: "Frieren: Beyond Journey's End",
    native: "คำอธิษฐานในวันที่จากลา",
  },
  coverImage: { large: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx154587-0qK6qQ8m8sJp.jpg" },
  description: "คำอธิษฐานในวันที่จากลา — เรื่องราวอนิเมะสำหรับใช้ทดลองระบบ AniList Watchlist",
  genres: ["Adventure", "Drama"],
  averageScore: 93,
  episodes: 28,
};

function renderAnimeDetail() {
  return render(<AnilistDetail />);
}

beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({
    isLoggedIn: true,
    user: { id: 1, displayName: "นักดูอนิเมะตัวอย่าง", role: "member" },
  });
  getAnimeById.mockResolvedValue(anime);
  getAnimeReviews.mockResolvedValue([]);
  getAnimeFavoriteStatus.mockResolvedValue({ count: 0, favorited: false });
});

test("สมาชิกส่งรีวิวอนิเมะแล้วเห็นรีวิวใหม่บนหน้าเรื่อง", async () => {
  const review = {
    id: 55,
    animeId: anime.id,
    memberId: 1,
    rating: 8,
    text: "เนื้อเรื่องอบอุ่นและชวนติดตาม",
    user: { id: 1, name: "นักดูอนิเมะตัวอย่าง" },
  };
  postAnimeReview.mockResolvedValue(review);

  renderAnimeDetail();

  await screen.findByRole("heading", { name: "Frieren: Beyond Journey's End" });
  fireEvent.change(screen.getByLabelText("คะแนน (1–10)"), { target: { value: "8" } });
  fireEvent.change(screen.getByPlaceholderText("แบ่งปันความเห็นเกี่ยวกับอนิเมะเรื่องนี้"), {
    target: { value: review.text },
  });
  fireEvent.click(screen.getByRole("button", { name: "โพสต์รีวิว" }));

  await waitFor(() => {
    expect(postAnimeReview).toHaveBeenCalledWith(anime.id, { rating: "8", text: review.text });
  });
  expect(await screen.findByText(review.text)).toBeInTheDocument();
  expect(screen.getByText("นักดูอนิเมะตัวอย่าง")).toBeInTheDocument();
});

test("แสดงข้อความเมื่อ API บันทึกรีวิวไม่สำเร็จ", async () => {
  postAnimeReview.mockRejectedValue(new Error("บันทึกรีวิวไม่สำเร็จ"));

  renderAnimeDetail();

  await screen.findByRole("heading", { name: "Frieren: Beyond Journey's End" });
  fireEvent.change(screen.getByPlaceholderText("แบ่งปันความเห็นเกี่ยวกับอนิเมะเรื่องนี้"), {
    target: { value: "รีวิวที่ส่งไม่สำเร็จ" },
  });
  fireEvent.click(screen.getByRole("button", { name: "โพสต์รีวิว" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("บันทึกรีวิวไม่สำเร็จ");
});
