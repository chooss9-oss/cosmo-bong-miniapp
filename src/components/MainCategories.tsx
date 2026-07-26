import {
  Link,
  useLocation
} from "react-router-dom";



const categories = [

  {
    id:"8961654",
    name:"💧 Бонги"
  },

  {
    id:"9323547",
    name:"🔥 Стекло"
  },

  {
    id:"9323710",
    name:"🔧 Аксессуары"
  },

  {
    id:"9338427",
    name:"🌱 Grow"
  },

  {
    id:"9338428",
    name:"🍄 Мицелий"
  },

  {
    id:"9338429",
    name:"CBD"
  }


];






function MainCategories(){


  const location =
    useLocation();





  return (



    <div

      className="
      w-full
      overflow-x-auto
      scrollbar-hide
      "

    >




      <div

        className="
        flex
        gap-3
        whitespace-nowrap
        pb-2
        "

      >




        {
          categories.map(category=>{


            const active =

              location.pathname.includes(

                category.id

              );





            return(



              <Link

                key={category.id}

                to={`/category/${category.id}`}

                className={

                  `
                  px-4
                  py-2
                  rounded-full
                  text-sm
                  font-semibold
                  transition
                  ${
                    active

                    ?

                    "bg-[#58BB43] text-black"

                    :

                    "bg-[#111113] text-gray-300"

                  }
                  `
                }


              >

                {category.name}


              </Link>



            );



          })

        }




      </div>




    </div>



  );


}



export default MainCategories;