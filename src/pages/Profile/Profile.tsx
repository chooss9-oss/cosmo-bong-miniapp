function Profile() {

  return (
    <div className="px-5 pt-[80px] pb-24">

      <div className="flex items-center gap-3">

        <img
          src="/nav-icons/profile.png"
          alt=""
          className="w-14 h-14 object-contain"
        />

        <h1 className="text-3xl font-bold">
          Профиль
        </h1>

      </div>


      <p className="mt-4 text-gray-400">
        Личный кабинет Cosmo Bong
      </p>



      <div
        className="
          mt-6
          bg-[#111113]
          rounded-3xl
          p-6
          border
          border-white/5
        "
      >

        <h2 className="text-xl font-bold flex items-center gap-2">
          <img src="/nav-icons/profile.png" alt="" className="w-6 h-6 object-contain" />
          Ваш аккаунт
        </h2>


        <p className="mt-3 text-gray-400">
          История заказов, бонусы и настройки
        </p>


      </div>


    </div>
  )
}


export default Profile