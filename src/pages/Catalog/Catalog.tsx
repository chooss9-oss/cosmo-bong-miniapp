import {
  useEffect,
  useState
} from "react";


import {
  useSearchParams,
  useNavigate
} from "react-router-dom";


import ProductCard from "../../components/ProductCard";


import {
  getProducts,
  getCategories
} from "../../api/storelandApi";





type Product = {

  id:string;

  name:string;

  price:number;

  oldPrice?:number;

  discount?:number;

  images?:string[];

  categoryIds?:string[];

  description?:string;

};





type Category = {

  "@_id":string;

  "#text":string;

  "@_parentId"?:string;

};







const mainCategoryNames = [

"Бонги и Водники",

"Запчасти и Тюнинг",

"Сувенирные трубки",

"Гриндеры и Прессы",

"Для самокруток",

"Аксессуары",

"Аксессуары для Wax",

"КБД (cbd) / Мицелий",

"Гроу",

"Чайная Лавка",

"Благовония",

"Мерч Космо Бонг",

"Напасы"

];









function cleanDescription(
html:string
){

return html

.replace(/<[^>]*>/g," ")

.replace(/&nbsp;/g," ")

.replace(/\s+/g," ")

.toLowerCase();

}









function normalizeWord(
word:string
){

return word

.replace(
/[^a-zа-яё0-9]/gi,
""
)

.replace(
/(ом|ем|ами|ями|ов|ев|а|ы|и)$/i,
""
);

}









function Catalog(){



const [

searchParams

]=useSearchParams();



const navigate = useNavigate();





const search =

searchParams

.get("search")

?.toLowerCase()

.trim()

||

"";









const [

products,

setProducts

]=useState<Product[]>([]);





const [

categories,

setCategories

]=useState<Category[]>([]);





const [

filteredProducts,

setFilteredProducts

]=useState<Product[]>([]);





const [

loading,

setLoading

]=useState(true);


const [onlyDiscount, setOnlyDiscount] = useState(false);

const [sortBy, setSortBy] = useState<"none" | "price_asc" | "price_desc">("none");









useEffect(()=>{


async function load(){


try{


const [

productsData,

categoriesData

]=await Promise.all([


getProducts(),


getCategories()


]);
console.log("CATEGORIES DATA", categoriesData);




setProducts(
productsData
);





const mainCategories =

categoriesData.filter(

(cat:Category)=>

mainCategoryNames.includes(

cat["#text"]

)

);

console.log("ALL CATEGORIES", categoriesData);

console.log("MAIN CATEGORIES", mainCategories);



setCategories(

mainCategories

);



}

catch(error){


console.log(

"CATALOG ERROR",

error

);


}

finally{


setLoading(false);


}


}



load();



},[]);









useEffect(()=>{


if(!search){


setFilteredProducts(

products

);


return;


}







const stopWords=[

"с",
"и",
"для",
"на",
"по",
"от",
"из",
"в",
"у"

];







const searchWords =

search

.split(" ")

.map(word=>

normalizeWord(word)

)

.filter(word=>

word.length>1 &&

!stopWords.includes(word)

);








const result =

products.filter(product=>{


const name =

product.name

?.toLowerCase()

||

"";




const description =

product.description

?

cleanDescription(
product.description
)

:

"";




const fullText =

normalizeWord(

`${name} ${description}`

);



return searchWords.every(word=>

fullText.includes(word)

);


});




setFilteredProducts(

result

);



},[
search,
products
]);


let displayedProducts = filteredProducts;

if(onlyDiscount){

  displayedProducts = displayedProducts.filter(product =>

    product.oldPrice &&

    product.oldPrice > product.price

  );

}

if(sortBy === "price_asc"){

  displayedProducts = [...displayedProducts].sort((a, b) => a.price - b.price);

}
else if(sortBy === "price_desc"){

  displayedProducts = [...displayedProducts].sort((a, b) => b.price - a.price);

}









if(loading){


return(

<div

className="
p-5
text-white
"

>

Загрузка каталога...

</div>

);

}









return(


<div

className="
min-h-screen
bg-[#080808]
text-white
px-4
pt-[57px]
pb-28
"

>









{/* ЛИПКИЕ КАТЕГОРИИ */}


<div

className="
sticky
top-[57px]
z-30
bg-[#080808]
py-2
mb-3
"

>


<div

className="
flex
gap-2
overflow-x-auto
scrollbar-hide
"

>


{

categories.map(cat=>(


<button


key={
cat["@_id"]
}


onClick={()=>


navigate(

`/category/${cat["@_id"]}`

)

}


className="
flex-shrink-0
px-3
py-1.5
rounded-full
bg-[#151515]
border
border-[#58BB43]
text-xs
font-semibold
text-gray-300
transition
"

>


{cat["#text"]}


</button>


))


}



</div>


</div>









<h1

className="
text-2xl
font-bold
mb-4
"

>

{

search

?

`Поиск: ${search}`

:

"Каталог"

}


</h1>


{/* ФИЛЬТРЫ */}

<div

className="
flex
gap-2
mb-4
flex-wrap
"

>

<button

onClick={() => setOnlyDiscount(v => !v)}

className={`
flex-shrink-0
px-3
py-1.5
rounded-full
border
text-xs
font-semibold
transition
${
  onlyDiscount
  ? "bg-[#58BB43] border-[#58BB43] text-black"
  : "bg-[#151515] border-white/10 text-gray-300"
}
`}

>

🔥 Со скидкой

</button>

<button

onClick={() => setSortBy(sortBy === "price_asc" ? "none" : "price_asc")}

className={`
flex-shrink-0
px-3
py-1.5
rounded-full
border
text-xs
font-semibold
transition
${
  sortBy === "price_asc"
  ? "bg-[#58BB43] border-[#58BB43] text-black"
  : "bg-[#151515] border-white/10 text-gray-300"
}
`}

>

Цена ↑

</button>

<button

onClick={() => setSortBy(sortBy === "price_desc" ? "none" : "price_desc")}

className={`
flex-shrink-0
px-3
py-1.5
rounded-full
border
text-xs
font-semibold
transition
${
  sortBy === "price_desc"
  ? "bg-[#58BB43] border-[#58BB43] text-black"
  : "bg-[#151515] border-white/10 text-gray-300"
}
`}

>

Цена ↓

</button>

</div>









<div

className="
grid
grid-cols-2
gap-3
"

>


{

displayedProducts.map(product=>(


<ProductCard

key={product.id}

product={product}

/>


))


}



</div>









{

displayedProducts.length===0 && (


<div

className="
text-center
text-gray-400
mt-10
"

>

Ничего не найдено

</div>


)


}



</div>


);


}


export default Catalog;