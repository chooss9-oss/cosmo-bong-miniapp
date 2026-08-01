import {
  useNavigate
} from "react-router-dom";


function Success(){


const navigate =
useNavigate();




const orderNumber =
Math.floor(
100000 +
Math.random()*900000
);





return (


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
bg-[#111113]
rounded-3xl
p-8
text-center
max-w-md
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
mb-4
"

>

Заказ принят!

</h1>






<p

className="
text-gray-400
leading-relaxed
"

>

Спасибо за заказ в
<br/>

<b className="text-white">
Cosmo Bong
</b>

<br/>

Мы получили вашу заявку
и скоро свяжемся с вами.

</p>








<div

className="
mt-6
bg-black
rounded-2xl
p-4
"

>


<p className="text-gray-500 text-sm">

Номер заказа

</p>


<p

className="
text-[#58BB43]
text-2xl
font-bold
"

>

#{orderNumber}

</p>


</div>








<button

onClick={()=>navigate("/")}

className="
mt-4
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



export default Success;