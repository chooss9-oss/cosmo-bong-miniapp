import {
  useState
} from "react";


import {
  useNavigate
} from "react-router-dom";





function Header(){



const navigate =

useNavigate();



const [
search,
setSearch
]=useState("");







function handleSearch(
e:React.FormEvent
){


e.preventDefault();



const value =

search.trim();



if(value){


navigate(

`/catalog?search=${encodeURIComponent(value)}`

);



setSearch("");



}



}








return(



<header

className="
fixed
top-0
left-0
right-0
z-50
h-20
bg-[#080808]/95
backdrop-blur
border-b
border-white/10
"

>



<form


onSubmit={handleSearch}


className="
h-full
flex
items-center
px-5
"

>



<div

className="
relative
w-full
"

>



<span

className="
absolute
left-4
top-1/2
-translate-y-1/2
text-gray-400
"

>

🔍

</span>







<input


value={search}


onChange={

e=>

setSearch(
e.target.value
)

}



placeholder="
Поиск по товарам...
"



className="
w-full
h-12
bg-[#151515]
border
border-white/10
rounded-2xl
pl-12
pr-5
text-white
outline-none
focus:border-[#58BB43]
transition
"



/>





</div>







</form>





</header>



);


}





export default Header;