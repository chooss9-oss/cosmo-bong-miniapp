// src/pages/Sales/Sales.tsx

import { useEffect, useState } from "react";

import ProductCard from "../../components/ProductCard";

import {
  getSaleProducts
} from "../../api/products";


type Product = {

  id: string;

  name: string;

  price: number;

  oldPrice?: number;

  discount?: number;

  images?: string[];

  description?: string;

};




function Sales() {


  const [
    products,
    setProducts
  ] = useState<Product[]>([]);



  const [
    loading,
    setLoading
  ] = useState(true);




  useEffect(() => {


    async function loadSale() {


      try {


        const data: Product[] =
          await getSaleProducts();



        console.log(
          "🔥 SALE PRODUCTS:",
          data
        );



        setProducts(data);



      } catch(error) {


        console.error(
          "Ошибка загрузки акций:",
          error
        );


      } finally {


        setLoading(false);


      }


    }



    loadSale();


  }, []);







  return (

    <div
      className="
      min-h-screen
      bg-[#080808]
      text-white
      p-5
      pb-24
      "
    >


      <h1
        className="
        text-3xl
        font-bold
        "
      >

        🔥 Акции Cosmo Bong

      </h1>



      <p
        className="
        mt-3
        text-gray-400
        "
      >

        Специальные предложения и скидки

      </p>




      {
        loading && (

          <div
            className="
            text-gray-400
            mt-10
            "
          >

            Загружаем акции...

          </div>

        )
      }





      <div
        className="
        mt-8
        grid
        grid-cols-2
        md:grid-cols-4
        gap-4
        "
      >


        {
          products.map(

            product => (

              <ProductCard

                key={
                  product.id
                }

                product={
                  product
                }

              />

            )

          )
        }


      </div>





      {
        !loading &&
        products.length === 0 && (

          <div
            className="
            text-gray-400
            text-center
            mt-10
            "
          >

            Сейчас нет акционных товаров

          </div>

        )
      }



    </div>

  );


}



export default Sales;