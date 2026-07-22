type CategoryCardProps = {
  icon: string
  name: string
  count: string
}

function CategoryCard({
  icon,
  name,
  count,
}: CategoryCardProps) {
  return (
    <div
      className="
        bg-[#111113]
        rounded-3xl
        p-5
        border
        border-white/5
        hover:border-[#58BB43]
        transition-all
        cursor-pointer
      "
    >
      <div className="text-4xl">
        {icon}
      </div>

      <h3 className="mt-5 font-bold text-lg">
        {name}
      </h3>

      {count && (
        <p className="mt-2 text-gray-400">
          {count} товаров
        </p>
      )}
    </div>
  )
}

export default CategoryCard