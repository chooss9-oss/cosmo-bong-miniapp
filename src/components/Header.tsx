import {
  useState,
  useEffect
} from "react";

import {
  useNavigate,
  useLocation
} from "react-router-dom";



function Header(){


  const navigate = useNavigate();

  const location = useLocation();


  const [
    search,
    setSearch
  ] = useState("");



  const isHome =
    location.pathname === "/";



  // Держим строку поиска в синхронизации с адресной строкой — если
  // пользователь открыл каталог с поиском (например, вернулся назад),
  // строка поиска отображает актуальный запрос.
  useEffect(()=>{

    if(location.pathname !== "/catalog"){
      return;
    }

    const params = new URLSearchParams(location.search);
    const urlSearch = params.get("search") || "";

    setSearch(urlSearch);

  },[location.pathname, location.search]);



  function handleSearch(
    e:React.FormEvent<HTMLFormElement>
  ){


    e.preventDefault();



    const value =
      search.trim();



    // убираем фокус с input
    // закрывает клавиатуру на iPhone
    const activeElement =
      document.activeElement as HTMLElement;


    activeElement?.blur();





    if(value){


      navigate(
        `/catalog?search=${encodeURIComponent(value)}`
      );


    }


  }








  function goBack(){


    navigate(-1);


  }








  return(



    <header


      className="
      fixed
      top-0
      left-0
      right-0
      z-50
      bg-[#080808]/95
      backdrop-blur
      border-b
      border-white/10
      px-4
      py-2
      "


    >





      <form


        onSubmit={handleSearch}


        className="
        flex
        items-center
        gap-2
        "


      >








        {
          !isHome && (



            <button


              type="button"


              onClick={goBack}



              className="
              flex
              items-center
              justify-center
              w-10
              h-10
              rounded-xl
              bg-[#151515]
              border
              border-white/10
              text-gray-300
              text-lg
              active:scale-95
              transition
              "


            >


              ←


            </button>



          )
        }









        <div


          className="
          relative
          flex-1
          "


        >







          <span


            className="
            absolute
            left-3
            top-1/2
            -translate-y-1/2
            "


          >


            <img
              src="/nav-icons/search.png"
              alt=""
              className="w-7 h-7 object-contain opacity-90"
            />


          </span>









          <input



            value={search}



            onChange={


              e =>

              setSearch(
                e.target.value
              )


            }



            placeholder="
            Поиск по товарам...
            "



            enterKeyHint="search"



            inputMode="search"



            autoComplete="off"



            autoCorrect="off"



            spellCheck={false}



            className="
            w-full
            h-10
            bg-[#151515]
            border
            border-white/10
            rounded-xl
            pl-12
            pr-4
            text-base
            text-white
            outline-none
            focus:border-[#58BB43]
            transition
            "



          />







        </div>









      </form>








    </header>



  );


}





export default Header;