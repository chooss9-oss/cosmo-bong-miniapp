import { useNavigate } from "react-router-dom";

export default function BackBar() {
  const navigate = useNavigate();

  return (
    <div
      className="
      fixed
      top-[64px]
      left-0
      right-0
      z-40
      bg-[#080808]/95
      backdrop-blur
      px-4
      py-2
      "
    >
      <button
        onClick={() => navigate(-1)}
        className="
        h-10
        px-4
        rounded-xl
        bg-[#151515]
        border
        border-white/10
        text-sm
        font-semibold
        text-gray-300
        active:scale-95
        transition
        "
      >
        ← Назад
      </button>
    </div>
  );
}