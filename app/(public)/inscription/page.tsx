import InscriptionForm from "./InscriptionForm";

export default function InscriptionPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-8"
      style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-md w-full bg-white rounded-xl p-8 shadow-lg">
        <div className="text-center mb-8">
          <img src="/logo-compact.webp" alt="La Dogosphère"
            className="h-24 w-24 rounded-full object-cover mx-auto mb-4" />
          <h1 className="text-3xl font-bold" style={{ color: "#1B2B5E" }}>
            La Dogosphère
          </h1>
          <p className="text-gray-500 mt-2">Créez votre espace client</p>
        </div>
        <InscriptionForm />
        <p className="text-center text-sm text-gray-500 mt-4">
          Déjà un compte ?{" "}
          <a href="/login" style={{ color: "#4AAEA0" }} className="font-semibold">
            Se connecter
          </a>
        </p>
      </div>
    </main>
  );
}