import Header from "./components/Header"
import BottomNav from "./components/BottomNav"
import Home from "./pages/Home/Home"

function App() {
  return (
    <div className="min-h-screen bg-[#09090B] text-white pb-20">

      <Header />

      <main>
        <Home />
      </main>

      <BottomNav />

    </div>
  )
}

export default App