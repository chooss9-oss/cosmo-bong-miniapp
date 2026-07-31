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


// Запомненные позиции скролла для каждой записи в истории (по location.key)
const scrollPositions = new Map<string, number>();


export default function AnimatedRoutes() {

  const location = useLocation();
  const navigationType = useNavigationType();


  // Сохраняем позицию скролла для текущей страницы, пока пользователь на ней
  useEffect(() => {

    const key = location.key;

    function handleScroll() {
      scrollPositions.set(key, window.scrollY);
    }

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => window.removeEventListener("scroll", handleScroll);

  }, [location.key]);


  // Восстанавливаем скролл при переходе назад, сбрасываем при переходе вперёд
  useEffect(() => {

    if (navigationType === "POP") {

      const saved = scrollPositions.get(location.key) ?? 0;

      let cancelled = false;
      let lastHeight = -1;
      let stableFrames = 0;
      const startTime = Date.now();
      const maxWait = 4000;

      function reassert() {

        if (cancelled) return;

        const currentHeight = document.documentElement.scrollHeight;

        if (currentHeight === lastHeight) {
          stableFrames++;
        } else {
          stableFrames = 0;
          lastHeight = currentHeight;
        }

        window.scrollTo(0, saved);

        const timedOut = Date.now() - startTime >= maxWait;
        const isStable = stableFrames >= 10;

        if (!(timedOut || isStable)) {
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

  );

}