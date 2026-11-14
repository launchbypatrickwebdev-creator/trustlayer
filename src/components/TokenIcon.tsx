import Image from "next/image";

const TOKEN_ICONS: Record<string, { src: string; alt: string }> = {
  SOL: { src: "/icons/solana.svg", alt: "Solana" },
  SOLANA: { src: "/icons/solana.svg", alt: "Solana" },
  USDC: { src: "/icons/usdc.svg", alt: "USDC" },
  USDT: { src: "/icons/usdt.svg", alt: "USDT" },
  EURC: { src: "/icons/eurc.svg", alt: "EURC" },
  PYUSD: { src: "/icons/pyusd.svg", alt: "PYUSD" },
  USDS: { src: "/icons/usds.svg", alt: "USDS" },
  FDUSD: { src: "/icons/fdusd.svg", alt: "FDUSD" },
  // fiat / local rails
  NGN: { src: "/icons/fiat.svg", alt: "NGN" },
  FIAT: { src: "/icons/fiat.svg", alt: "Fiat" },
  CASH: { src: "/icons/fiat.svg", alt: "Fiat" },
};

type TokenIconProps = {
  code?: string | null;
  size?: number;
  className?: string;
};

export default function TokenIcon({
  code,
  size = 20,
  className = "",
}: TokenIconProps) {
  const key = (code || "").trim().toUpperCase();
  const icon = TOKEN_ICONS[key];

  if (!icon) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-full bg-white/10 text-[10px] font-bold text-[var(--tl-muted)] ${className}`}
        style={{ width: size, height: size }}
      >
        {key.slice(0, 1) || "?"}
      </span>
    );
  }

  return (
    <Image
      src={icon.src}
      alt={icon.alt}
      width={size}
      height={size}
      className={`shrink-0 object-contain object-center ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
