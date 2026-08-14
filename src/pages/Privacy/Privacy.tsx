import { useNavigate } from "react-router-dom";


function Privacy(){

  const navigate = useNavigate();

  return(

    <div className="min-h-screen bg-[#080808] pt-[57px] px-5 pb-10 text-white">

      <button
        onClick={() => navigate(-1)}
        className="text-sm text-gray-400 mb-4"
      >
        ← Назад
      </button>

      <h1 className="text-2xl font-bold mb-6">
        Обработка персональных данных
      </h1>

      <section className="mb-10">

        <h2 className="text-lg font-bold text-[#58BB43] mb-3">
          Согласие на обработку персональных данных
        </h2>

        <p className="text-sm text-gray-300 leading-relaxed mb-3">
          Настоящим свободно, своей волей и в своём интересе, оформляя заказ,
          оставляя отзыв, включая бота или другим образом используя
          мини-приложение «Cosmo Bong» в Telegram, я даю согласие
          индивидуальному предпринимателю Воронцову Артёму Константиновичу
          (ОГРНИП: 321762700045487, ИНН: 290409139692), находящемуся по
          адресу: Россия, г. Ярославль, переулок Герцена д. 6 к. 2, кв. 60
          (далее — Оператор), на обработку своих персональных данных.
          Предоставление персональных данных является добровольным. Отказ от
          предоставления данных может привести к невозможности оформить
          заказ или воспользоваться отдельными функциями приложения.
        </p>

        <p className="text-sm text-gray-300 leading-relaxed mb-2 font-semibold">
          Перечень персональных данных:
        </p>

        <ul className="text-sm text-gray-300 leading-relaxed list-disc pl-5 mb-3 space-y-1">
          <li>имя и/или username, указанные в Telegram или введённые при оформлении заказа;</li>
          <li>номер телефона (если указан);</li>
          <li>идентификатор пользователя Telegram (Telegram ID);</li>
          <li>содержимое заказа: список товаров, количество, сумма, комментарий к заказу;</li>
          <li>переписка с ботом Оператора в рамках оформления и сопровождения заказа;</li>
          <li>техническая информация, предоставляемая платформой Telegram Mini Apps (язык интерфейса, тип устройства, версия клиента);</li>
          <li>данные о накопленных/списанных бонусных баллах и истории заказов.</li>
        </ul>

        <p className="text-sm text-gray-300 leading-relaxed mb-2 font-semibold">
          Цели обработки:
        </p>

        <ul className="text-sm text-gray-300 leading-relaxed list-disc pl-5 mb-3 space-y-1">
          <li>оформление, обработка и доставка заказа, связь с покупателем по вопросам заказа;</li>
          <li>ведение истории заказов и программы бонусных баллов в приложении;</li>
          <li>обеспечение работы и улучшение приложения;</li>
          <li>информирование о статусе заказа и, при отдельном согласии, о новостях и акциях магазина через бота Telegram.</li>
        </ul>

        <p className="text-sm text-gray-300 leading-relaxed mb-3">
          Способы обработки: автоматизированный и неавтоматизированный, с
          передачей по сети Интернет через инфраструктуру Telegram и серверы
          Оператора.
        </p>

        <p className="text-sm text-gray-300 leading-relaxed mb-2 font-semibold">
          Передача третьим лицам:
        </p>

        <p className="text-sm text-gray-300 leading-relaxed mb-3">
          Мои персональные данные могут передаваться следующим категориям
          получателей:
        </p>

        <ul className="text-sm text-gray-300 leading-relaxed list-disc pl-5 mb-3 space-y-1">
          <li>транспортным компаниям (СДЭК, Почта России) — для доставки заказов;</li>
          <li>платформе Telegram — в объёме, необходимом для работы мини-приложения и бота (согласно условиям использования и политике конфиденциальности Telegram).</li>
        </ul>

        <p className="text-sm text-gray-300 leading-relaxed mb-3">
          Срок действия согласия: до отзыва мной согласия, но не более 3
          (трёх) лет с момента последнего обращения.
        </p>

        <p className="text-sm text-gray-300 leading-relaxed mb-3">
          Я имею право отозвать настоящее согласие в любой момент, направив
          сообщение на адрес: <span className="text-white">yar-bong@mail.ru</span>{" "}
          или написав об этом боту Оператора.
        </p>

        <p className="text-sm text-gray-300 leading-relaxed">
          Оператор вправе продолжить обработку данных без моего согласия,
          если это предусмотрено законом (ст. 6, 10, 11 ФЗ-152 от
          27.07.2006).
        </p>

      </section>

      <section>

        <h2 className="text-lg font-bold text-[#58BB43] mb-3">
          Политика конфиденциальности и обработки персональных данных
        </h2>

        <p className="text-sm text-gray-300 leading-relaxed mb-3">
          Настоящая Политика определяет порядок обработки персональных данных
          пользователей мини-приложения «Cosmo Bong» в Telegram.
        </p>

        <p className="text-sm text-gray-300 leading-relaxed mb-1 font-semibold">
          1. Оператор
        </p>
        <p className="text-sm text-gray-300 leading-relaxed mb-3">
          Индивидуальный предприниматель Воронцов Артём Константинович
          (ОГРНИП: 321762700045487, ИНН: 290409139692), адрес: Россия,
          г. Ярославль, переулок Герцена д. 6 к. 2, кв. 60.
        </p>

        <p className="text-sm text-gray-300 leading-relaxed mb-1 font-semibold">
          2. Цели обработки
        </p>
        <ul className="text-sm text-gray-300 leading-relaxed list-disc pl-5 mb-3 space-y-1">
          <li>оформление и обработка заказов, связь с покупателем;</li>
          <li>обеспечение работы приложения и программы бонусных баллов;</li>
          <li>отправка информационных и рекламных сообщений (только с отдельного согласия).</li>
        </ul>

        <p className="text-sm text-gray-300 leading-relaxed mb-1 font-semibold">
          3. Перечень обрабатываемых данных
        </p>
        <p className="text-sm text-gray-300 leading-relaxed mb-3">
          Имя/username, телефон, Telegram ID, состав и история заказов,
          переписка с ботом, техническая информация, предоставляемая
          Telegram.
        </p>

        <p className="text-sm text-gray-300 leading-relaxed mb-1 font-semibold">
          4. Срок хранения данных
        </p>
        <p className="text-sm text-gray-300 leading-relaxed mb-3">
          Не более 3 лет с момента последнего взаимодействия пользователя с
          приложением или Оператором.
        </p>

        <p className="text-sm text-gray-300 leading-relaxed mb-1 font-semibold">
          5. Передача третьим лицам
        </p>
        <p className="text-sm text-gray-300 leading-relaxed mb-3">
          Данные передаются транспортным компаниям для доставки заказов, а
          также обрабатываются с использованием инфраструктуры платформы
          Telegram, через которую работает приложение.
        </p>

        <p className="text-sm text-gray-300 leading-relaxed mb-1 font-semibold">
          6. Трансграничная передача данных
        </p>
        <p className="text-sm text-gray-300 leading-relaxed mb-3">
          Оператор самостоятельно не осуществляет трансграничную передачу
          данных. Приложение работает на платформе Telegram, серверная
          инфраструктура которой может располагаться за пределами РФ —
          подробнее см. политику конфиденциальности Telegram.
        </p>

        <p className="text-sm text-gray-300 leading-relaxed mb-1 font-semibold">
          7. Хранение данных приложения на устройстве
        </p>
        <p className="text-sm text-gray-300 leading-relaxed mb-3">
          Приложение сохраняет на устройстве пользователя (в локальном
          хранилище) техническую информацию, необходимую для его работы:
          содержимое корзины, применённый промокод, настройки отображения.
          Эти данные не передаются третьим лицам и используются только для
          удобства работы приложения.
        </p>

        <p className="text-sm text-gray-300 leading-relaxed mb-1 font-semibold">
          8. Уничтожение данных
        </p>
        <p className="text-sm text-gray-300 leading-relaxed mb-3">
          Осуществляется путём полного удаления из информационных систем
          Оператора или обезличивания, исключающего возможность определения
          принадлежности данных конкретному субъекту.
        </p>

        <p className="text-sm text-gray-300 leading-relaxed mb-1 font-semibold">
          9. Права субъекта персональных данных
        </p>
        <ul className="text-sm text-gray-300 leading-relaxed list-disc pl-5 mb-3 space-y-1">
          <li>получать подтверждение об обработке ваших данных и сведения о них;</li>
          <li>требовать уточнения, блокирования или уничтожения неточных/незаконно обработанных данных;</li>
          <li>отзывать согласие на обработку;</li>
          <li>обжаловать действия Оператора в Роскомнадзоре или в суде.</li>
        </ul>

        <p className="text-sm text-gray-300 leading-relaxed mb-1 font-semibold">
          10. Контакты для реализации прав
        </p>
        <p className="text-sm text-gray-300 leading-relaxed mb-3">
          Email: yar-bong@mail.ru, либо сообщение боту Оператора в Telegram.
        </p>

        <p className="text-sm text-gray-300 leading-relaxed mb-1 font-semibold">
          11. Изменения в политике
        </p>
        <p className="text-sm text-gray-300 leading-relaxed">
          Оператор вправе вносить изменения в настоящую Политику. Актуальная
          версия всегда доступна в приложении на этой странице. Последнее
          обновление: {new Date().toLocaleDateString("ru-RU")}.
        </p>

      </section>

    </div>

  );

}


export default Privacy;
