import { BrowserRouter } from "react-router-dom";
import AnimatedRoutes from "./AnimatedRoutes";


import Header from "./components/Header";
import BottomNav from "./components/BottomNav";
import SwipeBack from "./components/SwipeBack";














import { CartProvider } from "./context/CartContext";

if ("scrollRestoration" in window.history) {
  window.history.scrollRestoration = "manual";
}

function App() {

  return (

    <BrowserRouter>

      <CartProvider>

        <SwipeBack />

        <div className="min-h-screen bg-[#09090B] text-white pb-20">

          <Header />

          <main>

  <AnimatedRoutes />

</main>

          <BottomNav />

        </div>

      </CartProvider>

    </BrowserRouter>

  );

}


export default App;