import SearchBar from "../../components/SearchBar"
import PromoBanner from "../../components/PromoBanner"
import ProductCard from "../../components/ProductCard"

import categories from "../../data/categories"
import products from "../../data/products"

function Home() {
  return (
    <div className="px-5">

      <SearchBar />

      <PromoBanner />

      {/* Категории */}
      <section className="mt-8">

        <h2 className="text-2xl font-bold">
          Категории
        </h2>

        <div className="mt-4 space-y-3">

          {categories.map((category) => (

            <div
              key={category.name}
              className="
                bg-[#111113]
                rounded-2xl
                px-5
                py-4
                flex
                justify-between
                items-center
                border
                border-white/5
                hover:border-[#58BB43]
                hover:bg-[#151518]
                transition-all
                duration-200
                cursor-pointer
              "
            >

              <span className="font-medium">
                {category.name}
              </span>

              {category.count && (
                <span className="text-gray-400">
                  {category.count}
                </span>
              )}

            </div>

          ))}

        </div>

      </section>

      {/* Хиты продаж */}
      <section className="mt-10 pb-10">

        <div className="flex items-center justify-between">

          <h2 className="text-2xl font-bold">
            ⭐ Хиты продаж
          </h2>

          <button className="text-[#58BB43] font-semibold">
            Все →
          </button>

        </div>

        <div className="grid grid-cols-2 gap-4 mt-5">

          {products.map((product) => (

            <ProductCard
              key={product.id}
              name={product.name}
              price={product.price}
              image={product.image}
            />

          ))}

        </div>

      </section>

    </div>
  )
}

export default Home