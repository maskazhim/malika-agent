import Script from "next/script";
import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import VideoShowcase from "@/components/VideoShowcase";
import InteractiveDemo from "@/components/InteractiveDemo";
import { UspGrid, UseCaseGrid } from "@/components/Grids";
import Pricing from "@/components/Pricing";
import Faq from "@/components/Faq";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <div className="flex min-h-full flex-col">
      <Navbar />
      <main className="flex-1">
        <Hero />
        <VideoShowcase />
        <InteractiveDemo />
        <UspGrid />
        <UseCaseGrid />
        <Pricing />
        <Faq />
        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <div className="glass rounded-3xl px-8 py-12 text-center">
            <h2 className="mx-auto max-w-xl text-2xl font-semibold sm:text-3xl">
              Biarkan Malika Agent yang kerja.
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-sm text-stone-600">
              Sudah saatnya AI Agent kerja tanpa ditungguin, dipantengin.
              <br />
              Kasih jadwal kerjaan, tinggalin, selesai!
            </p>
            <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
              <a
                href="#harga"
                className="malika-gradient rounded-full px-7 py-3 text-sm font-semibold text-white hover:opacity-90"
              >
                Lihat Paket Harga
              </a>
              <a
                href="#demo"
                className="rounded-full bg-white/70 px-7 py-3 text-sm font-semibold ring-1 ring-white hover:bg-white"
              >
                Eksplor Demo Lagi
              </a>
            </div>
          </div>
        </section>
      </main>
      <Footer />
      <Script id="aksoro-livechat" strategy="lazyOnload">
        {`!function(c,h,a,t,s){c.mychat=c.mychat||{server:"https://live.aksoro.co.id",iframeWidth:"400px",iframeHeight:"700px",offsetX:"24px",offsetY:"24px",accessKey:"Malika-HzgiIBv4"};var q=[];c.ChatAI=function(){q.push(arguments)};c.ChatAI.q=q;t=h.createElement(a);s=h.getElementsByTagName(a)[0];t.async=1;t.src=c.mychat.server+"/widget.js";s.parentNode.insertBefore(t,s)}(window,document,"script");`}
      </Script>
    </div>
  );
}
