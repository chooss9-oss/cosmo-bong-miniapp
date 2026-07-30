import { useEffect, useRef, useState } from "react";

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

  const prevKeyRef = useRef(location.key);

  const [animClass, setAnimClass] = useState("");


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

      let attempts = 0;
      const maxAttempts = 40;

      const interval = setInterval(() => {

        attempts++;

        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;

        if (maxScroll >= saved || attempts >= maxAttempts) {
          window.scrollTo(0, Math.min(saved, maxScroll));
          clearInterval(interval);
        }

      }, 50);

      return () => clearInterval(interval);

    }

    window.scrollTo(0, 0);
    scrollPositions.set(location.key, 0);

  }, [location.key, navigationType]);


  // Определяем класс анимации при смене страницы
  useEffect(() => {

    if (location.key !== prevKeyRef.current) {

      if (location.pathname === "/") {
        setAnimClass("");
      } else {
        setAnimClass(
          navigationType === "POP" ? "page-anim-back" : "page-anim-forward"
        );
      }

      prevKeyRef.current = location.key;

    }

  }, [location, navigationType]);


  return (

    <div key={location.key} className={animClass}>

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

    </div>

  );

}