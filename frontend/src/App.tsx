import { Route, Routes } from 'react-router-dom';
import { RequireAuth } from './components/auth/RequireAuth';
import { RequireSeller } from './components/auth/RequireSeller';
import { Layout } from './components/layout/Layout';
import { AuthPage } from './pages/AuthPage';
import { CartPage } from './pages/CartPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { HomePage } from './pages/HomePage';
import { NewValidationPage } from './pages/NewValidationPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { OrderConfirmationPage } from './pages/OrderConfirmationPage';
import { OrdersPage } from './pages/OrdersPage';
import { ProductPage } from './pages/ProductPage';
import { SearchPage } from './pages/SearchPage';
import { SellerHubPage } from './pages/SellerHubPage';
import { SellPage } from './pages/SellPage';
import { ValidationPage } from './pages/ValidationPage';
import { ValidationResultsPage } from './pages/ValidationResultsPage';

export function App() {
  return (
    <Routes>
      {/* Auth screens render without the marketplace chrome */}
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />

      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="products/:id" element={<ProductPage />} />
        <Route path="coming-soon" element={<ComingSoonPage />} />
        <Route path="coming-soon/:id" element={<ValidationPage />} />
        {/* Selling: /sell explains it and opens a store; the hub and its pages are for store owners (the API enforces ownership). */}
        <Route path="sell" element={<SellPage />} />
        <Route path="seller" element={<RequireSeller><SellerHubPage /></RequireSeller>} />
        <Route path="seller/validations/new" element={<RequireSeller><NewValidationPage /></RequireSeller>} />
        <Route path="seller/validations/:id" element={<RequireSeller><ValidationResultsPage /></RequireSeller>} />
        {/* The buying flow needs an account; signed-out visitors are sent to sign in and then returned here. */}
        <Route path="cart" element={<RequireAuth><CartPage /></RequireAuth>} />
        <Route path="checkout" element={<RequireAuth><CheckoutPage /></RequireAuth>} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="orders/:orderNumber/confirmation" element={<RequireAuth><OrderConfirmationPage /></RequireAuth>} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
