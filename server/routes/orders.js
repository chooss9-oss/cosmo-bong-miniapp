const express = require("express");
const axios = require("axios");

const { saveReplyMapping, telegramApi } = require("../replyMapping");
const { createOrder, updateOrder, getOrdersForUser } = require("../orderStore");
const { getBonusBalance, getMaxRedeemable, deductBonusPoints } = require("../bonusStore");
const { notifyCustomer, buildOrderActionButtons } = require("../orderFlow");
const { appendChatMessage } = require("../chatStore");

const router = express.Router();

// Промокод перепроверяется на сервере (не доверяем скидке, применённой на
// клиенте). У Telegram Mini App и Android-приложения — разные коды, разные
// ставки и разные условия: у Telegram — только на первый заказ, у Android —
// постоянный промокод, можно применять к каждому заказу.
const PROMO_CONFIGS = {
  telegram: { code: "cosmo420tg", rate: 0.10, firstOrderOnly: true },
  android: { code: "cosmo420", rate: 0.10, firstOrderOnly: false }
};

const STORELAND_API_URL = "https://cosmo-bong.ru/api/v1";
const STORELAND_SECRET_KEY = process.env.STORELAND_API_KEY;

async function createStorelandOrder({ username, telegramUsername, phone, comment, cart, platform }) {

  const params = new URLSearchParams();

  params.append("secret_key", STORELAND_SECRET_KEY);

  const displayName =
    telegramUsername
      ? `@${telegramUsername}`
      : username
      ? `@${username}`
      : platform === "android"
      ? "Клиент из приложения"
      : "Клиент из Telegram";

  params.append("form[order_person]", displayName);
  params.append("form[order_phone]", phone || "-");
  params.append("form[without_delivery]", "1");

  const commentParts = [];

  if (comment) {
    commentParts.push(comment);
  }

  commentParts.push(
    platform === "android"
      ? "Заказ оформлен через Android-приложение"
      : "Заказ оформлен через Telegram Mini App"
  );

  params.append(
    "form[order_comment_only_for_staff]",
    commentParts.join(" | ")
  );

  cart.forEach((item, index) => {
    params.append(`form[line][${index}][goods_mod_id]`, item.id);
    params.append(`form[line][${index}][order_line_quantity]`, item.quantity);
  });

  const response = await axios.post(
    `${STORELAND_API_URL}/orders/add`,
    params,
    { timeout: 10000 }
  );

  return response.data;
}

async function debitStorelandOrderStock(orderNum) {

  const params = new URLSearchParams();

  params.append("secret_key", STORELAND_SECRET_KEY);
  params.append("form[is_debit]", "1");

  const response = await axios.post(
    `${STORELAND_API_URL}/orders/modify_rest_value/${orderNum}`,
    params,
    { timeout: 10000 }
  );

  return response.data;
}

