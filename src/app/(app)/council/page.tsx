import { PageHeader } from "@/components/shell/page-header";
import { CouncilForm } from "./council-form";

export default function CouncilPage() {
  return (
    <>
      <PageHeader
        title="The Council"
        description="Three personas debate your purchase before you spend."
      />
      <CouncilForm />
    </>
  );
}
