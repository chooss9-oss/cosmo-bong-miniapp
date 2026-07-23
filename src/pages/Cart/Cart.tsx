import { useCart } from "../../context/CartContext";


function Cart() {


  const {
    cart,
    removeFromCart
  } = useCart();




  const total = cart.reduce(

    (sum, item)=>{

      return sum +
        item.price *
        item.quantity;

    },

    0

  );





  if(cart.length === 0){


    return (

      <div

        className="
        p-6
        text-white
        "

      >

        <h1

          className="
          text-2xl
          font-bold
          mb-4
          "

        >

          Корзина

        </h1>



        <p className="text-gray-400">

          Корзина пока пустая

        </p>



      </div>

    );


  }






  return (

    <div

      className="
      p-5
      text-white
      "

    >


      <h1

        className="
        text-2xl
        font-bold
        mb-6
        "

      >

        Корзина

      </h1>






      <div

        className="
        space-y-4
        "

      >


        {
          cart.map(

            item=>(


              <div

                key={item.id}

                className="
                bg-[#111113]
                rounded-2xl
                p-4
                flex
                gap-4
                "

              >



                {
                  item.images?.[0] && (

                    <img

                      src={
                        item.images[0]
                      }

                      className="
                      w-20
                      h-20
                      object-contain
                      "

                    />

                  )

                }





                <div className="flex-1">


                  <h2 className="font-bold">

                    {item.name}

                  </h2>



                  <p className="text-[#58BB43]">

                    {
                      item.price.toLocaleString()
                    }
                    {" "}
                    ₽

                  </p>



                  <p>

                    Количество:
                    {" "}
                    {item.quantity}

                  </p>



                </div>





                <button

                  onClick={()=>
                    removeFromCart(item.id)
                  }

                  className="
                  text-red-400
                  "

                >

                  Удалить

                </button>



              </div>


            )

          )

        }



      </div>






      <div

        className="
        mt-8
        text-xl
        font-bold
        "

      >

        Итого:

        {" "}

        {
          total.toLocaleString()
        }

        {" "}

        ₽


      </div>





    </div>

  );


}



export default Cart;