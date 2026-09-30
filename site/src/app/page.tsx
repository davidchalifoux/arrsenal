import type { SoftwareApplication, WithContext } from "schema-dts";
import { Companion } from "@/components/companion";
import { Features } from "@/components/features";
import { Closing, Footer } from "@/components/footer";
import { Hero } from "@/components/hero";
import { Install } from "@/components/install";
import { JsonLd } from "@/components/json-ld";
import { Nav } from "@/components/nav";
import { Problems } from "@/components/problems";
import { repoUrl, siteDescription, siteName, siteUrl } from "@/lib/site";

const application: WithContext<SoftwareApplication> = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: siteName,
  description: siteDescription,
  url: `${siteUrl}/`,
  image: `${siteUrl}/library.png`,
  applicationCategory: "MultimediaApplication",
  operatingSystem: "Docker",
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  license: "https://www.gnu.org/licenses/gpl-3.0.html",
  sameAs: [repoUrl],
};

export default function Home() {
  return (
    <>
      <JsonLd data={application} />
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
