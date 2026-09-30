import { About } from "@/components/about";
import { UpdateStatus } from "@/components/update-status";
import { currentVersion, repositoryUrl } from "@/lib/server/releases";

export const metadata = { title: "About | Arrsenal" };

export default function AboutPage() {
  return (
    <About version={currentVersion} repositoryUrl={repositoryUrl}>
      <UpdateStatus
        currentVersion={currentVersion}
        repositoryUrl={repositoryUrl}
      />
    </About>
  );
}
