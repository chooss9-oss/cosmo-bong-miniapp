import { BrowserRouter, Routes, Route } from "react-router-dom";


import Header from "./components/Header";
import BottomNav from "./components/BottomNav";
import SwipeBack from "./components/SwipeBack";


import Home from "./pages/Home/Home";
import Catalog from "./pages/Catalog/Catalog";
import Sales from "./pages/Sales/Sales";
import Profile from "./pages/Profile/Profile";


import CategoryPage from "./pages/Category/CategoryPage";
import ProductPage from "./pages/Product/ProductPage";
import Cart from "./pages/Cart/Cart";
import Checkout from "./pages/Checkout/Checkout";
import Success from "./pages/Success/Success";

import { CartProvider } from "./context/CartContext";





function App() {


  return (

    <BrowserRouter>


      <CartProvider>


        <SwipeBack />


        <div

          className="