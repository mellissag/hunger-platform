import { redirect } from "next/navigation";

export default function BookingsNewRedirectPage() {
  redirect("/bookings?create=1");
}
