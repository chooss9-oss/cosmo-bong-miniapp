import {
  useEffect,
  useState
} from "react";

import {
  useParams,
  useNavigate
} from "react-router-dom";

import {
  useCart
} from "../../context/CartContext";

import {
  useFavorites
} from "../../context/FavoritesContext";

import {
  getCachedProductPreview,
  getProduct,
  getCachedProducts,
  getProducts,
  getCachedCategories,
  getCategories
} from "../../api/storelandApi";

import FadeImage from "../../components/FadeImage";
import ProductCard from "../../components/ProductCard";

import { cleanProductName } from "../../utils/productName";
import { pickCrossSellProducts, resolveMainCategoryId } from "../../utils/crossSell";
import { writeStoredFilter } from "../../utils/filterStorage";

interface Variant {

  id:string;

  name:string;

  price:number;

  image:string;

  available:boolean;

}



interface Product {

  id:string;

  name:string;

  price:number;

  oldPrice?:number;

  discount?:number;

  image?:string;

  images?:string[];

  description?:string;

  variants?:Variant[];

  categoryIds?:string[];

}


interface CrossSellProduct {
  id: string;
  name: string;
  price: number;
  oldPrice?: number;
  discount?: number;
  images?: string[];
  categoryIds?: string[];
  inStock?: boolean;
}


interface Category {
  "@_id": string;
  "@_parentId"?: string;
  "#text": string;
}






