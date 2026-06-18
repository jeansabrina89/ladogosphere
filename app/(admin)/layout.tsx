import NavBarServeur from "@/app/components/NavBarServeur";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NavBarServeur />
      <div className="md:pl-[248px]">{children}</div>
    </>
  );
}
