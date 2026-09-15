import { Heart } from "lucide-react";

import { cn } from "@/lib/utils";

interface AyudapiLogoProps {
  dark?: boolean;
  size?: "md" | "sm";
}

export function AyudapiLogo({ dark = false, size = "sm" }: AyudapiLogoProps) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={cn(
          "bg-blue-600 flex items-center justify-center text-white",
          size === "md" ? "h-8 w-8 rounded-lg" : "h-7 w-7 rounded-lg",
        )}
      >
        <Heart className="fill-white" size={size === "md" ? 16 : 14} />
      </span>
      <span
        className={cn(
          "font-bold leading-none text-lg",
          dark ? "text-white" : "text-gray-900",
        )}
      >
        Ayud<span className="font-black text-blue-600">API</span>
      </span>
    </span>
  );
}