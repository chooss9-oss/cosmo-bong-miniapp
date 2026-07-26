require("dotenv").config();


const express = require("express");
const cors = require("cors");

const fs = require("fs");
const path = require("path");


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


app.get(

"/api/products",

(req,res)=>{


res.json(products);


}

);










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
