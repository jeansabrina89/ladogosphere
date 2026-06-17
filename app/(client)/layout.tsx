import NavBarClient from "@/app/components/NavBarClient";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NavBarClient />
      {children}
    </>
  );
}
