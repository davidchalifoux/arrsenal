import { LibraryBrowser } from "@/components/library-browser";

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const status =
    params.status === "available" ||
    params.status === "incomplete" ||
    params.status === "downloading"
      ? params.status
      : "all";
  return (
    <LibraryBrowser
      key={status}
      category="library"
      initialStatus={status}
      openAdd={params.add === "1"}
    />
  );
}
