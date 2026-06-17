import NavBarServeur from "@/app/components/NavBarServeur";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NavBarServeur />
      {children}
    </>
  );
}
