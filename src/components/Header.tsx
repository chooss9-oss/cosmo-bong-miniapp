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
bg-[#080808]/95
backdrop-blur
border-b
border-white/10
px-4
py-3
"

>



<form

onSubmit={handleSearch}

className="
flex
items-center
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
left-3
top-1/2
-translate-y-1/2
text-gray-400
text-sm
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
h-9
bg-[#151515]
border
border-white/10
rounded-full
pl-9
pr-4
text-sm
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