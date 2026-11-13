import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext';
import ProtectRoute from '../routes/ProtectedRoute';

// Isolate the route guard from react-router-dom's DOM entry point, which CRA's
// Jest resolver cannot load for the installed React Router version.
jest.mock('react-router-dom', () => {
  const React = require('react');
  let currentPath = '/';
  return {
    MemoryRouter: ({ children, initialEntries }) => {
      currentPath = initialEntries?.[0] || '/';
      return children;
    },
    Routes: ({ children }) => {
      const route = React.Children.toArray(children).find((child) => child.props.path === currentPath);
      return route?.props.element || null;
    },
    Route: () => null,
    Navigate: ({ to }) => React.createElement('div', { 'data-testid': 'redirect' }, to),
    useLocation: () => ({ pathname: currentPath, search: '' }),
  };
});

// หน้าปลอม 2 หน้า พอให้รู้ว่าตอนนี้อยู่หน้าไหน
function Secret() { return <h1>หน้าลับ</h1>; }
function LoginPage() { return <h1>หน้า Login</h1>; }

// วาดแอปจิ๋วที่ใช้ route เดียวกับหน้า watchlist ในแอป
function renderAt(path) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/watchlist" element={<ProtectRoute><Secret /></ProtectRoute>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}

beforeEach(() => localStorage.clear());   // AuthProvider อ่าน token จาก localStorage ตอนเริ่ม ต้องล้างให้สะอาดทุกเทสต์

test('ยังไม่ login ต้องถูกพาไปหน้า Login', () => {
  renderAt('/watchlist');

  expect(screen.getByTestId('redirect')).toHaveTextContent('/login');
  expect(screen.queryByText('หน้าลับ')).not.toBeInTheDocument();
});

test('มี token ใน localStorage แล้ว ต้องเห็นหน้าที่ต้อง login', () => {
  localStorage.setItem('anilist.token', 'mock-token-1');
  localStorage.setItem('anilist.user', JSON.stringify({ id: 1, displayName: 'นักดูอนิเมะตัวอย่าง' }));

  renderAt('/watchlist');

  expect(screen.getByRole('heading', { name: 'หน้าลับ' })).toBeInTheDocument();
});
