import LayoutEspace from "@/app/components/LayoutEspace";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <LayoutEspace cle="equipe" nom="Équipe">
      {children}
    </LayoutEspace>
  );
}
