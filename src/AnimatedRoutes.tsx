import { useEffect } from "react";

import {
  Routes,
  Route,
  useLocation,
  useNavigationType
} from "react-router-dom";

import Home from "./pages/Home/Home";
import Catalog from "./pages/Catalog/Catalog";
import Sales from "./pages/Sales/Sales";
import Profile from "./pages/Profile/Profile";
import CategoryPage from "./pages/Category/CategoryPage";
import ProductPage from "./pages/Product/ProductPage";
import Cart from "./pages/Cart/Cart";
import Checkout from "./pages/Checkout/Checkout";
import Success from "./pages/Success/Success";


const scrollPositions = new Map<string, number>();


export default function AnimatedRoutes() {

  const location = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    const key = location.key;
    return () => {
      console.log("SAVE", key, "scrollY=", window.scrollY);
      scrollPositions.set(key, window.scrollY);
    };
  }, [location.key]);

  useEffect(() => {
    if (navigationType === "POP") {
      const saved = scrollPositions.get(location.key) ?? 0;
      let cancelled = false;
      const startTime = Date.now();
      const maxWait = 4000;
      function reassert() {
        if (cancelled) return;
        window.scrollTo(0, saved);
        const reached = Math.abs(window.scrollY - saved) < 2;
        const timedOut = Date.now() - startTime >= maxWait;
        if (!reached && !timedOut) {
          requestAnimationFrame(reassert);
        }
      }
      requestAnimationFrame(reassert);
      return () => { cancelled = true; };
    }
    window.scrollTo(0, 0);
    scrollPositions.set(location.key, 0);
  }, [location.key, navigationType]);

  return (
    <>
      <div
        style={{
          position: "fixed",
          bottom: 90,
          left: 10,
          zIndex: 9999,
          background: "black",
          color: "lime",
          fontSize: 10,
          padding: 6,
          borderRadius: 8,
          maxWidth: "95vw",
          wordBreak: "break-all"
        }}
      >
        type: {navigationType} | key: {location.key} | saved: {scrollPositions.get(location.key) ?? "нет"}
      </div>

      <Routes location={location}>
        <Route path="/" element={<Home />} />
        <Route path="/catalog" element={<Catalog />} />
        <Route path="/success" element={<Success />} />
        <Route path="/sales" element={<Sales />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/category/:categoryId" element={<CategoryPage />} />
        <Route path="/product/:productId" element={<ProductPage />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/checkout" element={<Checkout />} />
      </Routes>
    </>
  );
}