import { useNavigate } from "react-router-dom"

import { useCart } from "../context/CartContext"



function Header() {


  const navigate = useNavigate()



  const { cart } = useCart()





  const cartCount = cart.reduce(

    (sum, item) =>

      sum + item.quantity,

    0

  )






  return (

    <header

      className="
        sticky
        top-0
        z-50
        bg-[#09090B]/90
        backdrop-blur
        border-b
        border-white/5
        px-5
        py-4
        flex
        items-center
        justify-between
      "

    >




      <div

        onClick={() => navigate("/")}

        className="
          cursor-pointer
          font-bold
          text-xl
        "

      >

        Cosmo Bong


      </div>







      <button

        type="button"

        onClick={() => navigate("/cart")}

        className="
          relative
          cursor-pointer
          text-2xl
        "

      >

        🛒





        {cartCount > 0 && (


          <span

            className="
              absolute
              -top-2
              -right-3
              bg-[#58BB43]
              text-black
              text-xs
              font-bold
              rounded-full
              min-w-[20px]
              h-[20px]
              flex
              items-center
              justify-center
              px-1
            "

          >

            {cartCount}


          </span>


        )}




      </button>





    </header>

  )

}



export default Header