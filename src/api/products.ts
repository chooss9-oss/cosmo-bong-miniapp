// src/api/products.ts


const API_URL =
  "http://localhost:3001";



export type Product = {

  id: string;

  name: string;

  price: number;

  oldPrice?: number;

  discount?: number;

  images?: string[];

  description?: string;

  categoryIds?: string[];

};





async function request(
  url:string
){

  const response =
    await fetch(url);



  if(!response.ok){

    throw new Error(
      "Ошибка загрузки данных"
    );

  }



  return response.json();

}





export async function getSaleProducts(){

  return await request(
    `${API_URL}/api/sale`
  );

}





export async function getProducts(){


  const products =
    await request(
      `${API_URL}/api/products`
    );



  const saleProducts =
    await request(
      `${API_URL}/api/sale`
    );



  const saleMap =
    new Map();



  saleProducts.forEach(
    (sale:any)=>{


      saleMap.set(
        String(sale.id),
        {
          oldPrice:
            sale.oldPrice,

          discount:
            sale.discount
        }
      );


    }
  );





  return products.map(
    (product:any)=>{


      const sale =
        saleMap.get(
          String(product.id)
        );



      return {

        ...product,


        oldPrice:
          sale?.oldPrice,


        discount:
          sale?.discount


      };


    }
  );


}