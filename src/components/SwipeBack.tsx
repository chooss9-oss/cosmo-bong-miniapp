import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";


function SwipeBack() {

  const navigate = useNavigate();
  const location = useLocation();


  useEffect(() => {

    if (location.pathname === "/") return;

    let startX = 0;
    let startY = 0;
    let tracking = false;


    function handleTouchStart(e: TouchEvent) {

      const touch = e.touches[0];

      if (touch.clientX < 30) {
        startX = touch.clientX;
        startY = touch.clientY;
        tracking = true;
      } else {
        tracking = false;
      }

    }


    function handleTouchEnd(e: TouchEvent) {

      if (!tracking) return;
      tracking = false;

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;

      if (deltaX > 80 && Math.abs(deltaY) < 50) {
        navigate(-1);
      }

    }


    window.addEventListener("touchstart", handleTouchStart);
    window.addEventListener("touchend", handleTouchEnd);

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchend", handleTouchEnd);
    };

  }, [location.pathname, navigate]);


  return null;

}


export default SwipeBack;