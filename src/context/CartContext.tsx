import {
  createContext,
  useContext,
  useState
} from "react";


type Product = {

  id: string;

  name: string;

  price: number;

  images?: string[];

};



type CartItem = Product & {

  quantity:number;

};



type CartContextType = {

  cart: CartItem[];

  addToCart:
    (product:Product)=>void;

  removeFromCart:
    (id:string)=>void;

};




const CartContext =
  createContext<CartContextType | null>(null);





function getSavedCart(){

  const saved =
    localStorage.getItem(
      "cart"
    );


  return saved
    ? JSON.parse(saved)
    : [];

}




export function CartProvider({
  children
}:{
  children:React.ReactNode
}){


  const [
    cart,
    setCart
  ] = useState<CartItem[]>(
    getSavedCart()
  );





  function updateCart(
    newCart:CartItem[]
  ){

    setCart(newCart);

    localStorage.setItem(
      "cart",
      JSON.stringify(newCart)
    );

  }





  function addToCart(
    product:Product
  ){


    const exists =
      cart.find(
        item =>
          item.id === product.id
      );



    let newCart;



    if(exists){


      newCart =
        cart.map(
          item =>

            item.id === product.id

            ?

            {
              ...item,
              quantity:
              item.quantity + 1
            }

            :

            item

        );


    }

    else {


      newCart = [

        ...cart,

        {
          ...product,
          quantity:1
        }

      ];


    }



    updateCart(
      newCart
    );


  }






  function removeFromCart(
    id:string
  ){

    updateCart(

      cart.filter(
        item =>
          item.id !== id
      )

    );

  }







  return (

    <CartContext.Provider

      value={{

        cart,

        addToCart,

        removeFromCart

      }}

    >

      {children}

    </CartContext.Provider>

  );


}





export function useCart(){

  const context =
    useContext(
      CartContext
    );


  if(!context){

    throw new Error(
      "useCart outside provider"
    );

  }


  return context;

}