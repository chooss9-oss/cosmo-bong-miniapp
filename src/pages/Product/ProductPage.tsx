import {
  useEffect,
  useState
} from "react";

import {
  useParams
} from "react-router-dom";

import {
  useCart
} from "../../context/CartContext";

interface Variant {

  id:string;

  name:string;

  price:number;

  image:string;

  available:boolean;

}



interface Product {

  id:string;

  name:string;

  price:number;

  oldPrice?:number;

  discount?:number;

  image?:string;

  images?:string[];

  description?:string;

  variants?:Variant[];

}






export default function ProductPage(){


  const {
    productId
  } = useParams();



  



  const {
    addToCart
  } = useCart();




  const [
    loading,
    setLoading
  ] = useState(true);



  const [
    product,
    setProduct
  ] = useState<Product | null>(null);



  const [
    selectedVariant,
    setSelectedVariant
  ] = useState<Variant | null>(null);



  const [
    currentImage,
    setCurrentImage
  ] = useState(0);







  useEffect(()=>{


    if(!productId)
      return;



    fetch(
      `https://cosmo-bong-miniapp.onrender.com/api/product/${productId}`,
      {
        cache:"no-store"
      }
    )


    .then(async response=>{


      if(!response.ok){

        throw new Error(
          "Товар не найден"
        );

      }


      return response.json();


    })



    .then(data=>{


      setProduct(data);



      if(data.variants?.length){

        setSelectedVariant(
          data.variants[0]
        );

      }


    })



    .catch(error=>{


      console.log(
        "PRODUCT ERROR",
        error
      );


    })



    .finally(()=>{


      setLoading(false);


    });



  },[productId]);









  if(loading){


    return(

      <div className="
      p-6
      text-white
      "
      >

        Загрузка...

      </div>

    );


  }








  if(!product){


    return(

      <div className="
      p-6
      text-white
      "
      >

        Товар не найден

      </div>

    );


  }








  const images =

    product.images?.length

    ?

    product.images

    :

    product.image

    ?

    [product.image]

    :

    [];








  const image =

    selectedVariant?.image

    ||

    images[currentImage]

    ||

    "/logo.png";








  const price =

    selectedVariant?.price

    ||

    product.price;









  function vibrate(){


    const tg =
      (window as any)
      .Telegram
      ?.WebApp;



    tg?.HapticFeedback
    ?.notificationOccurred(
      "success"
    );


  }









  function addProduct(){


    if(!product)
      return;



    addToCart({


      id:String(product.id),


      name:product.name,


      price,


      images


    });



    vibrate();


  }









  return(



    <div

      className="
      min-h-screen
      bg-[#080808]
      text-white
      px-4
      pt-[122px]
      pb-28
      "

    >







   









      {/* PRODUCT */}



      <div

        className="
        bg-[#151515]
        rounded-3xl
        border
        border-white/10
        overflow-hidden
        "

      >








        <div

          className="
          h-72
          flex
          items-center
          justify-center
          "

        >


          <img

            src={image}

            alt={product.name}

            className="
            max-h-64
            object-contain
            "

          />


        </div>









        {
          images.length > 1 &&


          (

          <div

            className="
            flex
            justify-center
            gap-2
            pb-4
            "

          >

            {
              images.map((_,index)=>(


                <button

                  key={index}

                  onClick={()=>setCurrentImage(index)}

                  className={

                  `
                  w-2
                  h-2
                  rounded-full

                  ${
                    currentImage===index

                    ?

                    "bg-[#58BB43]"

                    :

                    "bg-white/30"

                  }

                  `

                  }

                />


              ))

            }


          </div>


          )

        }









        <div className="p-4">







          <h1

            className="
            text-lg
            font-bold
            leading-snug
            "

          >

            {product.name}


          </h1>









          {
            product.oldPrice &&
            product.oldPrice > price &&
            (
              <div

                className="
                text-gray-500
                text-sm
                line-through
                mt-3
                "

              >

                {product.oldPrice.toLocaleString("ru-RU")} ₽

              </div>

            )
          }


          <div

            className="
            text-[#58BB43]
            text-2xl
            font-bold
            mt-1
            "

          >

            {price.toLocaleString("ru-RU")} ₽


          </div>









          <div className="
          mt-6
          "
          >

          {
            product.variants &&
            product.variants.length > 1 &&


            (

            <>

            <h2 className="
            font-bold
            mb-3
            "
            >

              Выберите вариант

            </h2>


            <div className="space-y-3">


            {
              product.variants.map(v=>(


                <button

                key={v.id}

                onClick={()=>setSelectedVariant(v)}

                className={

                `
                w-full
                text-left
                p-3
                rounded-xl
                border

                ${
                  selectedVariant?.id===v.id

                  ?

                  "border-[#58BB43] bg-[#202020]"

                  :

                  "border-white/10 bg-[#111]"

                }

                `

                }

                >


                <div className="font-bold text-sm">

                  {v.name}

                </div>


                <div className="text-[#58BB43]">

                  {v.price.toLocaleString()} ₽

                </div>


                </button>


              ))

            }


            </div>


            </>

            )

          }

          </div>









          {
            product.description &&


            (

            <div

              className="
              mt-6
              text-sm
              leading-relaxed
              product-description
              "
              dangerouslySetInnerHTML={{

                __html:
                product.description

              }}

            />

            )

          }

          <button

            onClick={addProduct}

            className="
            w-full
            mt-6
            bg-[#58BB43]
            text-black
            font-bold
            py-3
            rounded-xl
            text-base
            "

          >

            Добавить в корзину

          </button>

        </div>

      </div>

    </div>

  );

}