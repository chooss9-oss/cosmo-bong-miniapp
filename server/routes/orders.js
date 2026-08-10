const express = require("express");
const axios = require("axios");

const { saveReplyMapping, telegramApi } = require("../replyMapping");
const { createOrder, updateOrder, getOrdersForUser } = require("../orderStore");
const { getBonusBalance, getMaxRedeemable, deductBonusPoints } = require("../bonusStore");
const { notifyCustomer, buildOrderActionButtons } = require("../orderFlow");

const router = express.Router();

// Промокод действует только на самый первый заказ клиента, перепроверяется
// на сервере (не доверяем скидке, применённой на клиенте). У Telegram
// Mini App и Android-приложения — разные коды и разные ставки, каждая
// платформа передаёт свой promoCode, сервер сверяет его с "своим" набором.
const PROMO_CONFIGS = {
  telegram: { code: "cosmo420tg", rate: 0.10 },
  android: { code: "cosmo420", rate: 0.07 }
};

const STORELAND_API_URL = "https://cosmo-bong.ru/api/v1";
const STORELAND_SECRET_KEY = process.env.STORELAND_API_KEY;

async function createStorelandOrder({ username, telegramUsername, phone, comment, cart }) {

  const params = new URLSearchParams();

  params.append("secret_key", STORELAND_SECRET_KEY);

  const displayName =
    telegramUsername
      ? `@${telegramUsername}`
      : username
      ? `@${username}`
      : "Клиент из Telegram";

  params.append("form[order_person]", displayName);
  params.append("form[order_phone]", phone || "-");
  params.append("form[without_delivery]", "1");

  const commentParts = [];

  if (comment) {
    commentParts.push(comment);
  }

  commentParts.push("Заказ оформлен через Telegram Mini App");

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

// Промокод перепроверяется на сервере: код должен совпасть и у клиента
// не должно быть предыдущих заказов
let promoApplied = false;

if (
  promoCode &&
  String(promoCode).trim().toLowerCase() === promoConfig.code
) {

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
    cart
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

  `🎟 Промокод (первый заказ): -${promoDiscount.toLocaleString()} ₽\n`;

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
  notificationsAllowed
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
// ещё ничего не писал боту.
if (telegramUserId && telegramData.result && platform !== "android") {

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

    await notifyCustomer(order, customerMessage, {
      inline_keyboard: [
        [
          {
            text: "🛍 Открыть магазин",
            url: "https://t.me/CSMBNGSHOP_bot/csmbngshop"
          }
        ]
      ]
    });

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