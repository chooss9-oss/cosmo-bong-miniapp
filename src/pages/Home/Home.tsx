import {
  useEffect,
  useState
} from "react";

import {
  useNavigate
} from "react-router-dom";

import ProductCard from "../../components/ProductCard";
import FadeImage from "../../components/FadeImage";

import {
  getCachedProducts,
  getCachedCategories
} from "../../api/storelandApi";



const API_URL = "/api";



interface Category {

  "#text": string;

  "@_id": string;

  "@_parentId"?: string;

}



interface Product {

  id:string;

  name:string;

  price:number;

  oldPrice?:number;

  discount?:number;

  images?:string[];

  image?:string;

  categoryIds?:string[];

  categoryId?:string | number;

  inStock?:boolean;

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


"Аксессуары":
"/categories/accessories.png",


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



function getChildCategoryIds(

parentId:string,

categories:Category[]

):string[]{


  const children = categories.filter(

    cat =>

    String(cat["@_parentId"])

    ===

    String(parentId)

  );



  let ids:string[]=[];



  children.forEach(child=>{


    ids.push(

      String(child["@_id"])

    );



    ids.push(

      ...getChildCategoryIds(

        String(child["@_id"]),

        categories

      )

    );


  });



  return ids;

}



function pluralizeTovarov(count:number){

const mod10 = count % 10;

const mod100 = count % 100;

if(mod100 >= 11 && mod100 <= 14){

return "товаров";

}

if(mod10 === 1){

return "товар";

}

if(mod10 >= 2 && mod10 <= 4){

return "товара";

}

return "товаров";

}







function Home(){


const navigate = useNavigate();



const [
categories,
setCategories
]=useState<Category[]>(
  () => getCachedCategories() ?? []
);



const [
products,
setProducts
]=useState<Product[]>(
  () => getCachedProducts() ?? []
);








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


const retryTimers = [5000, 10000, 15000, 20000].map(delay =>

  setTimeout(() => {

    fetch(`${API_URL}/products`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) {
          setProducts(data);
        }
      })
      .catch(() => {});

  }, delay)

);

return () => retryTimers.forEach(timer => clearTimeout(timer));



},[]);









function getCategoryCount(id:string){

const childIds = getChildCategoryIds(id, categories);

const allowedIds = [id, ...childIds];


return products.filter(product=>{


if(product.categoryIds){


return product.categoryIds.some(catId=>

allowedIds.includes(String(catId))

);


}



return allowedIds.includes(

String(product.categoryId)

);



}).length;



}










const mainCategories =

categories.filter(category=>

categoryImages[
category["#text"]
]

);



const saleProducts =

products.filter(product=>

product.oldPrice &&

product.oldPrice > product.price &&

product.inStock !== false

).slice(0, 10);










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



<div

className="
relative
mb-8
"

>

<FadeImage


src="/banner.PNG"


alt=""


className="
w-full
rounded-3xl
"


/>

<div

className="
absolute
left-5
bottom-5
right-5
"

>

<h1

className="
text-xl
font-bold
leading-tight
mb-3
drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]
"

>

Космо Бонг

</h1>

<button

onClick={()=>navigate("/catalog")}

className="
bg-[#58BB43]
text-black
font-bold
text-sm
px-5
py-2.5
rounded-2xl
shadow-lg
"

>

В каталог →

</button>

</div>

</div>









{

saleProducts.length > 0 && (

<>

<div

className="
flex
items-center
justify-between
mb-5
"

>

<h2

className="
text-xl
font-bold
flex
items-center
gap-2
"

>

<img src="/nav-icons/promotions.png" alt="" className="w-6 h-6 object-contain" />
Акции

</h2>

<button

onClick={()=>navigate("/sales")}

className="
text-sm
font-semibold
text-[#58BB43]
"

>

Все акции →

</button>

</div>

<div

className="
flex
gap-4
overflow-x-auto
scrollbar-hide
mb-8
-mx-5
px-5
"

>

{

saleProducts.map(product=>(

<div

key={product.id}

className="
w-40
flex-shrink-0
"

>

<ProductCard product={product} />

</div>

))

}

</div>

</>

)

}








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

<div

key="all"

onClick={()=>navigate("/catalog")}

className="
bg-gradient-to-b
from-[#191919]
to-[#090909]
rounded-3xl
border
border-[#58BB43]
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

<span

className="
text-4xl
font-black
text-[#58BB43]
"

>

Все

</span>

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
text-[#58BB43]
"

>

Все категории

</h3>

<p

className="
text-gray-400
text-xs
mt-2
"

>

{`${products.length} ${pluralizeTovarov(products.length)}`}

</p>

</div>

</div>

}

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



<FadeImage


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

{`${getCategoryCount(category["@_id"])} ${pluralizeTovarov(getCategoryCount(category["@_id"]))}`}

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