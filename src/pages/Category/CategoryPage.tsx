import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import ProductCard from "../../components/ProductCard";

import {
  getProducts,
  getCategories
} from "../../api/storelandApi";



type Product = {

  id:string;

  name:string;

  price:number;

  images?:string[];

  categoryId:string | number;

};



type Category = {

  "@_id": string;

  "#text": string;

};





function CategoryPage() {


  const {
    categoryName
  } = useParams();



  const [
    products,
    setProducts
  ] = useState<Product[]>([]);



  const [
    category,
    setCategory
  ] = useState<Category | null>(null);



  useEffect(()=>{


    async function load(){


      const [
        productsData,
        categoriesData
      ] = await Promise.all([

        getProducts(),

        getCategories()

      ]);



      const currentCategory =
        categoriesData.find(
          (cat:Category)=>
            cat["#text"]
            ===
            categoryName
        );



      setCategory(
        currentCategory || null
      );



      if(currentCategory){


        const filtered =
          productsData.filter(
            (product:Product)=>

              String(product.categoryId)
              ===
              String(
                currentCategory["@_id"]
              )

          );


        setProducts(filtered);


      }



    }



    load();



  },[categoryName]);






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

        {
          category
          ? category["#text"]
          : "Категория"
        }


      </h1>





      <div

        className="
        grid
        grid-cols-2
        gap-4
        "

      >

        {
          products.map(
            product=>(

              <ProductCard

                key={product.id}

                product={product}

              />

            )

          )
        }


      </div>





      {
        products.length === 0 && (

          <div
            className="
            text-gray-400
            "
          >

            В этой категории пока нет товаров

          </div>

        )

      }



    </div>

  );


}



export default CategoryPage;