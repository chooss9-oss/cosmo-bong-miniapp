function PromoBanner() {
  return (
    <section className="mt-6">

      <div
        className="
          rounded-3xl
          p-6
          bg-gradient-to-r
          from-[#58BB43]
          via-[#8EDB57]
          to-[#FFBA00]
          text-black
        "
      >

        <div className="text-sm font-semibold uppercase">
          COSMO BONG
        </div>

        <h2 className="text-3xl font-black mt-2">
          🔥 Летняя распродажа
        </h2>

        <p className="mt-3 text-black/80">
          Скидки до 50% на популярные товары.
        </p>

        <button
          className="
            mt-6
            bg-black
            text-white
            px-6
            py-3
            rounded-full
            font-bold
          "
        >
          Смотреть товары
        </button>

      </div>

    </section>
  )
}

export default PromoBanner