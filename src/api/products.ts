// src/api/products.ts


const API_URL =
  "https://cosmo-bong-miniapp.onrender.com";



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

  return [];

}





export async function getProducts(){


  const products =
    await request(
      `${API_URL}/api/products`
    );



  return products.map(
    (product:any)=>{


      return {

        ...product,

        oldPrice:
          undefined,

        discount:
          undefined

      };


    }
  );


}