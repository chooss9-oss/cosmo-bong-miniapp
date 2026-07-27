import {
  useEffect,
  useState
} from "react";


import {
  useSearchParams
} from "react-router-dom";


import ProductCard from "../../components/ProductCard";


import {
  getProducts
} from "../../api/storelandApi";





type Product = {

  id:string;

  name:string;

  price:number;

  images?:string[];

  categoryIds?:string[];

  description?:string;

};









function cleanDescription(
  html:string
){

  return html

    .replace(/<[^>]*>/g," ")

    .replace(/&nbsp;/g," ")

    .replace(/\s+/g," ")

    .toLowerCase();

}









function normalizeWord(
  word:string
){

  return word

    .replace(
      /[^a-zа-яё0-9]/gi,
      ""
    )

    .replace(
      /(ом|ем|ами|ями|ов|ев|а|ы|и)$/i,
      ""
    );

}









function Catalog(){



  const [
    searchParams
  ] = useSearchParams();





  const search =

    searchParams

      .get("search")

      ?.toLowerCase()

      .trim()

    ||

    "";









  const [
    products,
    setProducts
  ] = useState<Product[]>([]);









  const [
    filteredProducts,
    setFilteredProducts
  ] = useState<Product[]>([]);









  const [
    loading,
    setLoading
  ] = useState(true);









  useEffect(()=>{


    async function load(){


      try{


        const productsData =

          await getProducts();





        setProducts(
          productsData
        );



      }


      catch(error){


        console.log(
          "Catalog loading error",
          error
        );


      }


      finally{


        setLoading(false);


      }



    }



    load();



  },[]);









  useEffect(()=>{



    if(!search){


      setFilteredProducts(
        products
      );


      return;


    }









    const stopWords = [

      "с",
      "и",
      "для",
      "на",
      "по",
      "от",
      "из",
      "в",
      "у"

    ];









    const searchWords =

      search

        .split(" ")

        .map(word=>

          normalizeWord(word)

        )

        .filter(word=>

          word.length > 1 &&

          !stopWords.includes(word)

        );









    const result =

      products.filter(product=>{



        const name =

          product.name

            ?.toLowerCase()

          ||

          "";








        const description =

          product.description

          ?

          cleanDescription(
            product.description
          )

          :

          "";








        const fullText =

          normalizeWord(

            `${name} ${description}`

          );








        return searchWords.every(word=>

          fullText.includes(word)

        );



      });








    setFilteredProducts(
      result
    );





  },[
    search,
    products
  ]);









  if(loading){


    return(

      <div

        className="
        p-5
        text-white
        "

      >

        Загрузка каталога...


      </div>

    );


  }









  return(



    <div


      className="
      min-h-screen
      bg-[#080808]
      text-white
      px-4
      pt-[72px]
      pb-28
      "

    >







      <h1


        className="
        text-2xl
        font-bold
        mb-4
        "

      >


        {

          search

          ?

          `Поиск: ${search}`

          :

          "Каталог"

        }


      </h1>









      {/* ТОВАРЫ */}



      <div


        className="
        grid
        grid-cols-2
        gap-3
        "

      >



        {

          filteredProducts.map(product=>(



            <ProductCard


              key={
                product.id
              }


              product={
                product
              }


            />



          ))



        }



      </div>









      {

        filteredProducts.length===0 && (



          <div


            className="
            text-center
            text-gray-400
            mt-10
            "

          >

            Ничего не найдено


          </div>



        )

      }









    </div>



  );


}





export default Catalog;