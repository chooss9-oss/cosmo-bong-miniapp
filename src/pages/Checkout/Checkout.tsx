import {
  useState,
  useEffect
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



const [bonusBalance, setBonusBalance] = useState(0);
const [usePoints, setUsePoints] = useState(false);
const [pointsUsedInOrder, setPointsUsedInOrder] = useState(0);




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



const maxRedeemable = Math.min(bonusBalance, Math.floor(total * 0.5));

const amountToPay = usePoints ? total - maxRedeemable : total;



useEffect(() => {

  const telegramUserId = getTelegramUser()?.id;

  if (!telegramUserId) return;

  fetch(`/api/bonus-balance?telegramUserId=${telegramUserId}`)
    .then(res => res.json())
    .then(data => setBonusBalance(typeof data?.balance === "number" ? data.balance : 0))
    .catch(() => setBonusBalance(0));

}, []);







function getTelegramUsername(){

const tg = (window as any).Telegram?.WebApp;

return tg?.initDataUnsafe?.user?.username || "";

}




// Спрашиваем нативным окном Telegram разрешение боту писать пользователю —
// чтобы уведомление о заказе пришло сразу, без отдельного захода в чат с
// ботом. Если разрешение уже выдано раньше — окно не покажется повторно.
function requestNotificationAccess(): Promise<boolean> {

  const attempt = new Promise<boolean>((resolve)=>{

    const tg = window.Telegram?.WebApp;

    if(!tg || !tg.requestWriteAccess){
      resolve(false);
      return;
    }

    if(tg.initDataUnsafe?.user?.allows_write_to_pm){
      resolve(true);
      return;
    }

    try{

      tg.requestWriteAccess((granted)=>{
        resolve(!!granted);
      });

    } catch {
      resolve(false);
    }

  });

  // На случай, если нативное окно Telegram по какой-то причине не вызовет
  // callback — не даём этому заблокировать оформление заказа.
  const timeout = new Promise<boolean>((resolve)=>{
    setTimeout(()=>resolve(false), 8000);
  });

  return Promise.race([attempt, timeout]);

}




async function sendOrder(){



if(cart.length===0){

alert(
"Корзина пустая"
);

return;

}



const notificationsAllowed = await requestNotificationAccess();





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

notificationsAllowed,

phone,

comment,

cart,

total,

promoCode: localStorage.getItem("promoCode") || null,

pointsUsed: usePoints ? maxRedeemable : 0


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

setPointsUsedInOrder(usePoints ? maxRedeemable : 0);



clearCart();



localStorage.removeItem(
"finalTotal"
);

localStorage.removeItem("promoCode");
localStorage.removeItem("discount");



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

{
  pointsUsedInOrder > 0 && (
    <div className="mt-2 text-sm text-gray-400">
      Списано баллами: {pointsUsedInOrder.toLocaleString()} ₽
    </div>
  )
}

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


{
  bonusBalance > 0 && (

    <div
      className="
      mt-4
      pt-4
      border-t
      border-white/10
      "
    >

      <label
        className="
        flex
        items-center
        justify-between
        gap-3
        cursor-pointer
        "
      >

        <span className="text-sm text-gray-300">
          🎁 Списать баллы (доступно {maxRedeemable.toLocaleString()} ₽ из {bonusBalance.toLocaleString()} ₽)
        </span>

        <input
          type="checkbox"
          checked={usePoints}
          onChange={e => setUsePoints(e.target.checked)}
          className="w-5 h-5 accent-[#58BB43] flex-shrink-0"
        />

      </label>

      {
        usePoints && (
          <div className="mt-3 flex justify-between text-sm">
            <span className="text-gray-400">К оплате</span>
            <span className="text-[#58BB43] font-bold">{amountToPay.toLocaleString()} ₽</span>
          </div>
        )
      }

    </div>

  )
}


<p
className="
mt-4
text-sm
text-gray-400
leading-relaxed
"
>

🔔 Разрешите уведомления от бота — это удобно: напишем, чтобы уточнить детали доставки, и пришлём трек-номер для отслеживания заказа.

</p>




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