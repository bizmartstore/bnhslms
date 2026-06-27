import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Image as ImageIcon, PartyPopper } from "lucide-react";

type Banner = { id: string; title: string; subtitle?: string; image_url?: string; is_active: boolean };
type Event = { id: string; title: string; content?: string; is_active: boolean; event_images?: { image_data: string; sort_order: number }[] };

type Props = {
  banners: Banner[];
  events: Event[];
};

/**
 * Live preview that mirrors how banners + the first event image will render
 * on the homepage hero and event card.
 */
const BannerLivePreview = ({ banners, events }: Props) => {
  const activeBanners = banners.filter((b) => b.is_active && b.image_url);
  const activeEvents = events.filter((e) => e.is_active);
  const [bIdx, setBIdx] = useState(0);
  const [eIdx, setEIdx] = useState(0);

  // Auto-advance hero preview
  useEffect(() => {
    if (activeBanners.length < 2) return;
    const t = setInterval(() => setBIdx((i) => (i + 1) % activeBanners.length), 3500);
    return () => clearInterval(t);
  }, [activeBanners.length]);

  const banner = activeBanners[bIdx];
  const ev = activeEvents[eIdx];
  const evImg = ev?.event_images?.sort((a, b) => a.sort_order - b.sort_order)?.[0]?.image_data;

  return (
    <div className="rounded-2xl border border-border bg-gradient-to-b from-muted/50 to-card p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-xs font-bold text-foreground">Live preview</h4>
          <p className="text-[10px] text-muted-foreground">Mirrors homepage hero + event cards in real time.</p>
        </div>
        <div className="text-[9px] text-muted-foreground px-2 py-0.5 rounded-full bg-muted">
          mobile · 390w
        </div>
      </div>

      {/* Phone frame */}
      <div className="mx-auto w-full max-w-[280px] rounded-[28px] bg-foreground/90 p-2 shadow-sacred">
        <div className="rounded-[22px] bg-background overflow-hidden">
          {/* Hero banner preview */}
          <div className="relative aspect-[16/9] bg-muted">
            {banner ? (
              <>
                <img src={banner.image_url} alt={banner.title} className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-foreground/80 via-foreground/30 to-transparent" />
                <div className="absolute bottom-2 left-2.5 right-2.5">
                  <p className="text-[10px] font-bold text-primary-foreground leading-tight line-clamp-1 font-display">
                    {banner.title}
                  </p>
                  {banner.subtitle && (
                    <p className="text-[8px] text-primary-foreground/85 line-clamp-1">{banner.subtitle}</p>
                  )}
                </div>
                {activeBanners.length > 1 && (
                  <>
                    <button
                      onClick={() => setBIdx((i) => (i - 1 + activeBanners.length) % activeBanners.length)}
                      className="absolute left-1 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full bg-background/70 flex items-center justify-center"
                    >
                      <ChevronLeft className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => setBIdx((i) => (i + 1) % activeBanners.length)}
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full bg-background/70 flex items-center justify-center"
                    >
                      <ChevronRight className="h-3 w-3" />
                    </button>
                    <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
                      {activeBanners.map((_, i) => (
                        <span
                          key={i}
                          className={`h-1 rounded-full transition-all ${i === bIdx ? "w-3 bg-accent" : "w-1 bg-primary-foreground/60"}`}
                        />
                      ))}
                    </div>
                  </>
                )}
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                <ImageIcon className="h-6 w-6 mb-1" />
                <p className="text-[9px]">No active banner yet</p>
              </div>
            )}
          </div>

          {/* Event card preview */}
          <div className="p-2 space-y-1.5">
            <p className="text-[9px] font-bold uppercase tracking-wider text-primary">Events</p>
            <div className="rounded-xl border border-border overflow-hidden bg-card">
              <div className="relative aspect-[5/3] bg-muted">
                {evImg ? (
                  <img src={evImg} alt="" className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                    <PartyPopper className="h-5 w-5" />
                  </div>
                )}
              </div>
              <div className="p-2">
                <p className="text-[10px] font-bold text-foreground line-clamp-1 font-display">
                  {ev?.title || "Add an event to preview"}
                </p>
                <p className="text-[8px] text-muted-foreground line-clamp-2">
                  {ev?.content || "Active events appear on the homepage event carousel."}
                </p>
              </div>
            </div>
            {activeEvents.length > 1 && (
              <div className="flex justify-center gap-1 pt-0.5">
                {activeEvents.slice(0, 6).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setEIdx(i)}
                    className={`h-1 rounded-full transition-all ${i === eIdx ? "w-3 bg-primary" : "w-1 bg-border"}`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{activeBanners.length} active banner{activeBanners.length === 1 ? "" : "s"}</span>
        <span>{activeEvents.length} active event{activeEvents.length === 1 ? "" : "s"}</span>
      </div>
    </div>
  );
};

export default BannerLivePreview;
