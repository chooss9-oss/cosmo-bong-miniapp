import {
  useEffect,
  useState
} from "react";

import {
  Link,
  useLocation
} from "react-router-dom";



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


const location =
useLocation();



const [
categories,
setCategories
]=useState<Category[]>([]);



const [
visible,
setVisible
]=useState(true);



const [
lastScroll,
setLastScroll
]=useState(0);







useEffect(()=>{


fetch(
"https://cosmo-bong-miniapp.onrender.com/api/categories"
)


.then(res=>
res.json()
)


.then(data=>{


setCategories(
data.filter(
(category:Category)=>

categoryImages[
category["#text"]
]

)

);


})


.catch(error=>{


console.log(
"CATEGORY ERROR",
error
);


});



},[]);









useEffect(()=>{


function scroll(){


const current =
window.scrollY;



if(current > lastScroll && current > 120){


setVisible(false);


}


else{


setVisible(true);


}



setLastScroll(current);


}



window.addEventListener(
"scroll",
scroll
);



return()=>{


window.removeEventListener(
"scroll",
scroll
);


}



},[lastScroll]);









return(


<div


className={

`
sticky
top-[56px]
z-30
bg-[#080808]/95
backdrop-blur
transition-all
duration-300

${
visible

?

"opacity-100 translate-y-0"

:

"opacity-0 -translate-y-10 pointer-events-none"

}

`

}


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
px-4
py-1.5
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


to={

`/category/${category["@_id"]}`

}



className={

`

px-3
py-1.5
rounded-full
text-xs
font-semibold
border
transition-all

${
active

?

"bg-[#58BB43] text-black border-[#58BB43]"

:

"bg-[#151515] text-gray-300 border-white/10"

}


`

}


>


{
category["#text"]
}


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