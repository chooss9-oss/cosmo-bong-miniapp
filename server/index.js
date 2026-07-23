const express = require("express");
const cors = require("cors");
const axios = require("axios");
const { XMLParser } = require("fast-xml-parser");
const fs = require("fs");
const path = require("path");

const app = express();

const PORT = 3001;

const YML_URL =
  "https://cosmo-bong.ru/export/yandex_market/37768";


app.use(cors());
app.use(express.json());



const CACHE_DIR = path.join(__dirname, "cache");

const PRODUCTS_FILE =
  path.join(CACHE_DIR, "products.json");

const CATEGORIES_FILE =
  path.join(CACHE_DIR, "categories.json");



if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR);
}



function saveJSON(file, data) {

  fs.writeFileSync(
    file,
    JSON.stringify(data, null, 2),
    "utf-8"
  );

}



function readJSON(file) {

  if (!fs.existsSync(file)) {
    return [];
  }

  return JSON.parse(
    fs.readFileSync(file, "utf-8")
  );

}




async function updateCatalog() {

  console.log("⬇️ Загружаем YML Storeland...");


  const response = await axios.get(
    YML_URL
  );


  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_"
  });



  const xml = parser.parse(
    response.data
  );



  const shop =
    xml.yml_catalog.shop;



  const categories =
    shop.categories.category || [];



  const offers =
    shop.offers.offer || [];



  const products =
    offers.map((item) => {


      let images = [];


      if (item.picture) {

        images =
          Array.isArray(item.picture)
            ? item.picture
            : [item.picture];

      }



      return {

        id:
          item["@_id"],


        name:
          item.name || "",


        price:
          Number(item.price) || 0,


        description:
          item.description || "",


        url:
          item.url || "",


        categoryId:
          item.categoryId || null,


        images

      };


    });



  saveJSON(
    PRODUCTS_FILE,
    products
  );


  saveJSON(
    CATEGORIES_FILE,
    categories
  );



  console.log(
    `✅ Загружено товаров: ${products.length}`
  );


  console.log(
    `✅ Загружено категорий: ${categories.length}`
  );


  return {
    products,
    categories
  };


}





app.get(
  "/api/products",
  (req,res)=>{

    const products =
      readJSON(PRODUCTS_FILE);


    res.json(products);

  }
);




app.get(
  "/api/categories",
  (req,res)=>{

    const categories =
      readJSON(CATEGORIES_FILE);


    res.json(categories);

  }
);





app.get(
  "/api/products/:id",
  (req,res)=>{


    const products =
      readJSON(PRODUCTS_FILE);



    const product =
      products.find(
        p =>
        String(p.id)
        ===
        String(req.params.id)
      );



    if(!product){

      return res
      .status(404)
      .json({
        error:"Товар не найден"
      });

    }


    res.json(product);


  }
);





app.post(
  "/api/update",
  async(req,res)=>{

    try{

      const result =
        await updateCatalog();


      res.json({

        success:true,

        products:
          result.products.length

      });


    }
    catch(error){

      res.status(500)
      .json({

        error:
        error.message

      });

    }

  }
);





app.listen(
  PORT,
  async()=>{


    console.log(
      `🚀 Server started http://localhost:${PORT}`
    );


    try{

      await updateCatalog();

    }
    catch(error){

      console.log(
        "Ошибка загрузки каталога",
        error.message
      );

    }


  }
);