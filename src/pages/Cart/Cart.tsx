import {
  useState
} from "react";


import {
  useCart
} from "../../context/CartContext";


import {
  useNavigate
} from "react-router-dom";

import FadeImage from "../../components/FadeImage";





export default function Cart(){



const {

  cart,

  removeFromCart,

  updateQuantity,

  clearCart,

  getTotal

}=useCart();




const navigate =
useNavigate();





const total =
getTotal();




const [promo,setPromo]=useState("");

const [promoApplied,setPromoApplied]=useState(false);

const [promoMessage,setPromoMessage]=useState("");







const discount =

promoApplied

?

Math.floor(total * 0.10)

:

0;





const finalTotal =

promoApplied

?

total - discount

:

total;









function applyPromo(){



const code =

promo.trim()

.toLowerCase();





if(code === "cosmo420tg"){



setPromoApplied(true);



setPromoMessage(

"✅ Промокод применен: скидка 10%"

);









localStorage.setItem(

"discount",

String(
Math.floor(total * 0.10)
)

);



localStorage.setItem(

"finalTotal",

String(
total - Math.floor(total * 0.10)
)

);



}

else{



setPromoApplied(false);



setPromoMessage(

"❌ Промокод не найден"

);



localStorage.removeItem(

"promoCode"

);


localStorage.removeItem(

"discount"

);


localStorage.removeItem(

"finalTotal"

);



}



}









function goCheckout(){



localStorage.setItem(

"finalTotal",

String(finalTotal)

);



localStorage.setItem(

"discount",

String(discount)

);



navigate("/checkout");



}









function clearCartAll(){



clearCart();



localStorage.removeItem(

"promoCode"

);


localStorage.removeItem(

"discount"

);


localStorage.removeItem(

"finalTotal"

);



}









if(cart.length===0){


return(


<div

className="
min-h-screen
bg-[#080808]
text-white
pt-[57px]
px-5
pb-5
"

>


<h1

className="
text-3xl
font-bold
mb-6
"

>

Корзина

</h1>





<div

className="
bg-[#151515]
rounded-3xl
border
border-white/10
p-8
text-center
"

>


<div

className="
mb-5
flex
justify-center
"

>

<img src="/nav-icons/cart.png" alt="" className="w-16 h-16 object-contain opacity-70" />

</div>




<p

className="
text-gray-400
"

>

Корзина пока пустая

</p>




<button

onClick={()=>navigate("/catalog")}

className="
mt-6
bg-[#58BB43]
text-black
font-bold
px-8
py-3
rounded-2xl
"

>

Перейти в каталог

</button>



</div>



</div>


);


}








return(



<div

className="
min-h-screen
bg-[#080808]
text-white
pt-[57px]
px-5
pb-28
"

>


<h1

className="
text-3xl
font-bold
mb-6
"

>

Корзина

</h1>









<div className="space-y-4">



{

cart.map(item=>(



<div

key={item.id}

className="
bg-[#151515]
border
border-white/10
rounded-3xl
p-4
flex
gap-4
"

>



<div

className="
w-28
h-28
flex
items-center
justify-center
bg-black/30
rounded-2xl
"

>



{

(item.images?.[0])

&&


<FadeImage

src={
item.images?.[0] ||
item.images?.[0]
}

alt={item.name}

className="
max-h-24
object-contain
"

/>


}



</div>





<div className="flex-1">


<h2 className="
font-bold
text-sm
line-clamp-2
">

{item.name}

</h2>





<div className="
text-[#58BB43]
font-bold
text-lg
mt-2
">

{item.price.toLocaleString()} ₽

</div>





<div className="
flex
items-center
gap-3
mt-4
">


<button

onClick={()=>updateQuantity(
item.id,
item.quantity-1
)}

className="
w-9
h-9
rounded-full
bg-white/10
text-xl
"

>

−

</button>





<span>

{item.quantity}

</span>





<button

onClick={()=>updateQuantity(
item.id,
item.quantity+1
)}

className="
w-9
h-9
rounded-full
bg-[#58BB43]
text-black
font-bold
text-xl
"

>

+

</button>


</div>


</div>





<button

onClick={()=>removeFromCart(item.id)}

className="
text-red-400
text-xl
"

>

✕

</button>



</div>


))


}



</div>








<div

className="
mt-8
bg-[#151515]
border
border-white/10
rounded-3xl
p-5
"

>



<h2 className="
font-bold
mb-3
">

Промокод

</h2>




<div className="
flex
gap-3
">


<input

value={promo}

onChange={(e)=>{

setPromo(e.target.value);

setPromoMessage("");

}}

onFocus={(e)=>{

const target = e.target;

setTimeout(()=>{

target.scrollIntoView({
  behavior: "smooth",
  block: "start"
});

}, 300);

}}

placeholder="Введите промокод"

className="
flex-1
bg-black/40
border
border-white/10
rounded-2xl
px-4
py-3
outline-none
focus:border-[#58BB43]
"

/>





<button

onClick={applyPromo}

className="
bg-[#58BB43]
text-black
font-bold
px-5
rounded-2xl
"

>

OK

</button>



</div>






{
promoMessage && (

<div

className={`
mt-3
text-sm
${
promoApplied
?
"text-[#58BB43]"
:
"text-red-400"
}
`}

>

{promoMessage}

</div>


)

}





</div>








<div

className="
mt-5
bg-[#151515]
border
border-white/10
rounded-3xl
p-5
"

>



<div className="
flex
justify-between
text-gray-400
">

<span>
Сумма
</span>


<span>
{total.toLocaleString()} ₽
</span>

</div>






{
promoApplied && (

<div className="
flex
justify-between
mt-2
text-[#58BB43]
">


<span>
Скидка 10%
</span>


<span>
-{discount.toLocaleString()} ₽
</span>


</div>


)

}







<div className="
flex
justify-between
text-xl
font-bold
mt-4
">


<span>
Итого
</span>



<span className="
text-[#58BB43]
">

{finalTotal.toLocaleString()} ₽

</span>


</div>








<button

onClick={goCheckout}

className="
mt-6
w-full
bg-[#58BB43]
text-black
font-bold
py-4
rounded-2xl
"

>

Оформить заказ

</button>






<button

onClick={clearCartAll}

className="
mt-4
w-full
text-gray-400
"

>

Очистить корзину

</button>





</div>






</div>


);


}