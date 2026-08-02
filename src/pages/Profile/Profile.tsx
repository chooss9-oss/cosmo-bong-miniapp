import { useEffect, useState } from "react";
import { getTelegramUser } from "../../utils/telegram";

interface OrderItem {
  name: string;
  quantity: number;
  price: number;
}

interface Order {
  id: string;
  total: number;
  items: OrderItem[];
  status: string;
  statusLabel: string;
  statusEmoji: string;
  createdAt: number;
  trackingNumber?: string;
}

function Profile() {

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {

    const telegramUserId = getTelegramUser()?.id;

    if (!telegramUserId) {
      setLoading(false);
      return;
    }

    fetch(`/api/my-orders?telegramUserId=${telegramUserId}`)
      .then(res => res.json())
      .then(data => setOrders(Array.isArray(data) ? data : []))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));

  }, []);

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
          Ваши заказы
        </h2>


        {
          loading && (
            <p className="mt-3 text-gray-400">
              Загрузка...
            </p>
          )
        }


        {
          !loading && orders.length === 0 && (
            <p className="mt-3 text-gray-400">
              Пока заказов нет — оформленные заказы будут появляться здесь.
            </p>
          )
        }


        {
          !loading && orders.length > 0 && (

            <div className="mt-4 space-y-3">

              {
                orders.map(order => (

                  <div
                    key={order.id}
                    className="
                      bg-[#080808]
                      rounded-2xl
                      p-4
                      border
                      border-white/5
                    "
                  >

                    <div className="flex items-center justify-between">

                      <span className="text-xs text-gray-500">
                        {new Date(order.createdAt).toLocaleDateString("ru-RU")}
                      </span>

                      <span
                        className="
                          text-xs
                          font-bold
                          bg-white/10
                          text-[#58BB43]
                          px-2
                          py-1
                          rounded-full
                          flex
                          items-center
                          gap-1
                        "
                      >
                        {order.statusEmoji} {order.statusLabel}
                      </span>

                    </div>


                    <div className="mt-2 text-sm text-gray-300">
                      {
                        order.items.map((item, index) => (
                          <div key={index} className="truncate">
                            {item.name} × {item.quantity}
                          </div>
                        ))
                      }
                    </div>


                    <div className="mt-2 text-[#58BB43] font-bold">
                      {order.total.toLocaleString("ru-RU")} ₽
                    </div>


                    {
                      order.trackingNumber && (
                        <div className="mt-2 text-xs text-gray-400">
                          Трек-номер: <span className="text-white">{order.trackingNumber}</span>
                        </div>
                      )
                    }

                  </div>

                ))
              }

            </div>

          )
        }


      </div>


    </div>
  )
}


export default Profile
