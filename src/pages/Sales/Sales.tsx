// src/pages/Sales/Sales.tsx



import { useEffect, useState, useRef } from "react";

import ProductCard from "../../components/ProductCard";

import { getProducts, getCachedProducts } from "../../api/storelandApi";

import { readStoredFilter, writeStoredFilter } from "../../utils/filterStorage";


type Product = {

  id: string;

  name: string;

  price: number;

  oldPrice?: number;

  discount?: number;

  images?: string[];

  description?: string;

  inStock?:boolean;

};


function computeCachedSaleProducts(): Product[] {

  const cached = getCachedProducts();

  if (!cached) return [];

  return cached.filter(
    (product: Product) =>
      product.oldPrice &&
      product.oldPrice > product.price &&
      product.inStock !== false
  );

}


function Sales() {


  const [products, setProducts] = useState<Product[]>(
    () => computeCachedSaleProducts()
  );

  const [loading, setLoading] = useState(
    () => getCachedProducts() === null
  );

  const [sortBy, setSortBy] = useState<"none" | "price_asc" | "price_desc">(
    () => readStoredFilter("salesFilters:sortBy", "none" as "none" | "price_asc" | "price_desc")
  );

  useEffect(() => {
    writeStoredFilter("salesFilters:sortBy", sortBy);
  }, [sortBy]);

const isFirstFilterRender = useRef(true);

useEffect(() => {

  if (isFirstFilterRender.current) {
    isFirstFilterRender.current = false;
    return;
  }

  window.scrollTo(0, 0);

}, [sortBy]);

  useEffect(() => {

  async function loadSale() {

      try {

        const data: Product[] = await getProducts();

        const saleProducts = data.filter(
  (product) =>
    product.oldPrice &&
    product.oldPrice > product.price &&
    product.inStock !== false
);

        setProducts(saleProducts);

      } catch (error) {

        console.error("Ошибка загрузки акций:", error);

      } finally {

        setLoading(false);

      }

    }

    loadSale();

  }, []);


  let displayedProducts = products;

  if(sortBy === "price_asc"){

    displayedProducts = [...displayedProducts].sort((a, b) => a.price - b.price);

  }
  else if(sortBy === "price_desc"){

    displayedProducts = [...displayedProducts].sort((a, b) => b.price - a.price);

  }


  return (

    <div className="min-h-screen bg-[#080808] text-white pt-[57px] px-5 pb-24">

      

      <div className="sticky top-[57px] z-20 bg-[#080808] flex gap-2 py-2 mt-4 flex-wrap">

        <button

          onClick={() => setSortBy(sortBy === "price_asc" ? "none" : "price_asc")}

          className={`
          flex-shrink-0
          px-3
          py-1.5
          rounded-full
          border
          text-xs
          font-semibold
          transition
          ${
            sortBy === "price_asc"
            ? "bg-[#58BB43] border-[#58BB43] text-black"
            : "bg-[#151515] border-white/10 text-gray-300"
          }
          `}

        >

          Цена ↑

        </button>

        <button

          onClick={() => setSortBy(sortBy === "price_desc" ? "none" : "price_desc")}

          className={`
          flex-shrink-0
          px-3
          py-1.5
          rounded-full
          border
          text-xs
          font-semibold
          transition
          ${
            sortBy === "price_desc"
            ? "bg-[#58BB43] border-[#58BB43] text-black"
            : "bg-[#151515] border-white/10 text-gray-300"
          }
          `}

        >

          Цена ↓

        </button>

      </div>

<h1 className="text-3xl font-bold">
  🔥 Акции Cosmo Bong
</h1>

<p className="mt-3 text-gray-400">
  Специальные предложения и скидки
</p>

      {loading && (
        <div className="text-gray-400 mt-10">
          Загружаем акции...
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">

        {displayedProducts.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}

      </div>

      {!loading && displayedProducts.length === 0 && (
        <div className="text-gray-400 text-center mt-10">
          Сейчас нет акционных товаров
        </div>
      )}

    </div>

  );

}


export default Sales;