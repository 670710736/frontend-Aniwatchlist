import { render, screen } from '@testing-library/react';
import App from './App';

jest.mock('react-router-dom', () => ({
  BrowserRouter: ({ children }) => children,
  Routes: () => null,
  Route: () => null,
}));

jest.mock('./components/Navbar', () => () => <nav>Aniwatchlist navigation</nav>);
jest.mock('./components/Footer', () => () => <footer>Aniwatchlist footer</footer>);

test('renders the application shell', () => {
  render(<App />);
  expect(screen.getByText('Aniwatchlist navigation')).toBeInTheDocument();
  expect(screen.getByText('Aniwatchlist footer')).toBeInTheDocument();
});
