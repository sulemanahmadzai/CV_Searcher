import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { Uploader } from "@/components/uploader";

export const metadata = { title: "Upload CVs · CV Search" };

export default function UploadPage() {
  return (
    <div>
      <PageHeader
        title="Upload CVs"
        subtitle={
          <>
            Each file is stored privately, then Claude reads it and records the candidate&apos;s skills with evidence
            (about 4 cents per CV). Duplicates and non-CV documents are detected automatically. See the{" "}
            <Link href="/imports" className="text-accent hover:underline">
              import log
            </Link>{" "}
            for everything processed so far.
          </>
        }
      />
      <Uploader />
    </div>
  );
}
