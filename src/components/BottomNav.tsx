import {
  NavLink
} from "react-router-dom";

import {
  useCart
} from "../context/CartContext";





function BottomNav(){



const {
  cart
}=useCart();





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

path:"/cart",

label:"Корзина",

icon:"🛒"

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
max-w-md
mx-auto
h-full
flex
items-center
justify-around
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

flex

flex-col

items-center

justify-center

gap-1

text-xs

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
text-2xl
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




</div>






<span>

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