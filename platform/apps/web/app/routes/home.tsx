import { storefront } from "../surface";

export const handle = storefront;

export function meta() {
  return [
    { title: "Learning Routes" },
    { name: "description", content: "Lo que sabes, convertido en una ruta." },
  ];
}

export default function Home() {
  return (
    <main className="home">
      <h1>Learning Routes</h1>
      <p>Lo que sabes, convertido en una ruta.</p>
    </main>
  );
}
