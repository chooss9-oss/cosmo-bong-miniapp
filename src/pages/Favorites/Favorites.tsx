import { useEffect, useState } from "react";

import ProductCard from "../../components/ProductCard";

import { getProducts, getCachedProducts } from "../../api/storelandApi";

import { useFavorites } from "../../context/FavoritesContext";


type Product = {

  id: string;

  name: string;

  price: number;

  oldPrice?: number;

  discount?: number;

  images?: string[];

  inStock?: boolean;

};


function Favorites() {


  const { favorites } = useFavorites();

  const [products, setProducts] = useState<Product[]>(
    () => getCachedProducts() ?? []
  );

  const [loading, setLoading] = useState(
    () => getCachedProducts() === null
  );


  useEffect(() => {

    async function load() {

      try {

        const data: Product[] = await getProducts();

        setProducts(data);

      } catch (error) {

        console.error("Ошибка загрузки избранного:", error);

      } finally {

        setLoading(false);

      }

    }

    load();

  }, []);


  const favoriteProducts = products.filter(
    product => favorites.includes(product.id)
  );


  return (

    <div className="min-h-screen bg-[#080808] text-white pt-[57px] px-5 pb-24">

      <h1 className="text-3xl font-bold mt-4">
        ❤️ Избранное
      </h1>

      <p className="mt-3 text-gray-400">
        Товары, которые вы отложили
      </p>

      {loading && (
        <div className="text-gray-400 mt-10">
          Загружаем избранное...
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3">

        {favoriteProducts.map(product => (
          <ProductCard key={product.id} product={product} />
        ))}

      </div>

      {!loading && favoriteProducts.length === 0 && (
        <div className="text-gray-400 text-center mt-10">
          Пока пусто — нажмите на 🤍 на карточке товара, чтобы добавить сюда
        </div>
      )}

    </div>

  );

}


export default Favorites;
