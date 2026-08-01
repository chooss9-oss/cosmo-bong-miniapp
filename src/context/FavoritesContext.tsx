import {
  createContext,
  useContext,
  useState
} from "react";



type FavoritesContextType = {

  favorites: string[];

  isFavorite: (id: string) => boolean;

  toggleFavorite: (id: string) => void;

};



const FavoritesContext =
  createContext<FavoritesContextType | null>(null);



function getSavedFavorites(): string[] {

  const saved = localStorage.getItem("favorites");

  if (!saved) return [];

  try {
    return JSON.parse(saved);
  } catch {
    return [];
  }

}



export function FavoritesProvider({
  children
}: {
  children: React.ReactNode
}) {


  const [favorites, setFavorites] = useState<string[]>(
    () => getSavedFavorites()
  );


  function saveFavorites(next: string[]) {

    setFavorites(next);

    localStorage.setItem("favorites", JSON.stringify(next));

  }


  function isFavorite(id: string) {

    return favorites.includes(id);

  }


  function toggleFavorite(id: string) {

    if (favorites.includes(id)) {

      saveFavorites(favorites.filter(favId => favId !== id));

    } else {

      saveFavorites([...favorites, id]);

    }

  }


  return (

    <FavoritesContext.Provider

      value={{
        favorites,
        isFavorite,
        toggleFavorite
      }}

    >

      {children}

    </FavoritesContext.Provider>

  );

}



export function useFavorites() {

  const context = useContext(FavoritesContext);

  if (!context) {

    throw new Error(
      "useFavorites must be inside FavoritesProvider"
    );

  }

  return context;

}
