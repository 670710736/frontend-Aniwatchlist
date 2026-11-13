import mockRequest from "../mock/server";

jest.mock("../mock/server", () => jest.fn());

// backend.js reads this flag when the module is loaded. Tests exercise its
// mock-server adapter regardless of the developer's local .env settings.
process.env.REACT_APP_USE_MOCK = "true";
const { request, setToken } = require("./backend");

beforeEach(() => {
  mockRequest.mockReset();
  setToken(null);
  mockRequest.mockResolvedValue({
    ok: true,
    status: 200,
    data: { items: [{ id: 1 }] },
  });
});

test("GET ส่ง path และคืนข้อมูลจาก mock server", async () => {
  const result = await request("/api/movies");

  expect(result).toEqual({ items: [{ id: 1 }] });
  expect(mockRequest).toHaveBeenCalledWith(expect.stringMatching(/\/api\/movies$/), {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: undefined,
  });
});

test("POST แปลง body เป็น JSON และกำหนด Content-Type", async () => {
  await request("/api/reviews", {
    method: "POST",
    body: { animeId: 12, rating: 5 },
  });

  expect(mockRequest).toHaveBeenCalledWith(expect.stringMatching(/\/api\/reviews$/), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    signal: undefined,
    body: JSON.stringify({ animeId: 12, rating: 5 }),
  });
});

test("เมื่อ API ตอบ error จะ throw ApiError พร้อม status และ code", async () => {
  mockRequest.mockResolvedValueOnce({
    ok: false,
    status: 400,
    data: { error: { code: "VALIDATION_ERROR", message: "ข้อมูลไม่ถูกต้อง" } },
  });

  await expect(request("/api/reviews", { method: "POST", body: {} })).rejects.toMatchObject({
    name: "ApiError",
    status: 400,
    code: "VALIDATION_ERROR",
    message: "ข้อมูลไม่ถูกต้อง",
  });
});

test("204 คืน null", async () => {
  mockRequest.mockResolvedValueOnce({ ok: true, status: 204, data: null });

  await expect(request("/api/favorites/1", { method: "DELETE" })).resolves.toBeNull();
});
