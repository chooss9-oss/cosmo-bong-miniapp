import { Home, ShoppingBag, Flame, User } from "lucide-react"

function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-[#111113] border-t border-white/10">
      <div className="flex justify-around items-center py-3">

        <button className="flex flex-col items-center text-[#58BB43]">
          <Home size={24} />
          <span className="text-xs mt-1">
            Главная
          </span>
        </button>

        <button className="flex flex-col items-center text-gray-400">
          <ShoppingBag size={24} />
          <span className="text-xs mt-1">
            Каталог
          </span>
        </button>

        <button className="flex flex-col items-center text-gray-400">
          <Flame size={24} />
          <span className="text-xs mt-1">
            Акции
          </span>
        </button>

        <button className="flex flex-col items-center text-gray-400">
          <User size={24} />
          <span className="text-xs mt-1">
            Профиль
          </span>
        </button>

      </div>
    </nav>
  )
}

export default BottomNav