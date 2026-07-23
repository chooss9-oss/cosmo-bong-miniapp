import {
  Home,
  Grid2X2,
  Flame,
  User
} from "lucide-react"

import { useLocation, useNavigate } from "react-router-dom"


function BottomNav() {

  const navigate = useNavigate()
  const location = useLocation()



  const items = [
    {
      title: "Главная",
      icon: Home,
      path: "/",
    },
    {
      title: "Каталог",
      icon: Grid2X2,
      path: "/catalog",
    },
    {
      title: "Акции",
      icon: Flame,
      path: "/sales",
    },
    {
      title: "Профиль",
      icon: User,
      path: "/profile",
    },
  ]



  return (

    <div
      className="
        fixed
        bottom-0
        left-0
        right-0
        h-20
        bg-[#09090B]/95
        backdrop-blur
        border-t
        border-white/10
        flex
        items-center
        justify-around
        px-4
        z-50
      "
    >


      {items.map((item) => {

        const Icon = item.icon

        const active = location.pathname === item.path


        return (

          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className={`
              flex
              flex-col
              items-center
              gap-1
              transition
              ${
                active
                ? "text-[#58BB43]"
                : "text-gray-400"
              }
            `}
          >

            <Icon size={24} />


            <span className="text-xs">
              {item.title}
            </span>


          </button>

        )

      })}


    </div>

  )
}


export default BottomNav