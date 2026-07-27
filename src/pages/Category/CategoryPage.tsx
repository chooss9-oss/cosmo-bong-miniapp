import {
  useEffect,
  useState
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

category,

setCategory

]=useState<Category|null>(null);





const [

loading,

setLoading

]=useState(true);









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

}, [categoryId]);





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









<div

className="
grid
grid-cols-2
gap-4
"

>


{

products.map(product=>(



<ProductCard

key={product.id}

product={product}

/>



))


}


</div>









{

products.length===0 && (



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