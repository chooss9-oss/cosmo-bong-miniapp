import {
  useEffect,
  useState,
  useRef
} from "react";


import {
  useSearchParams,
  useNavigate
} from "react-router-dom";


import ProductCard from "../../components/ProductCard";


import {
  getProducts,
  getCategories,
  getCachedProducts,
  getCachedCategories
} from "../../api/storelandApi";

import {
  readStoredFilter,
  writeStoredFilter
} from "../../utils/filterStorage";

import {
  getCategoryScrollX,
  setCategoryScrollX
} from "../../utils/categoryScrollMemory";





type Product = {

  id:string;

  name:string;

  price:number;

  oldPrice?:number;

  discount?:number;

  inStock?:boolean;

  images?:string[];

  categoryIds?:string[];

  description?:string;

  descriptionText?:string;

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

let result =

word

.replace(
/[^a-zа-яё0-9]/gi,
""
)

.toLowerCase();


// Лёгкий стеммер: последовательно срезаем типичные окончания русских
// существительных/прилагательных (падежи, число), чтобы разные формы
// одного слова ("чаша", "чаши", "чашу", "чашами") находили друг друга.
// Останавливаемся, если слово становится слишком коротким — так не
// ломаем короткие слова вроде "лёд", "гель".
const endings = [
  "иями","ями","ами","ами",
  "ого","его","ому","ему",
  "ыми","ими",
  "ах","ях",
  "ов","ев","ей",
  "ом","ем",
  "ый","ий","ая","яя","ое","ее",
  "ы","и","а","я","у","ю","е","о","й","ь"
];

for(const ending of endings){

  if(
    result.length - ending.length >= 3 &&
    result.endsWith(ending)
  ){
    result = result.slice(0, result.length - ending.length);
    break;
  }

}


return result;

}




// Расстояние Левенштейна — чтобы находить товары даже с опечаткой
// в поисковом запросе (например "прекулет" вместо "прекулер").
function levenshtein(
a:string,
b:string
){

const m = a.length;
const n = b.length;

if(m === 0) return n;
if(n === 0) return m;

let prevRow = new Array(n + 1);
let currRow = new Array(n + 1);

for(let j = 0; j <= n; j++){
  prevRow[j] = j;
}

for(let i = 1; i <= m; i++){

  currRow[0] = i;

  for(let j = 1; j <= n; j++){

    const cost = a[i - 1] === b[j - 1] ? 0 : 1;

    currRow[j] = Math.min(
      currRow[j - 1] + 1,
      prevRow[j] + 1,
      prevRow[j - 1] + cost
    );

  }

  [prevRow, currRow] = [currRow, prevRow];

}

return prevRow[n];

}




// Ищем слово по подстроке, а если не нашли — допускаем небольшую опечатку
// (порог зависит от длины слова, чтобы не ловить случайные совпадения).
function wordMatchesText(
searchWord:string,
fullText:string,
textTokens:string[]
){

if(fullText.includes(searchWord)){
  return true;
}

const maxDistance =
  searchWord.length <= 4
  ? 1
  : searchWord.length <= 8
  ? 2
  : 3;

return textTokens.some(token=>{

  if(Math.abs(token.length - searchWord.length) > maxDistance){
    return false;
  }

  return levenshtein(searchWord, token) <= maxDistance;

});

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

]=useState<Product[]>(
  () => getCachedProducts() ?? []
);





const [

categories,

setCategories

]=useState<Category[]>(
  () => getCachedCategories() ?? []
);





const [

filteredProducts,

setFilteredProducts

]=useState<Product[]>(
  () => getCachedProducts() ?? []
);





const [

loading,

setLoading

]=useState(
  () => getCachedProducts() === null
);


// Названия ВСЕХ категорий/подкатегорий (не только основных, которые
// показаны чипами) — чтобы поиск находил товары по названию подкатегории,
// например "с перколятором" или "со льдом", даже если этих слов нет в
// названии/описании конкретного товара.
const [categoryNameById, setCategoryNameById] = useState<Record<string,string>>({});

