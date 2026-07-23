import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import {
  getProduct
} from "../../api/storelandApi";

import { useCart } from "../../context/CartContext";



type Product = {

  id: string;

  name: string;

  price: number;

  description?: string;

  images?: string[];

};





function ProductPage() {


  const {
    productId
  } = useParams();



  const {
    addToCart
  } = useCart();



  const [
    product,
    setProduct
  ] = useState<Product | null>(null);



  const [
    loading,
    setLoading
  ] = useState(true);





  useEffect(() => {


    if (!productId) return;



    getProduct(productId)

      .then((data)=>{


        setProduct(data);


      })

      .catch((error)=>{


        console.log(
          "Ошибка загрузки товара",
          error
        );


      })

      .finally(()=>{


        setLoading(false);


      });



  }, [productId]);






  if (loading) {


    return (

      <div className="p-6 text-white">

        Загрузка товара...

      </div>

    );

  }





  if (!product) {


    return (

      <div className="p-6 text-white">

        Товар не найден

      </div>

    );

  }





  const image =
    product.images &&
    product.images.length > 0
      ? product.images[0]
      : "";







  return (

    <div

      className="
      p-5
      text-white
      "

    >



      <div

        className="
        bg-[#111113]
        rounded-3xl
        p-5
        "

      >



        {
          image && (

            <img

              src={image}

              alt={product.name}

              className="
              w-full
              h-72
              object-contain
              rounded-2xl
              "

            />

          )

        }




        <h1

          className="
          mt-6
          text-xl
          font-bold
          "

        >

          {product.name}

        </h1>





        <div

          className="
          mt-4
          text-2xl
          font-bold
          text-[#58BB43]
          "

        >

          {product.price.toLocaleString()}
          {" "}
          ₽


        </div>






        <button

          onClick={()=>{


            addToCart(product);


            alert(
              "Товар добавлен в корзину"
            );


          }}


          className="
          mt-6
          w-full
          bg-[#58BB43]
          text-black
          font-bold
          py-4
          rounded-2xl
          "

        >

          Добавить в корзину


        </button>





        {
          product.description && (


            <div

              className="
              mt-8
              text-sm
              text-gray-300
              leading-relaxed
              "

              dangerouslySetInnerHTML={{
                __html:
                product.description
              }}

            />


          )

        }




      </div>


    </div>


  );


}



export default ProductPage;