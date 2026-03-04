import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
};

export default function Button({ children, className, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={`bg-action text-white px-10 py-4 rounded-pill transition-all duration-300 ease-out active:scale-95 hover:bg-actionActive ${className ?? ""}`.trim()}
    >
      {children}
    </button>
  );
}
