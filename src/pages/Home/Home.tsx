import {
  useEffect,
  useState
} from "react";

import {
  useNavigate
} from "react-router-dom";



const API_URL =
"https://cosmo-bong-miniapp.onrender.com/api";



interface Category {

  "#text": string;

  "@_id": string;

  "@_parentId"?: string;

}



interface Product {

  id:string;

  name:string;

  price:number;

  images?:string[];

  image?:string;

  categoryIds?:string[];

  categoryId?:string | number;

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







function Home(){


const navigate = useNavigate();



const [
categories,
setCategories
]=useState<Category[]>([]);



const [
products,
setProducts
]=useState<Product[]>([]);








useEffect(()=>{


async function load(){


try{


const categoriesRes =
await fetch(
`${API_URL}/categories`
);



const productsRes =
await fetch(
`${API_URL}/products`
);



if(!categoriesRes.ok){

throw new Error(
"Ошибка загрузки категорий"
);

}



if(!productsRes.ok){

throw new Error(
"Ошибка загрузки товаров"
);

}





const categoriesData =
await categoriesRes.json();



const productsData =
await productsRes.json();





setCategories(
categoriesData
);



setProducts(
productsData
);



}
catch(error){


console.error(
"Ошибка загрузки:",
error
);


}


}



load();



},[]);









function getCategoryCount(id:string){


return products.filter(product=>{


if(product.categoryIds){


return product.categoryIds.includes(id);


}



return String(product.categoryId)===id;



}).length;



}










const mainCategories =

categories.filter(category=>

categoryImages[
category["#text"]
]

);










return(



<div

className="
min-h-screen
bg-[#080808]
text-white
p-5
pt-28
"

>





<img


src="/logo.png"


alt="Cosmo Bong"


className="
w-48
mx-auto
mb-8
object-contain
drop-shadow-[0_0_20px_rgba(88,187,67,.8)]
"


/>









<img


src="/banner.jpg"


alt=""


className="
w-full
rounded-3xl
mb-8
"


/>








<h2

className="
text-xl
font-bold
mb-5
"

>

Категории

</h2>









<div

className="
grid
grid-cols-2
gap-4
"

>


{

mainCategories.map(category=>(


<div


key={
category["@_id"]
}


onClick={()=>


navigate(

`/category/${category["@_id"]}`

)

}


className="
bg-gradient-to-b
from-[#191919]
to-[#090909]
rounded-3xl
border
border-white/10
overflow-hidden
cursor-pointer
hover:border-[#58bb43]
transition
"

>





<div

className="
h-36
flex
items-center
justify-center
"

>



<img


src={
categoryImages[
category["#text"]
]
}


alt=""


className="
w-28
h-28
object-contain
brightness-0
invert
drop-shadow-[0_0_20px_rgba(88,187,67,1)]
"


/>



</div>








<div

className="
px-4
pb-5
"

>



<h3

className="
font-bold
text-sm
"

>

{
category["#text"]
}

</h3>






<p

className="
text-gray-400
text-xs
mt-2
"

>

{
getCategoryCount(
category["@_id"]
)
}

 товаров

</p>





</div>






</div>



))


}



</div>






</div>



);


}





export default Home;