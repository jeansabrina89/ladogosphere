import LayoutEspace from "@/app/components/LayoutEspace";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <LayoutEspace cle="aujourdhui">
      {children}
    </LayoutEspace>
  );
}
