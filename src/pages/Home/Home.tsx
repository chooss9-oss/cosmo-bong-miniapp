import { useEffect, useState } from "react";

import CategoryCard from "../../components/CategoryCard";

import {
  getCategories
} from "../../api/storelandApi";



type Category = {

  "@_id": string;

  "#text": string;

};





function Home() {


  const [
    categories,
    setCategories
  ] = useState<Category[]>([]);



  const [
    loading,
    setLoading
  ] = useState(true);





  useEffect(()=>{


    getCategories()

      .then((data)=>{


        const mainCategories =
          data.filter(
            (category:Category)=>{

              return [

                "Бонги и Водники",
                "Запчасти и Тюнинг",
                "Сувенирные трубки",
                "Гриндеры и Прессы",
                "Для самокруток",
                "Аксессуары для Wax"

              ].includes(
                category["#text"]
              );


            }
          );


        setCategories(
          mainCategories
        );


      })

      .catch((error)=>{


        console.log(
          "Ошибка загрузки категорий",
          error
        );


      })

      .finally(()=>{


        setLoading(false);


      });



  },[]);






  if(loading){


    return (

      <div className="p-5 text-white">

        Загрузка...

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
        text-3xl
        font-bold
        mb-6
        "

      >

        Cosmo Bong

      </h1>





      <div

        className="
        grid
        grid-cols-2
        gap-4
        "

      >


        {
          categories.map(
            (category)=>(


              <CategoryCard

                key={
                  category["@_id"]
                }


                image="/category.png"


                name={
                  category["#text"]
                }


                count=""


              />


            )

          )
        }


      </div>




    </div>


  );


}



export default Home;