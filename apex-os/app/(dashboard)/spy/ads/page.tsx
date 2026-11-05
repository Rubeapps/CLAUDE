import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { AdsWorkspace } from "@/components/spy/AdsWorkspace";
import { buttonVariants } from "@/components/ui/button";
import { getSpyAdsData } from "@/lib/data/spy-ads";
import { isMetaConfigured } from "@/lib/meta-ads";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Meta Ad Intelligence" };

export default async function SpyAdsPage({ searchParams }: { searchParams: Promise<{ import?: string }> }) {
  const params = await searchParams;
  const { supabase, user } = await requireUser();
  const data = await getSpyAdsData(supabase, user.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Meta Ad Intelligence"
        description="Anúncios ativos de marcas concorrentes (Meta Ad Library), agrupados por criativo e pontuados pelo Winner Score."
        actions={
          <Link href="/spy" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Voltar ao Spy Engine
          </Link>
        }
      />
      <AdsWorkspace ads={data.ads} targets={data.targets} lastSyncAt={data.lastSyncAt} metaConfigured={isMetaConfigured()} autoOpenImport={params.import === "1"} />
    </div>
  );
}
