import { useNavigate } from "react-router-dom"


type Category = {
  name: string
}

type CategoryScrollProps = {
  categories: Category[]
  activeCategory?: string
}


function CategoryScroll({ categories, activeCategory }: CategoryScrollProps) {

  const navigate = useNavigate()

  return (

    <div
      className="
        flex
        gap-2
        overflow-x-auto
        px-4
        py-3
        [&::-webkit-scrollbar]:hidden
        [-ms-overflow-style:none]
        [scrollbar-width:none]
      "
    >

      {categories.map((cat) => (

        <button
          key={cat.name}
          onClick={() => navigate(`/category/${cat.name}`)}
          className={`
            flex-shrink-0
            whitespace-nowrap
            rounded-full
            px-4
            py-2
            text-sm
            font-bold
            border
            transition
            cursor-pointer
            ${
              activeCategory === cat.name
                ? "bg-[#58BB43] border-[#58BB43] text-black"
                : "bg-[#111113] border-white/5 text-white hover:border-[#58BB43]"
            }
          `}
        >
          {cat.name}
        </button>

      ))}

    </div>

  )

}


export default CategoryScroll