export default function ProductPage(){


  const {
    productId
  } = useParams();

  const navigate = useNavigate();



  



  const {
    addToCart
  } = useCart();

  const {
    isFavorite,
    toggleFavorite
  } = useFavorites();


  const [
    loading,
    setLoading
  ] = useState(
    () => !getCachedProductPreview(productId ?? "")
  );



  const [
    product,
    setProduct
  ] = useState<Product | null>(
    () => getCachedProductPreview(productId ?? "")
  );



  const [
    selectedVariant,
    setSelectedVariant
  ] = useState<Variant | null>(null);



  const [
    currentImage,
    setCurrentImage
  ] = useState(0);


  const [
    crossSell,
    setCrossSell
  ] = useState<CrossSellProduct[]>([]);


  const [
    categories,
    setCategories
  ] = useState<Category[]>(
    () => getCachedCategories() ?? []
  );










  useEffect(()=>{


    if(!productId)
      return;


    getProduct(productId)


    .then(data=>{


      setProduct(data);



      if(data.variants?.length){

        setSelectedVariant(
          data.variants[0]
        );

      }


    })



    .catch(error=>{


      console.log(
        "PRODUCT ERROR",
        error
      );


    })



    .finally(()=>{


      setLoading(false);


    });


  },[productId]);


  // "С этим товаром покупают" — считаем, как только знаем id товара и его
  // категории (после загрузки полных данных товара)
  useEffect(()=>{

    if(!product?.id || !product.categoryIds){
      setCrossSell([]);
      return;
    }

    let cancelled = false;

    async function loadCrossSell(){

      const cached = getCachedProducts();
      const allProducts = cached ?? await getProducts().catch(()=>[]);

      if(cancelled) return;

      const picked = pickCrossSellProducts(
        allProducts as CrossSellProduct[],
        product!.id,
        product!.categoryIds,
        8
      );

      setCrossSell(picked as CrossSellProduct[]);

    }

    loadCrossSell();

    return ()=>{ cancelled = true; };

  },[product?.id, product?.categoryIds]);


  // Категории нужны только чтобы построить "хлебную крошку" — подгружаем
  // один раз, кэш переживает переходы между товарами.
  useEffect(()=>{

    if(categories.length > 0) return;

    getCategories()
      .then(data => setCategories(data))
      .catch(()=>{});

  },[]);


  // Путь товара: главная категория -> подкатегория (если есть), для
  // "хлебной крошки" сверху карточки товара
  const mainCategoryId = resolveMainCategoryId(product?.categoryIds);

  const mainCategory = mainCategoryId
    ? categories.find(c => String(c["@_id"]) === String(mainCategoryId))
    : null;

  const subCategory = mainCategoryId && product?.categoryIds
    ? categories.find(c =>
        String(c["@_parentId"]) === String(mainCategoryId) &&
        product.categoryIds!.some(id => String(id) === String(c["@_id"]))
      )
    : null;


  function goToMainCategory(){
    if(!mainCategory) return;
    navigate(`/category/${mainCategory["@_id"]}`);
  }


  function goToSubCategory(){
    if(!mainCategory || !subCategory) return;
    writeStoredFilter(
      `categoryFilters:${mainCategory["@_id"]}:subcategoryId`,
      subCategory["@_id"]
    );
    navigate(`/category/${mainCategory["@_id"]}`);
  }









  if(loading){


    return(

      <div className="
      min-h-screen
      bg-[#080808]
      text-white
      pt-[57px]
      px-6
      "
      >

        Загрузка...

      </div>

    );


  }








  if(!product){


    return(

      <div className="
      min-h-screen
      bg-[#080808]
      text-white
      pt-[57px]
      px-6
      "
      >

        Товар не найден

      </div>

    );


  }








  const images =

    product.images?.length

    ?

    product.images

    :

    product.image

    ?

    [product.image]

    :

    [];








  const image =

    selectedVariant?.image

    ||

    images[currentImage]

    ||

    "/logo.png";








  const price =

    selectedVariant?.price

    ||

    product.price;









  function vibrate(){


    const tg =
      (window as any)
      .Telegram
      ?.WebApp;



    tg?.HapticFeedback
    ?.notificationOccurred(
      "success"
    );


  }









  function addProduct(){


    if(!product)
      return;



    addToCart({


      id:String(product.id),


      name:cleanProductName(product.name),


      price,


      images


    });



    vibrate();


  }









  return(



    <div

      className="
      min-h-screen
      bg-[#080808]
      text-white
      px-4
      pt-[57px]
      pb-40
      "

    >







   









      {/* ХЛЕБНАЯ КРОШКА: категория -> подкатегория товара — липкая, сразу под строкой поиска */}

      {
        mainCategory && (

          <div
            className="
            sticky
            top-[57px]
            z-30
            bg-[#080808]
            flex
            items-center
            flex-wrap
            gap-1
            text-xs
            py-2
            mb-1
            "
          >

            <button
              onClick={goToMainCategory}
              className={`
              font-bold
              ${subCategory ? "text-gray-400" : "text-[#58BB43]"}
              `}
            >
              {mainCategory["#text"]}
            </button>

            {
              subCategory && (
                <>
                  <span className="text-gray-600">›</span>
                  <button
                    onClick={goToSubCategory}
                    className="font-bold text-[#58BB43]"
                  >
                    {subCategory["#text"]}
                  </button>
                </>
              )
            }

          </div>

        )
      }


      {/* PRODUCT */}



      <div

        className="
        relative
        bg-[#151515]
        rounded-3xl
        border
        border-white/10
        overflow-hidden
        "

      >

        <button

          onClick={() => productId && toggleFavorite(productId)}

          className="
          absolute
          top-3
          right-3
          z-10
          w-11
          h-11
          flex
          items-center
          justify-center
          "

        >

          <img

            src="/nav-icons/favorites.png"

            alt=""

            decoding="sync"

            className={`
            w-11
            h-11
            object-contain
            ${
              productId && isFavorite(productId)
              ? "[filter:drop-shadow(0_0_2px_#E53935)_drop-shadow(0_0_2px_#E53935)_drop-shadow(0_1px_3px_rgba(0,0,0,0.7))] opacity-100"
              : "[filter:drop-shadow(0_0_2px_#58BB43)_drop-shadow(0_0_2px_#58BB43)_drop-shadow(0_1px_3px_rgba(0,0,0,0.7))] opacity-50 grayscale"
            }
            `}

          />

        </button>






        <div

          className="
          h-72
          flex
          items-center
          justify-center
          "

        >


          <FadeImage

            key={image}

            src={image}

            alt={product.name}

            className="
            max-h-64
            object-contain
            "

          />


        </div>









        {
          images.length > 1 &&


          (

          <div

            className="
            flex
            justify-center
            gap-2
            pb-4
            "

          >

            {
              images.map((_,index)=>(


                <button

                  key={index}

                  onClick={()=>setCurrentImage(index)}

                  className={

                  `
                  w-2
                  h-2
                  rounded-full

                  ${
                    currentImage===index

                    ?

                    "bg-[#58BB43]"

                    :

                    "bg-white/30"

                  }

                  `

                  }

                />


              ))

            }


          </div>


          )

        }









        <div className="p-4">







          <h1

            className="
            text-lg
            font-bold
            leading-snug
            "

          >

            {cleanProductName(product.name)}


          </h1>









          {
            product.oldPrice &&
            product.oldPrice > price &&
            (
              <div

                className="
                text-gray-500
                text-sm
                line-through
                mt-3
                "

              >

                {product.oldPrice.toLocaleString("ru-RU")} ₽

              </div>

            )
          }


          <div

            className="
            text-[#58BB43]
            text-2xl
            font-bold
            mt-1
            "

          >

            {price.toLocaleString("ru-RU")} ₽


          </div>









          <div className="
          mt-6
          "
          >

          {
            product.variants &&
            product.variants.length > 1 &&


            (

            <div className="fade-in-fast">

            <h2 className="
            font-bold
            mb-3
            "
            >

              Выберите вариант

            </h2>


            <div className="space-y-3">


            {
              product.variants.map(v=>(


                <button

                key={v.id}

                onClick={()=>setSelectedVariant(v)}

                className={

                `
                w-full
                text-left
                p-3
                rounded-xl
                border

                ${
                  selectedVariant?.id===v.id

                  ?

                  "border-[#58BB43] bg-[#202020]"

                  :

                  "border-white/10 bg-[#111]"

                }

                `

                }

                >


                <div className="font-bold text-sm">

                  {v.name}

                </div>


                <div className="text-[#58BB43]">

                  {v.price.toLocaleString()} ₽

                </div>


                </button>


              ))

            }


            </div>


            </div>

            )

          }

          </div>









          {
            product.description &&


            (

            <div

              className="
              mt-6
              text-sm
              leading-relaxed
              product-description
              fade-in-fast
              "
              dangerouslySetInnerHTML={{

                __html:
                product.description

              }}

            />

            )

          }

        </div>

      </div>

      {
        crossSell.length > 0 && (

          <div className="mt-6">

            <h2 className="text-lg font-bold mb-3">
              С этим товаром покупают
            </h2>

            <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">

              {
                crossSell.map(item=>(

                  <div key={item.id} className="w-36 flex-shrink-0">
                    <ProductCard product={item} />
                  </div>

                ))
              }

            </div>

          </div>

        )
      }

      {/* ПРИЛИПШАЯ КНОПКА "В КОРЗИНУ" — всегда доступна, не нужно листать
      длинное описание, чтобы её найти */}

      <div
        className="
        fixed
        bottom-20
        left-0
        right-0
        z-40
        bg-[#080808]/95
        backdrop-blur
        border-t
        border-white/10
        px-4
        py-3
        "
      >

        <button

          onClick={addProduct}

          className="
          w-full
          bg-[#58BB43]
          text-black
          font-bold
          py-3
          rounded-xl
          text-base
          "

        >

          Добавить в корзину

        </button>

      </div>

    </div>

  );

}