const [onlyDiscount, setOnlyDiscount] = useState(
  () => readStoredFilter("catalogFilters:onlyDiscount", false)
);

const [sortBy, setSortBy] = useState<"none" | "price_asc" | "price_desc">(
  () => readStoredFilter("catalogFilters:sortBy", "none" as "none" | "price_asc" | "price_desc")
);

useEffect(() => {
  writeStoredFilter("catalogFilters:onlyDiscount", onlyDiscount);
}, [onlyDiscount]);

useEffect(() => {
  writeStoredFilter("catalogFilters:sortBy", sortBy);
}, [sortBy]);

const categoryScrollRef = useRef<HTMLDivElement>(null);

// Восстанавливаем горизонтальный скролл строки категорий сразу после
// монтирования — та же лента, что и на странице категории, позиция
// хранится в общем модуле src/utils/categoryScrollMemory.ts, т.к.
// AnimatedRoutes пересоздаёт страницу заново при каждом переходе.
useEffect(() => {
  if (categoryScrollRef.current) {
    categoryScrollRef.current.scrollLeft = getCategoryScrollX();
  }
}, []);

const isFirstFilterRender = useRef(true);

useEffect(() => {

  if (isFirstFilterRender.current) {
    isFirstFilterRender.current = false;
    return;
  }

  window.scrollTo(0, 0);

}, [sortBy, onlyDiscount]);







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



setCategories(

mainCategories

);



const nameById:Record<string,string> = {};

categoriesData.forEach((cat:Category)=>{
  nameById[cat["@_id"]] = cat["#text"] || "";
});

setCategoryNameById(nameById);



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
"со",
"и",
"для",
"на",
"по",
"от",
"из",
"изо",
"в",
"во",
"у",
"о",
"об",
"обо",
"до",
"за",
"под",
"подо",
"над",
"надо",
"при",
"через",
"между",
"без",
"безо",
"ко",
"как",
"что",
"это",
"эта",
"этот",
"эти",
"или",
"либо",
"то",
"же",
"ли",
"не",
"ну",
"вот",
"весь",
"вся",
"все",
"всё"

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

product.descriptionText

?.toLowerCase()

||

"";




const categoryNames =

(product.categoryIds || [])

.map(id=>categoryNameById[id] || "")

.join(" ")

.toLowerCase();



const searchableText =

`${name} ${description} ${categoryNames}`;



const fullText =

normalizeWord(

searchableText

);



const textTokens =

searchableText

.split(/\s+/)

.map(token=>normalizeWord(token))

.filter(token=>token.length>1);



return searchWords.every(word=>

wordMatchesText(word, fullText, textTokens)

);


});




setFilteredProducts(

result

);



},[
search,
products,
categoryNameById
]);


let displayedProducts = filteredProducts.filter(product => product.inStock !== false);

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
py-1
"

>


<div

ref={categoryScrollRef}

onScroll={e => setCategoryScrollX(e.currentTarget.scrollLeft)}

className="
flex
gap-2
overflow-x-auto
scrollbar-hide
"

>


{

<button

key="all"

onClick={() => {
  setCategoryScrollX(0);
  if(categoryScrollRef.current){
    categoryScrollRef.current.scrollLeft = 0;
  }
}}

className="
flex-shrink-0
px-3
py-1.5
rounded-full
bg-[#58BB43]
border
border-[#58BB43]
text-xs
font-semibold
text-black
transition
"

>

Все

</button>

}


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


{/* ЛИПКИЕ ФИЛЬТРЫ */}

<div

className="
sticky
top-[94px]
z-20
bg-[#080808]
py-1
mb-3
"

>

<div

className="
flex
gap-2
flex-wrap
"

>

<button

onClick={() => setOnlyDiscount(v => !v)}

className={`
flex-shrink-0
flex
items-center
gap-1
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

<img src="/nav-icons/promotions.png" alt="" className="w-4 h-4 object-contain" />
Со скидкой

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


{loading && (

<div

className="
text-gray-400
mt-10
text-center
"

>

Загрузка каталога...

</div>

)}









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

!loading &&

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