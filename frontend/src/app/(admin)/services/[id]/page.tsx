"use client";

import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { ServiceDrawer } from "@/components/services/ServiceDrawer";
import { useService } from "@/hooks/useServices";

export default function ServiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const t = useTranslations("pages.services");
  const id = typeof params.id === "string" ? params.id : null;
  const { data: service, isPending, isError } = useService(id);

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 p-8">
      {isPending && (
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
      )}
      {isError && !isPending && (
        <p className="text-center text-sm text-muted-foreground">
          {t("detailLoadError")}{" "}
          <button type="button" className="underline" onClick={() => router.push("/services")}>
            {t("detailBack")}
          </button>
        </p>
      )}
      {!isPending && !isError && service && id && (
        <ServiceDrawer
          open
          serviceId={id}
          service={service}
          onClose={() => router.push("/services")}
        />
      )}
    </div>
  );
}
