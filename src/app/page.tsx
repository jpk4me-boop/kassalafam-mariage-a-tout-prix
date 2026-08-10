import { Navbar } from "@/components/landing/navbar";
import { Hero } from "@/components/landing/hero";
import { ProofBar } from "@/components/landing/proof-bar";
import { ProductWindow } from "@/components/landing/product-window";
import { TrustSection } from "@/components/landing/trust-section";
import { HowItWorks } from "@/components/landing/how-it-works";
import { WhySection } from "@/components/landing/why-section";
import { Features } from "@/components/landing/features";
import { CtaBanner } from "@/components/landing/cta-banner";
import { Pricing } from "@/components/landing/pricing";
import { Testimonials } from "@/components/landing/testimonials";
import { Faq } from "@/components/landing/faq";
import { Cta } from "@/components/landing/cta";
import { Footer } from "@/components/landing/footer";
import { WhatsappContactButton } from "@/components/public/whatsapp-contact-button";

export default function Home() {
  return (
    <>
      <Navbar />
      <main className="flex-1">
        <Hero />
        <ProofBar />
        <ProductWindow />
        <TrustSection />
        <HowItWorks />
        <WhySection />
        <Features />
        <CtaBanner />
        <Pricing />
        <Testimonials />
        <Faq />
        <Cta />
      </main>
      <Footer />
      <WhatsappContactButton context="accueil" />
    </>
  );
}
