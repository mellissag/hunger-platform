import { ConvDetail } from "./conv-detail";

export default function ConvDetailPage({ params }: { params: { id: string } }) {
  return <ConvDetail id={params.id} />;
}
