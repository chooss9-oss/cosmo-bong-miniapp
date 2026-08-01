import {
  useState
} from "react";

import {
  useCart
} from "../../context/CartContext";

import {
  getTelegramUser
} from "../../utils/telegram";





function Checkout(){


const {
cart,
clearCart
}=useCart();





const [
username,
setUsername
]=useState(
  () => getTelegramUser()?.username || ""
);



const [
phone,
setPhone
]=useState("");



const [
comment,
setComment
]=useState("");



const [
loading,
setLoading
]=useState(false);



const [
success,
setSuccess
]=useState(false);




const [
orderTotal,
setOrderTotal
]=useState(0);







const savedTotal =

localStorage.getItem("finalTotal");



const total =

savedTotal

?

Number(savedTotal)

:

cart.reduce(

(sum,item)=>

sum +

Number(item.price) *

item.quantity,

0

);







function getTelegramUsername(){

const tg = (window as any).Telegram?.WebApp;

return tg?.initDataUnsafe?.user?.username || "";

}

async function sendOrder(){



if(cart.length===0){

alert(
"Корзина пустая"
);

return;

}





setLoading(true);





try{



const response = await fetch(

"/api/order",

{


method:"POST",


headers:{


"Content-Type":

"application/json"


},



body:JSON.stringify({

username,

telegramUsername: getTelegramUsername(),

telegramUserId: getTelegramUser()?.id,

phone,

comment,

cart,

total


})


}

);







if(!response.ok){

throw new Error(
"Ошибка сервера"
);

}





const data =

await response.json();








if(data.success){



setOrderTotal(total);



clearCart();



localStorage.removeItem(
"finalTotal"
);



setSuccess(true);



}
else{


throw new Error(
"Заказ не принят"
);


}



}

catch(error){



console.log(

"ORDER ERROR:",

error

);



alert(

"Ошибка отправки заказа"

);



}

finally{


setLoading(false);


}


}










if(success){



return(


<div

className="
min-h-screen
bg-[#080808]
text-white
flex
items-center
justify-center
p-5
"

>



<div

className="
w-full
max-w-md
bg-[#111113]
rounded-3xl
p-8
text-center
border
border-white/10
"

>



<div

className="
text-6xl
mb-5
"

>

✅

</div>







<h1

className="
text-3xl
font-bold
"

>

Заказ принят!

</h1>







<p

className="
mt-4
text-gray-400
leading-relaxed
"

>

Спасибо за покупку ❤️

<br/>

Мы получили ваш заказ и скоро свяжемся с вами.

</p>







<div

className="
mt-6
bg-[#080808]
rounded-2xl
p-5
"

>


<p

className="
text-gray-400
text-sm
"

>

Сумма заказа:

</p>




<div

className="
text-3xl
font-bold
text-[#58BB43]
mt-2
"

>

{orderTotal.toLocaleString()} ₽


</div>

</div>







<button


onClick={()=>{


window.location.href="/";


}}



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

Вернуться в магазин


</button>





</div>



</div>


);



}









return(


<div className="min-h-screen bg-[#080808] pt-[57px] px-5 pb-5 text-white">



<h1

className="
text-3xl
font-bold
mb-6
"

>

Оформление заказа

</h1>









<div

className="
space-y-4
"

>



<input

value={username}

onChange={e=>setUsername(e.target.value)}

placeholder="Telegram username (если есть)"

className="
w-full
bg-[#111113]
rounded-2xl
p-4
outline-none
"

/>



<p

className="
text-gray-500
text-sm
"

>

Нет Telegram username?

<br/>

Укажите номер телефона для связи.

</p>



<input

value={phone}

onChange={e=>setPhone(e.target.value)}

placeholder="Телефон (не обязательно)"

className="
w-full
bg-[#111113]
rounded-2xl
p-4
outline-none
"

/>



<textarea

value={comment}

onChange={e=>setComment(e.target.value)}

placeholder="Комментарий к заказу"

className="
w-full
h-32
bg-[#111113]
rounded-2xl
p-4
outline-none
"

/>



</div>









<div

className="
mt-8
bg-[#111113]
rounded-3xl
p-5
border
border-white/10
"

>



<div

className="
flex
justify-between
text-xl
font-bold
"

>


<span>

Итого

</span>




<span

className="
text-[#58BB43]
"

>

{total.toLocaleString()} ₽


</span>



</div>








<button


disabled={loading}


onClick={sendOrder}



className="
mt-6
w-full
bg-[#58BB43]
text-black
font-bold
py-4
rounded-2xl
disabled:opacity-50
"

>


{

loading

?

"Отправляем..."

:

"Оформить заказ"

}



</button>






</div>






</div>


);



}





export default Checkout;