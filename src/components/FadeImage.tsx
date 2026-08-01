import { useState, type ImgHTMLAttributes } from "react";


type Props = ImgHTMLAttributes<HTMLImageElement>;


// Картинка с плавным появлением (fade-in) вместо резкого "выскакивания"
// после загрузки. Если картинка уже в кэше браузера, onLoad срабатывает
// почти сразу — переход остаётся незаметным.
export default function FadeImage({
  className = "",
  onLoad,
  ...rest
}: Props) {

  const [loaded, setLoaded] = useState(false);

  return (
    <img
      {...rest}
      onLoad={(e) => {
        setLoaded(true);
        onLoad?.(e);
      }}
      className={`
        ${className}
        transition-opacity
        duration-300
        ${loaded ? "opacity-100" : "opacity-0"}
      `}
    />
  );

}
