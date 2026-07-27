require("dotenv").config();


const express = require("express");
const cors = require("cors");

const fs = require("fs");
const path = require("path");

const axios = require("axios");
const cheerio = require("cheerio");

// Кэш для данных распродажи (обновляем не чаще раза в 10 минут)
let salesCache = null;
let lastSalesFetch = 0;

async function fetchSalesData() {
  const now = Date.now();
  if (salesCache && now - lastSalesFetch < 600000) {
    return salesCache;
  }

  try {
    console.log("🔄 Обновление данных распродажи с cosmo-bong.ru...");
    const { data } = await axios.get("https://cosmo-bong.ru/discount/Rasprodazha", {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
    });
    const $ = cheerio.load(data);
    const newSalesCache = {};

    $(".price-box").each((i, el) => {
      const oldPriceText = $(el).find(".old-price .num").text().replace(/\s/g, "");
      const oldPrice = parseInt(oldPriceText, 10);
      const mainPrice = parseInt($(el).find(".main-price").attr("content"), 10);
      
      if (oldPrice && mainPrice) {
        const link = $(el).closest(".actions").find("a[href*='mod_id=']");
        const href = link.attr("href");
        const match = href ? href.match(/mod_id=(\d+)/) : null;
        
        if (match) {
          const productId = match[1];
          newSalesCache[productId] = {
            oldPrice,
            discount: Math.round(((oldPrice - mainPrice) / oldPrice) * 100)
          };
        }
      }
    });

    salesCache = newSalesCache;
    lastSalesFetch = now;
    console.log(`✅ Данные распродажи обновлены: найдено ${Object.keys(salesCache).length} товаров.`);
  } catch (error) {
    console.error("❌ Ошибка при получении данных распродажи:", error.message);
    return salesCache || {};
  }
  
  return salesCache;
}
const orderRouter = require("./routes/orders");



const app = express();



app.use(cors());

app.use(express.json());



const PORT =
process.env.PORT || 3001;



let products = [];
let categories = [];





// ==============================
// LOAD CACHE
// ==============================


function loadCache(){


try{


products = JSON.parse(

fs.readFileSync(

path.join(
__dirname,
"cache/products.json"
),

"utf8"

)

);




categories = JSON.parse(

fs.readFileSync(

path.join(
__dirname,
"cache/categories.json"
),

"utf8"

)

);





console.log(
`✅ Товары: ${products.length}`
);



console.log(
`✅ Категории: ${categories.length}`
);



}

catch(error){


console.log(

"❌ CACHE ERROR:",
error.message

);


}


}








// ==============================
// ORDERS
// ==============================


app.use(

"/api/order",

orderRouter

);









// ==============================
// ALL PRODUCTS
// ==============================


app.get("/api/products", async (req, res) => {
  try {
    const salesData = await fetchSalesData();
    
    // Обогащаем массив товаров реальными данными о скидках
    const productsWithSales = products.map(product => {
      const saleInfo = salesData[product.id];
      if (saleInfo) {
        return {
          ...product,
          oldPrice: saleInfo.oldPrice,
          discount: saleInfo.discount
        };
      }
      return product; // Если товара нет в распродаже, отдаем как есть
    });

    res.json(productsWithSales);
  } catch (error) {
    console.error("Ошибка в /api/products:", error.message);
    res.json(products); // На случай ошибки отдаем обычные данные
  }
});










// ==============================
// ONE PRODUCT
// ==============================


app.get(

"/api/product/:id",

(req,res)=>{


const id =
String(req.params.id);




const product =

products.find(

item =>

String(item.id) === id

);





if(!product){


return res.status(404).json({

error:"Product not found"

});


}






res.json({

id:product.id,

name:product.name,


price:Number(product.price),



description:
product.description || "",



images:

product.images

?

product.images

:

product.image

?

[product.image]

:

[],



categoryIds:

product.categoryIds || []



});



}

);









// ==============================
// CATEGORIES
// ==============================


app.get(

"/api/categories",

(req,res)=>{


res.json(categories);


}

);









// ==============================
// START
// ==============================

loadCache();

module.exports = app;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Server started http://localhost:${PORT}`);
  });
}