router.post(
"/",
async(req,res)=>{


try{


const {

username,

telegramUsername,

telegramUserId,

notificationsAllowed,

phone,

comment,

cart,

promoCode,

pointsUsed,

platform


}=req.body;

// Всё, что не явно "android", считаем Telegram Mini App — так старые
// клиенты (не присылающие platform вообще) продолжают работать как раньше.
const promoConfig = platform === "android" ? PROMO_CONFIGS.android : PROMO_CONFIGS.telegram;




// Считаем сумму заказа сами по товарам из корзины — не доверяем итогу,
// присланному с клиента
const subtotal = cart
  ? cart.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0)
  : 0;

// Промокод перепроверяется на сервере: код должен совпасть, а если у
// платформы промокод только на первый заказ (firstOrderOnly) — ещё и не
// должно быть предыдущих оплаченных заказов. У Android промокод постоянный
// (firstOrderOnly: false), эта проверка для него пропускается.
let promoApplied = false;

if (
  promoCode &&
  String(promoCode).trim().toLowerCase() === promoConfig.code
) {

  if (!promoConfig.firstOrderOnly) {

    promoApplied = true;

  } else {

    const existingOrders = telegramUserId
      ? await getOrdersForUser(String(telegramUserId))
      : [];

    // Промокод действует, пока не было ни одного реально оплаченного
    // заказа — так же, как в /api/promo-check
    const hasPaidOrder = existingOrders.some(o =>
      ["paid", "shipped", "ready"].includes(o.status)
    );

    if (!hasPaidOrder) {
      promoApplied = true;
    }

  }

}

const promoDiscount = promoApplied
  ? Math.floor(subtotal * promoConfig.rate)
  : 0;

const total = subtotal - promoDiscount;

// Проверяем списание баллов заново на сервере (не доверяем сумме с
// клиента) — не больше 50% суммы заказа и не больше реального баланса
let appliedPoints = 0;

if (telegramUserId && pointsUsed) {

  const balance = await getBonusBalance(String(telegramUserId));
  appliedPoints = getMaxRedeemable(total, Math.min(Number(pointsUsed) || 0, balance));

}

const amountToPay = total - appliedPoints;





if(!cart || cart.length === 0){


return res.status(400).json({

success:false,

error:"Корзина пустая"

});


}


// ==============================
// Создаём настоящий заказ в Storeland
// ==============================
let storelandOrderNum = null;
let storelandError = null;

try {

  const storelandResult = await createStorelandOrder({
    username,
    telegramUsername,
    phone,
    comment,
    cart,
    platform
  });

  if (storelandResult.status === "ok") {

    storelandOrderNum = storelandResult.data.order_num.value;

    try {
      await debitStorelandOrderStock(storelandOrderNum);
    } catch (debitError) {
      console.log("STORELAND DEBIT ERROR:", debitError.message);
    }

  } else {
    storelandError = JSON.stringify(storelandResult);
    console.log("STORELAND ORDER ERROR:", storelandError);
  }

} catch (storelandRequestError) {
  storelandError = storelandRequestError.message;
  console.log("STORELAND REQUEST ERROR:", storelandError);
}






let message =

platform === "android"
? `📱 НОВЫЙ ЗАКАЗ COSMO BONG (Android-приложение)\n\n`
: `🔥 НОВЫЙ ЗАКАЗ COSMO BONG\n\n`;





message +=

`👤 Telegram:\n`;



message += telegramUsername

?

`@${telegramUsername} (подтверждено Telegram)\n\n`

:

username

?

`@${username} (введено вручную, не проверено)\n\n`

:

`не указан\n\n`;







message +=

`📞 Телефон:\n`;



message += phone

?

`${phone}\n\n`

:

`не указан\n\n`;







message +=

`🛒 Товары:\n`;






cart.forEach((item,index)=>{


message +=

`

${index + 1}. ${item.name}

Количество: ${item.quantity}

Цена: ${item.price.toLocaleString()} ₽

`;



});








if (promoApplied) {

  message +=

  `🎟 Промокод${promoConfig.firstOrderOnly ? " (первый заказ)" : ""}: -${promoDiscount.toLocaleString()} ₽\n`;

}



message +=

`\n💰 Итого: ${Number(total).toLocaleString()} ₽\n`;



if (appliedPoints > 0) {

  message +=

  `🎁 Списано баллами: -${appliedPoints.toLocaleString()} ₽\n💳 К оплате: ${amountToPay.toLocaleString()} ₽\n`;

}







message +=

`

💬 Комментарий:

${comment || "нет"}

`;



message +=

storelandOrderNum

?

`\n✅ Заказ в Storeland: №${storelandOrderNum}\n`

:

`\n⚠️ Не удалось создать заказ в Storeland, оформите вручную!\n`;



message +=

telegramUserId

?

(
  platform === "android"
  ? `\n💬 Клиент из Android-приложения — можно ответить на это сообщение (Reply), ответ придёт ему в чат приложения push-уведомлением.\n`
  : notificationsAllowed
  ? `\n🔔 Клиент разрешил уведомления боту — можно ответить на это сообщение (Reply).\n`
  : `\n🔕 Клиент НЕ разрешил уведомления боту — Reply может не дойти, лучше связаться по телефону.\n`
)

:

`\n🔕 Telegram ID клиента неизвестен — написать через бота не получится.\n`;



// Сохраняем заказ — используется историей заказов в профиле клиента
// и кнопками статуса ниже
const order = await createOrder({
  telegramUserId,
  username,
  telegramUsername,
  items: cart.map(item => ({
    name: item.name,
    quantity: item.quantity,
    price: item.price
  })),
  total,
  storelandOrderNum,
  pointsUsed: appliedPoints,
  platform
});

// Списываем баллы только после того, как заказ реально создан
if (appliedPoints > 0) {
  await deductBonusPoints(String(telegramUserId), appliedPoints);
}








const telegramResponse = await fetch(


`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`,

{

method:"POST",

headers:{

"Content-Type":"application/json"

},

body:JSON.stringify({

chat_id:process.env.ADMIN_ID,

text:message,

reply_markup:{
  inline_keyboard: buildOrderActionButtons(order, order.id)
}

})

}


);








const telegramData =

await telegramResponse.json();






if(!telegramData.ok){


console.log(
"Telegram error:",
telegramData
);


return res.status(500).json({

success:false,

error:"Telegram send failed"

});


}


// Привязываем это сообщение у админа к чату клиента — так админ сможет
// ответить (Reply) прямо на уведомление о заказе, даже если клиент сам
// ещё ничего не писал боту. Для Android telegramUserId — это customerId
// ("android:<телефон>"), Reply на него уйдёт в чат приложения (см.
// /api/telegram-webhook и isAndroidCustomerId в server/chatStore.js).
if (platform === "android" && telegramUserId) {

  await fetch("https://cosmo-bong-telegram-relay.chooss9.workers.dev/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "push",
      text: `Посетитель: ${telegramUserId}\n📱 Новый заказ №${storelandOrderNum || "?"} на ${Number(total).toLocaleString()} ₽`
    })
  }).catch((e) => console.log("PUSH RELAY ERROR (new order):", e.message));

  // Полный текст заказа (тот же, что уходит в Telegram) — в историю чата
  // для панели, с пометкой internal:true, чтобы клиент его не увидел
  // у себя в приложении.
  await appendChatMessage(telegramUserId, {
    from: "admin",
    text: message,
    internal: true,
    buttons: buildOrderActionButtons(order, order.id)
  });

}

