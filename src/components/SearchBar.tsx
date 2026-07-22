import { Search } from "lucide-react"

function SearchBar() {
  return (
    <div className="mt-6">

      <div
        className="
          flex
          items-center
          gap-3
          bg-[#111113]
          rounded-2xl
          px-4
          py-4
          border
          border-white/5
          focus-within:border-[#58BB43]
          transition
        "
      >

        <Search size={20} className="text-gray-500" />

        <input
          type="text"
          placeholder="Поиск товаров..."
          className="
            bg-transparent
            w-full
            outline-none
            text-white
            placeholder:text-gray-500
          "
        />

      </div>

    </div>
  )
}

export default SearchBar