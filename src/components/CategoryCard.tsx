import { useNavigate } from "react-router-dom"


type CategoryCardProps = {
  image: string
  name: string
  count: string
}



function CategoryCard({

  image,
  name,
  count,

}: CategoryCardProps) {


  const navigate = useNavigate()



  return (

    <div

      onClick={() =>
        navigate(
          `/category/${name}`
        )
      }

      className="
        bg-[#111113]
        rounded-3xl
        p-4
        border
        border-white/5
        hover:border-[#58BB43]
        transition
        cursor-pointer
      "

    >


      <div
        className="
          h-24
          flex
          items-center
          justify-center
        "
      >

        <img

          src={image}

          alt={name}

          className="
            w-16
            h-16
            object-contain
            invert
          "

        />

      </div>



      <h3
        className="
          mt-3
          font-bold
          text-sm
        "
      >

        {name}

      </h3>




      {count && (

        <p
          className="
            mt-2
            text-gray-400
            text-xs
          "
        >

          {count} товаров

        </p>

      )}



    </div>

  )

}


export default CategoryCard