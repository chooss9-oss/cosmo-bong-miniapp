import { useNavigate } from "react-router-dom";


type Product = {

  id: string;

  name: string;

  price: number;

  images?: string[];

};



type Props = {

  product: Product;

};




function ProductCard({
  product
}: Props) {


  const navigate =
    useNavigate();



  const image =
    product.images &&
    product.images.length > 0
      ? product.images[0]
      : "";




  return (


    <div

      onClick={() =>
        navigate(
          `/product/${product.id}`
        )
      }


      className="
      bg-[#111113]
      rounded-3xl
      p-4
      cursor-pointer
      border
      border-white/5
      hover:border-[#58BB43]
      transition
      "

    >



      <div
        className="
        h-40
        flex
        items-center
        justify-center
        "

      >


        {
          image && (

            <img

              src={image}

              alt={product.name}

              className="
              max-h-36
              object-contain
              "

            />

          )

        }


      </div>




      <h3

        className="
        mt-3
        text-sm
        font-bold
        "

      >

        {product.name}

      </h3>




      <p

        className="
        mt-2
        text-[#58BB43]
        font-bold
        "

      >

        {product.price.toLocaleString()}
        {" "}
        ₽


      </p>



    </div>


  );


}



export default ProductCard;