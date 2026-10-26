import { redirect } from 'next/navigation';

/** Where the phone app's Preview first opened; the preview lives at /preview/<id> now. */
export default async function OldCardPreview(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  redirect(`/preview/${id}`);
}
