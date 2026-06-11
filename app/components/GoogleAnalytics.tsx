"use client";

import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type GtagArgs =
  | ["js", Date]
  | [
      "config",
      string,
      {
        page_location?: string;
        page_path?: string;
        send_page_view?: boolean;
      },
    ]
  | ["event", string, Record<string, unknown>];

declare global {
  interface Window {
    dataLayer?: IArguments[];
    gtag?: (...args: GtagArgs) => void;
  }
}

type GoogleAnalyticsProps = {
  measurementId?: string;
};

let lastTrackedPagePath: string | undefined;

export default function GoogleAnalytics({ measurementId }: GoogleAnalyticsProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isReady, setIsReady] = useState(false);

  const pagePath = useMemo(() => {
    const queryString = searchParams.toString();

    return queryString ? `${pathname}?${queryString}` : pathname;
  }, [pathname, searchParams]);

  useEffect(() => {
    if (!measurementId || !isReady || !window.gtag) {
      return;
    }

    if (lastTrackedPagePath === pagePath) {
      return;
    }

    lastTrackedPagePath = pagePath;

    window.gtag("config", measurementId, {
      page_location: window.location.href,
      page_path: pagePath,
    });
  }, [isReady, measurementId, pagePath]);

  if (!measurementId) {
    return null;
  }

  return (
    <>
      <Script
        id="google-analytics-init"
        strategy="afterInteractive"
        onReady={() => setIsReady(true)}
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            window.gtag = function gtag(){window.dataLayer.push(arguments);};
            window.gtag('js', new Date());
            window.gtag('config', ${JSON.stringify(measurementId)}, { send_page_view: false });
          `,
        }}
      />
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(
          measurementId,
        )}`}
        strategy="afterInteractive"
      />
    </>
  );
}
