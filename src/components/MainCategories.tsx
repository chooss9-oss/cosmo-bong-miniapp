import {
  useEffect,
  useState
} from "react";

import {
  Link,
  useLocation
} from "react-router-dom";


const API_URL =
"https://cosmo-bong-miniapp.onrender.com/api";



interface Category {

  "#text": string;

  "@_id": string;

}





const categoryImages:Record<string,string> = {


"Бонги и Водники":
"/categories/bongs.png",


"Запчасти и Тюнинг":
"/categories/parts.png",


"Сувенирные трубки":
"/categories/pipes.png",


"Гриндеры и Прессы":
"/categories/grinders.png",


"Для самокруток":
"/categories/rolling.png",


"Аксессуары для Wax":
"/categories/wax.png",


"КБД (cbd) / Мицелий":
"/categories/cbd.png",


"Гроу":
"/categories/grow.png",


"Чайная Лавка":
"/categories/tea.png",


"Благовония":
"/categories/incense.png",


"Дисконт":
"/categories/discount.png",


"Мерч Космо Бонг":
"/categories/merch.png",


"Напасы":
"/categories/napasy.png"

};








function MainCategories(){


const [
categories,
setCategories
]=useState<Category[]>([]);



const location =
useLocation();






useEffect(()=>{


async function load(){


try{


const response =
await fetch(
`${API_URL}/categories`
);



const data =
await response.json();





const mainCategories =

data.filter(

(category:Category)=>

categoryImages[
category["#text"]
]

);




setCategories(
mainCategories
);



}
catch(error){

console.log(
"Categories error",
error
);

}


}



load();


},[]);








return(



<div

className="
sticky
top-[60px]
z-40
bg-[#080808]
py-2
"

>


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
gap-2
whitespace-nowrap
"

>


{

categories.map(category=>{


const active =

location.pathname.includes(
category["@_id"]
);



return(


<Link

key={
category["@_id"]
}


to={`/category/${category["@_id"]}`}


className={`

flex-shrink-0

px-3
py-1.5

rounded-full

text-xs

font-semibold

border

transition

${
active

?

"bg-[#58BB43] text-black border-[#58BB43]"

:

"bg-[#151515] text-gray-300 border-white/10"

}

`}


>


{category["#text"]}


</Link>


);



})


}


</div>


</div>


</div>


);


}



export default MainCategories;