const express = require("express");

const router = express.Router();





router.post(
"/",
async(req,res)=>{


try{


const {

username,

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






let message =

`🔥 НОВЫЙ ЗАКАЗ COSMO BONG\n\n`;





message +=

`👤 Telegram:\n`;



message += username

?

`@${username}\n\n`

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








res.json({

success:true

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