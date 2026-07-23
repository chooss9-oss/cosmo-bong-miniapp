import { useEffect, useState } from "react";

import ProductCard from "../../components/ProductCard";

import {
  getProducts
} from "../../api/storelandApi";



type Product = {

  id: string;

  name: string;

  price: number;

  description?: string;

  images?: string[];

};





function Catalog() {


  const [products, setProducts] =
    useState<Product[]>([]);



  const [loading, setLoading] =
    useState(true);



  useEffect(() => {


    getProducts()

      .then((data)=>{


        setProducts(data);


      })

      .catch((error)=>{


        console.log(
          "Ошибка загрузки товаров",
          error
        );


      })

      .finally(()=>{


        setLoading(false);


      });



  }, []);





  if (loading) {


    return (

      <div className="p-6 text-white">

        Загрузка каталога...

      </div>

    );


  }





  return (

    <div

      className="
      p-4
      grid
      grid-cols-2
      gap-4
      "

    >


      {
        products.map(
          (product)=>(


            <ProductCard

              key={product.id}

              product={product}

            />


          )

        )
      }



    </div>

  );

}



export default Catalog;