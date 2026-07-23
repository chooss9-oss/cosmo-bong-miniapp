import { Search } from "lucide-react"

function SearchBar() {
  return (
    <div className="mt-6">

      <div
        className="
          bg-[#111113]
          border
          border-white/10
          rounded-2xl
          h-14
          px-4
          flex
          items-center
          gap-3
          hover:border-[#58BB43]
          transition
          cursor-text
        "
      >

        <Search
          size={20}
          className="text-gray-500"
        />

        <input
          type="text"
          placeholder="Поиск товаров..."
          className="
            flex-1
            bg-transparent
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