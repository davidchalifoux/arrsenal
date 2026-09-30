import { Companion } from "@/components/companion";
import { Features } from "@/components/features";
import { Closing, Footer } from "@/components/footer";
import { Hero } from "@/components/hero";
import { Install } from "@/components/install";
import { Nav } from "@/components/nav";
import { Problems } from "@/components/problems";

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Problems />
        <Features />
        <Companion />
        <Install />
        <Closing />
      </main>
      <Footer />
    </>
  );
}
