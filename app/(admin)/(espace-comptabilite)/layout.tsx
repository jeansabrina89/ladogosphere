import LayoutEspace from "@/app/components/LayoutEspace";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <LayoutEspace cle="comptabilite" nom="Comptabilité">
      {children}
    </LayoutEspace>
  );
}
