import type { ReactNode } from "react";

// Numbered editorial section with a marker (§NN), eyebrow label, and a
// generous horizontal rule above the content. Rule + marker mimic the
// printed-document feel that the audience associates with rigor.

export function Section({
  id,
  number,
  eyebrow,
  title,
  children,
  align = "default",
}: {
  id?: string;
  number: string;
  eyebrow: string;
  title: ReactNode;
  children: ReactNode;
  align?: "default" | "center";
}) {
  return (
    <section id={id} className="px-6 lg:px-10">
      <div className="mx-auto max-w-[1320px]">
        <hr className="rule" />
        <div
          className={
            "grid grid-cols-1 lg:grid-cols-12 gap-10 pt-10 pb-6 " +
            (align === "center" ? "items-end" : "")
          }
        >
          <div className="lg:col-span-3">
            <p className="section-marker">
              §{number} · {eyebrow}
            </p>
          </div>
          <div className={"lg:col-span-9"}>
            <h2 className="display text-[44px] sm:text-[58px] lg:text-[68px] leading-[0.95] font-medium tracking-tightest text-ink">
              {title}
            </h2>
          </div>
        </div>
        <div className="pb-24 pt-6">{children}</div>
      </div>
    </section>
  );
}
