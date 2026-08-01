function PromoBanner() {
  return (
    <section className="mt-6">

      <div
        className="
          rounded-3xl
          p-6
          bg-gradient-to-r
          from-[#58BB43]
          via-[#79C84F]
          to-[#FFBA00]
          text-black
          shadow-lg
        "
      >

        <div className="flex items-center justify-between">

          <div>

            <p className="text-sm font-semibold uppercase tracking-wide">
              ГОРЯЧИЕ ПРЕДЛОЖЕНИЯ
            </p>

            <h2 className="text-3xl font-extrabold mt-2 flex items-center gap-2">
              <img src="/nav-icons/promotions.png" alt="" className="w-8 h-8 object-contain" />
              СКИДКИ
            </h2>

            <p className="mt-3 text-sm">
              Постоянные обновления акционных товаров
            </p>

            <button
              className="
                mt-5
                bg-black
                text-white
                px-6
                py-3
                rounded-full
                font-semibold
                hover:bg-[#1f1f1f]
                transition
              "
            >
              Смотреть все товары со скидкой
            </button>

          </div>

          <div className="text-6xl">
            🚀
          </div>

        </div>

      </div>

    </section>
  )
}

export default PromoBanner