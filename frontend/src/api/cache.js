// จำผลลัพธ์ไว้ในเครื่อง (localStorage) วันละครั้ง
// จะได้ไม่ยิง API ทุกครั้งที่เปิดหน้า
// localStorage เก็บได้แค่ข้อความ จึงต้องแปลง object เป็น JSON ตอนเก็บ
// และแปลงกลับตอนอ่าน

function today() {
  return new Date().toISOString().slice(0, 10);
}

// ถ้าในกล่องมีของที่เก็บไว้วันนี้ ให้คืนของนั้นทันที
// ถ้าไม่มีหรือข้อมูลเสีย จะโหลดข้อมูลจริงแล้วเก็บไว้ใช้ครั้งถัดไป
export async function onceADay(key, fetcher) {
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (saved && saved.date === today()) {
      return saved.items;
    }
  } catch {
    // อ่านไม่ได้หรือข้อมูลเสีย ให้โหลดข้อมูลใหม่ด้านล่าง
  }

  const items = await fetcher();
  localStorage.setItem(key, JSON.stringify({ date: today(), items }));
  return items;
}

// ลบ cache ในกล่องทิ้ง ครั้งหน้าจะโหลดข้อมูลใหม่
export function forget(key) {
  localStorage.removeItem(key);
}