if (telegramUserId && telegramData.result) {

  await saveReplyMapping(telegramData.result.message_id, telegramUserId);

  // Отдельным сообщением — жирная пометка, что именно на это можно
  // ответить (Reply), чтобы ответ ушёл клиенту. Текст полностью
  // фиксированный (без данных из заказа), поэтому Markdown-разметка
  // здесь безопасна.
  const replyHint = await telegramApi("sendMessage", {
    chat_id: process.env.ADMIN_ID,
    text: "✍️ *Можно ответить (Reply)* на уведомление о заказе выше — ответ уйдёт клиенту.",
    parse_mode: "Markdown"
  });

  if (replyHint.ok) {
    await saveReplyMapping(replyHint.result.message_id, telegramUserId);
  }

}

// Запоминаем id этого сообщения — понадобится, чтобы поменять кнопку
// "Отправлен" на "Собран", если клиент позже выберет самовывоз
if (telegramData.result) {
  await updateOrder(order.id, { adminMessageId: telegramData.result.message_id });
}


// ==============================
// Подтверждение клиенту в личку с ботом (необязательно — если не
// получится, например бот заблокирован, заказ всё равно считается
// оформленным). Через общий notifyCustomer — он же сам дублирует
// текст сообщения админу.
// ==============================
if (telegramUserId) {

  try {

    const customerMessage =
`✅ Ваш заказ принят!

Спасибо за покупку в Cosmo Bong 🌿
Мы получили заказ и скоро свяжемся с вами.

💰 Сумма: ${Number(total).toLocaleString()} ₽`;

    // Кнопка "Открыть магазин" ведёт в Telegram Mini App — для
    // Android-клиента это бессмысленная ссылка (они уже в приложении),
    // да и кнопки со ссылкой (url) чат приложения не умеет показывать
    // (там только кнопки-действия с callback_data), поэтому для Android
    // отправляем то же сообщение без кнопки.
    await notifyCustomer(
      order,
      customerMessage,
      platform === "android"
        ? undefined
        : {
            inline_keyboard: [
              [
                {
                  text: "🛍 Открыть магазин",
                  url: "https://t.me/CSMBNGSHOP_bot/csmbngshop"
                }
              ]
            ]
          }
    );

  } catch (customerMessageError) {

    console.log("CUSTOMER MESSAGE ERROR:", customerMessageError.message);

  }

}







res.json({

success:true,

storelandOrderNum

});





}

catch(error){



console.log(

"ORDER ERROR:",

error.message

);





res.status(500).json({

success:false

});



}



}

);







module.exports = router;