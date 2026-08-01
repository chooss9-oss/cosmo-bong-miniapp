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
import Favorites from "./pages/Favorites/Favorites";
import CategoryPage from "./pages/Category/CategoryPage";
import ProductPage from "./pages/Product/ProductPage";
import Cart from "./pages/Cart/Cart";
import Checkout from "./pages/Checkout/Checkout";
import Success from "./pages/Success/Success";


// Запомненные позиции скролла для каждой записи в истории (по location.key).
// Дублируем в sessionStorage: на тяжёлых страницах (весь каталог разом)
// WebView Telegram иногда перезагружает страницу при возврате назад —
// обычный JS Map при этом теряется, а sessionStorage переживает перезагрузку.
const scrollPositions = new Map<string, number>();

const STORAGE_PREFIX = "scrollPos:";

function readStoredScroll(key: string): number | undefined {
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + key);
    return raw !== null ? Number(raw) : undefined;
  } catch {
    return undefined;
  }
}

function writeStoredScroll(key: string, y: number) {
  try {
    sessionStorage.setItem(STORAGE_PREFIX + key, String(y));
  } catch {
    // sessionStorage недоступен — тихо игнорируем
  }
}


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
      writeStoredScroll(key, window.scrollY);
    }

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => window.removeEventListener("scroll", handleScroll);

  }, [location.key]);


  // Восстанавливаем скролл при переходе назад, сбрасываем при переходе вперёд
  useEffect(() => {

    if (navigationType === "POP") {

      const saved =
        scrollPositions.get(location.key) ??
        readStoredScroll(location.key) ??
        0;

      if (saved <= 0) {
        window.scrollTo(0, 0);
        return;
      }

      // Не ждём один раз "достаточной высоты", а на каждом кадре подтягиваем
      // скролл к нужной позиции, пока страница дорисовывается (карточки,
      // картинки). Так работает даже если каталог грузится дольше 1-2 сек.
      let rafId: number;
      let stableFrames = 0;
      const start = Date.now();
      const maxDuration = 5000;

      function tick() {

        const maxScroll = Math.max(
          document.documentElement.scrollHeight - window.innerHeight,
          0
        );

        const target = Math.min(saved, maxScroll);

        window.scrollTo(0, target);

        const reachedFullTarget =
          maxScroll >= saved - 2 && Math.abs(window.scrollY - target) < 2;

        stableFrames = reachedFullTarget ? stableFrames + 1 : 0;

        const timeUp = Date.now() - start > maxDuration;

        if ((stableFrames > 8) || timeUp) {
          return;
        }

        rafId = requestAnimationFrame(tick);

      }

      rafId = requestAnimationFrame(tick);

      return () => cancelAnimationFrame(rafId);

    }

    window.scrollTo(0, 0);
    scrollPositions.set(location.key, 0);
    writeStoredScroll(location.key, 0);

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

        <Route path="/favorites" element={<Favorites />} />

        <Route path="/category/:categoryId" element={<CategoryPage />} />

        <Route path="/product/:productId" element={<ProductPage />} />

        <Route path="/cart" element={<Cart />} />

        <Route path="/checkout" element={<Checkout />} />

      </Routes>

    </div>

  );

}