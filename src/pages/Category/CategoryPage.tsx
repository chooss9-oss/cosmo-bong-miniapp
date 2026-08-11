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
  setCategoryScrollX,
  getSubcategoryScrollX,
  setSubcategoryScrollX
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









// Синхронно считает товары категории из кэша (если он уже есть),
// чтобы при возврате назад страница отрисовалась сразу, без ожидания сети.
function computeCachedCategoryProducts(
  categoryId: string | undefined
): Product[] {

  const cachedProducts = getCachedProducts();
  const cachedCategories = getCachedCategories();

  if (!cachedProducts || !cachedCategories || !categoryId) {
    return [];
  }

  const currentCategory = cachedCategories.find(
    (cat: Category) => String(cat["@_id"]) === String(categoryId)
  );

  if (!currentCategory) {
    return [];
  }

  const childIds = getChildCategoryIds(
    String(currentCategory["@_id"]),
    cachedCategories
  );

  const allowedIds = [String(currentCategory["@_id"]), ...childIds];

  return cachedProducts.filter((product: Product) =>
    product.categoryIds?.some(id => allowedIds.includes(String(id)))
  );

}


export default function CategoryPage(){



const {

categoryId

}=useParams();

const categoryScrollRef = useRef<HTMLDivElement>(null);
const subcategoryScrollRef = useRef<HTMLDivElement>(null);


const navigate =
useNavigate();





const [

products,

setProducts

]=useState<Product[]>(
  () => computeCachedCategoryProducts(categoryId)
);





const [

categories,

setCategories

]=useState<Category[]>(
  () => (getCachedCategories() ?? []).filter(
    (cat: Category) => mainCategoryNames.includes(cat["#text"])
  )
);





const [

category,

setCategory

]=useState<Category|null>(
  () => {
    const cachedCategories = getCachedCategories();
    if (!cachedCategories || !categoryId) return null;
    return (
      cachedCategories.find(
        (cat: Category) => String(cat["@_id"]) === String(categoryId)
      ) || null
    );
  }
);


// Полный (нефильтрованный) список категорий — нужен, чтобы находить
// подкатегории текущей категории (у них "@_parentId" === categoryId)
const [allCategoriesFull, setAllCategoriesFull] = useState<Category[]>(
  () => getCachedCategories() ?? []
);


const [activeSubcategoryId, setActiveSubcategoryId] = useState<string | null>(
  () => readStoredFilter(`categoryFilters:${categoryId}:subcategoryId`, null as string | null)
);





const [

loading,

setLoading

]=useState(
  () => getCachedProducts() === null
);


const [onlyDiscount, setOnlyDiscount] = useState(
  () => readStoredFilter(`categoryFilters:${categoryId}:onlyDiscount`, false)
);

const [sortBy, setSortBy] = useState<"none" | "price_asc" | "price_desc">(
  () => readStoredFilter(`categoryFilters:${categoryId}:sortBy`, "none" as "none" | "price_asc" | "price_desc")
);

useEffect(() => {
  writeStoredFilter(`categoryFilters:${categoryId}:onlyDiscount`, onlyDiscount);
}, [onlyDiscount, categoryId]);

useEffect(() => {
  writeStoredFilter(`categoryFilters:${categoryId}:sortBy`, sortBy);
}, [sortBy, categoryId]);

useEffect(() => {
  setActiveSubcategoryId(
    readStoredFilter(`categoryFilters:${categoryId}:subcategoryId`, null as string | null)
  );
}, [categoryId]);

useEffect(() => {
  writeStoredFilter(`categoryFilters:${categoryId}:subcategoryId`, activeSubcategoryId);
}, [activeSubcategoryId, categoryId]);

const isFirstFilterRender = useRef(true);

useEffect(() => {

  if (isFirstFilterRender.current) {
    isFirstFilterRender.current = false;
    return;
  }

  window.scrollTo(0, 0);

}, [sortBy, onlyDiscount, activeSubcategoryId]);







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



setAllCategoriesFull(

categoriesData

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


// Позиционируем горизонтальный скролл строк категорий/подкатегорий сразу
// после монтирования — компонент пересоздаётся на каждый переход (в товар
// и обратно, между категориями). Строку категорий НЕ восстанавливаем из
// общей памяти вслепую (она общая с Главной/Каталогом и могла быть
// проскроллена совсем в другом месте) — вместо этого прокручиваем так,
// чтобы была видна активная категория этой страницы. Подкатегории же
// хранятся отдельно по каждой категории, их восстанавливаем как обычно.
useEffect(() => {

  if (categoryScrollRef.current) {
    const activeChip = categoryScrollRef.current.querySelector<HTMLButtonElement>(
      `[data-category-id="${categoryId}"]`
    );
    if (activeChip) {
      const container = categoryScrollRef.current;
      const targetLeft = activeChip.offsetLeft - 12;
      container.scrollLeft = targetLeft > 0 ? targetLeft : 0;
      setCategoryScrollX(container.scrollLeft);
    } else {
      categoryScrollRef.current.scrollLeft = 0;
      setCategoryScrollX(0);
    }
  }

  if (subcategoryScrollRef.current) {
    subcategoryScrollRef.current.scrollLeft = getSubcategoryScrollX(categoryId);
  }

}, []);


const subcategories = allCategoriesFull.filter(
  cat => String(cat["@_parentId"]) === String(categoryId)
);

let displayedProducts = products.filter(product => product.inStock !== false);

if(activeSubcategoryId){

  const subChildIds = getChildCategoryIds(activeSubcategoryId, allCategoriesFull);
  const allowedSubIds = [activeSubcategoryId, ...subChildIds];

  displayedProducts = displayedProducts.filter(product =>
    product.categoryIds?.some(id => allowedSubIds.includes(String(id)))
  );

}

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
pt-[57px]
px-5
pb-5
"

>


{/* КАТЕГОРИИ КАК В КАТАЛОГЕ */}

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

    <button
      onClick={() => {
        setCategoryScrollX(0);
        navigate("/catalog");
      }}
      className="
      flex-shrink-0
      px-3
      py-1.5
      rounded-full
      border
      text-xs
      font-semibold
      transition
      bg-[#151515]
      border-[#58BB43]
      text-gray-300
      "
    >
      Все
    </button>

    {categories.map(cat => (

      <button
        key={cat["@_id"]}
        data-category-id={cat["@_id"]}
        onClick={() => {
          if(String(cat["@_id"]) === String(categoryId)){
            setCategoryScrollX(0);
            navigate("/catalog");
          } else {
            navigate(`/category/${cat["@_id"]}`);
          }
        }}
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
          String(cat["@_id"]) === String(categoryId)
          ? "bg-[#58BB43] border-[#58BB43] text-black"
          : "bg-[#151515] border-[#58BB43] text-gray-300"
        }
        `}
      >
        {cat["#text"]}
      </button>

    ))}

  </div>

</div>


{/* ПОДКАТЕГОРИИ ГОРИЗОНТАЛЬНЫМ СКРОЛОМ */}

{subcategories.length > 0 && (

<div
  className="
  sticky
  top-[94px]
  z-[25]
  bg-[#080808]
  py-1
  "
>

  <div
  ref={subcategoryScrollRef}
  onScroll={e => setSubcategoryScrollX(categoryId, e.currentTarget.scrollLeft)}
  className="
  flex
  gap-2
  overflow-x-auto
  scrollbar-hide
  "
>

    <button
      onClick={() => setActiveSubcategoryId(null)}
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
        activeSubcategoryId === null
        ? "bg-[#58BB43] border-[#58BB43] text-black"
        : "bg-[#151515] border-white/10 text-gray-300"
      }
      `}
    >
      Все
    </button>

    {subcategories.map(sub => (

      <button
        key={sub["@_id"]}
        onClick={() =>
          setActiveSubcategoryId(
            activeSubcategoryId === sub["@_id"] ? null : sub["@_id"]
          )
        }
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
          activeSubcategoryId === sub["@_id"]
          ? "bg-[#58BB43] border-[#58BB43] text-black"
          : "bg-[#151515] border-white/10 text-gray-300"
        }
        `}
      >
        {sub["#text"]}
      </button>

    ))}

  </div>

</div>

)}


{/* ЛИПКИЕ ФИЛЬТРЫ */}

<div

className="
sticky
z-20
bg-[#080808]
py-1
mb-3
"

style={{ top: subcategories.length > 0 ? "131px" : "94px" }}

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


{loading && (

<div

className="
text-gray-400
mt-10
text-center
"

>

Загрузка...

</div>

)}


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

!loading &&

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