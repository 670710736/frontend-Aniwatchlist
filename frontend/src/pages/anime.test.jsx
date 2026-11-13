import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Anime from "./Anime";
import { getMovies } from "../api/anilist";
import { forget } from "../api/cache";

jest.mock("react-router-dom", () => {
  const React = require("react");
  return {
    Link: ({ to, children, ...props }) => React.createElement("a", { href: to, ...props }, children),
  };
});
jest.mock("../api/anilist", () => ({
  CACHE_KEY: "anilist.anime",
  getMovies: jest.fn(),
}));
jest.mock("../api/cache", () => ({ forget: jest.fn() }));

const FAKE_ANIME = [
  {
    id: 16498,
    title: { english: "Attack on Titan", native: "ผ่าพิภพไททัน" },
    genres: ["Action", "Drama"],
    averageScore: 91,
  },
  {
    id: 113415,
    title: { english: "Jujutsu Kaisen", native: "มหาเวทย์ผนึกมาร" },
    genres: ["Action", "Supernatural"],
    averageScore: 87,
  },
  {
    id: 21087,
    title: { english: "One Punch Man", native: "เทพบุตรหมัดเดียวจอด" },
    genres: ["Action", "Comedy"],
    averageScore: 85,
  },
];

beforeEach(() => {
  jest.clearAllMocks();
});

test("โหลดสำเร็จ แสดงอนิเมะและปุ่มแนวจากข้อมูล", async () => {
  getMovies.mockResolvedValue(FAKE_ANIME);
  render(<Anime />);

  expect(await screen.findByText("Attack on Titan")).toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: /Attack on Titan|Jujutsu Kaisen|One Punch Man/ })).toHaveLength(3);
  expect(screen.getByRole("button", { name: "Action" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Drama" })).toBeInTheDocument();
});

test("พิมพ์ค้นหาแล้วกรองรายการในเครื่องโดยไม่เรียก API ซ้ำ", async () => {
  getMovies.mockResolvedValue(FAKE_ANIME);
  render(<Anime />);
  await screen.findByText("Attack on Titan");

  await userEvent.type(screen.getByPlaceholderText("พิมพ์ชื่ออนิเมะเพื่อกรอง..."), "jujutsu");

  expect(screen.getAllByRole("link", { name: /Attack on Titan|Jujutsu Kaisen|One Punch Man/ })).toHaveLength(1);
  expect(screen.getByText("Jujutsu Kaisen")).toBeInTheDocument();
  expect(getMovies).toHaveBeenCalledTimes(1);
});

test("เมื่อโหลดไม่สำเร็จ แสดง error และปุ่มลองใหม่โหลดข้อมูลอีกครั้ง", async () => {
  getMovies
    .mockRejectedValueOnce(new Error("เชื่อมต่อ AniList ไม่สำเร็จ"))
    .mockResolvedValueOnce(FAKE_ANIME);
  render(<Anime />);

  expect(await screen.findByText("โหลดข้อมูลอนิเมะไม่สำเร็จ")).toBeInTheDocument();
  expect(screen.getByText("เชื่อมต่อ AniList ไม่สำเร็จ")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "ลองใหม่" }));

  expect(await screen.findByText("Attack on Titan")).toBeInTheDocument();
  await waitFor(() => expect(getMovies).toHaveBeenCalledTimes(2));
  expect(forget).toHaveBeenCalledWith("anilist.anime.100");
});
