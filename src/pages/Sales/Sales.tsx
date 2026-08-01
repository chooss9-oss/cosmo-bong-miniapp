// src/pages/Sales/Sales.tsx



import { useEffect, useState, useRef } from "react";

import { useNavigate } from "react-router-dom";

import ProductCard from "../../components/ProductCard";

import {
  getProducts,
  getCategories,
  getCachedProducts,
  getCachedCategories
} from "../../api/storelandApi";

import { readStoredFilter, writeStoredFilter } from "../../utils/filterStorage";


type Category = {

  "#text": string;

  "@_id": string;

  "@_parentId"?: string;

};


const mainCategoryNames = [

  "Бонги и Водники",
  "Запчасти и Тюнинг",
  "Сувенирные трубки",
  "Гриндеры и Прессы",
  "Для самокруток",
  "Аксессуары",
  "Аксессуары для Wax",
  "КБД (cbd) / Мицелий",
  "Гроу",
  "Чайная Лавка",
  "Благовония",
  "Мерч Космо Бонг",
  "Напасы"

];


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


  const navigate = useNavigate();


  const [products, setProducts] = useState<Product[]>(
    () => computeCachedSaleProducts()
  );

  const [categories, setCategories] = useState<Category[]>(
    () => (getCachedCategories() ?? []).filter(
      (cat: Category) => mainCategoryNames.includes(cat["#text"])
    )
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

        const [data, categoriesData]: [Product[], Category[]] = await Promise.all([
          getProducts(),
          getCategories()
        ]);

        const saleProducts = data.filter(
  (product) =>
    product.oldPrice &&
    product.oldPrice > product.price &&
    product.inStock !== false
);

        setProducts(saleProducts);

        setCategories(
          categoriesData.filter(
            (cat: Category) => mainCategoryNames.includes(cat["#text"])
          )
        );

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

      {/* ЛИПКИЕ КАТЕГОРИИ */}

      <div className="sticky top-[57px] z-30 bg-[#080808] py-1">

        <div className="flex gap-2 overflow-x-auto scrollbar-hide">

          {categories.map(cat => (

            <button

              key={cat["@_id"]}

              onClick={() => navigate(`/category/${cat["@_id"]}`)}

              className="
              flex-shrink-0
              px-3
              py-1.5
              rounded-full
              bg-[#151515]
              border
              border-[#58BB43]
              text-xs
              font-semibold
              text-gray-300
              transition
              "

            >

              {cat["#text"]}

            </button>

          ))}

        </div>

      </div>

      <div className="sticky top-[94px] z-20 bg-[#080808] flex gap-2 py-2 mt-1 flex-wrap">

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

<h1 className="text-3xl font-bold flex items-center gap-2">
  <img src="/nav-icons/promotions.png" alt="" className="w-8 h-8 object-contain" />
  Акции Cosmo Bong
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