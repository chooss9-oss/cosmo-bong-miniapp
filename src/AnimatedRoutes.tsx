import { useEffect, useRef, useState } from "react";

import {
  Routes,
  Route,
  useLocation,
  useNavigationType,
  type Location
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


function AppRoutes({ location }: { location: Location }) {

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


const ANIM_DURATION = 300;

// Запомненные позиции скролла для каждой записи в истории (по location.key)
const scrollPositions = new Map<string, number>();


export default function AnimatedRoutes() {

  const location = useLocation();
  const navigationType = useNavigationType();

  const prevLocationRef = useRef<Location>(location);

  const [transitionState, setTransitionState] = useState<{
    prevLocation: Location;
    direction: "forward" | "back";
  } | null>(null);


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

      window.scrollTo(0, saved);

      const retry = setTimeout(() => {
        window.scrollTo(0, saved);
      }, 150);

      return () => clearTimeout(retry);

    }

    window.scrollTo(0, 0);
    scrollPositions.set(location.key, 0);

  }, [location.key, navigationType]);


  useEffect(() => {

    if (location.pathname === "/") {

      prevLocationRef.current = location;
      setTransitionState(null);
      return;

    }

    if (location.key !== prevLocationRef.current.key) {

      const direction = navigationType === "POP" ? "back" : "forward";

      setTransitionState({
        prevLocation: prevLocationRef.current,
        direction
      });

      prevLocationRef.current = location;

      const timer = setTimeout(() => {
        setTransitionState(null);
      }, ANIM_DURATION);

      return () => clearTimeout(timer);

    }

  }, [location, navigationType]);


  if (!transitionState) {

    return (
      <div style={{ position: "relative" }}>
        <AppRoutes location={location} />
      </div>
    );

  }

  const { prevLocation, direction } = transitionState;

  const movingLocation = direction === "forward" ? location : prevLocation;
  const staticLocation = direction === "forward" ? prevLocation : location;

  const animationName = direction === "forward" ? "slideInRight" : "slideOutRight";

  return (

    <div style={{ position: "relative", overflowX: "hidden" }}>

      <div style={{ position: "relative", zIndex: 1 }}>
        <AppRoutes location={staticLocation} />
      </div>

      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          animation: `${animationName} ${ANIM_DURATION}ms ease-out forwards`
        }}
      >
        <AppRoutes location={movingLocation} />
      </div>

    </div>

  );

}