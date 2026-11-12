import { Link } from "react-router-dom";
function NotFound() {
  return (
   <div className="px-4 py-24 text-center bg-gray-900">
      <p className="text-5xl font-semibold text-slate-300 ">404</p>
      <p className="mt-2 text-slate-300">ไม่พบหน้าที่คุณกำลังหา</p>
      <Link to="/Home" className="mt-4 inline-block text-sm text-slate-300 hover:underline">กลับหน้าแรก</Link>
    </div>
  );
}

export default NotFound;
