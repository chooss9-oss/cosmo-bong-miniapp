import {
  NavLink
} from "react-router-dom";

import {
  useCart
} from "../context/CartContext";

import {
  useFavorites
} from "../context/FavoritesContext";





function BottomNav(){



const {
  cart
}=useCart();

const {
  favorites
}=useFavorites();





const cartCount =

cart.reduce(

(sum,item)=>

sum + item.quantity,

0

);








const items = [


{

path:"/",

label:"Главная",

icon:"🏠"

},



{

path:"/catalog",

label:"Каталог",

icon:"📂"

},



{

path:"/sales",

label:"Акции",

icon:"🔥"

},



{

path:"/favorites",

label:"Избранное",

icon:"❤️"

},



{

path:"/cart",

label:"Корзина",

icon:"🛒"

},



{

path:"/profile",

label:"Профиль",

icon:"🦁"

}



];








return(



<nav


className="
fixed
bottom-0
left-0
right-0
z-50
bg-[#111113]/95
backdrop-blur
border-t
border-white/10
h-20
"

>



<div

className="
mx-auto
h-full
flex
items-center
justify-between
px-1
"

>



{

items.map(item=>(


<NavLink


key={item.path}


to={item.path}


className={({isActive})=>

`

relative

flex-1

min-w-0

flex

flex-col

items-center

justify-center

gap-0.5

text-[10px]

transition

${

isActive

?

"text-[#58BB43]"

:

"text-gray-400"

}

`

}



>


<div

className="
relative
text-lg
"

>


{item.icon}






{

item.path === "/cart"

&&

cartCount > 0

&& (


<span

className="
absolute
-left-3
-top-2
bg-[#58BB43]
text-black
text-[10px]
font-bold
min-w-5
h-5
rounded-full
flex
items-center
justify-center
px-1
"

>


{cartCount}



</span>


)

}


{

item.path === "/favorites"

&&

favorites.length > 0

&& (


<span

className="
absolute
-left-3
-top-2
bg-[#58BB43]
text-black
text-[10px]
font-bold
min-w-5
h-5
rounded-full
flex
items-center
justify-center
px-1
"

>


{favorites.length}



</span>


)


}




</div>






<span

className="
truncate
max-w-full
leading-none
"

>

{item.label}

</span>





</NavLink>


))

}




</div>


</nav>



);


}





export default BottomNav;