import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { getProduct } from "../api/storelandApi";
import { useFavorites } from "../context/FavoritesContext";
import { cleanProductName } from "../utils/productName";


type Product = {

  id: string;

  name: string;

  price: number;

  oldPrice?: number;

  discount?: number;

  images?: string[];

};



type Props = {

  product: Product;

};



function ProductCard({
  product
}: Props) {


  const navigate = useNavigate();

  const [imgLoaded, setImgLoaded] = useState(false);

  const { isFavorite, toggleFavorite } = useFavorites();

  const favorite = isFavorite(product.id);

  const image =
    product.images &&
    product.images.length > 0
      ? product.images[0]
      : "/placeholder.png";




  const hasSale =
    product.oldPrice &&
    product.oldPrice > product.price;



  return (


    <div


      onClick={() => {
        // Запускаем загрузку полных данных товара (описание, варианты) чуть
        // раньше — в момент клика, ещё до перехода. Пока едет анимация
        // перехода, часто успевает прийти ответ, и описание не "выскакивает"
        // с задержкой после открытия карточки.
        getProduct(product.id).catch(() => {});
        navigate(
          `/product/${product.id}`
        )
      }}


      className="
      relative
      bg-[#111113]
      rounded-3xl
      p-4
      cursor-pointer
      border
      border-white/5
      hover:border-[#58BB43]
      transition-all
      duration-300
      overflow-hidden
      "

    >




      {/* ИЗБРАННОЕ */}

      <button

        onClick={(e) => {
          e.stopPropagation();
          toggleFavorite(product.id);
        }}

        className="
        absolute
        top-3
        right-3
        z-10
        w-7
        h-7
        flex
        items-center
        justify-center
        "

      >

        <img

          src="/nav-icons/favorites.png"

          alt=""

          decoding="sync"

          className={`
          w-7
          h-7
          object-contain
          [filter:drop-shadow(0_0_2px_#58BB43)_drop-shadow(0_0_2px_#58BB43)_drop-shadow(0_1px_3px_rgba(0,0,0,0.7))]
          ${favorite ? "opacity-100" : "opacity-50 grayscale"}
          `}

        />

      </button>


      {/* SALE BADGE */}


      {
        hasSale && (

          <div

            className="
            absolute
            top-3
            left-3
            z-10
            bg-[#58BB43]
            text-black
            text-xs
            font-black
            pl-1.5
            pr-3
            py-1
            rounded-full
            shadow-lg
            flex
            items-center
            gap-0.5
            "

          >

            <img src="/nav-icons/promotions.png" alt="" className="w-4 h-4 object-contain" />

            -
            {
              product.discount
            }
            %

          </div>

        )
      }






      {/* КАРТИНКА */}


      <div


        className="
        h-40
        flex
        items-center
        justify-center
        "

      >


        <img


          src={image}


          alt={product.name}


          loading="lazy"


          onLoad={() => setImgLoaded(true)}


          className={`
          max-h-36
          object-contain
          hover:scale-105
          transition-all
          duration-300
          ${imgLoaded ? "opacity-100" : "opacity-0"}
          `}

        />


      </div>








      {/* НАЗВАНИЕ */}



      <h3


        className="
        mt-3
        text-sm
        font-bold
        leading-snug
        "

      >

        {cleanProductName(product.name)}


      </h3>









      {/* ЦЕНЫ */}



      <div className="mt-3">



        {
          hasSale && (

            <div


              className="
              text-gray-500
              text-sm
              line-through
              "

            >

              {
                product.oldPrice?.toLocaleString(
                  "ru-RU"
                )
              }

              {" "}₽


            </div>


          )
        }







        <div


          className="
          flex
          items-center
          gap-2
          mt-1
          flex-wrap
          "

        >



          <span


            className="
            text-[#58BB43]
            text-xl
            font-black
            whitespace-nowrap
            "

          >

            {
              product.price.toLocaleString(
                "ru-RU"
              )
            }

            {" "}₽


          </span>





          {
            hasSale && (

              <span


                className="
                bg-white/10
                text-[#58BB43]
                text-xs
                font-bold
                px-2
                py-1
                rounded-full
                whitespace-nowrap
                "

              >

                скидка


              </span>


            )
          }



        </div>



      </div>




    </div>


  );

}



export default ProductCard;