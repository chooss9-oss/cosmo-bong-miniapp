import {
  createContext,
  useContext,
  useState
} from "react";

import { cleanProductName } from "../utils/productName";



type Product = {

  id:string;

  name:string;

  price:number;

  images?:string[];

};



type CartItem = Product & {

  quantity:number;

};



type CartContextType = {


  cart:CartItem[];


  addToCart:
  (product:Product)=>void;


  removeFromCart:
  (id:string)=>void;


  updateQuantity:
  (id:string, quantity:number)=>void;


  clearCart:
  ()=>void;


  getTotal:
  ()=>number;


};





const CartContext =

createContext<CartContextType|null>(null);







function getSavedCart():CartItem[]{


const saved =

localStorage.getItem("cart");



if(!saved)

return [];



try{

return JSON.parse(saved);

}

catch{

return [];

}


}









export function CartProvider({

children

}:{

children:React.ReactNode

}){



const [

cart,

setCart

]=useState<CartItem[]>(

getSavedCart()

);





const [

toast,

setToast

]=useState("");









function saveCart(

newCart:CartItem[]

){


setCart(newCart);


localStorage.setItem(

"cart",

JSON.stringify(newCart)

);


}








function showToast(

text:string

){


setToast(text);



setTimeout(()=>{


setToast("");


},2500);


}








function addToCart(

product:Product

){



const existing =

cart.find(

item=>

item.id===product.id

);




let newCart:CartItem[];





if(existing){


newCart =

cart.map(item=>

item.id===product.id

?

{

...item,

quantity:item.quantity+1

}

:

item

);


}

else{


newCart=[

...cart,

{

...product,

quantity:1

}

];


}





saveCart(newCart);



showToast(

`✅ ${cleanProductName(product.name)} добавлен в корзину`

);



}










function removeFromCart(

id:string

){


const newCart =

cart.filter(

item=>

item.id!==id

);



saveCart(newCart);


}








function updateQuantity(

id:string,

quantity:number

){



if(quantity<=0){


removeFromCart(id);


return;


}





const newCart =

cart.map(item=>



item.id===id

?

{

...item,

quantity

}

:

item



);



saveCart(newCart);



}









function clearCart(){


saveCart([]);


}









function getTotal(){


return cart.reduce(

(sum,item)=>

sum +

Number(item.price) *

item.quantity,

0

);


}









return(



<CartContext.Provider

value={{

cart,

addToCart,

removeFromCart,

updateQuantity,

clearCart,

getTotal

}}

>



{

toast && (


<div

className="
fixed
top-5
left-1/2
-translate-x-1/2
z-[9999]
bg-[#111113]
border
border-[#58BB43]
px-5
py-4
rounded-2xl
text-white
font-bold
shadow-2xl
"

>

{toast}

</div>


)


}





{children}



</CartContext.Provider>



);


}








export function useCart(){



const context =

useContext(CartContext);



if(!context){


throw new Error(

"useCart must be inside CartProvider"

);


}



return context;



}