const express = require("express");
const axios = require("axios");

const router = express.Router();

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

phone,

comment,

cart,

total


}=req.body;





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

`🔥 НОВЫЙ ЗАКАЗ COSMO BONG\n\n`;





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








message +=

`\n💰 Итого: ${Number(total).toLocaleString()} ₽\n`;







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








const telegramResponse = await fetch(


`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`,

{

method:"POST",

headers:{

"Content-Type":"application/json"

},

body:JSON.stringify({

chat_id:process.env.ADMIN_ID,

text:message

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


// ==============================
// Подтверждение клиенту в личку с ботом (необязательно — если не
// получится, например бот заблокирован, заказ всё равно считается
// оформленным)
// ==============================
if (telegramUserId) {

  try {

    const customerMessage =
`✅ Ваш заказ принят!

Спасибо за покупку в Cosmo Bong 🌿
Мы получили заказ и скоро свяжемся с вами.

💰 Сумма: ${Number(total).toLocaleString()} ₽`;

    await fetch(
      `https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: telegramUserId,
          text: customerMessage
        })
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