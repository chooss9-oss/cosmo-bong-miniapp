import {
  useEffect,
  useState,
  useRef
} from "react";


import {
  useParams,
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

  inStock?:boolean;

  images?:string[];

  categoryIds?:string[];

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









export default function CategoryPage(){



const {

categoryId

}=useParams();

const categoryScrollRef = useRef<HTMLDivElement>(null);


const navigate =
useNavigate();





const [

products,

setProducts

]=useState<Product[]>([]);





const [

categories,

setCategories

]=useState<Category[]>([]);


const [

subcategories,

setSubcategories

]=useState<Category[]>([]);





const [

category,

setCategory

]=useState<Category|null>(null);





const [

loading,

setLoading

]=useState(true);


const [onlyDiscount, setOnlyDiscount] = useState(false);

const [sortBy, setSortBy] = useState<"none" | "price_asc" | "price_desc">("none");

useEffect(() => {
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








const currentCategory =

categoriesData.find(

(cat:Category)=>

String(cat["@_id"])

===

String(categoryId)

);







setCategory(

currentCategory || null

);



if(currentCategory){

  const directChildren =

    categoriesData.filter(

      (cat:Category)=>

      String(cat["@_parentId"])

      ===

      String(currentCategory["@_id"])

    );

  setSubcategories(directChildren);

}
else{

  setSubcategories([]);

}








if(!currentCategory){


setProducts([]);

return;


}








const childIds =

getChildCategoryIds(

String(currentCategory["@_id"]),

categoriesData

);







const allowedIds = [


String(currentCategory["@_id"]),


...childIds


];








const filtered =

productsData.filter(

(product:Product)=>

product.categoryIds?.some(

id=>

allowedIds.includes(

String(id)

)

)

);






setProducts(

filtered

);





}

catch(error){


console.log(

"CATEGORY ERROR",

error

);


}

finally{


setLoading(false);


}


}



load();



},[categoryId]);



useEffect(() => {

  window.scrollTo(0, 0);

  if (categoryScrollRef.current) {
    categoryScrollRef.current.scrollLeft = 0;
  }

}, [categoryId]);


let displayedProducts = products.filter(product => product.inStock !== false);

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


const hasSubcategories = subcategories.length > 0;

const filtersTopClass = hasSubcategories ? "top-[147px]" : "top-[102px]";




if(loading){


return(

<div

className="
p-5
text-white
"

>

Загрузка...

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
pb-5
"

>









<h1

className="
text-2xl
font-bold
mb-5
"

>

{

category

?

category["#text"]

:

"Категория"

}


</h1>









{/* КАТЕГОРИИ КАК В КАТАЛОГЕ */}

<div
  className="
  sticky
  top-[57px]
  z-30
  bg-[#080808]
  py-2
  "
>

  <div

  ref={categoryScrollRef}

  className="
  flex
  gap-2
  overflow-x-auto
  scrollbar-hide
  "
>

    {categories.map(cat => (

      <button
        key={cat["@_id"]}
        onClick={() =>
          navigate(`/category/${cat["@_id"]}`)
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

    ))}

  </div>

</div>


{/* ПОДКАТЕГОРИИ */}

{

hasSubcategories && (

<div

className="
sticky
top-[102px]
z-25
bg-[#080808]
py-2
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

subcategories.map(sub => (

<button

key={sub["@_id"]}

onClick={() => navigate(`/category/${sub["@_id"]}`)}

className="
flex-shrink-0
px-3
py-1.5
rounded-full
bg-[#151515]
border
border-white/10
text-xs
font-semibold
text-gray-300
transition
"

>

{sub["#text"]}

</button>

))

}

</div>

</div>

)

}


{/* ЛИПКИЕ ФИЛЬТРЫ */}

<div

className={`
sticky
${filtersTopClass}
z-20
bg-[#080808]
py-2
mb-3
`}

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

</div>









<div

className="
grid
grid-cols-2
gap-4
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

В этой категории пока нет товаров


</div>



)


}









</div>



);


}