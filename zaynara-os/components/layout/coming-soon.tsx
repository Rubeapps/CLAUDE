import { Construction } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";

export function ComingSoon({ title, description, phase }: { title: string; description: string; phase: string }) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <Card>
        <CardContent className="flex items-center gap-3 text-sm text-muted-foreground">
          <Construction className="size-5 shrink-0" />
          Este módulo chega na {phase}.
        </CardContent>
      </Card>
    </>
  );
}
