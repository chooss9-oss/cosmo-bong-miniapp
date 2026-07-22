type ProductCardProps = {
  name: string
  price: string
  image: string
}

function ProductCard({ name, price, image }: ProductCardProps) {
  return (
    <div className="bg-[#111113] rounded-3xl overflow-hidden border border-white/5">

      <div className="h-56 bg-white/5 flex items-center justify-center rounded-t-3xl overflow-hidden">
  <img
    src={image}
    alt={name}
    className="w-full h-full object-contain p-4"
  />
</div>

      <div className="p-4">

        <h3 className="font-bold text-lg">
          {name}
        </h3>

        <p className="mt-2 text-[#58BB43] font-bold">
          {price}
        </p>

        <button className="mt-4 w-full bg-[#FFBA00] text-black rounded-full py-3 font-bold">
          В корзину
        </button>

      </div>

    </div>
  )
}

export default ProductCard